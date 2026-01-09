import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import SmartVideoPlayer from '@/components/SmartVideoPlayer';
import { IconSymbol } from '@/components/IconSymbol';
import * as CommonStyles from '@/styles/commonStyles';
import { supabase } from '@/app/integrations/supabase/client';
import { taskService } from '@/services/taskService';

const FALLBACK_COLORS = {
  primary: '#3B82F6',
  error: '#DC2626',
  text: '#0F172A',
};

const colors =
  ((CommonStyles as any)?.colors as typeof FALLBACK_COLORS | undefined) ?? FALLBACK_COLORS;

export type TaskDetailsModalNewProps = {
  visible: boolean;
  title: string;
  categoryColor: string;
  isDark: boolean;
  description?: string;
  reminderMinutes?: number | null;
  videoUrl?: string | null;
  completed?: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onComplete: () => void | Promise<void>;
};

export type TaskDetailsModalLegacyProps = {
  taskId: string;
  onClose: () => void;
};

export type TaskDetailsModalProps = TaskDetailsModalNewProps | TaskDetailsModalLegacyProps;

type LegacyTaskData = {
  id: string;
  title: string;
  description?: string | null;
  completed: boolean;
  reminder_minutes?: number | null;
  video_url?: string | null;
  is_external: boolean;
};

function isNewProps(props: TaskDetailsModalProps): props is TaskDetailsModalNewProps {
  return (props as any)?.visible !== undefined;
}

function clampColorHex(input?: string | null): string {
  const v = String(input ?? '').trim();
  return v.startsWith('#') && (v.length === 7 || v.length === 4) ? v : colors.primary;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '').trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

