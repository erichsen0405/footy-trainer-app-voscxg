
/**
 * Calendar Sync Operations Computer
 * 
 * This module implements a robust calendar synchronization algorithm that handles:
 * - Soft deletes with grace period and miss count tracking
 * - Immediate deletes for CANCELLED events (STATUS:CANCELLED or METHOD:CANCEL)
 * - Unstable UID matching via provider_uid, summary+datetime, and fuzzy matching
 * - Preservation of local metadata (categories, reminders, etc.)
 * 
 * Based on the architecture described in:
 * https://docs.google.com/document/d/1nviy_flRA7e5Xfn1caChMKEKVxWTNJ1qkDjKpoI544Q/edit?usp=sharing
 */

export interface FetchedEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  startDateString: string;
  startTimeString: string;
  endDateString: string;
  endTimeString: string;
  timezone?: string;
  isAllDay: boolean;
  categories?: string[];
  lastModified?: Date;
  status?: string; // CANCELLED, CONFIRMED, TENTATIVE
  method?: string; // CANCEL, REQUEST, PUBLISH
}

export interface ExternalEventRow {
  id: string;
  provider_event_uid: string;
  title: string;
  description?: string;
  location?: string;
  start_date: string;
  start_time: string;
  end_date?: string;
  end_time?: string;
  is_all_day: boolean;
  external_last_modified?: string;
  raw_payload?: any;
  miss_count?: number;
  deleted?: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncOptions {
  graceHours?: number; // Hours before soft-deleting missing events (default: 6)
  fuzzyThreshold?: number; // Token overlap threshold for fuzzy matching (default: 0.65)
  dtToleranceSeconds?: number; // Time tolerance for matching in seconds (default: 300 = 5 minutes)
  maxMissCount?: number; // Max miss count before soft delete (default: 3)
}

export interface SyncOperations {
  creates: Array<{
    event: FetchedEvent;
    reason: string;
  }>;
  updates: Array<{
    dbRowId: string;
    event: FetchedEvent;
    reason: string;
  }>;
  softDeletes: Array<{
    dbRowId: string;
    reason: string;
  }>;
  restores: Array<{
    dbRowId: string;
    event: FetchedEvent;
    reason: string;
  }>;
  immediateDeletes: Array<{
    dbRowId: string;
    reason: string;
  }>;
}

/**
 * Tokenize a string for fuzzy matching.
 * Removes special characters except Danish letters (æ, ø, å).
 */
function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  
  const normalized = text.toLowerCase()
    .replace(/[^a-z0-9æøå\s]/g, ' ')
    .trim();
  
  const tokens = normalized.split(/\s+/).filter(t => t.length > 2);
  return new Set(tokens);
}

/**
 * Calculate Jaccard similarity (token overlap) between two strings.
 * Returns a value between 0 and 1.
 */
function calculateTokenOverlap(text1: string, text2: string): number {
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);
  
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);
  
  return intersection.size / union.size;
}

/**
 * Check if two timestamps are within tolerance.
 */
function isWithinTimeTolerance(
  dt1: Date,
  dt2: Date,
  toleranceSeconds: number
): boolean {
  const diffMs = Math.abs(dt1.getTime() - dt2.getTime());
  const diffSeconds = diffMs / 1000;
  
  return diffSeconds <= toleranceSeconds;
}

/**
 * Check if an event is cancelled.
 */
function isCancelled(event: FetchedEvent): boolean {
  const status = event.status?.toUpperCase();
  const method = event.method?.toUpperCase();
  
  return status === 'CANCELLED' || method === 'CANCEL';
}

/**
 * Match a fetched event to an existing database row.
 * 
 * Matching strategy (in order):
 * 1. Exact UID match
 * 2. Summary + start datetime exact match
 * 3. Fuzzy match (token overlap + time tolerance)
 */
function matchEvent(
  fetchedEvent: FetchedEvent,
  dbRows: ExternalEventRow[],
  options: Required<SyncOptions>
): ExternalEventRow | null {
  // Step 1: Try exact UID match
  for (const row of dbRows) {
    if (row.provider_event_uid === fetchedEvent.uid) {
      return row;
    }
  }
  
  // Step 2: Try exact summary + datetime match
  const fetchedStart = new Date(`${fetchedEvent.startDateString}T${fetchedEvent.startTimeString}`);
  
  for (const row of dbRows) {
    const rowStart = new Date(`${row.start_date}T${row.start_time}`);
    
    if (
      row.title === fetchedEvent.summary &&
      fetchedStart.getTime() === rowStart.getTime()
    ) {
      return row;
    }
  }
  
  // Step 3: Try fuzzy match
  let bestMatch: ExternalEventRow | null = null;
  let bestScore = 0;
  
  for (const row of dbRows) {
    const rowStart = new Date(`${row.start_date}T${row.start_time}`);
    
    // Check time tolerance first (optimization)
    if (!isWithinTimeTolerance(fetchedStart, rowStart, options.dtToleranceSeconds)) {
      continue;
    }
    
    // Calculate token overlap
    const summaryOverlap = calculateTokenOverlap(fetchedEvent.summary, row.title);
    const locationOverlap = fetchedEvent.location && row.location
      ? calculateTokenOverlap(fetchedEvent.location, row.location)
      : 0;
    
    // Combined score: summary is more important
    const score = summaryOverlap * 0.7 + locationOverlap * 0.3;
    
    if (score >= options.fuzzyThreshold && score > bestScore) {
      bestScore = score;
      bestMatch = row;
    }
  }
  
  return bestMatch;
}

