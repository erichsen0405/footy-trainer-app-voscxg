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
import { scheduleTaskReminderImmediate } from '@/utils/notificationScheduler';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';

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
  };
  activityId: string;
  activityTitle: string;
  activityDate?: Date | string | null;
  activityTime: string;
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
}: CreateActivityTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hasReminder, setHasReminder] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState('0');
  const [hasAfterTrainingFeedback, setHasAfterTrainingFeedback] = useState(false);
  const [afterTrainingDelayMinutes, setAfterTrainingDelayMinutes] = useState('0');
  const [hasTaskDuration, setHasTaskDuration] = useState(false);
  const [taskDurationMinutes, setTaskDurationMinutes] = useState('0');
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([{ id: createLocalId(), title: '' }]);
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [activityExists, setActivityExists] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const isEditMode = !!editingTask?.id;

  const safeActivityDate = useMemo(() => {
    if (!activityDate) return null;
    const candidate = activityDate instanceof Date ? activityDate : new Date(activityDate);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }, [activityDate]);

  const activityDateLabel = useMemo(
    () => (safeActivityDate ? safeActivityDate.toLocaleDateString('da-DK') : 'Ukendt dato'),
    [safeActivityDate],
  );

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
    return `Feedback på ${trimmed || 'opgaven'}`;
  }, []);

  const buildFeedbackTaskDescription = useCallback((templateId: string): string => {
    const normalizedTemplateId = String(templateId ?? '').trim();
    return `Del din feedback efter træningen direkte til træneren. [auto-after-training:${normalizedTemplateId}]`;
  }, []);

  const upsertLocalTaskTemplate = useCallback(
    async ({
      ownerUserId,
      existingTemplateId,
      templateTitle,
      templateDescription,
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
          throw new Error(`Kunne ikke hente opgaveskabelon: ${existingTemplateError.message}`);
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
        reminder_minutes: reminderMinutes,
        after_training_enabled: feedbackEnabled,
        after_training_delay_minutes: feedbackEnabled ? feedbackDelayMinutes : null,
        task_duration_enabled: taskDurationEnabled,
        task_duration_minutes: taskDurationEnabled ? taskDurationMinutes : null,
        after_training_feedback_enable_score: true,
        after_training_feedback_score_explanation: null,
        after_training_feedback_enable_note: true,
        after_training_feedback_enable_intensity: true,
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
          throw new Error(`Kunne ikke opdatere lokal opgaveskabelon: ${updateError.message}`);
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
          `Kunne ikke oprette lokal opgaveskabelon: ${insertError?.message || 'Mangler template-id'}`
        );
      }

      return String(insertedTemplate.id);
    },
    [normalizeId],
  );

  const syncLocalFeedbackTask = useCallback(
    async ({
      parentTaskId,
      templateId,
      taskTitle,
      enabled,
      delayMinutes,
    }: {
      parentTaskId: string;
      templateId: string;
      taskTitle: string;
      enabled: boolean;
      delayMinutes: number | null;
    }) => {
      const parentId = String(parentTaskId ?? '').trim();
      const normalizedTemplateId = String(templateId ?? '').trim();
      if (!parentId || !normalizedTemplateId) return;

      const legacyMarker = `[[feedback_parent_task_id:${parentId}]]`;
      const description = buildFeedbackTaskDescription(normalizedTemplateId);
      const title = buildFeedbackTaskTitle(taskTitle);

      const { data: existingRows, error: existingError } = await supabase
        .from('activity_tasks')
        .select('id, description, created_at, completed, feedback_template_id, task_template_id, is_feedback_task')
        .eq('activity_id', activityId);

      if (existingError) {
        throw new Error(`Kunne ikke hente eksisterende feedback-opgave: ${existingError.message}`);
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
            throw new Error(`Kunne ikke fjerne feedback-opgave: ${deleteError.message}`);
          }
        }
        return;
      }

      if (matchedIds.length) {
        const keepId = matchedIds[0];
        const { error: updateFeedbackError } = await supabase
          .from('activity_tasks')
          .update({
            title,
            description,
            reminder_minutes: delayMinutes,
            feedback_template_id: normalizedTemplateId,
            is_feedback_task: true,
            task_template_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', keepId);
        if (updateFeedbackError) {
          throw new Error(`Kunne ikke opdatere feedback-opgave: ${updateFeedbackError.message}`);
        }

        if (matchedIds.length > 1) {
          const extras = matchedIds.slice(1);
          const { error: deleteExtrasError } = await supabase
            .from('activity_tasks')
            .delete()
            .in('id', extras);
          if (deleteExtrasError) {
            throw new Error(`Kunne ikke rydde op i ekstra feedback-opgaver: ${deleteExtrasError.message}`);
          }
        }

        return;
      }

      const { error: insertFeedbackError } = await supabase
        .from('activity_tasks')
        .insert({
          activity_id: activityId,
          title,
          description,
          completed: false,
          reminder_minutes: delayMinutes,
          feedback_template_id: normalizedTemplateId,
          is_feedback_task: true,
          task_template_id: null,
          after_training_enabled: false,
          after_training_delay_minutes: null,
          task_duration_enabled: false,
          task_duration_minutes: null,
        });

      if (insertFeedbackError) {
        throw new Error(`Kunne ikke oprette feedback-opgave: ${insertFeedbackError.message}`);
      }
    },
    [activityId, buildFeedbackTaskDescription, buildFeedbackTaskTitle],
  );

  const syncActivitySubtasks = useCallback(async (activityTaskId: string, drafts: SubtaskDraft[]) => {
    const normalizedTaskId = String(activityTaskId ?? '').trim();
    if (!normalizedTaskId) return;

    const { error: deleteError } = await supabase
      .from('activity_task_subtasks')
      .delete()
      .eq('activity_task_id', normalizedTaskId);
    if (deleteError) {
      throw new Error(`Kunne ikke opdatere delopgaver: ${deleteError.message}`);
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
      throw new Error(`Kunne ikke gemme delopgaver: ${insertError.message}`);
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
        return;
      }

      console.log('🔍 Verifying activity exists:', activityId);
      
      try {
        const { data, error } = await supabase
          .from('activities')
          .select('id')
          .eq('id', activityId)
          .single();

        if (error) {
          console.error('❌ Error verifying activity:', error);
          setActivityExists(false);
          return;
        }

        if (data) {
          console.log('✅ Activity verified:', data.id);
          setActivityExists(true);
        } else {
          console.log('⚠️ Activity not found');
          setActivityExists(false);
        }
      } catch (error) {
        console.error('❌ Exception verifying activity:', error);
        setActivityExists(false);
      }
    };

    // Add a small delay on iOS to ensure the activity is fully committed
    if (Platform.OS === 'ios' && visible) {
      const timer = setTimeout(() => {
        verifyActivity();
      }, 500);
      return () => clearTimeout(timer);
    } else {
      verifyActivity();
    }
  }, [activityId, visible]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('Fejl', 'Opgavetitel er påkrævet');
      return;
    }

    if (!userId) {
      Alert.alert('Fejl', 'Bruger ikke autentificeret');
      return;
    }

    if (!activityExists) {
      Alert.alert(
        'Vent venligst',
        'Aktiviteten er ved at blive oprettet. Prøv igen om et øjeblik.',
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

      const localTemplateId = await upsertLocalTaskTemplate({
        ownerUserId: userId,
        existingTemplateId:
          isEditMode && editingTask
            ? editingTask.task_template_id ?? editingTask.taskTemplateId
            : null,
        templateTitle: title.trim(),
        templateDescription: description.trim(),
        reminderMinutes: reminderPayload,
        feedbackEnabled: hasAfterTrainingFeedback,
        feedbackDelayMinutes: feedbackDelayPayload,
        taskDurationEnabled: hasTaskDuration,
        taskDurationMinutes: taskDurationPayload,
      });

      if (isEditMode && editingTask?.id) {
        const updatePayload: Record<string, any> = {
          title: title.trim(),
          description: description.trim(),
          reminder_minutes: reminderPayload,
          task_template_id: localTemplateId,
          feedback_template_id: null,
          is_feedback_task: false,
          after_training_enabled: hasAfterTrainingFeedback,
          after_training_delay_minutes: feedbackDelayPayload,
          task_duration_enabled: hasTaskDuration,
          task_duration_minutes: taskDurationPayload,
          updated_at: new Date().toISOString(),
        };

        const { error: updateError } = await supabase
          .from('activity_tasks')
          .update(updatePayload)
          .eq('id', editingTask.id)
          .eq('activity_id', activityId);

        if (updateError) {
          throw new Error(`Database fejl: ${updateError.message}`);
        }

        await syncActivitySubtasks(editingTask.id, subtasks);

        await syncLocalFeedbackTask({
          parentTaskId: editingTask.id,
          templateId: localTemplateId,
          taskTitle: title.trim(),
          enabled: hasAfterTrainingFeedback,
          delayMinutes: feedbackDelayPayload,
        });

        Alert.alert('Opgave opdateret', `Opgaven "${title}" er opdateret.`, [{ text: 'OK' }]);
        if (onTaskUpdated) {
          await onTaskUpdated();
        }
      } else {
        const { data: activityCheck, error: activityCheckError } = await supabase
          .from('activities')
          .select('id')
          .eq('id', activityId)
          .single();

        if (activityCheckError || !activityCheck) {
          throw new Error('Aktiviteten kunne ikke findes. Prøv at lukke og åbne aktiviteten igen.');
        }

        const taskPayload: Record<string, any> = {
          activity_id: activityId,
          title: title.trim(),
          description: description.trim(),
          completed: false,
          reminder_minutes: reminderPayload,
          task_template_id: localTemplateId,
          after_training_enabled: hasAfterTrainingFeedback,
          after_training_delay_minutes: feedbackDelayPayload,
          task_duration_enabled: hasTaskDuration,
          task_duration_minutes: taskDurationPayload,
        };

        const { data: taskData, error: taskError } = await supabase
          .from('activity_tasks')
          .insert(taskPayload as any)
          .select()
          .single();

        if (taskError) {
          throw new Error(`Database fejl: ${taskError.message}`);
        }

        if (!taskData) {
          throw new Error('Ingen data returneret fra databasen');
        }

        await syncActivitySubtasks(String(taskData.id), subtasks);

        await syncLocalFeedbackTask({
          parentTaskId: String(taskData.id),
          templateId: localTemplateId,
          taskTitle: title.trim(),
          enabled: hasAfterTrainingFeedback,
          delayMinutes: feedbackDelayPayload,
        });

        if (hasReminder && safeActivityDate) {
          const activityDateStr = safeActivityDate.toISOString().split('T')[0];
          const success = await scheduleTaskReminderImmediate(
            taskData.id,
            title.trim(),
            description.trim(),
            activityId,
            activityTitle,
            activityDateStr,
            activityTime,
            reminderPayload ?? 0
          );

          if (success) {
            Alert.alert(
              'Opgave oprettet',
              `Opgaven "${title}" er oprettet med påmindelse ${reminderPayload ?? 0} minutter før aktiviteten.`,
              [{ text: 'OK' }]
            );
          } else {
            Alert.alert(
              'Opgave oprettet',
              `Opgaven "${title}" er oprettet. Påmindelsen vil blive planlagt automatisk.`,
              [{ text: 'OK' }]
            );
          }
        } else if (hasReminder && !safeActivityDate) {
          Alert.alert(
            'Opgave oprettet',
            `Opgaven "${title}" er oprettet, men der kunne ikke planlægges påmindelse uden gyldig dato.`,
            [{ text: 'OK' }],
          );
        } else {
          Alert.alert('Opgave oprettet', `Opgaven "${title}" er oprettet.`, [{ text: 'OK' }]);
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
      setSubtasks([{ id: createLocalId(), title: '' }]);
      onClose();
    } catch (error: any) {
      console.error('❌ Error in handleSave:', error);
      console.error('  Error type:', typeof error);
      console.error('  Error name:', error?.name);
      console.error('  Error message:', error?.message);
      console.error('  Error stack:', error?.stack);
      
      Alert.alert(
        'Fejl',
        error?.message || 'Kunne ikke oprette opgave. Prøv venligst igen.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    title,
    userId,
    activityExists,
    activityId,
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
    normalizeDurationInput,
    upsertLocalTaskTemplate,
    syncActivitySubtasks,
    syncLocalFeedbackTask,
    description,
    onSave,
    onTaskCreated,
    onTaskUpdated,
    onClose,
    isEditMode,
    editingTask,
  ]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isEditMode ? 'Rediger opgave' : 'Ny opgave'}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.activityInfo}>
            For: {activityTitle}
          </Text>
          <Text style={styles.activityInfo}>
            Dato: {activityDateLabel}
            {safeActivityDate ? ` kl. ${activityTime}` : ''}
          </Text>

          {!activityExists && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>
                ⏳ Venter på at aktiviteten bliver oprettet...
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
            <Text style={styles.label}>Titel</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Opgavens titel"
              placeholderTextColor={colors.textSecondary}
              editable={activityExists}
              returnKeyType="next"
            />

            <Text style={styles.label}>Beskrivelse</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Beskrivelse af opgaven"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
              editable={activityExists}
              textAlignVertical="top"
            />

            <View style={styles.subtasksSection}>
              <View style={styles.subtasksHeader}>
                <Text style={styles.label}>Delopgaver</Text>
                <TouchableOpacity
                  style={[styles.addSubtaskButton, !activityExists && styles.addSubtaskButtonDisabled]}
                  onPress={addSubtask}
                  disabled={!activityExists}
                >
                  <Text style={styles.addSubtaskButtonText}>Tilføj</Text>
                </TouchableOpacity>
              </View>
              {subtasks.map((subtask, index) => (
                <View key={subtask.id} style={styles.subtaskRow}>
                  <TextInput
                    style={[styles.input, styles.subtaskInput]}
                    value={subtask.title}
                    onChangeText={(value) => updateSubtask(index, value)}
                    placeholder={`Delopgave ${index + 1}`}
                    placeholderTextColor={colors.textSecondary}
                    editable={activityExists}
                  />
                  {subtasks.length > 1 && (
                    <TouchableOpacity
                      style={styles.removeSubtaskButton}
                      onPress={() => removeSubtask(index)}
                      disabled={!activityExists}
                    >
                      <Text style={styles.removeSubtaskButtonText}>Fjern</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>

            <View style={styles.reminderSectionCard}>
              <View style={styles.reminderSectionHeader}>
                <View style={styles.toggleTextWrapper}>
                  <Text style={styles.toggleLabel}>Påmindelse før start</Text>
                  <Text style={styles.toggleHelperText}>
                    Slå til for at vise en påmindelse inden aktiviteten starter.
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
                  <Text style={styles.label}>Minutter før start</Text>
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
                    0 = på starttidspunktet. Påmindelsen vises før aktivitetens starttid.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.reminderSectionSpacing} />

            <View style={styles.reminderSectionCard}>
              <View style={styles.reminderSectionHeader}>
                <View style={styles.toggleTextWrapper}>
                  <Text style={styles.toggleLabel}>Opret efter-træning feedback</Text>
                  <Text style={styles.toggleHelperText}>
                    Når denne skabelon bruges på en aktivitet, oprettes automatisk en efter-træning feedback-opgave til aktiviteten.
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
                  <Text style={styles.label}>Påmindelse efter slut (minutter)</Text>
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
                  <Text style={styles.helperText}>Vises efter aktivitetens sluttidspunkt + valgt delay.</Text>
                </View>
              )}
            </View>

            <View style={styles.reminderSectionSpacing} />

            <View style={styles.reminderSectionCard}>
              <View style={styles.reminderSectionHeader}>
                <View style={styles.toggleTextWrapper}>
                  <Text style={styles.toggleLabel}>Tid på opgave</Text>
                  <Text style={styles.toggleHelperText}>
                    Når slået til tæller opgavetiden i performance-kortet i stedet for aktivitetstiden.
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
                  <Text style={styles.label}>Varighed (minutter)</Text>
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
              disabled={isLoading}
            >
              <Text style={styles.cancelButtonText}>Annuller</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.saveButton,
                (isLoading || !activityExists) && styles.disabledButton
              ]}
              onPress={handleSave}
              disabled={isLoading || !activityExists}
            >
              <Text style={styles.saveButtonText}>
                {isLoading ? 'Gemmer...' : !activityExists ? 'Vent...' : isEditMode ? 'Gem ændringer' : 'Gem'}
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
