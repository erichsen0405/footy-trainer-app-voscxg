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

type ModalCardProps = {
  visible: boolean;
  title: string;
  description?: string;
  videoUrl?: string | null;
  reminderMinutes?: number | null;
  completed: boolean;
  isSaving: boolean;
  errorText?: string | null;
  loading?: boolean;
  onClose: () => void;
  onPrimary: () => void;
  primaryDisabled?: boolean;
};

async function fetchLegacyTask(taskId: string): Promise<LegacyTaskData | null> {
  const { data: internal } = await supabase
    .from('activity_tasks')
    .select(
      `
      id,
      title,
      description,
      completed,
      reminder_minutes,
      video_url,
      task_templates!activity_tasks_task_template_id_fkey ( video_url )
    `
    )
    .eq('id', taskId)
    .single();

  if (internal) {
    return {
      id: internal.id,
      title: internal.title,
      description: internal.description || '',
      completed: !!internal.completed,
      reminder_minutes: internal.reminder_minutes,
      video_url:
        internal.video_url ??
        internal.task_templates?.video_url ??
        undefined,
    };
  }

  const { data: external } = await supabase
    .from('external_event_tasks')
    .select(
      `
      id,
      title,
      description,
      completed,
      reminder_minutes,
      video_url,
      task_templates!external_event_tasks_task_template_id_fkey ( video_url )
    `
    )
    .eq('id', taskId)
    .single();

  if (!external) return null;

  return {
    id: external.id,
    title: external.title,
    description: external.description || '',
    completed: !!external.completed,
    reminder_minutes: external.reminder_minutes,
    video_url:
      external.video_url ??
      external.task_templates?.video_url ??
      undefined,
  };
}

const TaskDetailsModalCard = ({
  visible,
  title,
  description,
  videoUrl,
  reminderMinutes,
  completed,
  isSaving,
  loading,
  errorText,
  onClose,
  onPrimary,
}: ModalCardProps) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
      <View style={styles.backdrop}>
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} disabled={isSaving} />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} disabled={isSaving}>
              <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={18} color="#fff" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            {loading ? (
              <View style={styles.skeletonBlock} />
            ) : errorText ? (
              <Text style={styles.errorText}>{errorText}</Text>
            ) : (
              <>
                {videoUrl ? (
                  <View style={styles.video}>
                    <SmartVideoPlayer url={videoUrl} />
                  </View>
                ) : null}
                {description ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Beskrivelse</Text>
                    <Text style={styles.sectionText}>{description}</Text>
                  </View>
                ) : null}
                {typeof reminderMinutes === 'number' ? (
                  <View style={styles.section}>
                    <View style={styles.chip}>
                      <IconSymbol ios_icon_name="bell.fill" android_material_icon_name="notifications" size={14} color="#4CAF50" />
                      <Text style={styles.chipText}>{formatReminderText(reminderMinutes)}</Text>
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable style={styles.secondaryButton} onPress={onClose} disabled={isSaving}>
              <Text style={styles.secondaryButtonText}>Annuller</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]}
              onPress={onPrimary}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>{completed ? 'Fuldført' : 'Markér som fuldført'}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
);

function TaskDetailsModalComponent(props: TaskDetailsModalProps) {
  if (isNewProps(props)) {
    return (
      <TaskDetailsModalCard
        visible={props.visible}
        title={props.title}
        description={props.description}
        videoUrl={props.videoUrl ?? undefined}
        reminderMinutes={
          props.reminderMinutes === null || props.reminderMinutes === undefined
            ? undefined
            : Number(props.reminderMinutes)
        }
        completed={!!props.completed}
        isSaving={!!props.isSaving}
        loading={false}
        errorText={null}
        onClose={props.onClose}
        onPrimary={props.onComplete}
      />
    );
  }

  const { taskId, onClose } = props;
  const [task, setTask] = useState<LegacyTaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchLegacyTask(taskId);
        if (!mounted) return;
        if (!result) {
          setTask(null);
          setError('Opgave ikke fundet');
        } else {
          setTask(result);
        }
      } catch (err) {
        if (!mounted) return;
        setError('Kunne ikke hente opgaven');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [taskId]);

  const handleToggle = useCallback(async () => {
    if (!task || saving) return;
    const nextCompleted = !task.completed;
    setSaving(true);
    setTask({ ...task, completed: nextCompleted });
    try {
      await taskService.toggleTaskCompletion(taskId);
    } catch (err) {
      setTask({ ...task, completed: !nextCompleted });
    } finally {
      setSaving(false);
    }
  }, [task, saving, taskId]);

  return (
    <TaskDetailsModalCard
      visible
      title={task?.title ?? 'Opgave'}
      description={task?.description ?? undefined}
      videoUrl={task?.video_url ?? null}
      reminderMinutes={
        task?.reminder_minutes === null || task?.reminder_minutes === undefined
          ? null
          : Number(task.reminder_minutes)
      }
      completed={!!task?.completed}
      isSaving={saving}
      errorText={error}
      loading={loading}
      onClose={onClose}
      onPrimary={handleToggle}
    />
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  card: { width: '85%', borderRadius: 20, padding: 20, backgroundColor: 'rgba(15,15,15,0.9)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '600', color: '#fff' },
  body: { paddingBottom: 16 },
  skeletonBlock: { height: 120, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)' },
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 },
  sectionText: { fontSize: 15, color: '#fff' },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(76,175,80,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  chipText: { color: '#fff', marginLeft: 6 },
  video: { borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  errorText: { color: '#ff6b6b', textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  secondaryButton: { flex: 1, marginRight: 8, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', paddingVertical: 12, alignItems: 'center' },
  secondaryButtonText: { color: '#fff', fontWeight: '600' },
  primaryButton: { flex: 1, marginLeft: 8, borderRadius: 12, backgroundColor: '#2563EB', paddingVertical: 12, alignItems: 'center' },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
});

const TaskDetailsModal = memo(TaskDetailsModalComponent);
export default TaskDetailsModal;
export { TaskDetailsModal };
