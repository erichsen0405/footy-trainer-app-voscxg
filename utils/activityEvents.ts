export interface ActivityPatchEvent {
  activityId: string;
  updates: Record<string, any>;
}

type ActivityPatchListener = (event: ActivityPatchEvent) => void;

export interface ActivityDeleteEvent {
  activityIds?: string[];
  activityId?: string;
  seriesId?: string | null;
  reason?: string;
  action?: 'deleted' | 'restored';
}

type ActivityDeleteListener = (event: Required<Pick<ActivityDeleteEvent, 'action'>> & ActivityDeleteEvent) => void;

export interface ActivitiesRefreshRequestedEvent {
  reason?: string;
}

type ActivitiesRefreshListener = (event: ActivitiesRefreshRequestedEvent) => void;

let activitiesRefreshVersion = 0;
let lastActivitiesRefreshRequestedEvent: ActivitiesRefreshRequestedEvent = {};
const optimisticallyDeletedActivityIds = new Set<string>();
const optimisticallyDeletedSeriesIds = new Set<string>();

function normalizeId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

function normalizeDeleteEvent(event: ActivityDeleteEvent): ActivityDeleteEvent {
  const ids = new Set<string>();
  const directId = normalizeId(event.activityId);
  if (directId) ids.add(directId);
  (event.activityIds ?? []).forEach(id => {
    const normalized = normalizeId(id);
    if (normalized) ids.add(normalized);
  });

  return {
    ...event,
    activityId: directId ?? undefined,
    activityIds: Array.from(ids),
    seriesId: normalizeId(event.seriesId),
  };
}

class ActivityEventBus {
  private listeners = new Set<ActivityPatchListener>();

  emit(event: ActivityPatchEvent) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[activityEvents] listener failed:', error);
      }
    });
  }

  subscribe(listener: ActivityPatchListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

const activityEventBus = new ActivityEventBus();
const activityDeleteEventBus = new (class {
  private listeners = new Set<ActivityDeleteListener>();

  emit(event: Required<Pick<ActivityDeleteEvent, 'action'>> & ActivityDeleteEvent) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[activityEvents] delete listener failed:', error);
      }
    });
  }

  subscribe(listener: ActivityDeleteListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
})();
const activitiesRefreshEventBus = new (class {
  private listeners = new Set<ActivitiesRefreshListener>();

  emit(event: ActivitiesRefreshRequestedEvent) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[activityEvents] refresh listener failed:', error);
      }
    });
  }

  subscribe(listener: ActivitiesRefreshListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
})();

export function emitActivityPatch(event: ActivityPatchEvent) {
  activityEventBus.emit(event);
}

export function subscribeToActivityPatch(listener: ActivityPatchListener) {
  return activityEventBus.subscribe(listener);
}

export function emitActivityDeleted(event: ActivityDeleteEvent) {
  const payload = normalizeDeleteEvent(event);
  (payload.activityIds ?? []).forEach(id => optimisticallyDeletedActivityIds.add(id));
  if (payload.seriesId) {
    optimisticallyDeletedSeriesIds.add(payload.seriesId);
  }
  activityDeleteEventBus.emit({ ...payload, action: 'deleted' });
}

export function emitActivityDeleteRestored(event: ActivityDeleteEvent) {
  const payload = normalizeDeleteEvent(event);
  (payload.activityIds ?? []).forEach(id => optimisticallyDeletedActivityIds.delete(id));
  if (payload.seriesId) {
    optimisticallyDeletedSeriesIds.delete(payload.seriesId);
  }
  activityDeleteEventBus.emit({ ...payload, action: 'restored' });
}

export function subscribeToActivityDeleted(listener: ActivityDeleteListener) {
  return activityDeleteEventBus.subscribe(listener);
}

export function isActivityOptimisticallyDeleted(activity: {
  id?: unknown;
  series_id?: unknown;
  seriesId?: unknown;
} | null | undefined) {
  const activityId = normalizeId(activity?.id);
  if (activityId && optimisticallyDeletedActivityIds.has(activityId)) {
    return true;
  }

  const seriesId = normalizeId(activity?.series_id ?? activity?.seriesId);
  return !!seriesId && optimisticallyDeletedSeriesIds.has(seriesId);
}

export function emitActivitiesRefreshRequested(event: ActivitiesRefreshRequestedEvent = {}) {
  const payload = { ...event };
  lastActivitiesRefreshRequestedEvent = payload;
  activitiesRefreshVersion += 1;
  activitiesRefreshEventBus.emit(payload);
}

export function subscribeToActivitiesRefreshRequested(listener: ActivitiesRefreshListener) {
  return activitiesRefreshEventBus.subscribe(listener);
}

export function getActivitiesRefreshRequestedVersion() {
  return activitiesRefreshVersion;
}

export function getLastActivitiesRefreshRequestedEvent() {
  return lastActivitiesRefreshRequestedEvent;
}
