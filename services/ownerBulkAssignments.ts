import { FunctionsHttpError } from '@supabase/functions-js';
import { supabase } from '@/integrations/supabase/client';

export const OWNER_BULK_ASSIGNMENTS_API_VERSION = 1 as const;

export type OwnerBulkAssignmentOwnerType = 'club' | 'private_coach_business';
export type OwnerBulkAssignmentOperation = 'assign' | 'update' | 'remove';
export type OwnerBulkAssignmentContentType =
  | 'activity'
  | 'exercise'
  | 'training_template'
  | 'program';
export type OwnerBulkAssignmentFilterField =
  | 'team'
  | 'tag'
  | 'crm_status'
  | 'age'
  | 'playing_level'
  | 'position'
  | 'program_enrollment';

export interface OwnerBulkAssignmentWorkspace {
  ownerAccountId: string;
  ownerType: OwnerBulkAssignmentOwnerType;
  name: string;
  roles: string[];
}

export interface OwnerBulkAssignmentOwner {
  ownerAccountId: string;
  ownerType: OwnerBulkAssignmentOwnerType;
  name: string;
}

export interface OwnerBulkAssignmentTeam {
  id: string;
  name: string;
}

export interface OwnerBulkAssignmentTag {
  id: string;
  name: string;
  color: string | null;
}

export interface OwnerBulkAssignmentProgramEnrollment {
  programId: string;
  status: string;
}

export interface OwnerBulkAssignmentRosterPlayer {
  playerId: string;
  name: string;
  status: string;
  crmStatus: string;
  dateOfBirth: string | null;
  age: number | null;
  playingLevel: string | null;
  positions: string[];
  tags: OwnerBulkAssignmentTag[];
  teams: OwnerBulkAssignmentTeam[];
  programEnrollments: OwnerBulkAssignmentProgramEnrollment[];
}

export interface OwnerBulkAssignmentActivity {
  id: string;
  title: string;
  status: 'active';
  activityDate: string | null;
  activityTime: string | null;
  location: string | null;
  isExternal: false;
  updatedAt: string | null;
}

export interface OwnerBulkAssignmentExercise {
  id: string;
  title: string;
  status: 'active';
  description: string | null;
  isSystem: boolean;
  updatedAt: string | null;
}

export interface OwnerBulkAssignmentTrainingTemplate {
  id: string;
  title: string;
  status: string;
  templateType: 'task' | 'exercise' | 'session' | 'week';
  description: string | null;
  updatedAt: string | null;
}

export interface OwnerBulkAssignmentProgram {
  id: string;
  title: string;
  status: 'published';
  level: string | null;
  durationWeeks: number;
  publishedVersion: number;
  updatedAt: string | null;
}

export interface OwnerBulkAssignmentContext {
  apiVersion: typeof OWNER_BULK_ASSIGNMENTS_API_VERSION;
  workspaces: OwnerBulkAssignmentWorkspace[];
  selectedOwnerAccountId: string | null;
  owner: OwnerBulkAssignmentOwner | null;
  roster: OwnerBulkAssignmentRosterPlayer[];
  filters: {
    teams: OwnerBulkAssignmentTeam[];
    tags: OwnerBulkAssignmentTag[];
    crmStatuses: string[];
    playingLevels: string[];
    positions: string[];
    enrollmentStatuses: string[];
  };
  content: {
    activities: OwnerBulkAssignmentActivity[];
    exercises: OwnerBulkAssignmentExercise[];
    trainingTemplates: OwnerBulkAssignmentTrainingTemplate[];
    programs: OwnerBulkAssignmentProgram[];
  };
}

export interface OwnerBulkAssignmentContentSelection {
  type: OwnerBulkAssignmentContentType;
  id: string;
}

export type OwnerBulkAssignmentFilter =
  | {
      field: Exclude<OwnerBulkAssignmentFilterField, 'age' | 'program_enrollment'>;
      values: string[];
      operator?: 'in';
    }
  | {
      field: 'age';
      values: number[];
      operator: 'between';
    }
  | {
      field: 'program_enrollment';
      values: string[];
      operator?: 'in';
      programId: string;
    };

export interface OwnerBulkAssignmentExclusions {
  playerIds?: string[];
  teamIds?: string[];
}

export interface OwnerBulkAssignmentOptions {
  startDate?: string;
  enrollmentStatus?: 'active' | 'paused';
  activityDate?: string;
  activityTime?: string;
  location?: string;
  title?: string;
  sourceTeamId?: string;
}