/**
 * Compute sync operations for a calendar sync.
 * 
 * This function takes fetched events from an iCal feed and existing database rows,
 * and returns the operations needed to synchronize them.
 * 
 * @param fetched - Events fetched from the iCal feed
 * @param dbRows - Existing events in the database
 * @param methodCancel - Whether to handle METHOD:CANCEL (default: true)
 * @param opts - Sync options
 * @returns Sync operations to execute
 */
export function computeSyncOps(
  fetched: FetchedEvent[],
  dbRows: ExternalEventRow[],
  methodCancel: boolean = true,
  opts: SyncOptions = {}
): SyncOperations {
  const options: Required<SyncOptions> = {
    graceHours: opts.graceHours ?? 6,
    fuzzyThreshold: opts.fuzzyThreshold ?? 0.65,
    dtToleranceSeconds: opts.dtToleranceSeconds ?? 300, // 5 minutes
    maxMissCount: opts.maxMissCount ?? 3,
  };
  
  const operations: SyncOperations = {
    creates: [],
    updates: [],
    softDeletes: [],
    restores: [],
    immediateDeletes: [],
  };
  
  const matchedDbRowIds = new Set<string>();
  const now = new Date();
  
  // Process fetched events
  for (const event of fetched) {
    const matchedRow = matchEvent(event, dbRows, options);
    
    if (matchedRow) {
      matchedDbRowIds.add(matchedRow.id);
      
      // Check if event is cancelled
      if (methodCancel && isCancelled(event)) {
        // Immediate delete for cancelled events
        operations.immediateDeletes.push({
          dbRowId: matchedRow.id,
          reason: `Event cancelled (STATUS:${event.status || 'N/A'}, METHOD:${event.method || 'N/A'})`,
        });
        continue;
      }
      
      // Check if event was soft-deleted and should be restored
      if (matchedRow.deleted) {
        operations.restores.push({
          dbRowId: matchedRow.id,
          event: event,
          reason: 'Event reappeared in feed after soft delete',
        });
        continue;
      }
      
      // Update existing event
      operations.updates.push({
        dbRowId: matchedRow.id,
        event: event,
        reason: 'Event exists and needs update',
      });
    } else {
      // Check if new event is already cancelled
      if (methodCancel && isCancelled(event)) {
        // Don't create cancelled events
        console.log(`Skipping cancelled event: ${event.summary}`);
        continue;
      }
      
      // Create new event
      operations.creates.push({
        event: event,
        reason: 'New event not found in database',
      });
    }
  }
  
  // Process database rows that weren't matched (missing from feed)
  for (const row of dbRows) {
    if (matchedDbRowIds.has(row.id)) {
      continue; // Already processed
    }
    
    // Skip already deleted events
    if (row.deleted) {
      continue;
    }
    
    // Calculate how long the event has been missing
    const updatedAt = new Date(row.updated_at);
    const hoursSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);
    
    const missCount = row.miss_count ?? 0;
    
    // Check if event is past the grace period
    if (hoursSinceUpdate >= options.graceHours || missCount >= options.maxMissCount) {
      operations.softDeletes.push({
        dbRowId: row.id,
        reason: `Event missing from feed (${hoursSinceUpdate.toFixed(1)}h since update, miss_count: ${missCount})`,
      });
    } else {
      // Increment miss count (will be handled in update operation)
      console.log(`Event "${row.title}" missing but within grace period (${hoursSinceUpdate.toFixed(1)}h, miss_count: ${missCount})`);
    }
  }
  
  return operations;
}

/**
 * Helper function to create a datetime string from date and time strings.
 */
export function createDateTimeString(date: string, time: string): string {
  return `${date}T${time}`;
}

/**
 * Helper function to check if an event needs updating.
 * Compares key fields to determine if an update is necessary.
 */
export function needsUpdate(event: FetchedEvent, row: ExternalEventRow): boolean {
  // Compare title
  if (event.summary !== row.title) return true;
  
  // Compare description
  if ((event.description || '') !== (row.description || '')) return true;
  
  // Compare location
  if ((event.location || '') !== (row.location || '')) return true;
  
  // Compare start date/time
  if (event.startDateString !== row.start_date) return true;
  if (event.startTimeString !== row.start_time) return true;
  
  // Compare end date/time
  if (event.endDateString !== row.end_date) return true;
  if (event.endTimeString !== row.end_time) return true;
  
  // Compare all-day flag
  if (event.isAllDay !== row.is_all_day) return true;
  
  // Compare last modified
  if (event.lastModified && row.external_last_modified) {
    const fetchedModified = event.lastModified.getTime();
    const rowModified = new Date(row.external_last_modified).getTime();
    if (fetchedModified > rowModified) return true;
  }
  
  return false;
}
