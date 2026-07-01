import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import * as CommonStyles from '@/styles/commonStyles';
import { Task } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { scheduleTaskReminderImmediate } from '@/utils/notificationScheduler';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import { pickAndUploadTaskMedia } from '@/utils/taskVideoUpload';
import { buildTaskVideoPayload, getTaskMediaType, isTaskMediaUrl, mergeTaskVideoUrls } from '@/utils/taskVideos';

/*
 * ========================================
 * PERFORMANCE CHECKLIST (STEP F)
 * ========================================
 * ✅ First render & loading:
 *    - No blocking before paint
 *    - Activity verification deferred to useEffect
 * 
 * ✅ Navigation:
 *    - No fetch in onPress/onOpen
 *    - Modal opens immediately
 * 
 * ✅ Render control:
 *    - useCallback for handlers (stable deps)
 *    - No inline handlers in render
 * 
 * ✅ Platform parity:
 *    - Same behavior iOS/Android/Web
 *    - Platform-specific delay handled correctly
 * ========================================
 */

const FALLBACK_COLORS = {
  primary: '#3B82F6',
  background: '#FFFFFF',
  cardBackground: '#F5F5F5',
  border: '#E2E8F0',
  text: '#111827',
  textSecondary: '#6B7280',
};

const colors =
  ((CommonStyles as any)?.colors as typeof FALLBACK_COLORS | undefined) ?? FALLBACK_COLORS;

const REMINDER_DELAY_OPTIONS = [
  { value: 0, label: '0' },
  { value: 15, label: '15' },
  { value: 30, label: '30' },
  { value: 60, label: '60' },
  { value: 120, label: '120' },
] as const;
const LOCAL_ACTIVITY_TEMPLATE_SOURCE = 'activity_local_task';
const TASK_LOCAL_OPTIONAL_COLUMNS = [
  'after_training_enabled',
  'after_training_delay_minutes',
  'task_duration_enabled',
  'task_duration_minutes',
] as const;
const TASK_FEEDBACK_OPTIONAL_COLUMNS = [
  'feedback_template_id',
  'is_feedback_task',
] as const;

const getTaskMediaLabel = (url: string): string => {
  const mediaType = getTaskMediaType(url);
  if (mediaType === 'image') return 'Image';
  if (mediaType === 'pdf') return 'PDF';
  if (String(url).toLowerCase().includes('youtu')) return 'YouTube';
  if (String(url).toLowerCase().includes('vimeo.com')) return 'Vimeo';
  if (String(url).toLowerCase().includes('instagram.com')) return 'Instagram';
  return 'Video';
};

type ActivityTaskFeedbackUpdatePayload = TablesUpdate<'activity_tasks'> & {
  is_feedback_task?: boolean;
};

type ActivityTaskFeedbackInsertPayload = TablesInsert<'activity_tasks'> & {
  is_feedback_task?: boolean;
};

type ExternalEventTaskFeedbackUpdatePayload = TablesUpdate<'external_event_tasks'> & {
  is_feedback_task?: boolean;
};

type ExternalEventTaskFeedbackInsertPayload = TablesInsert<'external_event_tasks'> & {
  is_feedback_task?: boolean;
};

const isMissingColumn = (error: any, columnName: string): boolean => {
  const needle = String(columnName ?? '').trim().toLowerCase();
  if (!needle.length) return false;
  const haystack = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(' | ');
  return haystack.includes(needle);
};

const hasMissingTaskLocalOptionError = (error: any): boolean =>
  TASK_LOCAL_OPTIONAL_COLUMNS.some((columnName) => isMissingColumn(error, columnName));
const hasMissingTaskFeedbackOptionError = (error: any): boolean =>
  TASK_FEEDBACK_OPTIONAL_COLUMNS.some((columnName) => isMissingColumn(error, columnName));

const omitTaskLocalOptions = (payload: Record<string, any>): Record<string, any> => {
  const next = { ...payload };
  delete next.after_training_enabled;
  delete next.after_training_delay_minutes;
  delete next.task_duration_enabled;
  delete next.task_duration_minutes;
  return next;
};

interface SubtaskDraft {
  id: string;
  title: string;
}

const createLocalId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const normalizeReminderValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
};

type FeedbackTaskCandidateRow = {
  id?: string | null;
  created_at?: string | null;
  completed?: boolean | null;
};

const feedbackTaskCanonicalSort = (
  a: FeedbackTaskCandidateRow,
  b: FeedbackTaskCandidateRow,
): number => {
  const completedDiff = Number(Boolean(b?.completed)) - Number(Boolean(a?.completed));
  if (completedDiff !== 0) return completedDiff;

  const aMs = new Date(String(a?.created_at ?? '')).getTime();
  const bMs = new Date(String(b?.created_at ?? '')).getTime();
  const aTime = Number.isFinite(aMs) ? aMs : 0;
  const bTime = Number.isFinite(bMs) ? bMs : 0;
  if (aTime !== bTime) return aTime - bTime;

  const aId = String(a?.id ?? '');
  const bId = String(b?.id ?? '');
  return aId.localeCompare(bId);
};

export const sortFeedbackTaskCandidates = <T extends FeedbackTaskCandidateRow>(rows: T[]): T[] =>
  [...rows].sort(feedbackTaskCanonicalSort);

interface CreateActivityTaskModalProps {
  visible: boolean;
  onClose: () => void;
  onSave?: (task: Omit<Task, 'id'>) => Promise<void>;
  onTaskCreated?: () => void | Promise<void>;
  onTaskUpdated?: () => void | Promise<void>;
  editingTask?: Partial<Task> & {
    id: string;
    task_template_id?: string | null;
    taskTemplateId?: string | null;
    feedback_template_id?: string | null;
    feedbackTemplateId?: string | null;
    reminder_minutes?: number | null;
    reminder?: number | null;
    after_training_enabled?: boolean | null;
    afterTrainingEnabled?: boolean;
    after_training_delay_minutes?: number | null;
    afterTrainingDelayMinutes?: number | null;
    task_duration_enabled?: boolean | null;
    taskDurationEnabled?: boolean;
    task_duration_minutes?: number | null;
    taskDurationMinutes?: number | null;
    video_url?: string | null;
    video_urls?: string[] | null;
    videoUrl?: string | null;
    videoUrls?: string[] | null;
  };
  activityId: string;
  activityTitle: string;
  activityDate?: Date | string | null;
  activityTime: string;
  isExternalActivity?: boolean;
}