export interface OwnerBulkAssignmentPreviewInput {
  ownerAccountId: string;
  operation: OwnerBulkAssignmentOperation;
  content: OwnerBulkAssignmentContentSelection;
  includeAllPlayers?: boolean;
  filters?: OwnerBulkAssignmentFilter[];
  playerIds?: string[];
  exclusions?: OwnerBulkAssignmentExclusions;
  assignment?: OwnerBulkAssignmentOptions;
  targetBatchId?: string;
}

export type OwnerBulkAssignmentPreviewRecipientStatus =
  | 'create'
  | 'update'
  | 'remove'
  | 'duplicate'
  | 'conflict';

export interface OwnerBulkAssignmentPreviewPerson {
  playerId: string;
  name: string;
  reasons: string[];
  status?: OwnerBulkAssignmentPreviewRecipientStatus;
  conflictCode?: string | null;
}

export interface OwnerBulkAssignmentPreviewSummary {
  matched: number;
  included: number;
  excluded: number;
  duplicates: number;
  conflicts: number;
  willCreate: number;
  willUpdate: number;
  willRemove: number;
}

export interface OwnerBulkAssignmentPreview {
  apiVersion: typeof OWNER_BULK_ASSIGNMENTS_API_VERSION;
  ownerAccountId: string;
  operation: OwnerBulkAssignmentOperation;
  content: OwnerBulkAssignmentContentSelection & { title?: string | null };
  previewToken: string;
  expiresAt: string;
  summary: OwnerBulkAssignmentPreviewSummary;
  recipients: OwnerBulkAssignmentPreviewPerson[];
  excluded: OwnerBulkAssignmentPreviewPerson[];
  conflicts: OwnerBulkAssignmentPreviewPerson[];
}

export interface OwnerBulkAssignmentApplyInput extends OwnerBulkAssignmentPreviewInput {
  previewToken: string;
  idempotencyKey: string;
}

export type OwnerBulkAssignmentBatchStatus =
  | 'applied'
  | 'partially_applied'
  | 'rolled_back'
  | 'partially_rolled_back'
  | 'failed';

export interface OwnerBulkAssignmentBatchSummary {
  matched: number;
  included: number;
  excluded: number;
  duplicates: number;
  conflicts: number;
  created: number;
  updated: number;
  removed: number;
  skipped: number;
  failed: number;
  rollbackEligible?: number;
  rollbackConflicts?: number;
  rolledBack?: number;
}

export interface OwnerBulkAssignmentBatch {
  batchId: string;
  ownerAccountId: string;
  status: OwnerBulkAssignmentBatchStatus;
  operation: OwnerBulkAssignmentOperation;
  content: OwnerBulkAssignmentContentSelection & { title?: string | null };
  summary: OwnerBulkAssignmentBatchSummary;
  createdAt: string;
  appliedAt: string | null;
  rolledBackAt?: string | null;
}

export type OwnerBulkAssignmentBatchItemStatus =
  | 'created'
  | 'updated'
  | 'removed'
  | 'duplicate'
  | 'conflict'
  | 'skipped'
  | 'failed'
  | 'rolled_back'
  | 'rollback_conflict';

export interface OwnerBulkAssignmentBatchItem {
  itemId: string;
  playerId: string;
  name?: string | null;
  status: OwnerBulkAssignmentBatchItemStatus;
  targetType?: 'activity' | 'exercise_assignment' | 'training_template_assignment' | 'program_enrollment';
  targetId?: string | null;
  reasonCode?: string | null;
  message?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  createdAt: string;
  rolledBackAt?: string | null;
}

export interface OwnerBulkAssignmentApplyResult {
  apiVersion: typeof OWNER_BULK_ASSIGNMENTS_API_VERSION;
  ownerAccountId: string;
  batch: OwnerBulkAssignmentBatch;
  items: OwnerBulkAssignmentBatchItem[];
}

export interface OwnerBulkAssignmentRollbackEligibility {
  eligible: boolean;
  eligibleCount: number;
  conflictCount: number;
  reasonCode?: string | null;
}

export interface OwnerBulkAssignmentBatchDetail extends OwnerBulkAssignmentApplyResult {
  rollback: OwnerBulkAssignmentRollbackEligibility;
}

export interface OwnerBulkAssignmentRollbackResult extends OwnerBulkAssignmentApplyResult {
  summary: OwnerBulkAssignmentBatchSummary;
}

type OwnerBulkAssignmentEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string | { code?: string; message?: string; details?: unknown };
};

export class OwnerBulkAssignmentError extends Error {
  readonly code: string | null;
  readonly status: number | null;
  readonly details: unknown;

  constructor(message: string, options?: { code?: string | null; status?: number | null; details?: unknown }) {
    super(message);
    this.name = 'OwnerBulkAssignmentError';
    this.code = options?.code ?? null;
    this.status = options?.status ?? null;
    this.details = options?.details;
  }
}

