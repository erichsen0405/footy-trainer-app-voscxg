import { FunctionsHttpError } from '@supabase/functions-js';
import { supabase } from '@/integrations/supabase/client';
import type { OwnerPlayerCrmOwner, OwnerPlayerCrmWorkspace } from '@/services/ownerPlayerCrmService';

export type TrainingTemplateType = 'task' | 'exercise' | 'session' | 'week';
export type TrainingTemplateStatus = 'active' | 'archived';
export type TrainingTemplateItemType = 'task_template' | 'exercise' | 'session_template' | 'note' | 'focus' | 'feedback_requirement';

export interface TrainingTemplateExerciseTimer {
  activeSeconds: number;
  restSeconds: number;
  rounds: number;
}

export interface TrainingTemplateTaskConfig {
  title: string;
  description: string | null;
  categoryIds: string[];
  subtasks: { id?: string | null; title: string }[];
  videoUrl: string | null;
  videoUrls: string[];
  mediaNames: string[];
  reminderMinutes: number | null;
  afterTrainingEnabled: boolean;
  afterTrainingDelayMinutes: number | null;
  afterTrainingFeedbackEnableScore: boolean;
  afterTrainingFeedbackScoreExplanation: string | null;
  afterTrainingFeedbackEnableIntensity: boolean;
  afterTrainingFeedbackEnableNote: boolean;
  taskDurationEnabled: boolean;
  taskDurationMinutes: number | null;
  autoAddToActivities: boolean;
}

export interface TrainingTemplateFolder {
  id: string;
  ownerAccountId: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingTemplateLibraryItem {
  id: string;
  title: string;
  description: string | null;
  videoUrl: string | null;
  videoUrls: string[];
  mediaNames: string[];
  categoryPath: string | null;
  isSystem: boolean;
  trainerId: string | null;
  subtasks: { id: string; title: string; sortOrder: number }[];
}

export interface TrainingTemplateItem {
  id: string;
  templateId: string;
  parentItemId: string | null;
  itemType: TrainingTemplateItemType;
  sourceTaskTemplateId: string | null;
  sourceActivitySeriesId: string | null;
  linkedTemplateId: string | null;
  title: string;
  description: string | null;
  dayOffset: number;
  startTime: string | null;
  durationMinutes: number | null;
  sortOrder: number;
  config: Record<string, unknown>;
}

export interface TrainingTemplateSummary {
  id: string;
  ownerAccountId: string;
  templateType: TrainingTemplateType;
  title: string;
  description: string | null;
  status: TrainingTemplateStatus;
  folderId: string | null;
  folderName: string | null;
  focusAreas: string[];
  durationMinutes: number | null;
  defaultActivityCategoryId: string | null;
  defaultActivityCategoryName: string | null;
  sourceTaskTemplateId: string | null;
  activeVersionId: string | null;
  versionNumber: number;
  metadata: Record<string, unknown>;
  itemCount: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  items: TrainingTemplateItem[];
}

export interface OwnerTrainingTemplatesContext {
  isPlatformAdmin: boolean;
  workspaces: OwnerPlayerCrmWorkspace[];
  defaultOwnerAccountId: string | null;
}

export interface OwnerTrainingTemplatesPayload {
  ownerAccount: OwnerPlayerCrmOwner;
  actor: {
    userId: string;
    roles: string[];
    canManageTemplates: boolean;
  };
  folders: TrainingTemplateFolder[];
  templates: TrainingTemplateSummary[];
  summary: {
    total: number;
    active: number;
    archived: number;
    task: number;
    exercise: number;
    session: number;
    week: number;
  };
  libraryItems: TrainingTemplateLibraryItem[];
}

export interface TrainingTemplateItemInput {
  id?: string | null;
  parentItemId?: string | null;
  itemType: TrainingTemplateItemType;
  sourceTaskTemplateId?: string | null;
  sourceActivitySeriesId?: string | null;
  linkedTemplateId?: string | null;
  title: string;
  description?: string | null;
  dayOffset?: number | null;
  startTime?: string | null;
  durationMinutes?: number | null;
  sortOrder?: number | null;
  config?: Record<string, unknown> | null;
}

export interface TrainingTemplateInput {
  id?: string | null;
  ownerAccountId: string;
  templateType: TrainingTemplateType;
  title: string;
  description?: string | null;
  folderId?: string | null;
  focusAreas?: string[];
  durationMinutes?: number | null;
  defaultActivityCategoryId?: string | null;
  defaultActivityCategoryName?: string | null;
  status?: TrainingTemplateStatus;
  sourceTaskTemplateId?: string | null;
  taskConfig?: TrainingTemplateTaskConfig | null;
  exerciseTimer?: TrainingTemplateExerciseTimer | null;
  items?: TrainingTemplateItemInput[];
  changeNote?: string | null;
}

type TrainingTemplateEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string | { code?: string; message?: string };
};