export function CreateActivityTaskModal({
  visible,
  onClose,
  onSave,
  onTaskCreated,
  onTaskUpdated,
  editingTask,
  activityId,
  activityTitle,
  activityDate,
  activityTime,
  isExternalActivity = false,
}: CreateActivityTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hasReminder, setHasReminder] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState('0');
  const [hasAfterTrainingFeedback, setHasAfterTrainingFeedback] = useState(false);
  const [afterTrainingDelayMinutes, setAfterTrainingDelayMinutes] = useState('0');
  const [hasTaskDuration, setHasTaskDuration] = useState(false);
  const [taskDurationMinutes, setTaskDurationMinutes] = useState('0');
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([{ id: createLocalId(), title: '' }]);
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [activityExists, setActivityExists] = useState(false);
  const [resolvedExternalMetaId, setResolvedExternalMetaId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const isEditMode = !!editingTask?.id;

  const safeActivityDate = useMemo(() => {
    if (!activityDate) return null;
    const candidate = activityDate instanceof Date ? activityDate : new Date(activityDate);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }, [activityDate]);

  const activityDateLabel = useMemo(
    () => (safeActivityDate ? safeActivityDate.toLocaleDateString('en-US') : 'Unknown date'),
    [safeActivityDate],
  );
  const resolvedActivityLinkId = useMemo(() => {
    if (!isExternalActivity) {
      return String(activityId ?? '').trim();
    }
    return String(resolvedExternalMetaId ?? '').trim();
  }, [activityId, isExternalActivity, resolvedExternalMetaId]);

  const normalizeDurationInput = useCallback((raw: string): number => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 0;
    const rounded = Math.round(parsed);
    if (rounded < 0) return 0;
    if (rounded > 600) return 600;
    return rounded;
  }, []);

  const normalizeId = useCallback((value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : null;
  }, []);

  const buildFeedbackTaskTitle = useCallback((taskTitle: string): string => {
    const trimmed = String(taskTitle ?? '').trim();
    return `Feedback on ${trimmed || 'the task'}`;
  }, []);

  const buildFeedbackTaskDescription = useCallback((templateId: string): string => {
    const normalizedTemplateId = String(templateId ?? '').trim();
    return `Share your feedback after training directly with your coach. [auto-after-training:${normalizedTemplateId}]`;
  }, []);

  const upsertLocalTaskTemplate = useCallback(
    async ({
      ownerUserId,
      existingTemplateId,
      templateTitle,
      templateDescription,
      templateVideoUrl,
      templateVideoUrls,
      reminderMinutes,
      feedbackEnabled,
      feedbackDelayMinutes,
      taskDurationEnabled,
      taskDurationMinutes,
    }: {
      ownerUserId: string;
      existingTemplateId?: string | null;
      templateTitle: string;
      templateDescription: string;
      templateVideoUrl: string | null;
      templateVideoUrls: string[] | null;
      reminderMinutes: number | null;
      feedbackEnabled: boolean;
      feedbackDelayMinutes: number | null;
      taskDurationEnabled: boolean;
      taskDurationMinutes: number | null;
    }): Promise<string> => {
      const normalizedExistingTemplateId = normalizeId(existingTemplateId);
      let reusableTemplateId: string | null = null;

      if (normalizedExistingTemplateId) {
        const { data: existingTemplateRow, error: existingTemplateError } = await supabase
          .from('task_templates')
          .select('id, user_id, source_folder')
          .eq('id', normalizedExistingTemplateId)
          .maybeSingle();

        if (existingTemplateError) {
          throw new Error(`Could not load task template: ${existingTemplateError.message}`);
        }

        if (
          existingTemplateRow &&
          String(existingTemplateRow.user_id ?? '').trim() === ownerUserId &&
          String(existingTemplateRow.source_folder ?? '').trim() === LOCAL_ACTIVITY_TEMPLATE_SOURCE
        ) {
          reusableTemplateId = String(existingTemplateRow.id);
        }
      }

      const templatePayload = {
        title: templateTitle,
        description: templateDescription,
        video_url: templateVideoUrl,
        video_urls: templateVideoUrls,
        reminder_minutes: reminderMinutes,
        after_training_enabled: feedbackEnabled,
        after_training_delay_minutes: feedbackEnabled ? feedbackDelayMinutes : null,
        task_duration_enabled: taskDurationEnabled,
        task_duration_minutes: taskDurationEnabled ? taskDurationMinutes : null,
        after_training_feedback_enable_score: true,
        after_training_feedback_score_explanation: null,
        after_training_feedback_enable_note: true,
        after_training_feedback_enable_intensity: true,
        auto_add_to_activities: false,
        source_folder: LOCAL_ACTIVITY_TEMPLATE_SOURCE,
        updated_at: new Date().toISOString(),
      };

      if (reusableTemplateId) {
        const { error: updateError } = await supabase
          .from('task_templates')
          .update(templatePayload)
          .eq('id', reusableTemplateId)
          .eq('user_id', ownerUserId);

        if (updateError) {
          throw new Error(`Could not update local task template: ${updateError.message}`);
        }

        return reusableTemplateId;
      }

      const { data: insertedTemplate, error: insertError } = await supabase
        .from('task_templates')
        .insert({
          ...templatePayload,
          user_id: ownerUserId,
        })
        .select('id')
        .single();

      if (insertError || !insertedTemplate?.id) {
        throw new Error(
          `Could not create local task template: ${insertError?.message || 'Missing template ID'}`
        );
      }

      return String(insertedTemplate.id);
    },
    [normalizeId],
  );

  const syncLocalFeedbackTask = useCallback(
    async ({
      parentTaskId,
      activityLinkId,
      templateId,
      taskTitle,
      enabled,
      delayMinutes,
    }: {
      parentTaskId: string;
      activityLinkId?: string;
      templateId: string;
      taskTitle: string;
      enabled: boolean;
      delayMinutes: number | null;
    }) => {
      const parentId = String(parentTaskId ?? '').trim();
      const normalizedActivityLinkId = String(activityLinkId ?? activityId ?? '').trim();
      const normalizedTemplateId = String(templateId ?? '').trim();
      if (!parentId || !normalizedTemplateId || !normalizedActivityLinkId) return;

      const legacyMarker = `[[feedback_parent_task_id:${parentId}]]`;
      const description = buildFeedbackTaskDescription(normalizedTemplateId);
      const title = buildFeedbackTaskTitle(taskTitle);

      let supportsFeedbackColumns = true;
      let existingRows: any[] = [];
      const existingRowsFull = await supabase
        .from('activity_tasks')
        .select('id, description, created_at, completed, feedback_template_id, task_template_id, is_feedback_task')
        .eq('activity_id', normalizedActivityLinkId);

      if (existingRowsFull.error) {
        if (!hasMissingTaskFeedbackOptionError(existingRowsFull.error)) {
          throw new Error(`Could not load existing feedback task: ${existingRowsFull.error.message}`);
        }
        supportsFeedbackColumns = false;
        const existingRowsFallback = await supabase
          .from('activity_tasks')
          .select('id, description, created_at, completed, task_template_id')
          .eq('activity_id', normalizedActivityLinkId);
        if (existingRowsFallback.error) {
          throw new Error(`Could not load existing feedback task: ${existingRowsFallback.error.message}`);
        }
        existingRows = Array.isArray(existingRowsFallback.data) ? existingRowsFallback.data : [];
      } else {
        existingRows = Array.isArray(existingRowsFull.data) ? existingRowsFull.data : [];
      }

      const matchedRows = (existingRows || []).filter((row: any) => {
        const directFeedbackTemplateId =
          typeof row?.feedback_template_id === 'string' ? row.feedback_template_id.trim() : '';
        if (directFeedbackTemplateId && directFeedbackTemplateId === normalizedTemplateId) {
          return true;
        }

        const directTaskTemplateId =
          typeof row?.task_template_id === 'string' ? row.task_template_id.trim() : '';
        if (row?.is_feedback_task === true && directTaskTemplateId && directTaskTemplateId === normalizedTemplateId) {
          return true;
        }

        const rowDescription = typeof row?.description === 'string' ? row.description : '';
        const markerTemplateId = parseTemplateIdFromMarker(rowDescription);
        if (markerTemplateId && String(markerTemplateId).trim() === normalizedTemplateId) {
          return true;
        }
        return rowDescription.includes(legacyMarker);
      });

      const matchedRowsSorted = sortFeedbackTaskCandidates(
        matchedRows as {
          id?: string | null;
          created_at?: string | null;
          completed?: boolean | null;
        }[],
      );
      const matchedIds = matchedRowsSorted
        .map((row: any) => String(row?.id ?? '').trim())
        .filter((id: string) => id.length > 0);

      if (!enabled) {
        if (matchedIds.length) {
          const { error: deleteError } = await supabase
            .from('activity_tasks')
            .delete()
            .in('id', matchedIds);
          if (deleteError) {
            throw new Error(`Could not remove feedback task: ${deleteError.message}`);
          }
        }
        return;
      }

      if (matchedIds.length) {
        const keepId = matchedIds[0];
        const updateFeedbackPayload: ActivityTaskFeedbackUpdatePayload = {
          title,
          description,
          reminder_minutes: delayMinutes,
          task_template_id: null,
          updated_at: new Date().toISOString(),
        };
        if (supportsFeedbackColumns) {
          updateFeedbackPayload.feedback_template_id = normalizedTemplateId;
          updateFeedbackPayload.is_feedback_task = true;
        }
        const { error: updateFeedbackError } = await supabase
          .from('activity_tasks')
          .update(updateFeedbackPayload as any)
          .eq('id', keepId);
        if (updateFeedbackError) {
          throw new Error(`Could not update feedback task: ${updateFeedbackError.message}`);
        }

        if (matchedIds.length > 1) {
          const extras = matchedIds.slice(1);
          const { error: deleteExtrasError } = await supabase
            .from('activity_tasks')
            .delete()
            .in('id', extras);
          if (deleteExtrasError) {
            throw new Error(`Could not clean up extra feedback tasks: ${deleteExtrasError.message}`);
          }
        }

        return;
      }

      const insertFeedbackPayload: ActivityTaskFeedbackInsertPayload = {
        activity_id: normalizedActivityLinkId,
        title,
        description,
        completed: false,
        reminder_minutes: delayMinutes,
        task_template_id: null,
      };
      if (supportsFeedbackColumns) {
        insertFeedbackPayload.feedback_template_id = normalizedTemplateId;
        insertFeedbackPayload.is_feedback_task = true;
      }
      const { error: insertFeedbackError } = await supabase
        .from('activity_tasks')
        .insert(insertFeedbackPayload as any);

      if (insertFeedbackError) {
        throw new Error(`Could not create feedback task: ${insertFeedbackError.message}`);
      }
    },
    [activityId, buildFeedbackTaskDescription, buildFeedbackTaskTitle],
  );

  const syncExternalFeedbackTask = useCallback(
    async ({
      parentTaskId,
      localMetaId,
      templateId,
      taskTitle,
      enabled,
      delayMinutes,
    }: {
      parentTaskId: string;
      localMetaId: string;
      templateId: string;
      taskTitle: string;
      enabled: boolean;
      delayMinutes: number | null;
    }) => {
      const parentId = String(parentTaskId ?? '').trim();
      const normalizedLocalMetaId = String(localMetaId ?? '').trim();
      const normalizedTemplateId = String(templateId ?? '').trim();
      if (!parentId || !normalizedLocalMetaId || !normalizedTemplateId) return;

      const legacyMarker = `[[feedback_parent_task_id:${parentId}]]`;
      const description = buildFeedbackTaskDescription(normalizedTemplateId);
      const title = buildFeedbackTaskTitle(taskTitle);

      let supportsFeedbackColumns = true;
      let existingRows: any[] = [];
      const existingRowsFull = await supabase
        .from('external_event_tasks')
        .select('id, description, created_at, completed, feedback_template_id, task_template_id, is_feedback_task')
        .eq('local_meta_id', normalizedLocalMetaId);

      if (existingRowsFull.error) {
        if (!hasMissingTaskFeedbackOptionError(existingRowsFull.error)) {
          throw new Error(`Could not load existing feedback task: ${existingRowsFull.error.message}`);
        }
        supportsFeedbackColumns = false;
        const existingRowsFallback = await supabase
          .from('external_event_tasks')
          .select('id, description, created_at, completed, task_template_id')
          .eq('local_meta_id', normalizedLocalMetaId);
        if (existingRowsFallback.error) {
          throw new Error(`Could not load existing feedback task: ${existingRowsFallback.error.message}`);
        }
        existingRows = Array.isArray(existingRowsFallback.data) ? existingRowsFallback.data : [];
      } else {
        existingRows = Array.isArray(existingRowsFull.data) ? existingRowsFull.data : [];
      }

      const matchedRows = (existingRows || []).filter((row: any) => {
        const directFeedbackTemplateId =
          typeof row?.feedback_template_id === 'string' ? row.feedback_template_id.trim() : '';
        if (directFeedbackTemplateId && directFeedbackTemplateId === normalizedTemplateId) {
          return true;
        }

        const directTaskTemplateId =
          typeof row?.task_template_id === 'string' ? row.task_template_id.trim() : '';
        if (row?.is_feedback_task === true && directTaskTemplateId && directTaskTemplateId === normalizedTemplateId) {
          return true;
        }

        const rowDescription = typeof row?.description === 'string' ? row.description : '';
        const markerTemplateId = parseTemplateIdFromMarker(rowDescription);
        if (markerTemplateId && String(markerTemplateId).trim() === normalizedTemplateId) {
          return true;
        }
        return rowDescription.includes(legacyMarker);
      });

      const matchedRowsSorted = sortFeedbackTaskCandidates(
        matchedRows as {
          id?: string | null;
          created_at?: string | null;
          completed?: boolean | null;
        }[],
      );
      const matchedIds = matchedRowsSorted
        .map((row: any) => String(row?.id ?? '').trim())
        .filter((id: string) => id.length > 0);

      if (!enabled) {
        if (matchedIds.length) {
          const { error: deleteError } = await supabase
            .from('external_event_tasks')
            .delete()
            .in('id', matchedIds);
          if (deleteError) {
            throw new Error(`Could not remove feedback task: ${deleteError.message}`);
          }
        }
        return;
      }

      if (matchedIds.length) {
        const keepId = matchedIds[0];
        const updateFeedbackPayload: ExternalEventTaskFeedbackUpdatePayload = {
          title,
          description,
          reminder_minutes: delayMinutes,
          task_template_id: null,
          updated_at: new Date().toISOString(),
        };
        if (supportsFeedbackColumns) {
          updateFeedbackPayload.feedback_template_id = normalizedTemplateId;
          updateFeedbackPayload.is_feedback_task = true;
        }
        const { error: updateFeedbackError } = await supabase
          .from('external_event_tasks')
          .update(updateFeedbackPayload as any)
          .eq('id', keepId);
        if (updateFeedbackError) {
          throw new Error(`Could not update feedback task: ${updateFeedbackError.message}`);
        }

        if (matchedIds.length > 1) {
          const extras = matchedIds.slice(1);
          const { error: deleteExtrasError } = await supabase
            .from('external_event_tasks')
            .delete()
            .in('id', extras);
          if (deleteExtrasError) {
            throw new Error(`Could not clean up extra feedback tasks: ${deleteExtrasError.message}`);
          }
        }

        return;
      }

      const insertFeedbackPayload: ExternalEventTaskFeedbackInsertPayload = {
        local_meta_id: normalizedLocalMetaId,
        title,
        description,
        completed: false,
        reminder_minutes: delayMinutes,
        task_template_id: null,
      };
      if (supportsFeedbackColumns) {
        insertFeedbackPayload.feedback_template_id = normalizedTemplateId;
        insertFeedbackPayload.is_feedback_task = true;
      }
      const { error: insertFeedbackError } = await supabase
        .from('external_event_tasks')
        .insert(insertFeedbackPayload as any);

      if (insertFeedbackError) {
        throw new Error(`Could not create feedback task: ${insertFeedbackError.message}`);
      }
    },
    [buildFeedbackTaskDescription, buildFeedbackTaskTitle],
  );

  const syncActivitySubtasks = useCallback(async (activityTaskId: string, drafts: SubtaskDraft[]) => {
    const normalizedTaskId = String(activityTaskId ?? '').trim();
    if (!normalizedTaskId) return;

    const { error: deleteError } = await supabase
      .from('activity_task_subtasks')
      .delete()
      .eq('activity_task_id', normalizedTaskId);
    if (deleteError) {
      throw new Error(`Could not update subtasks: ${deleteError.message}`);
    }

    const validSubtasks = (drafts ?? [])
      .map((draft) => String(draft?.title ?? '').trim())
      .filter((value) => value.length > 0);
    if (!validSubtasks.length) return;

    const rows = validSubtasks.map((subtaskTitle, index) => ({
      activity_task_id: normalizedTaskId,
      title: subtaskTitle,
      sort_order: index,
    }));
    const { error: insertError } = await supabase
      .from('activity_task_subtasks')
      .insert(rows);
    if (insertError) {
      throw new Error(`Could not save subtasks: ${insertError.message}`);
    }
  }, []);

  const addSubtask = useCallback(() => {
    setSubtasks((prev) => [...prev, { id: createLocalId(), title: '' }]);
  }, []);

  const updateSubtask = useCallback((index: number, value: string) => {
    setSubtasks((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], title: value };
      return next;
    });
  }, []);

  const removeSubtask = useCallback((index: number) => {
    setSubtasks((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, rowIndex) => rowIndex !== index);
    });
  }, []);

  const handleReminderToggle = useCallback((value: boolean) => {
    setHasReminder(value);
    if (value) {
      setReminderMinutes((current) => String(normalizeReminderValue(current) ?? 0));
      return;
    }
    setReminderMinutes('0');
  }, []);

  const handleAfterTrainingToggle = useCallback(
    (value: boolean) => {
      setHasAfterTrainingFeedback(value);
      if (value) {
        setAfterTrainingDelayMinutes((current) => String(normalizeDurationInput(current)));
        return;
      }
      setAfterTrainingDelayMinutes('0');
    },
    [normalizeDurationInput],
  );

  const handleTaskDurationToggle = useCallback(
    (value: boolean) => {
      setHasTaskDuration(value);
      if (value) {
        setTaskDurationMinutes((current) => String(normalizeDurationInput(current)));
        return;
      }
      setTaskDurationMinutes('0');
    },
    [normalizeDurationInput],
  );

  const handleAddVideoUrl = useCallback(() => {
    const trimmed = videoUrlInput.trim();
    if (!trimmed) return;
    if (!isTaskMediaUrl(trimmed)) {
      Alert.alert('Error', 'Invalid media. Use a video, image, or PDF link.');
      return;
    }
    setVideoUrls(prev => mergeTaskVideoUrls(prev, trimmed));
    setVideoUrlInput('');
  }, [videoUrlInput]);

  const handlePickVideo = useCallback(async () => {
    if (!userId) {
      Alert.alert('Error', 'You must be logged in to upload files.');
      return;
    }

    setIsUploadingVideo(true);
    try {
      const uploadedMedia = await pickAndUploadTaskMedia(userId);
      if (!uploadedMedia) return;
      setVideoUrls(prev => mergeTaskVideoUrls(prev, uploadedMedia.publicUrl));
      Alert.alert('File uploaded', 'The file has been added to the task.');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to upload file.');
    } finally {
      setIsUploadingVideo(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!visible) return;
    if (!isEditMode || !editingTask) {
      setTitle('');
      setDescription('');
      setHasReminder(false);
      setReminderMinutes('0');
      setHasAfterTrainingFeedback(false);
      setAfterTrainingDelayMinutes('0');
      setHasTaskDuration(false);
      setTaskDurationMinutes('0');
      setVideoUrls([]);
      setVideoUrlInput('');
      setSubtasks([{ id: createLocalId(), title: '' }]);
      return;
    }

    const reminderValue = editingTask.reminder_minutes ?? editingTask.reminder ?? null;
    const afterTrainingEnabled =
      editingTask.after_training_enabled === true || editingTask.afterTrainingEnabled === true;
    const afterTrainingDelay =
      editingTask.after_training_delay_minutes ?? editingTask.afterTrainingDelayMinutes ?? 0;
    const durationEnabled =
      editingTask.task_duration_enabled === true || editingTask.taskDurationEnabled === true;
    const durationMinutesRaw =
      editingTask.task_duration_minutes ?? editingTask.taskDurationMinutes ?? 0;

    setTitle(String(editingTask.title ?? ''));
    setDescription(String(editingTask.description ?? ''));
    setHasReminder(typeof reminderValue === 'number' && Number.isFinite(reminderValue));
    setReminderMinutes(
      typeof reminderValue === 'number' && Number.isFinite(reminderValue)
        ? String(Math.max(0, Math.round(reminderValue)))
        : '0',
    );
    setHasAfterTrainingFeedback(afterTrainingEnabled);
    setAfterTrainingDelayMinutes(String(normalizeDurationInput(String(afterTrainingDelay))));
    setHasTaskDuration(durationEnabled);
    setTaskDurationMinutes(String(normalizeDurationInput(String(durationMinutesRaw))));
    setVideoUrls(buildTaskVideoPayload([
      ...(Array.isArray(editingTask.videoUrls) ? editingTask.videoUrls : []),
      ...(Array.isArray(editingTask.video_urls) ? editingTask.video_urls : []),
      editingTask.videoUrl,
      editingTask.video_url,
    ]).videoUrls);
    setVideoUrlInput('');
  }, [editingTask, isEditMode, normalizeDurationInput, visible]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!visible || !isEditMode || !editingTask?.id) return;

      try {
        const { data, error } = await supabase
          .from('activity_task_subtasks')
          .select('id, title, sort_order')
          .eq('activity_task_id', editingTask.id)
          .order('sort_order', { ascending: true });

        if (cancelled) return;
        if (error || !Array.isArray(data) || !data.length) {
          setSubtasks([{ id: createLocalId(), title: '' }]);
          return;
        }

        setSubtasks(
          data.map((row: any) => ({
            id: String(row?.id ?? createLocalId()),
            title: String(row?.title ?? ''),
          })),
        );
      } catch {
        if (!cancelled) {
          setSubtasks([{ id: createLocalId(), title: '' }]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editingTask?.id, isEditMode, visible]);

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setUserId(null);
        return;
      }
      setUserId(data.session?.user?.id ?? null);
    };
    getCurrentUser();
  }, []);

  // Verify activity exists before allowing task creation
  useEffect(() => {
    const verifyActivity = async () => {
      if (!activityId || !visible) {
        setActivityExists(false);
        setResolvedExternalMetaId(null);
        return;
      }

      try {
        if (isExternalActivity) {
          const { data: directMeta, error: directMetaError } = await supabase
            .from('events_local_meta')
            .select('id')
            .eq('id', activityId)
            .maybeSingle();

          if (directMetaError) {
            setResolvedExternalMetaId(null);
            setActivityExists(false);
            return;
          }

          if (directMeta?.id) {
            setResolvedExternalMetaId(String(directMeta.id));
            setActivityExists(true);
            return;
          }

          const { data: linkedMeta, error: linkedMetaError } = await supabase
            .from('events_local_meta')
            .select('id')
            .eq('external_event_id', activityId)
            .maybeSingle();

          if (linkedMetaError || !linkedMeta?.id) {
            setResolvedExternalMetaId(null);
            setActivityExists(false);
            return;
          }

          setResolvedExternalMetaId(String(linkedMeta.id));
          setActivityExists(true);
          return;
        }

        const { data, error } = await supabase
          .from('activities')
          .select('id')
          .eq('id', activityId)
          .single();

        setResolvedExternalMetaId(null);
        setActivityExists(!error && !!data);
      } catch (error) {
        setResolvedExternalMetaId(null);
        setActivityExists(false);
      }
    };

    // Add a small delay on iOS to ensure the activity is fully committed
    if (Platform.OS === 'ios' && visible) {
      const hours = setTimeout(() => {
        verifyActivity();
      }, 500);
      return () => clearTimeout(hours);
    } else {
      verifyActivity();
    }
  }, [activityId, isExternalActivity, visible]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Assignment title is required');
      return;
    }

    if (!userId) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    if (isUploadingVideo) {
      Alert.alert('Please wait', 'The file is still uploading. Please try again in a moment.');
      return;
    }

    if (videoUrlInput.trim() && !isTaskMediaUrl(videoUrlInput)) {
      Alert.alert('Error', 'Invalid media. Use a video, image, or PDF link.');
      return;
    }

    if (!activityExists || !resolvedActivityLinkId) {
      Alert.alert(
        'Please wait',
        isExternalActivity
          ? 'The activity is still syncing. Please try again in a moment.'
          : 'The activity is being created. Please try again in a moment.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsLoading(true);

    try {
      const reminderPayload = hasReminder
        ? normalizeReminderValue(reminderMinutes) ?? 0
        : null;
      const feedbackDelayPayload = hasAfterTrainingFeedback
        ? normalizeDurationInput(afterTrainingDelayMinutes)
        : null;
      const taskDurationPayload = hasTaskDuration
        ? normalizeDurationInput(taskDurationMinutes)
        : null;
      const videoPayload = buildTaskVideoPayload([...videoUrls, videoUrlInput]);

      const localTemplateId = await upsertLocalTaskTemplate({
        ownerUserId: userId,
        existingTemplateId:
          isEditMode && editingTask
            ? editingTask.task_template_id ?? editingTask.taskTemplateId
            : null,
        templateTitle: title.trim(),
        templateDescription: description.trim(),
        templateVideoUrl: videoPayload.videoUrl,
        templateVideoUrls: videoPayload.video_urls,
        reminderMinutes: reminderPayload,
        feedbackEnabled: hasAfterTrainingFeedback,
        feedbackDelayMinutes: feedbackDelayPayload,
        taskDurationEnabled: hasTaskDuration,
        taskDurationMinutes: taskDurationPayload,
      });
      const baseTaskPayload: Record<string, any> = {
        title: title.trim(),
        description: description.trim(),
        video_urls: videoPayload.video_urls,
        completed: false,
        reminder_minutes: reminderPayload,
        task_template_id: localTemplateId,
        after_training_enabled: hasAfterTrainingFeedback,
        after_training_delay_minutes: feedbackDelayPayload,
        task_duration_enabled: hasTaskDuration,
        task_duration_minutes: taskDurationPayload,
      };
      const baseTaskPayloadWithoutLocalOptions = omitTaskLocalOptions(baseTaskPayload);
      const buildTaskUpdatePayload = () => ({
        ...baseTaskPayload,
        updated_at: new Date().toISOString(),
      });

      const runTaskUpdate = async (
        table: 'activity_tasks' | 'external_event_tasks',
        linkColumn: 'activity_id' | 'local_meta_id',
        taskId: string,
      ): Promise<boolean> => {
        const updatePayload = buildTaskUpdatePayload();
        let updateResponse = await (supabase as any)
          .from(table)
          .update(updatePayload)
          .eq('id', taskId)
          .eq(linkColumn, resolvedActivityLinkId)
          .select('id');

        if (updateResponse.error && hasMissingTaskLocalOptionError(updateResponse.error)) {
          const fallbackPayload = omitTaskLocalOptions(updatePayload);
          updateResponse = await (supabase as any)
            .from(table)
            .update(fallbackPayload)
            .eq('id', taskId)
            .eq(linkColumn, resolvedActivityLinkId)
            .select('id');
        }

        if (updateResponse.error) {
          throw new Error(`Database fejl: ${updateResponse.error.message}`);
        }

        return Array.isArray(updateResponse.data) && updateResponse.data.length > 0;
      };

      const runTaskInsert = async (
        table: 'activity_tasks' | 'external_event_tasks',
        linkColumn: 'activity_id' | 'local_meta_id',
      ): Promise<any> => {
        const insertPayload: Record<string, any> = {
          [linkColumn]: resolvedActivityLinkId,
          ...baseTaskPayload,
        };

        let insertResponse = await (supabase as any)
          .from(table)
          .insert(insertPayload)
          .select()
          .single();

        if (insertResponse.error && hasMissingTaskLocalOptionError(insertResponse.error)) {
          const fallbackPayload: Record<string, any> = {
            [linkColumn]: resolvedActivityLinkId,
            ...baseTaskPayloadWithoutLocalOptions,
          };
          insertResponse = await (supabase as any)
            .from(table)
            .insert(fallbackPayload)
            .select()
            .single();
        }

        if (insertResponse.error) {
          throw new Error(`Database fejl: ${insertResponse.error.message}`);
        }

        if (!insertResponse.data) {
          throw new Error('No data returned from the database');
        }

        return insertResponse.data;
      };

      if (isEditMode && editingTask?.id) {
        let activeTable: 'activity_tasks' | 'external_event_tasks' = isExternalActivity
          ? 'external_event_tasks'
          : 'activity_tasks';
        let updated = await runTaskUpdate(
          activeTable,
          activeTable === 'external_event_tasks' ? 'local_meta_id' : 'activity_id',
          editingTask.id,
        );

        if (!updated && isExternalActivity) {
          updated = await runTaskUpdate('activity_tasks', 'activity_id', editingTask.id);
          if (updated) {
            activeTable = 'activity_tasks';
          }
        }

        if (!updated) {
          throw new Error('The task could not be found on the activity.');
        }

        if (activeTable === 'activity_tasks') {
          await syncActivitySubtasks(editingTask.id, subtasks);
          await syncLocalFeedbackTask({
            parentTaskId: editingTask.id,
            activityLinkId: resolvedActivityLinkId,
            templateId: localTemplateId,
            taskTitle: title.trim(),
            enabled: hasAfterTrainingFeedback,
            delayMinutes: feedbackDelayPayload,
          });
        } else {
          await syncExternalFeedbackTask({
            parentTaskId: editingTask.id,
            localMetaId: resolvedActivityLinkId,
            templateId: localTemplateId,
            taskTitle: title.trim(),
            enabled: hasAfterTrainingFeedback,
            delayMinutes: feedbackDelayPayload,
          });
        }

        Alert.alert('Task updated', `The task "${title}" was updated.`, [{ text: 'OK' }]);
        if (onTaskUpdated) {
          await onTaskUpdated();
        }
      } else {
        if (!isExternalActivity) {
          const { data: activityCheck, error: activityCheckError } = await supabase
            .from('activities')
            .select('id')
            .eq('id', resolvedActivityLinkId)
            .single();

          if (activityCheckError || !activityCheck) {
            throw new Error('The activity could not be found. Try closing and opening the activity again.');
          }
        }

        const activeTable: 'activity_tasks' | 'external_event_tasks' = isExternalActivity
          ? 'external_event_tasks'
          : 'activity_tasks';
        const taskData = await runTaskInsert(
          activeTable,
          activeTable === 'external_event_tasks' ? 'local_meta_id' : 'activity_id',
        );

        if (activeTable === 'activity_tasks') {
          await syncActivitySubtasks(String(taskData.id), subtasks);
          await syncLocalFeedbackTask({
            parentTaskId: String(taskData.id),
            activityLinkId: resolvedActivityLinkId,
            templateId: localTemplateId,
            taskTitle: title.trim(),
            enabled: hasAfterTrainingFeedback,
            delayMinutes: feedbackDelayPayload,
          });
        } else {
          await syncExternalFeedbackTask({
            parentTaskId: String(taskData.id),
            localMetaId: resolvedActivityLinkId,
            templateId: localTemplateId,
            taskTitle: title.trim(),
            enabled: hasAfterTrainingFeedback,
            delayMinutes: feedbackDelayPayload,
          });
        }

        if (!isExternalActivity && hasReminder && safeActivityDate) {
          const activityDateStr = safeActivityDate.toISOString().split('T')[0];
          const success = await scheduleTaskReminderImmediate(
            taskData.id,
            title.trim(),
            description.trim(),
            resolvedActivityLinkId,
            activityTitle,
            activityDateStr,
            activityTime,
            reminderPayload ?? 0
          );

          if (success) {
            Alert.alert(
              'Task created',
              `The task "${title}" was created with a reminder ${reminderPayload ?? 0} minutes before the activity.`,
              [{ text: 'OK' }]
            );
          } else {
            Alert.alert(
              'Task created',
              `The task "${title}" was created. The reminder will be scheduled automatically.`,
              [{ text: 'OK' }]
            );
          }
        } else if (!isExternalActivity && hasReminder && !safeActivityDate) {
          Alert.alert(
            'Task created',
            `The task "${title}" was created, but a reminder could not be scheduled without a valid date.`,
            [{ text: 'OK' }],
          );
        } else {
          Alert.alert('Task created', `The task "${title}" was created.`, [{ text: 'OK' }]);
        }

        if (onTaskCreated) {
          await onTaskCreated();
        }
      }

      if (onSave) {
        await onSave({
          title: title.trim(),
          description: description.trim(),
          completed: false,
          isTemplate: false,
          categoryIds: [],
          reminder: reminderPayload ?? undefined,
          videoUrl: videoPayload.videoUrl ?? undefined,
          videoUrls: videoPayload.videoUrls,
          afterTrainingEnabled: hasAfterTrainingFeedback,
          afterTrainingDelayMinutes: hasAfterTrainingFeedback
            ? normalizeDurationInput(afterTrainingDelayMinutes)
            : null,
          taskDurationEnabled: hasTaskDuration,
          taskDurationMinutes: hasTaskDuration ? normalizeDurationInput(taskDurationMinutes) : null,
          subtasks: subtasks
            .map((draft) => String(draft?.title ?? '').trim())
            .filter(Boolean)
            .map((subtaskTitle) => ({ id: createLocalId(), title: subtaskTitle, completed: false })),
        });
      }

      // Reset form and close
      setTitle('');
      setDescription('');
      setHasReminder(false);
      setReminderMinutes('0');
      setHasAfterTrainingFeedback(false);
      setAfterTrainingDelayMinutes('0');
      setHasTaskDuration(false);
      setTaskDurationMinutes('0');
      setVideoUrls([]);
      setVideoUrlInput('');
      setSubtasks([{ id: createLocalId(), title: '' }]);
      onClose();
    } catch (error: any) {
      console.error('❌ Error in handleSave:', error);
      console.error('  Error type:', typeof error);
      console.error('  Error name:', error?.name);
      console.error('  Error message:', error?.message);
      console.error('  Error stack:', error?.stack);
      
      Alert.alert(
        'Error',
        error?.message || 'Could not create task. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    title,
    userId,
    isUploadingVideo,
    activityExists,
    resolvedActivityLinkId,
    activityTitle,
    safeActivityDate,
    activityTime,
    hasReminder,
    reminderMinutes,
    subtasks,
    hasAfterTrainingFeedback,
    afterTrainingDelayMinutes,
    hasTaskDuration,
    taskDurationMinutes,
    videoUrls,
    videoUrlInput,
    normalizeDurationInput,
    upsertLocalTaskTemplate,
    syncActivitySubtasks,
    syncLocalFeedbackTask,
    syncExternalFeedbackTask,
    description,
    onSave,
    onTaskCreated,
    onTaskUpdated,
    onClose,
    isEditMode,
    editingTask,
    isExternalActivity,
  ]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {
        if (!isLoading && !isUploadingVideo) onClose();
      }}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isEditMode ? 'Edit task' : 'New task'}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              disabled={isLoading || isUploadingVideo}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.activityInfo}>
            For: {activityTitle}
          </Text>
          <Text style={styles.activityInfo}>
            Date: {activityDateLabel}
            {safeActivityDate ? ` at ${activityTime}` : ''}
          </Text>

          {!activityExists && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>
                ⏳ {isExternalActivity
                  ? 'Waiting for external activity to sync...'
                  : 'Waiting for the activity to be created...'}
              </Text>
            </View>
          )}

          <ScrollView 
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Task title"
              placeholderTextColor={colors.textSecondary}
              editable={activityExists}
              returnKeyType="next"
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Task description"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
              editable={activityExists}
              textAlignVertical="top"
            />

            <View style={styles.videoSection}>
              <View style={styles.videoLabelRow}>
                <Text style={styles.label}>Media</Text>
                <Text style={styles.videoCountText}>
                  {videoUrls.length ? `${videoUrls.length} added` : 'None added'}
                </Text>
              </View>
              <TextInput
                style={styles.input}
                value={videoUrlInput}
                onChangeText={setVideoUrlInput}
                placeholder="Paste a video, image, or PDF link"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={activityExists && !isUploadingVideo}
              />
              <TouchableOpacity
                style={[
                  styles.addVideoUrlButton,
                  (!activityExists || isUploadingVideo || !videoUrlInput.trim()) && styles.uploadVideoButtonDisabled,
                ]}
                onPress={handleAddVideoUrl}
                disabled={!activityExists || isUploadingVideo || !videoUrlInput.trim()}
                activeOpacity={0.85}
              >
                <Text style={styles.addVideoUrlButtonText}>Add media link</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.uploadVideoButton,
                  (!activityExists || isUploadingVideo) && styles.uploadVideoButtonDisabled,
                ]}
                onPress={handlePickVideo}
                disabled={!activityExists || isUploadingVideo}
                activeOpacity={0.85}
              >
                <Text style={styles.uploadVideoButtonText}>
                  {isUploadingVideo ? 'Uploading file...' : 'Choose image, video, or PDF'}
                </Text>
              </TouchableOpacity>
              {videoUrls.length ? (
                <View style={styles.videoList}>
                  {videoUrls.map((url, index) => (
                    <View key={`${url}-${index}`} style={styles.videoListItem}>
                      <View style={styles.videoListTextWrap}>
                        <Text style={styles.videoListTitle}>Media {index + 1}</Text>
                        <Text style={styles.videoListSubtitle} numberOfLines={1}>
                          {getTaskMediaLabel(url)}
                          {videoUrls.length > 1 ? ' - swipe in the viewer' : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.removeVideoButton}
                        onPress={() => setVideoUrls(prev => prev.filter((_, currentIndex) => currentIndex !== index))}
                        disabled={!activityExists || isUploadingVideo}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.removeVideoButtonText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  {videoUrls.length > 1 ? (
                    <Text style={styles.videoSuccessText}>Swipe sideways in the task to switch between files.</Text>
                  ) : null}
                </View>
              ) : null}
              {videoUrlInput.trim() && !isTaskMediaUrl(videoUrlInput) ? (
                <Text style={styles.videoErrorText}>
                  Invalid media. Use a video, image, or PDF link.
                </Text>
              ) : null}
            </View>

            <View style={styles.subtasksSection}>
              <View style={styles.subtasksHeader}>
                <Text style={styles.label}>Subtasks</Text>
                <TouchableOpacity
                  style={[styles.addSubtaskButton, !activityExists && styles.addSubtaskButtonDisabled]}
                  onPress={addSubtask}
                  disabled={!activityExists}
                >
                  <Text style={styles.addSubtaskButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
              {subtasks.map((subtask, index) => (
                <View key={subtask.id} style={styles.subtaskRow}>
                  <TextInput
                    style={[styles.input, styles.subtaskInput]}
                    value={subtask.title}
                    onChangeText={(value) => updateSubtask(index, value)}
                    placeholder={`Subtask ${index + 1}`}
                    placeholderTextColor={colors.textSecondary}
                    editable={activityExists}
                  />
                  {subtasks.length > 1 && (
                    <TouchableOpacity
                      style={styles.removeSubtaskButton}
                      onPress={() => removeSubtask(index)}
                      disabled={!activityExists}
                    >
                      <Text style={styles.removeSubtaskButtonText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>

            <View style={styles.reminderSectionCard}>
              <View style={styles.reminderSectionHeader}>
                <View style={styles.toggleTextWrapper}>
                  <Text style={styles.toggleLabel}>Reminder before start</Text>
                  <Text style={styles.toggleHelperText}>
                    Turn on to show a reminder before the activity starts.
                  </Text>
                </View>
                <Switch
                  value={hasReminder}
                  onValueChange={handleReminderToggle}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                  ios_backgroundColor={colors.border}
                  disabled={!activityExists}
                />
              </View>

              {hasReminder && (
                <View style={styles.reminderSectionBody}>
                  <Text style={styles.label}>Minutes before start</Text>
                  <View style={styles.delayOptionsRow}>
                  {REMINDER_DELAY_OPTIONS.map((option) => {
                    const selected = normalizeDurationInput(reminderMinutes) === option.value;
                    return (
                      <TouchableOpacity
                        key={`reminder-delay-${option.value}`}
                        style={[
                          styles.delayOption,
                          selected && styles.delayOptionSelected,
                          !activityExists && styles.delayOptionDisabled,
                        ]}
                        onPress={() => setReminderMinutes(String(option.value))}
                        disabled={!activityExists}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.delayOptionText, selected && styles.delayOptionTextSelected]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  </View>
                  <Text style={styles.helperText}>
                    0 = at start time. The reminder is displayed before the activity's start time.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.reminderSectionSpacing} />

            <View style={styles.reminderSectionCard}>
              <View style={styles.reminderSectionHeader}>
                <View style={styles.toggleTextWrapper}>
                  <Text style={styles.toggleLabel}>Create post-training feedback</Text>
                  <Text style={styles.toggleHelperText}>
                    When this template is used on an activity, a post-training feedback task is automatically created for the activity.
                  </Text>
                </View>
                <Switch
                  value={hasAfterTrainingFeedback}
                  onValueChange={handleAfterTrainingToggle}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                  ios_backgroundColor={colors.border}
                  disabled={!activityExists}
                />
              </View>

              {hasAfterTrainingFeedback && (
                <View style={styles.reminderSectionBody}>
                  <Text style={styles.label}>Reminder after end (minutes)</Text>
                  <View style={styles.delayOptionsRow}>
                  {REMINDER_DELAY_OPTIONS.map((option) => {
                    const selected = normalizeDurationInput(afterTrainingDelayMinutes) === option.value;
                    return (
                      <TouchableOpacity
                        key={`feedback-delay-${option.value}`}
                        style={[
                          styles.delayOption,
                          selected && styles.delayOptionSelected,
                          !activityExists && styles.delayOptionDisabled,
                        ]}
                        onPress={() => setAfterTrainingDelayMinutes(String(option.value))}
                        disabled={!activityExists}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.delayOptionText, selected && styles.delayOptionTextSelected]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  </View>
                  <Text style={styles.helperText}>Shown after the activity's end time + selected delay.</Text>
                </View>
              )}
            </View>

            <View style={styles.reminderSectionSpacing} />

            <View style={styles.reminderSectionCard}>
              <View style={styles.reminderSectionHeader}>
                <View style={styles.toggleTextWrapper}>
                  <Text style={styles.toggleLabel}>Task time</Text>
                  <Text style={styles.toggleHelperText}>
                    When switched on, the task time counts in the performance card instead of the activity time.
                  </Text>
                </View>
                <Switch
                  value={hasTaskDuration}
                  onValueChange={handleTaskDurationToggle}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                  ios_backgroundColor={colors.border}
                  disabled={!activityExists}
                />
              </View>

              {hasTaskDuration && (
                <View style={styles.reminderSectionBody}>
                  <Text style={styles.label}>Duration (minutes)</Text>
                  <TextInput
                    style={styles.input}
                    value={taskDurationMinutes}
                    onChangeText={(text) => setTaskDurationMinutes(String(normalizeDurationInput(text)))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                    editable={activityExists}
                    returnKeyType="done"
                  />
                </View>
              )}
            </View>

            {/* Extra padding to ensure content is visible above keyboard */}
            <View style={{ height: 100 }} />
          </ScrollView>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={isLoading || isUploadingVideo}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.saveButton,
                (isLoading || isUploadingVideo || !activityExists) && styles.disabledButton
              ]}
              onPress={handleSave}
              disabled={isLoading || isUploadingVideo || !activityExists}
            >
              <Text style={styles.saveButtonText}>
                {isLoading
                  ? 'Saving...'
                  : isUploadingVideo
                    ? 'Uploading...'
                    : !activityExists
                      ? 'Wait...'
                      : isEditMode
                        ? 'Save changes'
                        : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: colors.text,
    fontWeight: '600',
  },
  activityInfo: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 5,
  },
  warningBanner: {
    backgroundColor: '#fff3cd',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    marginBottom: 10,
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
  },
  scrollView: {
    marginTop: 20,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  videoSection: {
    marginBottom: 16,
  },
  videoLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  videoCountText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  removeVideoButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEE2E2',
  },
  removeVideoButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B91C1C',
  },
  uploadVideoButton: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  addVideoUrlButton: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  addVideoUrlButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  uploadVideoButtonDisabled: {
    opacity: 0.6,
  },
  uploadVideoButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  videoSuccessText: {
    fontSize: 13,
    color: colors.primary,
    marginTop: 8,
  },
  videoList: {
    gap: 8,
    marginTop: 10,
  },
  videoListItem: {
    minHeight: 54,
    borderRadius: 10,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  videoListTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  videoListTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  videoListSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
  videoErrorText: {
    fontSize: 13,
    color: '#B91C1C',
    marginTop: 8,
  },
  subtasksSection: {
    marginBottom: 16,
  },
  subtasksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addSubtaskButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primary,
  },
  addSubtaskButtonDisabled: {
    opacity: 0.6,
  },
  addSubtaskButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  subtaskInput: {
    flex: 1,
    marginBottom: 0,
  },
  removeSubtaskButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEE2E2',
  },
  removeSubtaskButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B91C1C',
  },
  reminderSectionCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBackground,
    marginBottom: 12,
  },
  reminderSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reminderSectionBody: {
    marginTop: 16,
  },
  toggleTextWrapper: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  toggleHelperText: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    color: colors.textSecondary,
  },
  delayOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  delayOption: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBackground,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  delayOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  delayOptionDisabled: {
    opacity: 0.6,
  },
  delayOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  delayOptionTextSelected: {
    color: '#FFFFFF',
  },
  helperText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 6,
  },
  reminderSectionSpacing: {
    height: 12,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
});