function getEnvelopeError(payload: unknown): { message: string; code: string | null; details?: unknown } | null {
  if (!payload || typeof payload !== 'object') return null;
  const error = (payload as OwnerBulkAssignmentEnvelope<unknown>).error;
  if (typeof error === 'string') return { message: error, code: null };
  if (!error || typeof error !== 'object') return null;
  return {
    message: typeof error.message === 'string' && error.message.trim() ? error.message : 'Could not complete the bulk assignment action.',
    code: typeof error.code === 'string' ? error.code : null,
    details: error.details,
  };
}

async function toBulkAssignmentError(error: unknown, fallback: string): Promise<OwnerBulkAssignmentError> {
  if (error instanceof OwnerBulkAssignmentError) return error;

  if (error instanceof FunctionsHttpError && error.context) {
    const status = typeof error.context.status === 'number' ? error.context.status : null;
    try {
      const payload = await error.context.clone().json();
      const parsed = getEnvelopeError(payload);
      if (parsed) {
        return new OwnerBulkAssignmentError(parsed.message, {
          code: parsed.code,
          status,
          details: parsed.details,
        });
      }
    } catch {
      // Keep the transport fallback when an Edge Function returns a non-JSON body.
    }
    return new OwnerBulkAssignmentError(error.message || fallback, { status });
  }

  if (error instanceof Error && error.message) {
    return new OwnerBulkAssignmentError(error.message);
  }

  return new OwnerBulkAssignmentError(fallback);
}

async function invokeOwnerBulkAssignments<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manageOwnerBulkAssignments', { body });

  if (error) {
    throw await toBulkAssignmentError(error, 'Could not complete the bulk assignment action.');
  }

  const envelope = data as OwnerBulkAssignmentEnvelope<T> | T | null;
  if (envelope && typeof envelope === 'object' && 'success' in envelope) {
    const typedEnvelope = envelope as OwnerBulkAssignmentEnvelope<T>;
    if (typedEnvelope.success === false) {
      const parsed = getEnvelopeError(typedEnvelope);
      throw new OwnerBulkAssignmentError(
        parsed?.message ?? 'Could not complete the bulk assignment action.',
        { code: parsed?.code, details: parsed?.details },
      );
    }
    if (typedEnvelope.data !== undefined) return typedEnvelope.data;
  }

  return envelope as T;
}

export function createOwnerBulkAssignmentIdempotencyKey(scope = 'apply'): string {
  return `owner-bulk-${scope}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function isOwnerBulkAssignmentPreviewStaleError(error: unknown): boolean {
  return error instanceof OwnerBulkAssignmentError &&
    (error.code === 'BULK_PREVIEW_STALE' || (error.status === 409 && !error.code));
}

export function fetchOwnerBulkAssignmentContext(
  ownerAccountId?: string | null,
): Promise<OwnerBulkAssignmentContext> {
  return invokeOwnerBulkAssignments<OwnerBulkAssignmentContext>({
    action: 'context',
    ...(ownerAccountId ? { ownerAccountId } : {}),
  });
}

export function previewOwnerBulkAssignments(
  input: OwnerBulkAssignmentPreviewInput,
): Promise<OwnerBulkAssignmentPreview> {
  return invokeOwnerBulkAssignments<OwnerBulkAssignmentPreview>({
    action: 'preview',
    ...input,
  });
}

export function applyOwnerBulkAssignments(
  input: OwnerBulkAssignmentApplyInput,
): Promise<OwnerBulkAssignmentApplyResult> {
  return invokeOwnerBulkAssignments<OwnerBulkAssignmentApplyResult>({
    action: 'apply',
    ...input,
  });
}

export function fetchOwnerBulkAssignmentBatchDetail(args: {
  ownerAccountId: string;
  batchId: string;
}): Promise<OwnerBulkAssignmentBatchDetail> {
  return invokeOwnerBulkAssignments<OwnerBulkAssignmentBatchDetail>({
    action: 'batchDetail',
    ownerAccountId: args.ownerAccountId,
    batchId: args.batchId,
  });
}

export function rollbackOwnerBulkAssignmentBatch(args: {
  ownerAccountId: string;
  batchId: string;
  idempotencyKey?: string;
}): Promise<OwnerBulkAssignmentRollbackResult> {
  return invokeOwnerBulkAssignments<OwnerBulkAssignmentRollbackResult>({
    action: 'rollback',
    ownerAccountId: args.ownerAccountId,
    batchId: args.batchId,
    idempotencyKey: args.idempotencyKey ?? createOwnerBulkAssignmentIdempotencyKey('rollback'),
  });
}