function normalizeErrorBody(body: unknown): string | null {
  const payload = body as TrainingTemplateEnvelope<unknown> | null;
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.error === 'string') return payload.error;
  if (payload.error?.message) return payload.error.message;
  return null;
}

async function extractFunctionError(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError && error.context) {
    try {
      const body = await error.context.clone().json();
      return normalizeErrorBody(body) || fallback;
    } catch {
      return fallback;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

async function invokeTrainingTemplates<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manageTrainingTemplates', { body });

  if (error) {
    throw new Error(await extractFunctionError(error, 'Could not complete the template action.'));
  }

  const envelope = data as TrainingTemplateEnvelope<T> | T | null;
  if (envelope && typeof envelope === 'object' && 'success' in envelope) {
    const typedEnvelope = envelope as TrainingTemplateEnvelope<T>;
    if (typedEnvelope.success === false) {
      throw new Error(normalizeErrorBody(typedEnvelope) || 'Could not complete the template action.');
    }
    if (typedEnvelope.data !== undefined) {
      return typedEnvelope.data;
    }
  }

  return envelope as T;
}

export function fetchOwnerTrainingTemplatesContext(): Promise<OwnerTrainingTemplatesContext> {
  return invokeTrainingTemplates<OwnerTrainingTemplatesContext>({ action: 'context' });
}

export function fetchOwnerTrainingTemplates(ownerAccountId: string): Promise<OwnerTrainingTemplatesPayload> {
  return invokeTrainingTemplates<OwnerTrainingTemplatesPayload>({
    action: 'list',
    ownerAccountId,
  });
}

export function saveOwnerTrainingTemplate(input: TrainingTemplateInput): Promise<OwnerTrainingTemplatesPayload> {
  return invokeTrainingTemplates<OwnerTrainingTemplatesPayload>({
    action: 'upsertTemplate',
    ...input,
  });
}

export function duplicateOwnerTrainingTemplate(args: {
  ownerAccountId: string;
  templateId: string;
}): Promise<OwnerTrainingTemplatesPayload> {
  return invokeTrainingTemplates<OwnerTrainingTemplatesPayload>({
    action: 'duplicateTemplate',
    ownerAccountId: args.ownerAccountId,
    templateId: args.templateId,
  });
}

export function archiveOwnerTrainingTemplate(args: {
  ownerAccountId: string;
  templateId: string;
}): Promise<OwnerTrainingTemplatesPayload> {
  return invokeTrainingTemplates<OwnerTrainingTemplatesPayload>({
    action: 'archiveTemplate',
    ownerAccountId: args.ownerAccountId,
    templateId: args.templateId,
  });
}

export function restoreOwnerTrainingTemplate(args: {
  ownerAccountId: string;
  templateId: string;
}): Promise<OwnerTrainingTemplatesPayload> {
  return invokeTrainingTemplates<OwnerTrainingTemplatesPayload>({
    action: 'restoreTemplate',
    ownerAccountId: args.ownerAccountId,
    templateId: args.templateId,
  });
}

export function saveOwnerTrainingTemplateFolder(args: {
  ownerAccountId: string;
  folderId?: string | null;
  name: string;
  color?: string | null;
}): Promise<OwnerTrainingTemplatesPayload> {
  return invokeTrainingTemplates<OwnerTrainingTemplatesPayload>({
    action: 'upsertFolder',
    ownerAccountId: args.ownerAccountId,
    folderId: args.folderId ?? null,
    name: args.name,
    color: args.color ?? null,
  });
}