function mix(hex: string, target: { r: number; g: number; b: number }, t: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.round(rgb.r + (target.r - rgb.r) * t);
  const g = Math.round(rgb.g + (target.g - rgb.g) * t);
  const b = Math.round(rgb.b + (target.b - rgb.b) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
    .toString(16)
    .padStart(2, '0')}`;
}

function lighten(hex: string, t: number): string {
  return mix(hex, { r: 255, g: 255, b: 255 }, t);
}
function darken(hex: string, t: number): string {
  return mix(hex, { r: 0, g: 0, b: 0 }, t);
}

function formatReminderText(minutes: number): string {
  if (minutes < 60) return `${minutes} min før`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `${hours} time${hours > 1 ? 'r' : ''} før`;
  return `${hours} time${hours > 1 ? 'r' : ''} og ${remainingMinutes} min før`;
}

type RenderModel = {
  visible: boolean;
  title: string;
  categoryColor: string;
  isDark: boolean;
  description?: string;
  reminderMinutes?: number | null;
  videoUrl?: string | null;
  completed: boolean;
  isSaving: boolean;
  onClose: () => void;
  onComplete: () => void | Promise<void>;
  allowToggleWhenCompleted: boolean; // legacy only
};

function TaskDetailsModalCard({
  model,
  showSkeleton,
  errorText,
}: {
  model: RenderModel;
  showSkeleton: boolean;
  errorText?: string | null;
}) {
  const base = useMemo(() => clampColorHex(model.categoryColor), [model.categoryColor]);
  const headerGradient = useMemo(() => [lighten(base, 0.12), darken(base, 0.18)], [base]);

  const textColor = model.isDark ? '#E5E7EB' : '#0F172A';
  const textSecondary = model.isDark ? 'rgba(229,231,235,0.75)' : 'rgba(15,23,42,0.55)';
  const cardBg = model.isDark ? 'rgba(18,18,18,0.92)' : '#FFFFFF';
  const borderColor = model.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)';

  const reminderMinutes =
    model.reminderMinutes === null || model.reminderMinutes === undefined
      ? null
      : Number(model.reminderMinutes);
  const reminderValid = reminderMinutes !== null && !Number.isNaN(reminderMinutes);

  const disableCTA =
    model.isSaving || (!model.allowToggleWhenCompleted && model.completed);

  const ctaLabel = model.completed
    ? model.allowToggleWhenCompleted
      ? 'Markér som ikke udført'
      : 'Udført'
    : 'Markér som udført';

  return (
    <Modal
      visible={model.visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={model.onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalRoot}
      >
        <View style={styles.backdropContainer}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          <Pressable style={StyleSheet.absoluteFill} onPress={model.onClose} disabled={model.isSaving} />
          <View style={styles.cardWrapper}>
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <LinearGradient
                colors={headerGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
              >
                <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
                  {model.title}
                </Text>
                <Pressable onPress={model.onClose} hitSlop={12} disabled={model.isSaving} style={styles.closeButton}>
                  <Text style={styles.closeText}>X</Text>
                </Pressable>
              </LinearGradient>

              <ScrollView
                style={styles.body}
                contentContainerStyle={styles.bodyContent}
                showsVerticalScrollIndicator={false}
              >
                {showSkeleton ? (
                  <View style={styles.skeletonWrap}>
                    <View style={[styles.skeletonBlock, { width: '65%' }]} />
                    <View style={[styles.skeletonBlock, { width: '90%', marginTop: 10 }]} />
                    <View style={[styles.skeletonBlock, { width: '82%', marginTop: 10 }]} />
                    <View style={[styles.skeletonBlock, { width: '72%', marginTop: 10 }]} />
                  </View>
                ) : errorText ? (
                  <View style={styles.errorWrap}>
                    <Text style={[styles.errorText, { color: textSecondary }]}>{errorText}</Text>
                  </View>
                ) : (
                  <>
                    {model.videoUrl ? (
                      <View style={styles.videoSection}>
                        <View style={styles.videoContainer}>
                          <SmartVideoPlayer url={model.videoUrl} />
                        </View>
                      </View>
                    ) : null}

                    {model.description ? (
                      <View style={styles.section}>
                        <Text style={[styles.sectionLabel, { color: textSecondary }]}>Beskrivelse</Text>
                        <Text style={[styles.sectionText, { color: textColor }]}>{model.description}</Text>
                      </View>
                    ) : null}

                    {reminderValid ? (
                      <View style={styles.section}>
                        <View
                          style={[
                            styles.chip,
                            {
                              backgroundColor: model.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.06)',
                              borderColor: model.isDark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.10)',
                            },
                          ]}
                        >
                          <IconSymbol
                            ios_icon_name="bell.fill"
                            android_material_icon_name="notifications"
                            size={16}
                            color={base}
                          />
                          <Text style={[styles.chipText, { color: textColor, marginLeft: 8 }]}>
                            {formatReminderText(reminderMinutes!)}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </>
                )}
              </ScrollView>

              <View style={styles.footer}>
                <Pressable
                  onPress={model.onComplete}
                  disabled={disableCTA}
                  style={[
                    styles.primaryButtonShadow,
                    { shadowColor: base },
                    disableCTA && styles.primaryButtonDisabled,
                  ]}
                >
                  <LinearGradient
                    colors={[base, lighten(base, 0.25)]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryButton}
                  >
                    {model.isSaving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>{ctaLabel}</Text>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TaskDetailsModalComponent(props: TaskDetailsModalProps) {
  // NEW API: data-driven, no fetch on open
  if (isNewProps(props)) {
    const model: RenderModel = {
      visible: props.visible,
      title: String(props.title ?? 'Uden titel'),
      categoryColor: String(props.categoryColor ?? colors.primary),
      isDark: !!props.isDark,
      description: typeof props.description === 'string' ? props.description : undefined,
      reminderMinutes:
        props.reminderMinutes === null || props.reminderMinutes === undefined
          ? null
          : Number(props.reminderMinutes),
      videoUrl: typeof props.videoUrl === 'string' ? props.videoUrl : null,
      completed: !!props.completed,
      isSaving: !!props.isSaving,
      onClose: props.onClose,
      onComplete: props.onComplete,
      allowToggleWhenCompleted: false,
    };

    return <TaskDetailsModalCard model={model} showSkeleton={false} errorText={null} />;
  }

  // LEGACY API: fetch by taskId, then render the same UI
  const { taskId, onClose } = props;
  const systemIsDark = useColorScheme() === 'dark';

  const [task, setTask] = useState<LegacyTaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchTask = async () => {
      setLoading(true);
      setError(null);

      try {
        const [activityTaskResult, externalTaskResult] = await Promise.allSettled([
          supabase
            .from('activity_tasks')
            .select(
              `
              *,
              task_templates!activity_tasks_task_template_id_fkey (
                video_url
              )
            `
            )
            .eq('id', taskId)
            .maybeSingle(),
          supabase
            .from('external_event_tasks')
            .select(
              `
              *,
              task_templates!external_event_tasks_task_template_id_fkey (
                video_url
              )
            `
            )
            .eq('id', taskId)
            .maybeSingle(),
        ]);

        if (!isMounted) return;

        if (activityTaskResult.status === 'fulfilled' && activityTaskResult.value?.data) {
          const row: any = activityTaskResult.value.data;
          const videoUrl = row?.task_templates?.video_url ?? row?.video_url ?? null;

          setTask({
            id: String(row.id),
            title: String(row.title ?? 'Uden titel'),
            description: typeof row.description === 'string' ? row.description : null,
            completed: !!row.completed,
            reminder_minutes:
              row.reminder_minutes === null || row.reminder_minutes === undefined
                ? null
                : Number(row.reminder_minutes),
            video_url: typeof videoUrl === 'string' ? videoUrl : null,
            is_external: false,
          });
          return;
        }

        if (externalTaskResult.status === 'fulfilled' && externalTaskResult.value?.data) {
          const row: any = externalTaskResult.value.data;
          const videoUrl = row?.task_templates?.video_url ?? row?.video_url ?? null;

          setTask({
            id: String(row.id),
            title: String(row.title ?? 'Uden titel'),
            description: typeof row.description === 'string' ? row.description : null,
            completed: !!row.completed,
            reminder_minutes:
              row.reminder_minutes === null || row.reminder_minutes === undefined
                ? null
                : Number(row.reminder_minutes),
            video_url: typeof videoUrl === 'string' ? videoUrl : null,
            is_external: true,
          });
          return;
        }

        setTask(null);
        setError('Opgave ikke fundet');
      } catch (err) {
        console.error('TaskDetailsModal (legacy): Error fetching task:', err);
        if (isMounted) {
          setTask(null);
          setError('Kunne ikke hente opgaven');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchTask();

    return () => {
      isMounted = false;
    };
  }, [taskId]);

  const handleLegacyToggle = useCallback(async () => {
    if (!task || saving) return;

    const prev = !!task.completed;
    setSaving(true);

    // optimistic toggle
    setTask({ ...task, completed: !prev });

    try {
      await taskService.toggleTaskCompletion(taskId);
    } catch (err) {
      console.error('TaskDetailsModal (legacy): Error toggling completion:', err);
      // rollback
      setTask({ ...task, completed: prev });
    } finally {
      setSaving(false);
    }
  }, [saving, task, taskId]);

  const model: RenderModel = useMemo(
    () => ({
      visible: true,
      title: String(task?.title ?? 'Opgave'),
      categoryColor: colors.primary,
      isDark: systemIsDark,
      description: typeof task?.description === 'string' ? task.description : undefined,
      reminderMinutes:
        task?.reminder_minutes === null || task?.reminder_minutes === undefined
          ? null
          : Number(task.reminder_minutes),
      videoUrl: typeof task?.video_url === 'string' ? task.video_url : null,
      completed: !!task?.completed,
      isSaving: saving,
      onClose,
      onComplete: handleLegacyToggle,
      allowToggleWhenCompleted: true,
    }),
    [handleLegacyToggle, onClose, saving, systemIsDark, task]
  );

  return (
    <TaskDetailsModalCard
      model={model}
      showSkeleton={loading}
      errorText={loading ? null : error}
    />
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backdropContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(7, 16, 35, 0.45)',
  },
  cardWrapper: { width: '100%', paddingHorizontal: 24 },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 24,
    marginRight: 16,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 20, fontWeight: '700', color: '#fff' },

  body: { maxHeight: 420 },
  bodyContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 },

  section: { marginBottom: 14 },
  sectionLabel: { fontSize: 13, fontWeight: '700', marginBottom: 6, letterSpacing: 0.2 },
  sectionText: { fontSize: 16, lineHeight: 22, fontWeight: '500' },

  videoSection: { marginBottom: 14 },
  videoContainer: { borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  chipText: { fontSize: 14, fontWeight: '700' },

  footer: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18 },
  primaryButtonShadow: {
    borderRadius: 999,
    shadowRadius: 18,
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  primaryButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: { opacity: 0.55 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  skeletonWrap: { paddingVertical: 6 },
  skeletonBlock: {
    height: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(15,23,42,0.12)',
  },

  errorWrap: { paddingVertical: 10 },
  errorText: { fontSize: 14, fontWeight: '600' },
});

const TaskDetailsModal = memo(TaskDetailsModalComponent);
export default TaskDetailsModal;
export { TaskDetailsModal };
