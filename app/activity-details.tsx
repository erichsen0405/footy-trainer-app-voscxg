import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  useColorScheme,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Switch,
  DeviceEventEmitter,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFootball } from '@/contexts/FootballContext';

// Robust import: avoid runtime crash if named export "colors" changes
import * as CommonStyles from '@/styles/commonStyles';

import { IconSymbol } from '@/components/IconSymbol';
import { Activity, ActivityCategory, Task, TaskTemplateSelfFeedback } from '@/types';
import { useUserRole } from '@/hooks/useUserRole';
import { CreateActivityTaskModal } from '@/components/CreateActivityTaskModal';
import { deleteSingleExternalActivity } from '@/utils/deleteExternalActivities';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchLatestCategoryFeedback,
  fetchSelfFeedbackForActivities,
  fetchSelfFeedbackForTemplates,
  upsertSelfFeedback,
} from '@/services/feedbackService';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import { filterVisibleTasksForActivity } from '@/utils/taskTemplateVisibility';
import { resolveActivityIntensityEnabled } from '@/utils/activityIntensity';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import TaskDetailsModal from '@/components/TaskDetailsModal';

const FALLBACK_COLORS = {
  primary: '#3B82F6',
  secondary: '#2563EB',
  accent: '#F59E0B',
  background: '#F2F4F7',
  card: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  highlight: '#E2E8F0',
  success: '#16A34A',
  error: '#DC2626',
};

const colors =
  ((CommonStyles as any)?.colors as typeof FALLBACK_COLORS | undefined) ?? FALLBACK_COLORS;

const V2_WAVE_HEIGHT = 60;
const V2_CTA_HEIGHT = 56;
const FOCUS_CHANGE_PERFECT_SCORE_STREAK = 15;

// Header action buttons
const HEADER_ACTION_BUTTON_SIZE = 36;
const HEADER_ACTION_BUTTON_GAP = 0;
const HEADER_ACTION_HITSLOP = { top: 6, bottom: 6, left: 6, right: 6 };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (typeof hex !== 'string') return null;
  const raw = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  const r = Math.max(0, Math.min(255, Math.round(rgb.r)));
  const g = Math.max(0, Math.min(255, Math.round(rgb.g)));
  const b = Math.max(0, Math.min(255, Math.round(rgb.b)));
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixHex(a: string, b: string, t: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return a;
  const tt = clamp01(t);
  return rgbToHex({
    r: ra.r + (rb.r - ra.r) * tt,
    g: ra.g + (rb.g - ra.g) * tt,
    b: ra.b + (rb.b - ra.b) * tt,
  });
}

function lightenHex(hex: string, amount01: number): string {
  return mixHex(hex, '#FFFFFF', clamp01(amount01));
}

function darkenHex(hex: string, amount01: number): string {
  return mixHex(hex, '#000000', clamp01(amount01));
}

function SheetWaveTop({ color, height = V2_WAVE_HEIGHT }: { color: string; height?: number }) {
  return (
    <View pointerEvents="none" style={{ width: '100%', height }}>
      <Svg width="100%" height="100%" viewBox="0 0 375 60" preserveAspectRatio="none">
        <Path
          fill={color}
          d="M0,28
             C18,16 34,14 52,22
             C96,42 138,46 187.5,46
             C237,46 279,42 323,22
             C341,14 357,16 375,28
             L375,60 L0,60 Z"
        />
      </Svg>
    </View>
  );
}

function DetailsCard(props: {
  label: string;
  value: string;
  backgroundColor: string;
  textColor: string;
  secondaryTextColor: string;
  fullWidth?: boolean;
  flex?: number;
  icon?: { ios: string; android: string };
  iconColor?: string;
  leadingEmoji?: string;
}) {
  const {
    label,
    value,
    backgroundColor,
    textColor,
    secondaryTextColor,
    fullWidth,
    flex,
    icon,
    iconColor,
    leadingEmoji,
  } = props;

  const hasEmoji = typeof leadingEmoji === 'string' && leadingEmoji.trim().length > 0;

  return (
    <View
      style={[
        styles.v2DetailCard,
        { backgroundColor },
        fullWidth && styles.v2DetailCardFullWidth,
        flex !== undefined && { flex },
      ]}
    >
      <View style={styles.v2DetailCardRow}>
        {hasEmoji ? (
          <View style={styles.v2DetailIconWrap}>
            <Text style={styles.v2DetailEmoji}>{leadingEmoji}</Text>
          </View>
        ) : icon ? (
          <View style={styles.v2DetailIconWrap}>
            <IconSymbol
              ios_icon_name={icon.ios}
              android_material_icon_name={icon.android}
              size={20}
              color={iconColor || textColor}
            />
          </View>
        ) : null}

        <View style={{ flex: 1 }}>
          <Text style={[styles.v2DetailCardLabel, { color: secondaryTextColor }]}>{label}</Text>
          <Text style={[styles.v2DetailCardValue, { color: textColor }]} numberOfLines={2}>
            {value}
          </Text>
        </View>
      </View>
    </View>
  );
}

type FeedbackTask = Task & {
  feedbackTemplateId?: string | null;
  isFeedbackTask?: boolean;
  afterTrainingEnabled?: boolean;
  afterTrainingDelayMinutes?: number | null;
  taskTemplateId?: string | null;
  task_duration_enabled?: boolean;
  task_duration_minutes?: number | null;
  taskDurationEnabled?: boolean;
  taskDurationMinutes?: number | null;
  reminder_minutes?: number | null;
  reminder?: number | null;
};

const DAYS_OF_WEEK = [
  { label: 'Søn', value: 0 },
  { label: 'Man', value: 1 },
  { label: 'Tir', value: 2 },
  { label: 'Ons', value: 3 },
  { label: 'Tor', value: 4 },
  { label: 'Fre', value: 5 },
  { label: 'Lør', value: 6 },
];

const RECURRENCE_OPTIONS: {
  label: string;
  value: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
}[] = [
  { label: 'Dagligt', value: 'daily' },
  { label: 'Hver uge', value: 'weekly' },
  { label: 'Hver anden uge', value: 'biweekly' },
  { label: 'Hver tredje uge', value: 'triweekly' },
  { label: 'Månedligt', value: 'monthly' },
];
const FEEDBACK_PARENT_MARKER = '[[feedback_parent_task_id:';

const normalizeOptionalTime = (value?: string | null): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const timeToMinutes = (value?: string | null): number | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [hoursStr, minutesStr] = trimmed.split(':');
  if (hoursStr === undefined || minutesStr === undefined) return null;
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('da-DK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('da-DK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(date: Date, time: string): string {
  const timeDisplay = time.substring(0, 5);
  return `${formatDate(date)} kl. ${timeDisplay}`;
}

function formatTimeDisplay(time?: string | null): string {
  if (!time || typeof time !== 'string') {
    return 'Tilføj tid';
  }
  return time.substring(0, 5);
}

function parseTimeToDate(baseDate: Date, time?: string | null): Date {
  const next = new Date(baseDate);
  if (!time) {
    next.setHours(12, 0, 0, 0);
    return next;
  }
  const [hoursStr, minutesStr] = time.split(':');
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  const safeHours = Number.isFinite(hours) ? hours : 0;
  const safeMinutes = Number.isFinite(minutes) ? minutes : 0;
  next.setHours(safeHours, safeMinutes, 0, 0);
  return next;
}

const getTaskVideoUrl = (task: any): string | null => {
  if (!task) return null;
  const camel = typeof task.videoUrl === 'string' ? task.videoUrl.trim() : '';
  if (camel) return camel;
  const snake = typeof task.video_url === 'string' ? task.video_url.trim() : '';
  return snake || null;
};

const parseIntensityValue = (raw: any): number | null => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

// --- Supabase select strings (with/without optional video_url) ---
const INTERNAL_SELECT_WITH_VIDEO = `
  id,
  title,
  activity_date,
  activity_time,
  activity_end_time,
  location,
  category_id,
  intensity,
  intensity_enabled,
  intensity_note,
  is_external,
  external_calendar_id,
  external_event_id,
  series_id,
  series_instance_date,
  activity_categories (
    id,
    name,
    color,
    emoji
  ),
  activity_tasks (
    id,
    title,
    description,
    completed,
    reminder_minutes,
    after_training_enabled,
    after_training_delay_minutes,
    task_duration_enabled,
    task_duration_minutes,
    is_feedback_task,
    task_template_id,
    feedback_template_id,
    video_url
  )
`;

const INTERNAL_SELECT_NO_VIDEO = `
  id,
  title,
  activity_date,
  activity_time,
  activity_end_time,
  location,
  category_id,
  intensity,
  intensity_enabled,
  intensity_note,
  is_external,
  external_calendar_id,
  external_event_id,
  series_id,
  series_instance_date,
  activity_categories (
    id,
    name,
    color,
    emoji
  ),
  activity_tasks (
    id,
    title,
    description,
    completed,
    reminder_minutes,
    after_training_enabled,
    after_training_delay_minutes,
    task_duration_enabled,
    task_duration_minutes,
    is_feedback_task,
    task_template_id,
    feedback_template_id
  )
`;

const EXTERNAL_META_SELECT_WITH_VIDEO = `
  id,
  external_event_id,
  category_id,
  intensity,
  intensity_enabled,
  intensity_note,
  local_title_override,
  activity_categories (
    id,
    name,
    color,
    emoji
  ),
  events_external (
    id,
    title,
    location,
    start_date,
    start_time,
    end_time,
    provider_calendar_id,
    raw_payload
  ),
  external_event_tasks (
    id,
    task_template_id,
    feedback_template_id,
    is_feedback_task,
    title,
    description,
    completed,
    reminder_minutes,
    after_training_enabled,
    after_training_delay_minutes,
    task_duration_enabled,
    task_duration_minutes,
    video_url
  )
`;

const EXTERNAL_META_SELECT_NO_VIDEO = `
  id,
  external_event_id,
  category_id,
  intensity,
  intensity_enabled,
  intensity_note,
  local_title_override,
  activity_categories (
    id,
    name,
    color,
    emoji
  ),
  events_external (
    id,
    title,
    location,
    start_date,
    start_time,
    end_time,
    provider_calendar_id,
    raw_payload
  ),
  external_event_tasks (
    id,
    task_template_id,
    feedback_template_id,
    is_feedback_task,
    title,
    description,
    completed,
    reminder_minutes,
    after_training_enabled,
    after_training_delay_minutes,
    task_duration_enabled,
    task_duration_minutes
  )
`;

// --- Task template selects (fix for refactor missing constants) ---
const TEMPLATE_SELECT_FULL = `
  id,
  after_training_feedback_enable_score,
  after_training_feedback_score_explanation,
  after_training_feedback_enable_note,
  after_training_enabled,
  after_training_delay_minutes
`;

const TEMPLATE_SELECT_NO_TOGGLE = `
  id,
  after_training_feedback_enable_score,
  after_training_feedback_score_explanation,
  after_training_feedback_enable_note
`;

const TEMPLATE_SELECT_MINIMAL = `id`;

function isMissingColumn(err: any, colName: string): boolean {
  const needle = String(colName ?? '').toLowerCase();
  if (!needle) return false;
  const hay = [err?.message, err?.details, err?.hint, err?.code]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase())
    .join(' | ');
  return hay.includes(needle);
}

async function selectSingleWithOptionalColumn<T>(opts: {
  table: string;
  selectWith: string;
  selectWithout: string;
  eqColumn: string;
  eqValue: string;
  optionalColumnName: string;
  context: string;
}): Promise<{ data: T | null; error: any | null; usedFallback: boolean }> {
  const { table, selectWith, selectWithout, eqColumn, eqValue, optionalColumnName, context } = opts;

  const first = await (supabase as any).from(table).select(selectWith).eq(eqColumn, eqValue).single();
  if (!first.error) return { data: (first.data as T) ?? null, error: null, usedFallback: false };

  if (__DEV__) {
    console.log(`[ActivityDetails][${context}] select(with optional) failed`, {
      table,
      eqColumn,
      eqValue,
      message: first.error?.message,
      details: first.error?.details,
      hint: first.error?.hint,
      code: first.error?.code,
    });
  }

  if (!isMissingColumn(first.error, optionalColumnName)) {
    return { data: null, error: first.error, usedFallback: false };
  }

  const second = await (supabase as any).from(table).select(selectWithout).eq(eqColumn, eqValue).single();

  if (__DEV__) {
    console.log(`[ActivityDetails][${context}] retry(select without "${optionalColumnName}")`, {
      ok: !second.error,
      table,
      eqColumn,
      eqValue,
      message: second.error?.message,
      details: second.error?.details,
      hint: second.error?.hint,
      code: second.error?.code,
    });
  }

  return { data: (second.data as T) ?? null, error: second.error ?? null, usedFallback: true };
}

async function fetchArchivedAtByTemplateIds(tasks: any[]): Promise<Record<string, string | null>> {
  const normalizeId = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized.length ? normalized : null;
  };

  const templateIds = new Set<string>();

  (tasks || []).forEach((task) => {
    const directTemplateId = normalizeId(task?.task_template_id ?? task?.taskTemplateId);
    if (directTemplateId) templateIds.add(directTemplateId);

    const feedbackTemplateId = normalizeId(task?.feedback_template_id ?? task?.feedbackTemplateId);
    if (feedbackTemplateId) templateIds.add(feedbackTemplateId);

    const markerTemplateId =
      parseTemplateIdFromMarker(typeof task?.description === 'string' ? task.description : '') ||
      parseTemplateIdFromMarker(typeof task?.title === 'string' ? task.title : '');
    const normalizedMarkerId = normalizeId(markerTemplateId);
    if (normalizedMarkerId) templateIds.add(normalizedMarkerId);
  });

  const ids = Array.from(templateIds);
  if (!ids.length) return {};

  try {
    const { data, error } = await (supabase as any)
      .from('task_templates')
      .select('id, archived_at')
      .in('id', ids);

    if (error || !Array.isArray(data)) {
      return {};
    }

    const map: Record<string, string | null> = {};
    data.forEach((row: any) => {
      const id = normalizeId(row?.id);
      if (!id) return;
      map[id] = typeof row?.archived_at === 'string' ? row.archived_at : null;
    });
    return map;
  } catch {
    return {};
  }
}

export async function fetchActivityFromDatabase(activityId: string): Promise<Activity | null> {
  try {
    const { data: internalActivity, error: internalError } = await selectSingleWithOptionalColumn<any>({
      table: 'activities',
      selectWith: INTERNAL_SELECT_WITH_VIDEO,
      selectWithout: INTERNAL_SELECT_NO_VIDEO,
      eqColumn: 'id',
      eqValue: activityId,
      optionalColumnName: 'video_url',
      context: `activities.id=${activityId}`,
    });

    if (!internalError && internalActivity) {
      const internalActivityAny = internalActivity as any;
      const category: ActivityCategory = {
        id: internalActivityAny.activity_categories?.id || internalActivityAny.category_id || '',
        name: internalActivityAny.activity_categories?.name || 'Ukendt kategori',
        color: internalActivityAny.activity_categories?.color || '#999999',
        emoji: internalActivityAny.activity_categories?.emoji || '⚽️',
      };

      const tasks: FeedbackTask[] = (internalActivityAny.activity_tasks ?? []).map((task: any) => {
        const directFeedbackTemplateId = normalizeId(task.feedback_template_id ?? task.feedbackTemplateId);
        const markerTemplateId = getMarkerTemplateId({ description: task.description, title: task.title });
        const feedbackTemplateId = directFeedbackTemplateId ?? markerTemplateId ?? null;
        const isFeedbackTask = Boolean(feedbackTemplateId) || isFeedbackTitle(task.title);
        const resolvedVideo = getTaskVideoUrl(task);
        const mapped: any = {
          id: task.id,
          title: task.title,
          description: task.description || '',
          completed: task.completed,
          isTemplate: false,
          categoryIds: [],
          reminder_minutes: task.reminder_minutes ?? null,
          reminder: task.reminder_minutes ?? null,
          afterTrainingEnabled: task.after_training_enabled === true,
          afterTrainingDelayMinutes:
            typeof task.after_training_delay_minutes === 'number'
              ? task.after_training_delay_minutes
              : null,
          taskDurationEnabled: task.task_duration_enabled === true,
          taskDurationMinutes:
            typeof task.task_duration_minutes === 'number'
              ? task.task_duration_minutes
              : null,
          task_duration_enabled: task.task_duration_enabled === true,
          task_duration_minutes:
            typeof task.task_duration_minutes === 'number'
              ? task.task_duration_minutes
              : null,
          subtasks: [],
          videoUrl: resolvedVideo ?? undefined,
          video_url: resolvedVideo,
          taskTemplateId: task.task_template_id,
          feedback_template_id: task.feedback_template_id,
          feedbackTemplateId,
          isFeedbackTask: task.is_feedback_task === true || isFeedbackTask,
        };
        return mapped as FeedbackTask;
      });

      const intensityValue = parseIntensityValue(internalActivityAny.intensity);
      const intensityEnabled =
        typeof internalActivityAny.intensity_enabled === 'boolean'
          ? internalActivityAny.intensity_enabled
          : intensityValue !== null;
      const intensityNote =
        typeof internalActivityAny.intensity_note === 'string'
          ? internalActivityAny.intensity_note
          : null;

      const archivedAtByTemplateId = await fetchArchivedAtByTemplateIds(tasks as any[]);
      const visibleTasks = filterVisibleTasksForActivity<FeedbackTask>(
        tasks,
        internalActivityAny.activity_date,
        internalActivityAny.activity_time,
        archivedAtByTemplateId,
      );

      return {
        id: internalActivityAny.id,
        title: internalActivityAny.title,
        date: new Date(internalActivityAny.activity_date),
        time: internalActivityAny.activity_time,
        endTime: internalActivityAny.activity_end_time ?? undefined,
        location: internalActivityAny.location || '',
        category,
        tasks: visibleTasks,
        isExternal: false,
        externalCalendarId: internalActivityAny.external_calendar_id ?? undefined,
        externalEventId: internalActivityAny.external_event_id ?? undefined,
        seriesId: internalActivityAny.series_id ?? undefined,
        seriesInstanceDate: internalActivityAny.series_instance_date
          ? new Date(internalActivityAny.series_instance_date)
          : undefined,
        intensity: intensityValue,
        intensityEnabled,
        intensityNote,
      };
    }

    const selectExternalMetaBy = async (column: 'id' | 'external_event_id') =>
      selectSingleWithOptionalColumn<any>({
        table: 'events_local_meta',
        selectWith: EXTERNAL_META_SELECT_WITH_VIDEO,
        selectWithout: EXTERNAL_META_SELECT_NO_VIDEO,
        eqColumn: column,
        eqValue: activityId,
        optionalColumnName: 'video_url',
        context: `events_local_meta.${column}=${activityId}`,
      });

    let { data: localMeta, error: metaError } = await selectExternalMetaBy('id');
    if (metaError || !localMeta) {
      const fallback = await selectExternalMetaBy('external_event_id');
      localMeta = fallback.data ?? null;
      metaError = fallback.error ?? metaError;
    }

    if (!metaError && localMeta && (localMeta as any).events_external) {
      const localMetaAny = localMeta as any;
      const externalEvent = localMetaAny.events_external;
      const eventTitle = localMetaAny.local_title_override || externalEvent.title;

      let resolvedCategory: ActivityCategory | null = null;
      if (localMetaAny.activity_categories) {
        resolvedCategory = {
          id: localMetaAny.activity_categories.id,
          name: localMetaAny.activity_categories.name,
          color: localMetaAny.activity_categories.color,
          emoji: localMetaAny.activity_categories.emoji,
        };
      }

      const metaIntensity = parseIntensityValue(localMetaAny.intensity);
      const metaIntensityEnabled =
        typeof localMetaAny.intensity_enabled === 'boolean'
          ? localMetaAny.intensity_enabled
          : metaIntensity !== null;
      const metaIntensityNote =
        typeof localMetaAny.intensity_note === 'string'
          ? localMetaAny.intensity_note
          : null;

      const externalTasks = (localMetaAny.external_event_tasks || []).map((task: any) => {
        const directFeedbackTemplateId = normalizeId(task.feedback_template_id ?? task.feedbackTemplateId);
        const markerTemplateId = getMarkerTemplateId({ description: task.description, title: task.title });
        const feedbackTemplateId = directFeedbackTemplateId ?? markerTemplateId ?? null;
        const isFeedbackTask = Boolean(feedbackTemplateId) || isFeedbackTitle(task.title);
        const resolvedVideo = getTaskVideoUrl(task);
        const mapped: any = {
          id: task.id,
          title: task.title,
          description: task.description || '',
          completed: task.completed,
          isTemplate: false,
          categoryIds: [],
          reminder_minutes: task.reminder_minutes ?? null,
          reminder: task.reminder_minutes ?? null,
          afterTrainingEnabled: task.after_training_enabled === true,
          afterTrainingDelayMinutes:
            typeof task.after_training_delay_minutes === 'number'
              ? task.after_training_delay_minutes
              : null,
          taskDurationEnabled: task.task_duration_enabled === true,
          taskDurationMinutes:
            typeof task.task_duration_minutes === 'number'
              ? task.task_duration_minutes
              : null,
          task_duration_enabled: task.task_duration_enabled === true,
          task_duration_minutes:
            typeof task.task_duration_minutes === 'number'
              ? task.task_duration_minutes
              : null,
          subtasks: [],
          videoUrl: resolvedVideo ?? undefined,
          video_url: resolvedVideo,
          taskTemplateId: task.task_template_id,
          feedback_template_id: task.feedback_template_id,
          feedbackTemplateId,
          isFeedbackTask: task.is_feedback_task === true || isFeedbackTask,
        };
        return mapped as FeedbackTask;
      });

      const archivedAtByTemplateId = await fetchArchivedAtByTemplateIds(externalTasks as any[]);
      const visibleExternalTasks = filterVisibleTasksForActivity<FeedbackTask>(
        externalTasks,
        externalEvent.start_date,
        externalEvent.start_time,
        archivedAtByTemplateId,
      );

      return {
        id: localMetaAny.id,
        title: eventTitle,
        date: new Date(externalEvent.start_date),
        time: externalEvent.start_time,
        endTime: externalEvent.end_time,
        location: externalEvent.location || '',
        category:
          resolvedCategory ?? {
            id: '',
            name: 'Unknown',
            color: '#999999',
            emoji: '⚽️',
          },
        tasks: visibleExternalTasks,
        isExternal: true,
        externalCalendarId: externalEvent.provider_calendar_id,
        externalEventId: localMetaAny.external_event_id,
        externalEventRowId:
          normalizeId(localMetaAny.external_event_row_id ?? externalEvent.id) ?? undefined,
        intensity: metaIntensity,
        intensityEnabled: metaIntensityEnabled,
        intensityNote: metaIntensityNote,
      };
    }

    if (__DEV__ && metaError) {
      console.log('[ActivityDetails] events_local_meta lookup failed; falling back to events_external', {
        activityId,
        message: metaError?.message,
        details: metaError?.details,
        hint: metaError?.hint,
        code: metaError?.code,
      });
    }

    const { data: externalOnly, error: externalOnlyError } = await (supabase as any)
      .from('events_external')
      .select('id,title,location,start_date,start_time,end_time,provider_calendar_id')
      .eq('id', activityId)
      .is('deleted_at', null)
      .single();

    if (!externalOnlyError && externalOnly) {
      const externalOnlyAny = externalOnly as any;
      return {
        id: String(externalOnlyAny.id),
        title: externalOnlyAny.title ?? 'Ekstern aktivitet',
        date: new Date(externalOnlyAny.start_date),
        time: externalOnlyAny.start_time,
        endTime: externalOnlyAny.end_time ?? undefined,
        location: externalOnlyAny.location ?? '',
        category: {
          id: '',
          name: 'Unknown',
          color: '#999999',
          emoji: '⚽️',
        },
        tasks: [],
        isExternal: true,
        externalCalendarId: externalOnlyAny.provider_calendar_id ?? undefined,
        externalEventId: String(externalOnlyAny.id),
        externalEventRowId: String(externalOnlyAny.id),
        intensity: null,
        intensityEnabled: false,
        intensityNote: null,
      };
    }

    if (__DEV__) {
      console.log('[ActivityDetails] Activity not found after fallbacks', {
        activityId,
        externalOnlyError: externalOnlyError
          ? {
              message: externalOnlyError.message,
              details: externalOnlyError.details,
              hint: externalOnlyError.hint,
              code: externalOnlyError.code,
            }
          : null,
      });
    }

    return null;
  } catch (error) {
    console.error('Error fetching activity from database:', error);
    return null;
  }
}

function ActivityDetailsSkeleton({ isDark }: { isDark: boolean }) {
  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const skeletonColor = isDark ? '#3a3a3a' : '#e0e0e0';
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <LinearGradient
        colors={[skeletonColor, skeletonColor] as [string, string]}
        style={[styles.header, styles.v2Topbar, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.headerChevronWrap} pointerEvents="box-none">
          <View
            style={{
              width: 28,
              height: 28,
              backgroundColor: 'rgba(255,255,255,0.3)',
              borderRadius: 14,
            }}
          />
        </View>

        <View style={styles.headerContent}>
          <View
            style={{
              width: 64,
              height: 64,
              backgroundColor: 'rgba(255,255,255,0.3)',
              borderRadius: 32,
            }}
          />
          <View
            style={{
              width: 200,
              height: 28,
              backgroundColor: 'rgba(255,255,255,0.3)',
              borderRadius: 14,
              marginTop: 12,
            }}
          />
        </View>
      </LinearGradient>

      <View style={styles.v2Sheet}>
        <View pointerEvents="none" style={[styles.v2SheetFill, { backgroundColor: cardBgColor }]} />
        <View pointerEvents="none" style={styles.v2WaveOverlay}>
          <SheetWaveTop color={cardBgColor} />
        </View>

        <View style={{ paddingTop: 12, paddingBottom: 32 + V2_CTA_HEIGHT + 24 + insets.bottom }}>
          <View style={[styles.section, { backgroundColor: 'transparent', marginBottom: 8 }]}>
            <View
              style={{
                width: 100,
                height: 20,
                backgroundColor: skeletonColor,
                borderRadius: 10,
                marginBottom: 14,
              }}
            />
            <View
              style={{
                width: '100%',
                height: 64,
                backgroundColor: skeletonColor,
                borderRadius: 16,
                marginBottom: 12,
              }}
            />
            <View style={{ flexDirection: 'row', marginBottom: 12 }}>
              <View style={{ flex: 1, height: 64, backgroundColor: skeletonColor, borderRadius: 16 }} />
              <View style={{ width: 12 }} />
              <View style={{ flex: 1, height: 64, backgroundColor: skeletonColor, borderRadius: 16 }} />
            </View>
          </View>

          <View style={[styles.section, { backgroundColor: 'transparent' }]}>
            <View
              style={{
                width: 100,
                height: 20,
                backgroundColor: skeletonColor,
                borderRadius: 10,
                marginBottom: 14,
              }}
            />
            <View
              style={{
                width: '100%',
                height: 60,
                backgroundColor: skeletonColor,
                borderRadius: 16,
                marginBottom: 12,
              }}
            />
            <View
              style={{
                width: '100%',
                height: 60,
                backgroundColor: skeletonColor,
                borderRadius: 16,
                marginBottom: 12,
              }}
            />
            <View style={{ width: '100%', height: 60, backgroundColor: skeletonColor, borderRadius: 16 }} />
          </View>
        </View>
      </View>

      <View style={[styles.v2StickyCtaWrap, { paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.v2StickyCtaButton, { backgroundColor: skeletonColor, opacity: 0.6 }]} />
      </View>
    </View>
  );
}

interface ActivityDetailsContentProps {
  activity: Activity;
  categories: ActivityCategory[];
  isAdmin: boolean;
  isDark: boolean;
  onBack: () => void;
  onActivityUpdated: (activity: Activity) => void;
  initialFeedbackTaskId?: string | null;
  initialOpenTaskId?: string | null;
  initialOpenIntensity?: boolean;
}

interface TemplateFeedbackSummary {
  current?: TaskTemplateSelfFeedback;
  previous?: TaskTemplateSelfFeedback;
}

interface AfterTrainingFeedbackConfig {
  enableScore: boolean;
  scoreExplanation?: string | null;
  enableNote: boolean;
  // extra fields for compatibility if newer logic uses them:
  afterTrainingEnabled?: boolean | null;
  afterTrainingDelayMinutes?: number | null;
}

interface PreviousFeedbackEntry {
  templateId: string;
  taskTitle: string;
  feedback?: TaskTemplateSelfFeedback;
}

type LatestCategoryFeedbackEntry = {
  id: string;
  taskTemplateId: string;
  focusPointTitle: string;
  createdAt: string;
  rating?: number | null;
  note?: string | null;
};

function normalizeId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeUuid(value: unknown): string | null {
  const trimmed = normalizeId(value);
  if (!trimmed) return null;
  return isUuid(trimmed) ? trimmed : null;
}

function normalizeTitle(value?: string | null): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeFeedbackTitle(value?: string | null): string {
  return normalizeTitle(value);
}

function stripLeadingFeedbackPrefix(title: string): string {
  if (typeof title !== 'string') return title;
  const trimmed = title.trim();
  const stripped = trimmed.replace(/^feedback\s+p[\u00e5a]\s*/i, '');
  return stripped.length ? stripped : title;
}

function isFeedbackTitle(title?: string | null): boolean {
  if (typeof title !== 'string') return false;
  const normalized = normalizeFeedbackTitle(title);
  return normalized.startsWith('feedback pa');
}

function getMarkerTemplateId(task: { description?: string | null; title?: string | null }): string | null {
  return (
    parseTemplateIdFromMarker(task.description ?? '') ??
    parseTemplateIdFromMarker(task.title ?? '') ??
    null
  );
}

function isFeedbackTask(task: {
  description?: string | null;
  title?: string | null;
  feedbackTemplateId?: string | null;
  feedback_template_id?: string | null;
  isFeedbackTask?: boolean;
}): boolean {
  if (!task) return false;
  const direct = normalizeId(task.feedbackTemplateId ?? (task as any)?.feedback_template_id);
  if (direct) return true;
  if (task.isFeedbackTask === true) return true;
  return !!getMarkerTemplateId(task) || isFeedbackTitle(task.title);
}

function computeOrphanFeedbackTaskIds(tasks: FeedbackTask[]): {
  orphanIds: string[];
  orphanTasks: FeedbackTask[];
} {
  const parentsByTemplate = new Set<string>();
  const parentsByTitle = new Set<string>();

  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (isFeedbackTask(task)) continue;
    const templateId = normalizeId(task.taskTemplateId ?? (task as any)?.task_template_id);
    if (templateId) parentsByTemplate.add(templateId);
    const normalizedTitle = normalizeTitle(task.title);
    if (normalizedTitle) parentsByTitle.add(normalizedTitle);
  }

  const orphanIds: string[] = [];
  const orphanTasks: FeedbackTask[] = [];

  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!isFeedbackTask(task)) continue;

    const linkedTemplateId =
      normalizeId(task.feedbackTemplateId ?? (task as any)?.feedback_template_id) ??
      getMarkerTemplateId(task);
    const linkedTitle = normalizeTitle(stripLeadingFeedbackPrefix(task.title ?? ''));

    let isOrphan = false;
    if (linkedTemplateId) {
      isOrphan = !parentsByTemplate.has(linkedTemplateId);
    } else if (linkedTitle) {
      isOrphan = !parentsByTitle.has(linkedTitle);
    } else {
      continue;
    }

    if (isOrphan) {
      orphanIds.push(String(task.id));
      orphanTasks.push(task);
    }
  }

  return { orphanIds, orphanTasks };
}

function safeDateMs(value: unknown): number {
  const ms = new Date(String(value ?? '')).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function buildSelfFeedbackLookup(args: {
  templateIds: string[];
  allTemplateRows: TaskTemplateSelfFeedback[];
  currentActivityRows: TaskTemplateSelfFeedback[];
  currentActivityIds: string[];
}): Record<string, TemplateFeedbackSummary> {
  const { templateIds, allTemplateRows, currentActivityRows, currentActivityIds } = args;

  if (!Array.isArray(templateIds) || templateIds.length === 0) {
    return {};
  }

  const normalizedTemplateIds = templateIds
    .map((id) => normalizeId(id))
    .filter(Boolean) as string[];

  if (!normalizedTemplateIds.length) {
    return {};
  }

  const templateIdSet = new Set(normalizedTemplateIds);
  const currentActivityIdSet = new Set(
    (currentActivityIds ?? []).map((id) => normalizeId(id)).filter(Boolean) as string[],
  );

  const currentByTemplate: Record<string, TaskTemplateSelfFeedback> = {};
  for (const row of Array.isArray(currentActivityRows) ? currentActivityRows : []) {
    const templateId = normalizeId((row as any)?.taskTemplateId ?? (row as any)?.task_template_id);
    if (!templateId || !templateIdSet.has(templateId)) continue;

    const rowMs = safeDateMs((row as any)?.createdAt ?? (row as any)?.created_at);
    const existingMs = currentByTemplate[templateId] ? safeDateMs((currentByTemplate[templateId] as any).createdAt) : -1;
    if (!currentByTemplate[templateId] || rowMs > existingMs) {
      currentByTemplate[templateId] = row;
    }
  }

  const previousByTemplate: Record<string, TaskTemplateSelfFeedback> = {};
  for (const row of Array.isArray(allTemplateRows) ? allTemplateRows : []) {
    const templateId = normalizeId((row as any)?.taskTemplateId ?? (row as any)?.task_template_id);
    if (!templateId || !templateIdSet.has(templateId)) continue;

    const rowActivityId = normalizeId((row as any)?.activityId ?? (row as any)?.activity_id);
    if (rowActivityId && currentActivityIdSet.has(rowActivityId)) continue;

    const rowMs = safeDateMs((row as any)?.createdAt ?? (row as any)?.created_at);
    const existingMs = previousByTemplate[templateId] ? safeDateMs((previousByTemplate[templateId] as any).createdAt) : -1;
    if (!previousByTemplate[templateId] || rowMs > existingMs) {
      previousByTemplate[templateId] = row;
    }
  }

  const lookup: Record<string, TemplateFeedbackSummary> = {};
  for (const templateId of normalizedTemplateIds) {
    const current = currentByTemplate[templateId];
    const previous = previousByTemplate[templateId];
    if (current || previous) {
      lookup[templateId] = { current, previous };
    } else {
      lookup[templateId] = {};
    }
  }

  return lookup;
}

function buildFeedbackHistoryByTemplate(
  templateIds: string[],
  rows: TaskTemplateSelfFeedback[],
): Record<string, TaskTemplateSelfFeedback[]> {
  const normalizedTemplateIds = templateIds
    .map((id) => normalizeId(id))
    .filter(Boolean) as string[];

  if (!normalizedTemplateIds.length) {
    return {};
  }

  const templateIdSet = new Set(normalizedTemplateIds);
  const lookup: Record<string, TaskTemplateSelfFeedback[]> = {};
  normalizedTemplateIds.forEach((id) => {
    lookup[id] = [];
  });

  for (const row of Array.isArray(rows) ? rows : []) {
    const templateId = normalizeId((row as any)?.taskTemplateId ?? (row as any)?.task_template_id);
    if (!templateId || !templateIdSet.has(templateId)) continue;
    lookup[templateId].push(row);
  }

  Object.keys(lookup).forEach((templateId) => {
    lookup[templateId].sort((a, b) => {
      const aMs = safeDateMs((a as any)?.createdAt ?? (a as any)?.created_at);
      const bMs = safeDateMs((b as any)?.createdAt ?? (b as any)?.created_at);
      return bMs - aMs;
    });
  });

  return lookup;
}

function buildSelfFeedbackByTaskId(
  currentActivityRows: TaskTemplateSelfFeedback[],
): Record<string, TaskTemplateSelfFeedback> {
  const lookup: Record<string, TaskTemplateSelfFeedback> = {};
  for (const row of Array.isArray(currentActivityRows) ? currentActivityRows : []) {
    const taskInstanceId = normalizeId(
      (row as any)?.taskInstanceId ?? (row as any)?.task_instance_id,
    );
    if (!taskInstanceId) continue;

    const rowMs = safeDateMs((row as any)?.createdAt ?? (row as any)?.created_at);
    const existingMs = lookup[taskInstanceId]
      ? safeDateMs((lookup[taskInstanceId] as any).createdAt)
      : -1;
    if (!lookup[taskInstanceId] || rowMs > existingMs) {
      lookup[taskInstanceId] = row;
    }
  }
  return lookup;
}

function normalizeScoreExplanation(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return value ?? null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function buildFeedbackConfig(row?: any): AfterTrainingFeedbackConfig {
  if (!row) {
    return {
      enableScore: true,
      scoreExplanation: null,
      enableNote: true,
      afterTrainingEnabled: null,
      afterTrainingDelayMinutes: null,
    };
  }

  return {
    enableScore: row.after_training_feedback_enable_score ?? true,
    scoreExplanation: normalizeScoreExplanation(row.after_training_feedback_score_explanation),
    enableNote: row.after_training_feedback_enable_note ?? true,
    afterTrainingEnabled: row.after_training_enabled ?? null,
    afterTrainingDelayMinutes: row.after_training_delay_minutes ?? null,
  };
}

function buildFeedbackSummary(
  feedback?: TaskTemplateSelfFeedback,
  config?: AfterTrainingFeedbackConfig,
): string | null {
  if (!feedback) {
    return null;
  }

  const parts: string[] = [];

  if (config?.enableScore !== false) {
    parts.push(typeof feedback.rating === 'number' ? `Score ${feedback.rating}/10` : 'Score mangler');
  }

  return parts.length ? parts.join(' – ') : null;
}

function extractFeedbackNote(
  feedback?: TaskTemplateSelfFeedback,
  config?: AfterTrainingFeedbackConfig,
): string | null {
  if (!feedback || config?.enableNote === false) {
    return null;
  }
  const trimmed = feedback.note?.trim() ?? '';
  return trimmed.length ? trimmed : null;
}

function isFeedbackAnswered(
  feedback?: TaskTemplateSelfFeedback,
  config?: AfterTrainingFeedbackConfig,
): boolean {
  if (!feedback) return false;

  const enableScore = config?.enableScore !== false;
  const enableNote = config?.enableNote !== false;

  const hasScore = typeof feedback.rating === 'number';
  const hasNote = (feedback.note?.trim() ?? '').length > 0;

  if (enableScore && hasScore) return true;
  if (enableNote && hasNote) return true;

  return false;
}

type TaskListItem =
  | FeedbackTask
  | {
      __type: 'intensity';
      key: string;
    };

type PendingAction =
  | { type: 'duplicate' }
  | { type: 'delete-task'; taskId: string }
  | { type: 'delete-external' }
  | { type: 'delete-single' }
  | { type: 'delete-series' };

type ExternalIntensityModalState = {
  visible: boolean;
  nextEnabled: boolean;
  previousEnabled: boolean;
  previousIntensity: number | null;
  previousScope: 'single' | 'category';
};

export function ActivityDetailsContent(props: ActivityDetailsContentProps) {
  const {
    activity,
    categories,
    isAdmin,
    isDark,
    onBack,
    onActivityUpdated,
    initialFeedbackTaskId,
    initialOpenTaskId,
    initialOpenIntensity,
  } = props;

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const safeDismiss = useCallback(() => {
    try {
      const r: any = router;
      if (typeof r.dismiss === 'function') return r.dismiss();
      onBack();
      return;
    } catch {
      onBack();
    }
  }, [onBack, router]);

  const {
    updateActivitySingle,
    updateIntensityByCategory,
    updateActivitySeries,
    toggleTaskCompletion,
    deleteActivityTask,
    deleteActivitySingle,
    deleteActivitySeries,
    refreshData,
    createActivity,
    duplicateActivity,
    tasks: taskTemplates,
  } = useFootball();

  const listRef = useRef<FlatList<TaskListItem>>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [editingActivityTask, setEditingActivityTask] = useState<FeedbackTask | null>(null);
  const [showTemplateTaskModal, setShowTemplateTaskModal] = useState(false);
  const [isTemplateTaskSaving, setIsTemplateTaskSaving] = useState(false);
  const [templateTaskSearch, setTemplateTaskSearch] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [tasksState, setTasksState] = useState<FeedbackTask[]>((activity.tasks as FeedbackTask[]) || []);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const [feedbackConfigByTemplate, setFeedbackConfigByTemplate] = useState<
    Record<string, AfterTrainingFeedbackConfig>
  >({});

  const [selfFeedbackByTemplate, setSelfFeedbackByTemplate] = useState<
    Record<string, TemplateFeedbackSummary>
  >({});
  const [selfFeedbackByTaskId, setSelfFeedbackByTaskId] = useState<
    Record<string, TaskTemplateSelfFeedback>
  >({});
  const [selfFeedbackHistoryByTemplate, setSelfFeedbackHistoryByTemplate] = useState<
    Record<string, TaskTemplateSelfFeedback[]>
  >({});
  const [latestCategoryFeedback, setLatestCategoryFeedback] = useState<LatestCategoryFeedbackEntry[]>([]);
  const [isLatestCategoryFeedbackLoading, setIsLatestCategoryFeedbackLoading] = useState(true);
  const [latestFeedbackRefreshKey, setLatestFeedbackRefreshKey] = useState(0);
  const [isLatestFeedbackExpanded, setIsLatestFeedbackExpanded] = useState(true);

  const [selectedNormalTask, setSelectedNormalTask] = useState<FeedbackTask | null>(null);
  const [isNormalTaskModalVisible, setIsNormalTaskModalVisible] = useState(false);
  const [isNormalTaskCompleting, setIsNormalTaskCompleting] = useState(false);

  const normalTaskVideoUrl = useMemo(
    () => (selectedNormalTask ? getTaskVideoUrl(selectedNormalTask) : null),
    [selectedNormalTask],
  );

  const handleNormalTaskComplete = useCallback(async () => {
    if (!selectedNormalTask) return;
    const previousCompleted = !!selectedNormalTask.completed;
    const nextCompleted = !previousCompleted;
    setIsNormalTaskCompleting(true);
    setTasksState((prev) =>
      prev.map((t) =>
        t.id === selectedNormalTask.id ? { ...t, completed: nextCompleted } : t
      ),
    );
    try {
      await toggleTaskCompletion(activity.id, selectedNormalTask.id, nextCompleted);
      Promise.resolve(refreshData()).catch(() => {});
      setIsNormalTaskModalVisible(false);
      setSelectedNormalTask(null);
    } catch (err) {
      setTasksState((prev) =>
        prev.map((t) =>
          t.id === selectedNormalTask.id ? { ...t, completed: previousCompleted } : t
        ),
      );
      Alert.alert('Fejl', 'Kunne ikke ændre opgaven. Prøv igen.');
    } finally {
      setIsNormalTaskCompleting(false);
    }
  }, [selectedNormalTask, activity.id, toggleTaskCompletion, refreshData]);

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#9aa0a6' : colors.textSecondary;
  const sectionTitleColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.35)';
  const fieldBackgroundColor = isDark ? '#0f1116' : '#f2f4f7';
  const fieldBorderColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.08)';
  const infoBackgroundColor = isDark ? 'rgba(255,255,255,0.08)' : '#f8fafc';
  const infoTextColor = isDark ? '#f8fafc' : colors.text;
  const primaryColor = colors.primary;

  const headerGradientColors = useMemo(() => {
    const base = activity?.category?.color || colors.primary;
    return [darkenHex(base, 0.22), lightenHex(base, 0.12)] as [string, string];
  }, [activity?.category?.color]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isCurrentUserResolved, setIsCurrentUserResolved] = useState(false);

  const [pendingFeedbackTaskId, setPendingFeedbackTaskId] = useState<string | null>(initialFeedbackTaskId ?? null);
  const [pendingNormalTaskId, setPendingNormalTaskId] = useState<string | null>(initialOpenTaskId ?? null);
  const [deepLinkTaskLookupState, setDeepLinkTaskLookupState] = useState<'idle' | 'loading' | 'error'>('idle');
  const deepLinkTaskLookupAttemptedRef = useRef<string | null>(null);

  const [pendingOpenIntensity, setPendingOpenIntensity] = useState<boolean>(initialOpenIntensity ?? false);

  const activityId = activity.id;
  const activityIsExternal = activity.isExternal;
  const activityExternalEventRowId =
    (activity as any)?.externalEventRowId ?? (activity as any)?.external_event_row_id;
  const activityExternalEventId =
    activity.externalEventId ?? (activity as any)?.external_event_id;
  const activityTasks = activity.tasks;

  const feedbackActivityCandidates = useMemo(() => {
    const ids: string[] = [];
    const push = (value: unknown) => {
      const normalized = normalizeUuid(value);
      if (!normalized) return;
      if (!ids.includes(normalized)) ids.push(normalized);
    };

    push(activityId);

    if (activityIsExternal) {
      push(activityExternalEventRowId);
      push(activityExternalEventId);
    }

    return ids;
  }, [
    activityExternalEventId,
    activityExternalEventRowId,
    activityId,
    activityIsExternal,
  ]);

  const feedbackActivityCandidatesKey = useMemo(
    () => feedbackActivityCandidates.join('|'),
    [feedbackActivityCandidates],
  );

  const openCanonicalIntensityModal = useCallback(() => {
    if (!activityId) return;
    router.push({
      pathname: '/(modals)/task-score-note',
      params: {
        activityId: String(activity.id ?? activityId),
        initialScore:
          activity?.intensity !== null && activity?.intensity !== undefined
            ? String(activity.intensity)
            : '',
      },
    });
  }, [activity?.intensity, activity.id, activityId, router]);

  const openCanonicalFeedbackModal = useCallback(
    (task: FeedbackTask, templateId: string) => {
      const rawTaskInstanceId = task?.id ?? (task as any)?.task_id;
      const taskInstanceId = normalizeId(rawTaskInstanceId);
      const routeActivityId =
        feedbackActivityCandidates[0] ??
        ((activity as any)?.activity_id ?? (activity as any)?.activityId) ??
        activity?.id ??
        activityId;

      if (!routeActivityId) return;

      router.push({
        pathname: '/(modals)/task-feedback-note',
        params: {
          activityId: String(routeActivityId),
          templateId: String(templateId),
          title: String(task.title ?? 'opgave'),
          taskInstanceId: taskInstanceId ?? undefined,
        },
      });
    },
    [activity, activityId, feedbackActivityCandidates, router],
  );

  const resolveFeedbackTemplateId = useCallback((task: FeedbackTask | null | undefined): string | null => {
    if (!task) return null;
    const direct = normalizeId(task.feedbackTemplateId ?? (task as any)?.feedback_template_id);
    if (direct) return direct;
    const markerTemplateId = getMarkerTemplateId(task);
    if (markerTemplateId) return markerTemplateId;
    if (isFeedbackTitle(task.title) || task.isFeedbackTask === true) {
      const fallbackTemplateId = normalizeId(task.taskTemplateId ?? (task as any)?.task_template_id);
      if (fallbackTemplateId) return fallbackTemplateId;
    }
    return null;
  }, []);

  const getFeedbackConfigForTemplate = useCallback(
    (templateId: string | null): AfterTrainingFeedbackConfig => {
      if (!templateId) return buildFeedbackConfig(undefined);
      return feedbackConfigByTemplate[templateId] ?? buildFeedbackConfig(undefined);
    },
    [feedbackConfigByTemplate],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          setCurrentUserId(null);
          setIsCurrentUserResolved(true);
          return;
        }
        setCurrentUserId(data.session?.user?.id ?? null);
        setIsCurrentUserResolved(true);
      } catch {
        if (!cancelled) {
          setCurrentUserId(null);
          setIsCurrentUserResolved(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const incomingTasks = (activityTasks as FeedbackTask[]) || [];

    if (!activityIsExternal) {
      setTasksState(incomingTasks);
      return;
    }

    const { orphanIds, orphanTasks } = computeOrphanFeedbackTaskIds(incomingTasks);
    const orphanIdsToHide = orphanTasks
      .filter((task) => !task.completed)
      .map((task) => String(task.id));
    const orphanIdSet = new Set(orphanIdsToHide);
    const filteredTasks = orphanIdsToHide.length
      ? incomingTasks.filter((task) => !orphanIdSet.has(String(task.id)))
      : incomingTasks;

    setTasksState(filteredTasks);

    if (orphanIds.length && __DEV__) {
      console.log('[OrphanFeedbackCleanup]', {
        activityId,
        externalEventRowId: activityExternalEventRowId,
        orphanCount: orphanIds.length,
        orphanIdsSample: orphanIds.slice(0, 3),
      });
    }

    // NOTE: We no longer delete orphan feedback tasks here. External calendars can be noisy,
    // and completed feedback should never be removed automatically.
  }, [activityExternalEventRowId, activityId, activityIsExternal, activityTasks]);

  const feedbackTemplateIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tasksState) {
      const templateId = resolveFeedbackTemplateId(t);
      if (templateId) ids.add(String(templateId));
    }
    return Array.from(ids);
  }, [resolveFeedbackTemplateId, tasksState]);

  const feedbackTemplateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasksState) {
      const templateId = resolveFeedbackTemplateId(t);
      if (!templateId) continue;
      counts[String(templateId)] = (counts[String(templateId)] ?? 0) + 1;
    }
    return counts;
  }, [resolveFeedbackTemplateId, tasksState]);

  const focusChangeRecommendations = useMemo(() => {
    if (!feedbackTemplateIds.length) return [];

    const items: { templateId: string; name: string }[] = [];
    const resolveTemplateName = (templateId: string) => {
      const task = tasksState.find((t) => resolveFeedbackTemplateId(t) === templateId);
      const rawTitle = task?.title ?? 'Feedback opgave';
      const stripped = stripLeadingFeedbackPrefix(rawTitle);
      return stripped.length ? stripped : rawTitle;
    };

    for (const templateId of feedbackTemplateIds) {
      const rows = selfFeedbackHistoryByTemplate[String(templateId)] ?? [];
      const ratings = rows
        .map((row) => row.rating)
        .filter((rating): rating is number => typeof rating === 'number');
      const latestPerfectScores = ratings.slice(0, FOCUS_CHANGE_PERFECT_SCORE_STREAK);
      if (latestPerfectScores.length < FOCUS_CHANGE_PERFECT_SCORE_STREAK) continue;
      if (!latestPerfectScores.every((rating) => rating === 10)) continue;

      items.push({
        templateId,
        name: resolveTemplateName(String(templateId)),
      });
    }

    return items;
  }, [feedbackTemplateIds, resolveFeedbackTemplateId, selfFeedbackHistoryByTemplate, tasksState]);

  const focusRecommendationShownRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activityId || !focusChangeRecommendations.length) return;
    if (focusRecommendationShownRef.current === activityId) return;

    focusRecommendationShownRef.current = activityId;

    const names = focusChangeRecommendations.map((item) => item.name).join(', ');
    const message =
      focusChangeRecommendations.length === 1
        ? `Du har scoret 10 ${FOCUS_CHANGE_PERFECT_SCORE_STREAK} gange i træk på "${names}". Vi anbefaler, at du skifter fokuspunkt for at udvikle andre skills.`
        : `Du har scoret 10 ${FOCUS_CHANGE_PERFECT_SCORE_STREAK} gange i træk på: ${names}. Vi anbefaler, at du skifter fokuspunkt for at udvikle andre skills.`;

    Alert.alert('Overvej at skifte fokus', message);
  }, [activityId, focusChangeRecommendations]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!feedbackTemplateIds.length) {
        if (!cancelled) {
          setSelfFeedbackByTemplate({});
          setSelfFeedbackByTaskId({});
          setSelfFeedbackHistoryByTemplate({});
        }
        return;
      }

      try {
        const { data } = await supabase.from('task_templates').select(TEMPLATE_SELECT_FULL).in('id', feedbackTemplateIds);

        if (!cancelled && Array.isArray(data)) {
          const next: Record<string, AfterTrainingFeedbackConfig> = {};
          for (const row of data as any[]) {
            if (!row?.id) continue;
            next[String(row.id)] = buildFeedbackConfig(row);
          }
          setFeedbackConfigByTemplate((prev) => ({ ...prev, ...next }));
        }
      } catch (e) {
        if (__DEV__) console.log('[ActivityDetails] feedback config fetch skipped/failed', e);
      }

      try {
        if (!currentUserId) return;
        const uniqueCandidateIds = Array.from(new Set(feedbackActivityCandidates));

        const [allTemplateRows, currentActivityRows] = await Promise.all([
          fetchSelfFeedbackForTemplates(currentUserId, feedbackTemplateIds),
          uniqueCandidateIds.length
            ? fetchSelfFeedbackForActivities(currentUserId, uniqueCandidateIds)
            : Promise.resolve([] as TaskTemplateSelfFeedback[]),
        ]);
        if (cancelled) return;

        setSelfFeedbackByTemplate(
          buildSelfFeedbackLookup({
            templateIds: feedbackTemplateIds,
            allTemplateRows,
            currentActivityRows,
            currentActivityIds: uniqueCandidateIds,
          }),
        );
        setSelfFeedbackHistoryByTemplate(buildFeedbackHistoryByTemplate(feedbackTemplateIds, allTemplateRows));
        setSelfFeedbackByTaskId(buildSelfFeedbackByTaskId(currentActivityRows));
      } catch (e) {
        if (__DEV__) console.log('[ActivityDetails] self feedback fetch skipped/failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, feedbackActivityCandidates, feedbackActivityCandidatesKey, feedbackTemplateIds]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isCurrentUserResolved) {
        if (!cancelled) {
          setIsLatestCategoryFeedbackLoading(true);
        }
        return;
      }

      const categoryId = normalizeId(activity?.category?.id);
      if (!currentUserId || !categoryId) {
        if (!cancelled) {
          setLatestCategoryFeedback([]);
          setIsLatestCategoryFeedbackLoading(false);
        }
        return;
      }

      setIsLatestCategoryFeedbackLoading(true);
      try {
        const rows = await fetchLatestCategoryFeedback({
          userId: currentUserId,
          categoryId,
          limit: 3,
        });
        if (cancelled) return;
        setLatestCategoryFeedback(
          rows.map((row) => ({
            id: String(row.id),
            taskTemplateId: String(row.taskTemplateId ?? ''),
            focusPointTitle: stripLeadingFeedbackPrefix(
              String((row as any).focusPointTitle ?? '').trim() || 'Ukendt fokuspunkt',
            ),
            createdAt: String(row.createdAt ?? ''),
            rating: row.rating ?? null,
            note: row.note ?? null,
          })),
        );
      } catch {
        if (!cancelled) {
          setLatestCategoryFeedback([]);
        }
      } finally {
        if (!cancelled) {
          setIsLatestCategoryFeedbackLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activity?.category?.id, currentUserId, isCurrentUserResolved, latestFeedbackRefreshKey]);

  useEffect(() => {
    if (!pendingFeedbackTaskId) return;

    const task = tasksState.find((t) => String(t.id) === String(pendingFeedbackTaskId));
    if (!task) return;

    const templateId = resolveFeedbackTemplateId(task);
    if (!templateId) return;

    openCanonicalFeedbackModal(task, templateId);
    setPendingFeedbackTaskId(null);
    setDeepLinkTaskLookupState('idle');
  }, [openCanonicalFeedbackModal, pendingFeedbackTaskId, resolveFeedbackTemplateId, tasksState]);

  useEffect(() => {
    if (!pendingNormalTaskId) return;
    const task = tasksState.find((t) => String(t.id) === String(pendingNormalTaskId));
    if (!task) return;
    const feedbackTemplateId = resolveFeedbackTemplateId(task);
    if (feedbackTemplateId) {
      openCanonicalFeedbackModal(task, feedbackTemplateId);
      setPendingNormalTaskId(null);
      setDeepLinkTaskLookupState('idle');
      return;
    }
    setSelectedNormalTask(task);
    setIsNormalTaskModalVisible(true);
    setPendingNormalTaskId(null);
    setDeepLinkTaskLookupState('idle');
  }, [openCanonicalFeedbackModal, pendingNormalTaskId, resolveFeedbackTemplateId, tasksState]);

  const [editTitle, setEditTitle] = useState(activity.title);
  const [editLocation, setEditLocation] = useState(activity.location);
  const [editDate, setEditDate] = useState(activity.date);
  const [editTime, setEditTime] = useState(activity.time);
  const [editEndTime, setEditEndTime] = useState(activity.endTime);
  const [editCategory, setEditCategory] = useState<ActivityCategory | null>(activity.category);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [editScope, setEditScope] = useState<'single' | 'series'>('single');

  const activityIntensityValue = useMemo(
    () => parseIntensityValue((activity as any)?.intensity ?? (activity as any)?.activity_intensity),
    [activity],
  );
  const activityIntensityNote = useMemo(() => {
    const raw =
      (activity as any)?.intensityNote ??
      (activity as any)?.intensity_note ??
      (activity as any)?.activity_intensity_note ??
      null;
    return typeof raw === 'string' ? raw : '';
  }, [activity]);
  const [liveActivityIntensity, setLiveActivityIntensity] = useState<number | null>(activityIntensityValue);

  const activityIntensityEnabled = useMemo(() => {
    const flag = resolveActivityIntensityEnabled(activity);
    const hasExplicitFlag =
      typeof (activity as any)?.intensity_enabled === 'boolean' ||
      typeof (activity as any)?.intensityEnabled === 'boolean' ||
      typeof (activity as any)?.activity_intensity_enabled === 'boolean';

    if (hasExplicitFlag) return flag;
    return flag || activityIntensityValue !== null;
  }, [activity, activityIntensityValue]);

  const [editIntensityEnabled, setEditIntensityEnabled] = useState(activityIntensityEnabled);
  const [editIntensity, setEditIntensity] = useState<number | null>(activityIntensityValue);
  const [externalIntensityApplyScope, setExternalIntensityApplyScope] = useState<'single' | 'category'>('single');
  const [externalIntensityModal, setExternalIntensityModal] = useState<ExternalIntensityModalState>({
    visible: false,
    nextEnabled: activityIntensityEnabled,
    previousEnabled: activityIntensityEnabled,
    previousIntensity: activityIntensityValue,
    previousScope: 'single',
  });
  const isInternalActivity = !activity.isExternal;

  const currentActivityIntensity = liveActivityIntensity;
  const shouldShowActivityIntensityField = !!activityIntensityEnabled;
  const showIntensityTaskRow = activityIntensityEnabled;
  const intensityTaskCompleted = showIntensityTaskRow && currentActivityIntensity !== null;

  const startTimeDate = useMemo(() => parseTimeToDate(editDate, editTime), [editDate, editTime]);
  const endTimeDate = useMemo(
    () => parseTimeToDate(editDate, editEndTime ?? editTime),
    [editDate, editEndTime, editTime],
  );

  useEffect(() => {
    setPendingOpenIntensity(initialOpenIntensity ?? false);
  }, [activity.id, initialOpenIntensity]);

  useEffect(() => {
    setLiveActivityIntensity(activityIntensityValue);
  }, [activity.id, activityIntensityValue]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('progression:refresh', (payload?: any) => {
      if (payload?.source !== 'task-score-note') return;
      const payloadActivityId = String(payload?.activityId ?? '').trim();
      if (!payloadActivityId || payloadActivityId !== String(activityId)) return;

      const nextIntensity = parseIntensityValue(payload?.intensity);
      setLiveActivityIntensity(nextIntensity);
    });

    return () => {
      subscription.remove();
    };
  }, [activityId]);

  useEffect(() => {
    if (!pendingOpenIntensity) {
      return;
    }

    setPendingOpenIntensity(false);

    if (!showIntensityTaskRow) {
      Alert.alert('Intensitet ikke tilgængelig', 'Intensitet er ikke aktiveret for denne aktivitet.');
      return;
    }

    openCanonicalIntensityModal();
  }, [openCanonicalIntensityModal, pendingOpenIntensity, showIntensityTaskRow]);

  const [convertToRecurring, setConvertToRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly'>('weekly');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  useEffect(() => {
    if (isEditing) return;

    setEditTitle(activity.title);
    setEditLocation(activity.location);
    setEditDate(activity.date);
    setEditTime(activity.time);
    setEditEndTime(activity.endTime);
    setEditCategory(activity.category);

    const resolvedFlag = resolveActivityIntensityEnabled(activity);
    const resolvedValue = parseIntensityValue(activity.intensity);
    const hasExplicitFlag =
      typeof (activity as any)?.intensity_enabled === 'boolean' ||
      typeof (activity as any)?.intensityEnabled === 'boolean' ||
      typeof (activity as any)?.activity_intensity_enabled === 'boolean';

    setEditIntensityEnabled(hasExplicitFlag ? resolvedFlag : resolvedFlag || resolvedValue !== null);
    setEditIntensity(resolvedValue);
  }, [activity, isEditing]);

  useEffect(() => {
    setEditScope('single');
    setExternalIntensityApplyScope('single');
    setExternalIntensityModal({
      visible: false,
      nextEnabled: activityIntensityEnabled,
      previousEnabled: activityIntensityEnabled,
      previousIntensity: activityIntensityValue,
      previousScope: 'single',
    });
  }, [activity.id, activityIntensityEnabled, activityIntensityValue]);

  useEffect(() => {
    setPendingFeedbackTaskId(initialFeedbackTaskId ?? null);
    setPendingNormalTaskId(initialOpenTaskId ?? null);
    setDeepLinkTaskLookupState('idle');
    deepLinkTaskLookupAttemptedRef.current = null;
  }, [activity.id, initialFeedbackTaskId, initialOpenTaskId]);

  useEffect(() => {
    if (isEditing) return;
    setShowDatePicker(false);
    setShowTimePicker(false);
    setShowEndTimePicker(false);
    setShowEndDatePicker(false);
    setExternalIntensityModal(prev => ({ ...prev, visible: false }));
  }, [isEditing]);

  const applyActivityUpdates = useCallback(
    (updates: Partial<Activity>) => {
      const nextActivity: Activity = {
        ...activity,
        ...updates,
        category: updates.category ?? activity.category,
        tasks: updates.tasks ?? activity.tasks,
        intensity: updates.intensity !== undefined ? updates.intensity : activity.intensity,
        intensityEnabled:
          updates.intensityEnabled !== undefined ? updates.intensityEnabled : activity.intensityEnabled,
        intensityNote:
          updates.intensityNote !== undefined ? updates.intensityNote : activity.intensityNote,
      };
      onActivityUpdated(nextActivity);
    },
    [activity, onActivityUpdated],
  );

  const handleEditSingle = useCallback(() => {
    setEditScope('single');
    setIsEditing(true);
  }, []);

  const handleEditAll = useCallback(() => {
    setEditScope('series');
    setIsEditing(true);
  }, []);

  const handleEditClick = useCallback(() => {
    if (activity?.seriesId) {
      Alert.alert('Rediger serie', 'Vil du redigere kun denne aktivitet eller hele serien?', [
        { text: 'Annuller', style: 'cancel' },
        { text: 'Kun denne', onPress: handleEditSingle },
        { text: 'Hele serien', onPress: handleEditAll },
      ]);
      return;
    }

    setEditScope('single');
    setIsEditing(true);
  }, [activity?.seriesId, handleEditAll, handleEditSingle]);

  const handleDuplicate = useCallback(() => {
    if (!activity) return;

    if (activity.isExternal) {
      Alert.alert(
        'Kan ikke duplikere',
        'Denne aktivitet er fra en ekstern kalender og kan ikke duplikeres. Kun manuelle aktiviteter kan duplikeres.',
      );
      return;
    }

    Alert.alert(
      'Duplikér aktivitet',
      `Er du sikker på at du vil duplikere "${activity.title}"? En kopi vil blive oprettet med samme dato, tid, lokation og opgaver.`,
      [
        { text: 'Annuller', style: 'cancel' },
        { text: 'Duplikér', onPress: () => setPendingAction({ type: 'duplicate' }) },
      ],
    );
  }, [activity]);

  const handleIntensityToggle = useCallback((value: boolean) => {
    if (value === editIntensityEnabled) return;
    if (externalIntensityModal.visible) return;

    const previousIntensity = editIntensity;
    setEditIntensityEnabled(value);
    if (!value) {
      setEditIntensity(null);
    }

    setExternalIntensityModal({
      visible: true,
      nextEnabled: value,
      previousEnabled: editIntensityEnabled,
      previousIntensity,
      previousScope: externalIntensityApplyScope,
    });
  }, [
    editIntensity,
    editIntensityEnabled,
    externalIntensityApplyScope,
    externalIntensityModal.visible,
  ]);

  const closeExternalIntensityModal = useCallback(() => {
    setExternalIntensityModal(prev => ({ ...prev, visible: false }));
  }, []);

  const handleExternalIntensityApplyAll = useCallback(() => {
    setExternalIntensityApplyScope('category');
    closeExternalIntensityModal();
  }, [closeExternalIntensityModal]);

  const handleExternalIntensityApplySingle = useCallback(() => {
    setExternalIntensityApplyScope('single');
    closeExternalIntensityModal();
  }, [closeExternalIntensityModal]);

  const handleExternalIntensityCancel = useCallback(() => {
    setEditIntensityEnabled(externalIntensityModal.previousEnabled);
    setEditIntensity(externalIntensityModal.previousEnabled ? externalIntensityModal.previousIntensity : null);
    setExternalIntensityApplyScope(externalIntensityModal.previousScope);
    closeExternalIntensityModal();
  }, [
    closeExternalIntensityModal,
    externalIntensityModal.previousEnabled,
    externalIntensityModal.previousIntensity,
    externalIntensityModal.previousScope,
  ]);

  const handleIntensityRowPress = useCallback(() => {
    if (!showIntensityTaskRow) return;
    openCanonicalIntensityModal();
  }, [openCanonicalIntensityModal, showIntensityTaskRow]);

  const renderPicker = useCallback(
    ({
      visible,
      mode,
      value,
      onChange,
      onClose,
    }: {
      visible: boolean;
      mode: 'date' | 'time';
      value: Date;
      onChange: (event: DateTimePickerEvent, selected?: Date) => void;
      onClose: () => void;
    }) => {
      if (!visible || Platform.OS === 'web') {
        return null;
      }

      if (Platform.OS === 'ios') {
        return (
          <View style={[styles.pickerContainer, { backgroundColor: cardBgColor, borderColor: fieldBorderColor, borderWidth: 1 }]}>
            <DateTimePicker value={value} mode={mode} display="spinner" onChange={onChange} style={styles.iosPicker} />
            <TouchableOpacity
              style={[
                styles.pickerDoneButton,
                { borderTopColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.1)' },
              ]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={[styles.pickerDoneText, { color: primaryColor }]}>Færdig</Text>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <DateTimePicker
          value={value}
          mode={mode}
          display="default"
          is24Hour
          onChange={(event, selected) => {
            onChange(event, selected);
            if (Platform.OS === 'android') {
              onClose();
            }
          }}
        />
      );
    },
    [cardBgColor, fieldBorderColor, isDark, primaryColor],
  );

  const handleSave = useCallback(async () => {
    const endTimePayload = isInternalActivity ? normalizeOptionalTime(editEndTime) : undefined;
    const intensityPayload = editIntensityEnabled ? editIntensity ?? null : null;
    const resolvedCategoryId = editCategory?.id || activity.category?.id;
    const shouldApplyIntensityByCategory =
      externalIntensityApplyScope === 'category' && !!resolvedCategoryId;
    const intensityChanged =
      editIntensityEnabled !== activityIntensityEnabled ||
      intensityPayload !== activityIntensityValue;
    const trimmedTime = (editTime ?? '').trim();
    let safeTime: string | null = null;

    if (isInternalActivity) {
      if (!trimmedTime) {
        Alert.alert('Fejl', 'Starttidspunkt er påkrævet.');
        return;
      }

      const startMinutes = timeToMinutes(trimmedTime);
      if (startMinutes === null) {
        Alert.alert('Fejl', 'Ugyldigt starttidspunkt. Benyt formatet HH:MM.');
        return;
      }

      if (endTimePayload) {
        const endMinutes = timeToMinutes(endTimePayload);
        if (endMinutes === null) {
          Alert.alert('Fejl', 'Ugyldigt sluttidspunkt. Benyt formatet HH:MM.');
          return;
        }
        if (endMinutes <= startMinutes) {
          Alert.alert('Fejl', 'Sluttidspunkt skal være efter starttidspunkt.');
          return;
        }
      }

      safeTime = trimmedTime;
    }

    const effectiveTime = safeTime ?? activity.time;

    setIsSaving(true);

    try {
      if (convertToRecurring && isInternalActivity && !activity.seriesId) {
        if (
          (recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly') &&
          selectedDays.length === 0
        ) {
          Alert.alert('Fejl', 'Vælg venligst mindst én dag for gentagelse');
          return;
        }

        await createActivity({
          title: editTitle,
          location: editLocation,
          categoryId: editCategory?.id || activity.category.id,
          date: editDate,
          time: effectiveTime,
          endTime: endTimePayload,
          intensity: intensityPayload,
          intensityEnabled: editIntensityEnabled,
          isRecurring: true,
          recurrenceType,
          recurrenceDays:
            recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly'
              ? selectedDays
              : undefined,
          endDate: hasEndDate ? endDate : undefined,
        });

        await deleteActivitySingle(activity.id);
        await refreshData();

        Alert.alert('Succes', 'Aktiviteten er blevet konverteret til en gentagende serie');
        setIsEditing(false);
        setEditScope('single');
        router.replace('/(tabs)/(home)');
        return;
      }

      if (activity.isExternal) {
        await updateActivitySingle(activity.id, {
          categoryId: editCategory?.id,
          ...(shouldApplyIntensityByCategory
            ? {}
            : {
                intensityEnabled: editIntensityEnabled,
                intensity: intensityPayload,
              }),
        });
        if (shouldApplyIntensityByCategory && resolvedCategoryId) {
          await updateIntensityByCategory(resolvedCategoryId, editIntensityEnabled);
        }

        applyActivityUpdates({
          category: editCategory || activity.category,
          intensityEnabled: editIntensityEnabled,
          intensity: intensityPayload,
        });

        await refreshData();

        Alert.alert('Gemt', 'Aktiviteten er blevet opdateret');
        setIsEditing(false);
        setEditScope('single');
        setExternalIntensityApplyScope('single');
        return;
      }

      if (activity.seriesId && editScope === 'series') {
        await updateActivitySeries(activity.seriesId, {
          title: editTitle,
          location: editLocation,
          categoryId: editCategory?.id,
          time: effectiveTime,
          endTime: endTimePayload,
        });

        if (shouldApplyIntensityByCategory && resolvedCategoryId) {
          await updateIntensityByCategory(resolvedCategoryId, editIntensityEnabled);
        } else if (intensityChanged) {
          await updateActivitySingle(activity.id, {
            intensityEnabled: editIntensityEnabled,
            intensity: intensityPayload,
          });
        }

        applyActivityUpdates({
          title: editTitle,
          location: editLocation,
          category: editCategory || activity.category,
          time: effectiveTime,
          endTime: endTimePayload,
          intensityEnabled: editIntensityEnabled,
          intensity: intensityPayload,
        });

        Alert.alert('Gemt', 'Hele serien er blevet opdateret');
        setIsEditing(false);
        setEditScope('single');
        setExternalIntensityApplyScope('single');
        await refreshData();
        return;
      }

      await updateActivitySingle(activity.id, {
        title: editTitle,
        location: editLocation,
        categoryId: editCategory?.id,
        date: editDate,
        time: effectiveTime,
        endTime: endTimePayload,
        ...(shouldApplyIntensityByCategory
          ? {}
          : {
              intensityEnabled: editIntensityEnabled,
              intensity: intensityPayload,
            }),
      });
      if (shouldApplyIntensityByCategory && resolvedCategoryId) {
        await updateIntensityByCategory(resolvedCategoryId, editIntensityEnabled);
      }

      applyActivityUpdates({
        title: editTitle,
        location: editLocation,
        category: editCategory || activity.category,
        date: editDate,
        time: effectiveTime,
        endTime: endTimePayload,
        intensityEnabled: editIntensityEnabled,
        intensity: intensityPayload,
      });

      Alert.alert('Gemt', 'Aktiviteten er blevet opdateret');
      setIsEditing(false);
      setEditScope('single');
      setExternalIntensityApplyScope('single');
      await refreshData();
    } catch (error) {
      console.error('Error saving activity:', error);
      Alert.alert('Fejl', 'Der opstod en fejl ved gemning');
    } finally {
      setIsSaving(false);
    }
  }, [
    activity,
    applyActivityUpdates,
    convertToRecurring,
    createActivity,
    deleteActivitySingle,
    editCategory,
    editDate,
    editEndTime,
    editIntensity,
    editIntensityEnabled,
    externalIntensityApplyScope,
    activityIntensityEnabled,
    activityIntensityValue,
    editLocation,
    editScope,
    editTime,
    editTitle,
    endDate,
    hasEndDate,
    isInternalActivity,
    recurrenceType,
    refreshData,
    router,
    selectedDays,
    updateActivitySeries,
    updateIntensityByCategory,
    updateActivitySingle,
  ]);

  const handleDateChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (event.type === 'dismissed') {
      return;
    }
    if (selectedDate) {
      setEditDate(selectedDate);
    }
  }, []);

  const handleTimeChange = useCallback((event: DateTimePickerEvent, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    if (event.type === 'dismissed') {
      return;
    }
    if (selectedTime) {
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      setEditTime(`${hours}:${minutes}`);
    }
  }, []);

  const handleEndTimeChange = useCallback((event: DateTimePickerEvent, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndTimePicker(false);
    }
    if (event.type === 'dismissed') {
      return;
    }
    if (selectedTime) {
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      setEditEndTime(`${hours}:${minutes}`);
    }
  }, []);

  const handleEndDateChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndDatePicker(false);
    }
    if (event.type === 'dismissed') {
      return;
    }
    if (selectedDate) {
      setEndDate(selectedDate);
    }
  }, []);

  const toggleDay = useCallback((day: number) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }, []);

  const openTemplateFeedbackModal = useCallback(
    (task: FeedbackTask, templateId: string) => {
      openCanonicalFeedbackModal(task, templateId);
    },
    [openCanonicalFeedbackModal],
  );

  const handleTaskRowPress = useCallback(
    (task: FeedbackTask) => {
      const templateId = resolveFeedbackTemplateId(task);
      const hasFeedbackTemplateId = !!normalizeId(task.feedbackTemplateId ?? (task as any)?.feedback_template_id);
      const hasLocalFeedbackMarker =
        typeof task.description === 'string' && task.description.includes(FEEDBACK_PARENT_MARKER);
      const isFeedbackTaskLocal =
        task.isFeedbackTask === true ||
        isFeedbackTitle(task.title) ||
        isFeedbackTask(task) ||
        hasLocalFeedbackMarker ||
        (!!templateId && hasFeedbackTemplateId);

      if (isFeedbackTaskLocal && templateId) {
        openTemplateFeedbackModal(task, templateId);
        return;
      }

      setSelectedNormalTask(task);
      setIsNormalTaskModalVisible(true);
    },
    [openTemplateFeedbackModal, resolveFeedbackTemplateId],
  );

  const handleNormalTaskModalClose = useCallback(() => {
    if (isNormalTaskCompleting) return;
    setIsNormalTaskModalVisible(false);
    setSelectedNormalTask(null);
    setPendingNormalTaskId(null);
  }, [isNormalTaskCompleting]);

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      if (!activity) return;

      Alert.alert(
        'Slet opgave',
        'Er du sikker på at du vil slette denne opgave? Dette sletter kun opgaven fra denne aktivitet, ikke opgaveskabelonen.',
        [
          { text: 'Annuller', style: 'cancel' },
          { text: 'Slet', style: 'destructive', onPress: () => setPendingAction({ type: 'delete-task', taskId }) },
        ],
      );
    },
    [activity],
  );

  const handleEditTask = useCallback((task: FeedbackTask) => {
    Alert.alert(
      'Redigering af opgave',
      'Denne opgave kan redigeres lokalt på aktiviteten uden at ændre opgaveskabelonen.',
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Fortsæt',
          onPress: () => {
            setEditingActivityTask(task);
            setShowCreateTaskModal(true);
          },
        },
      ],
    );
  }, []);

  const refreshActivityTasks = useCallback(async () => {
    try {
      const refreshedActivity = await fetchActivityFromDatabase(activity.id);
      if (refreshedActivity?.tasks) {
        setTasksState((refreshedActivity.tasks as FeedbackTask[]) || []);
      }
    } catch (error) {
      console.error('Error refreshing tasks after creation:', error);
    }
    Promise.resolve(refreshData()).catch(() => {});
  }, [activity.id, refreshData]);

  useEffect(() => {
    const pendingTaskId = pendingFeedbackTaskId ?? pendingNormalTaskId;
    if (!pendingTaskId) {
      setDeepLinkTaskLookupState('idle');
      deepLinkTaskLookupAttemptedRef.current = null;
      return;
    }

    const hasTask = tasksState.some((task) => String(task.id) === String(pendingTaskId));
    if (hasTask) {
      setDeepLinkTaskLookupState('idle');
      deepLinkTaskLookupAttemptedRef.current = null;
      return;
    }

    if (deepLinkTaskLookupAttemptedRef.current === pendingTaskId) {
      setDeepLinkTaskLookupState('error');
      return;
    }

    deepLinkTaskLookupAttemptedRef.current = pendingTaskId;
    setDeepLinkTaskLookupState('loading');

    let cancelled = false;
    (async () => {
      try {
        const refreshedActivity = await fetchActivityFromDatabase(activity.id);
        if (cancelled) return;

        const refreshedTasks = ((refreshedActivity?.tasks as FeedbackTask[]) ?? []).filter(Boolean);
        setTasksState(refreshedTasks);

        const foundAfterRefresh = refreshedTasks.some((task) => String(task.id) === String(pendingTaskId));
        setDeepLinkTaskLookupState(foundAfterRefresh ? 'idle' : 'error');
      } catch (error) {
        if (!cancelled) {
          console.error('[ActivityDetails] Deep-link task refresh failed:', error);
          setDeepLinkTaskLookupState('error');
        }
      } finally {
        Promise.resolve(refreshData()).catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activity.id, pendingFeedbackTaskId, pendingNormalTaskId, refreshData, tasksState]);

  const handleAddTask = useCallback(() => {
    Alert.alert('Tilføj opgave', 'Vælg hvordan du vil oprette opgaven.', [
      { text: 'Annuller', style: 'cancel' },
      {
        text: 'Opret manuelt',
        onPress: () => {
          setEditingActivityTask(null);
          setShowCreateTaskModal(true);
        },
      },
      {
        text: 'Opret fra skabelon',
        onPress: () => {
          setTemplateTaskSearch('');
          setShowTemplateTaskModal(true);
        },
      },
    ]);
  }, []);

  const handleTaskCreated = useCallback(async () => {
    setShowCreateTaskModal(false);
    setEditingActivityTask(null);
    await refreshActivityTasks();
  }, [refreshActivityTasks]);

  const handleTaskUpdated = useCallback(async () => {
    setShowCreateTaskModal(false);
    setEditingActivityTask(null);
    await refreshActivityTasks();
  }, [refreshActivityTasks]);

  const handleTaskModalClose = useCallback(() => {
    setShowCreateTaskModal(false);
    setEditingActivityTask(null);
  }, []);

  const filteredTemplateTasks = useMemo(() => {
    const query = templateTaskSearch.trim().toLowerCase();
    const allTemplates = Array.isArray(taskTemplates) ? taskTemplates : [];
    const activeTemplates = allTemplates.filter((task) => !task?.archivedAt);
    const sortedTemplates = [...activeTemplates].sort((a, b) =>
      String(a?.title ?? '').localeCompare(String(b?.title ?? ''), 'da-DK', { sensitivity: 'base' })
    );

    if (!query.length) return sortedTemplates;

    return sortedTemplates.filter((task) => {
      const title = String(task?.title ?? '').toLowerCase();
      const description = String(task?.description ?? '').toLowerCase();
      return title.includes(query) || description.includes(query);
    });
  }, [taskTemplates, templateTaskSearch]);

  const handleTemplateTaskModalClose = useCallback(() => {
    if (isTemplateTaskSaving) return;
    setShowTemplateTaskModal(false);
    setTemplateTaskSearch('');
  }, [isTemplateTaskSaving]);

  const handleCreateTaskFromTemplate = useCallback(
    async (template: Task) => {
      if (isTemplateTaskSaving) return;
      if (!currentUserId) {
        Alert.alert('Fejl', 'Bruger ikke autentificeret.');
        return;
      }

      setIsTemplateTaskSaving(true);
      try {
        const clampMinutes = (value: unknown): number => {
          const parsed = Number(value);
          if (!Number.isFinite(parsed)) return 0;
          const rounded = Math.round(parsed);
          if (rounded < 0) return 0;
          if (rounded > 600) return 600;
          return rounded;
        };
        const reminderValue =
          typeof template.reminder === 'number' && Number.isFinite(template.reminder)
            ? clampMinutes(template.reminder)
            : null;
        const afterTrainingEnabled = template.afterTrainingEnabled === true;
        const taskDurationEnabled =
          template.taskDurationEnabled === true || template.task_duration_enabled === true;

        const { data: localTemplateData, error: localTemplateError } = await supabase
          .from('task_templates')
          .insert({
            user_id: currentUserId,
            title: String(template.title ?? '').trim() || 'Opgave',
            description: String(template.description ?? ''),
            reminder_minutes: reminderValue,
            after_training_enabled: afterTrainingEnabled,
            after_training_delay_minutes: afterTrainingEnabled
              ? clampMinutes(template.afterTrainingDelayMinutes ?? 0)
              : null,
            after_training_feedback_enable_score:
              template.afterTrainingFeedbackEnableScore !== false,
            after_training_feedback_score_explanation:
              template.afterTrainingFeedbackScoreExplanation ?? null,
            after_training_feedback_enable_note:
              template.afterTrainingFeedbackEnableNote !== false,
            after_training_feedback_enable_intensity: true,
            task_duration_enabled: taskDurationEnabled,
            task_duration_minutes: taskDurationEnabled
              ? clampMinutes(template.taskDurationMinutes ?? template.task_duration_minutes ?? 0)
              : null,
            source_folder: 'activity_local_task',
          })
          .select('id')
          .single();

        if (localTemplateError || !localTemplateData?.id) {
          throw new Error(localTemplateError?.message || 'Kunne ikke oprette lokal skabelon.');
        }

        const payload = {
          activity_id: activity.id,
          title: String(template.title ?? '').trim() || 'Opgave',
          description: String(template.description ?? ''),
          completed: false,
          reminder_minutes: reminderValue,
          task_template_id: String(localTemplateData.id),
          after_training_enabled: afterTrainingEnabled,
          after_training_delay_minutes:
            afterTrainingEnabled
              ? clampMinutes(template.afterTrainingDelayMinutes ?? 0)
              : null,
          task_duration_enabled: taskDurationEnabled,
          task_duration_minutes:
            taskDurationEnabled
              ? clampMinutes(template.taskDurationMinutes ?? template.task_duration_minutes ?? 0)
              : null,
        };

        const { error } = await supabase.from('activity_tasks').insert(payload);
        if (error) {
          if (error.code === '23505') {
            Alert.alert('Findes allerede', 'Denne opgave er allerede tilføjet til aktiviteten.');
            return;
          }
          throw error;
        }

        setShowTemplateTaskModal(false);
        setTemplateTaskSearch('');
        await refreshActivityTasks();
      } catch (error: any) {
        Alert.alert('Fejl', error?.message || 'Kunne ikke oprette opgave fra skabelon.');
      } finally {
        setIsTemplateTaskSaving(false);
      }
    },
    [activity.id, currentUserId, isTemplateTaskSaving, refreshActivityTasks],
  );

  const formatTemplateTaskMeta = useCallback((template: Task): string => {
    const parts: string[] = [];
    if (typeof template?.reminder === 'number' && Number.isFinite(template.reminder)) {
      parts.push(`Påmindelse: ${Math.max(0, Math.round(template.reminder))} min`);
    }

    if (template?.afterTrainingEnabled === true) {
      parts.push('Feedback: Ja');
    }

    const durationEnabled =
      template?.taskDurationEnabled === true || template?.task_duration_enabled === true;
    const rawDuration = template?.taskDurationMinutes ?? template?.task_duration_minutes;
    if (durationEnabled && typeof rawDuration === 'number' && Number.isFinite(rawDuration)) {
      parts.push(`Varighed: ${Math.max(0, Math.round(rawDuration))} min`);
    }

    return parts.join(' · ');
  }, []);

  const previousFeedbackEntries = useMemo<PreviousFeedbackEntry[]>(() => {
    const seen = new Set<string>();
    const entries: PreviousFeedbackEntry[] = [];

    for (const t of tasksState) {
      const templateId = resolveFeedbackTemplateId(t);
      if (!templateId || seen.has(templateId)) continue;
      seen.add(templateId);

      const prev = selfFeedbackByTemplate[templateId]?.previous;
      if (!prev) continue;

      entries.push({
        templateId,
        taskTitle: t.title,
        feedback: prev,
      });
    }

    return entries;
  }, [resolveFeedbackTemplateId, selfFeedbackByTemplate, tasksState]);

  const taskListItems = useMemo<TaskListItem[]>(() => {
    const items: TaskListItem[] = [];
    if (showIntensityTaskRow) {
      items.push({ __type: 'intensity', key: `intensity-${String(activity.id)}` });
    }
    items.push(...(tasksState || []));
    return items;
  }, [activity.id, showIntensityTaskRow, tasksState]);

  const taskKeyExtractor = useCallback((item: TaskListItem, index: number) => {
    if ('__type' in item) return item.key;
    const task = item as any;
    const rawId = task?.id ?? task?.task_id;
    const trimmedId =
      typeof rawId === 'number' || typeof rawId === 'string'
        ? String(rawId).trim()
        : '';
    if (trimmedId) return `task-${trimmedId}`;
    const templateRaw =
      task?.taskTemplateId ??
      task?.task_template_id ??
      task?.feedbackTemplateId ??
      task?.feedback_template_id ??
      getMarkerTemplateId(task) ??
      '';
    const templateId =
      typeof templateRaw === 'number' || typeof templateRaw === 'string'
        ? String(templateRaw).trim()
        : '';
    const titleKey = normalizeTitle(task?.title ?? '') || 'untitled';
    const taskType = isFeedbackTask(task) ? 'feedback' : 'task';
    return `task-${String(activity.id)}:${templateId || 'no-template'}:${taskType}:${titleKey}:${index}`;
  }, [activity.id]);

  // --- Missing render helpers (fix for refactor) ---
  const renderCategorySelector = useCallback(() => {
    const selected = editCategory ?? activity.category;

    if (!isEditing) {
      return (
        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, { color: textSecondaryColor }]}>Kategori</Text>
          <View
            style={[
              styles.categoryChip,
              {
                backgroundColor: fieldBackgroundColor,
                borderWidth: 1,
                borderColor: fieldBorderColor,
              },
            ]}
          >
            {selected?.emoji ? <Text style={styles.categoryEmoji}>{selected.emoji}</Text> : null}
            <Text style={[styles.categoryName, { color: textColor }]}>{selected?.name ?? 'Ukendt'}</Text>
            <View style={{ flex: 1 }} />
            <View
              style={[
                styles.categoryIndicator,
                { backgroundColor: selected?.color ? String(selected.color) : colors.primary },
              ]}
            />
          </View>
        </View>
      );
    }

    const data = Array.isArray(categories) ? categories : [];
    const selectedId = editCategory?.id ?? null;

    return (
      <View style={styles.fieldContainer}>
        <Text style={[styles.fieldLabel, { color: textSecondaryColor }]}>Kategori</Text>
        {data.length ? (
          <FlatList
            horizontal
            data={data}
            keyExtractor={(c, index) =>
              c?.id ? String(c.id) : c?.name ? `${String(c.name)}-${index}` : String(index)
            }
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.categoryScroll}
            renderItem={({ item, index }) => {
              const isSelected = selectedId === item.id;
              return (
                <TouchableOpacity
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: fieldBackgroundColor,
                      borderColor: isSelected ? colors.primary : fieldBorderColor,
                      borderWidth: isSelected ? 2 : 1,
                    },
                  ]}
                  onPress={() => setEditCategory(item)}
                  activeOpacity={0.8}
                  testID={`activity.details.edit.categoryChip.${index}`}
                >
                  {item.emoji ? <Text style={styles.categoryEmoji}>{item.emoji}</Text> : null}
                  <Text style={[styles.categoryName, { color: textColor }]}>{item.name}</Text>
                </TouchableOpacity>
              );
            }}
          />
        ) : (
          <Text style={{ color: textSecondaryColor, marginTop: 8 }}>Ingen kategorier</Text>
        )}
      </View>
    );
  }, [
    activity.category,
    categories,
    editCategory,
    fieldBackgroundColor,
    fieldBorderColor,
    isEditing,
    setEditCategory,
    textColor,
    textSecondaryColor,
  ]);

  const renderIntensitySection = useCallback(() => {
    if (!isEditing) return null;

    return (
      <View style={[styles.section, { backgroundColor: cardBgColor }]}>
        <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Intensitet</Text>

        <View style={[styles.intensityToggleRow, { backgroundColor: fieldBackgroundColor, paddingHorizontal: 16 }]}>
          <View style={styles.intensityToggleLabel}>
            <IconSymbol
              ios_icon_name="flame"
              android_material_icon_name="local_fire_department"
              size={18}
              color={colors.primary}
            />
            <Text style={[styles.switchLabel, { color: textColor }]}>Aktivér intensitet</Text>
          </View>
          <Switch
            value={editIntensityEnabled}
            onValueChange={handleIntensityToggle}
            trackColor={{ true: colors.primary, false: isDark ? '#3a3a3c' : '#d1d5db' }}
            thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
            testID="activity.details.edit.intensityToggle"
          />
        </View>
      </View>
    );
  }, [
    cardBgColor,
    editIntensityEnabled,
    fieldBackgroundColor,
    handleIntensityToggle,
    isDark,
    isEditing,
    sectionTitleColor,
    textColor,
  ]);

  const renderTaskItem = useCallback(
    ({ item }: { item: TaskListItem }) => {
      if ('__type' in item) {
        return (
          <TouchableOpacity
            style={[styles.taskRow, styles.taskCard, { backgroundColor: isDark ? '#111318' : '#ffffff' }]}
            onPress={(event) => {
              event.stopPropagation();
              handleIntensityRowPress();
            }}
            activeOpacity={0.7}
            testID="activity.details.intensityTaskButton"
          >
            <View style={styles.taskLeftSlot}>
              <View
                style={[
                  styles.taskCheckbox,
                  intensityTaskCompleted && { backgroundColor: colors.success, borderColor: colors.success },
                ]}
              >
                {intensityTaskCompleted && (
                  <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color="#fff" />
                )}
              </View>
            </View>

            <View style={styles.taskBody}>
              <View style={styles.taskTitleRow}>
                <Text style={[styles.taskTitle, { color: textColor }]}>Intensitet</Text>
                {intensityTaskCompleted && (
                  <Text style={[styles.intensityTaskValue, { color: textSecondaryColor }]}>{`${currentActivityIntensity}/10`}</Text>
                )}
              </View>
              {!intensityTaskCompleted && (
                <Text style={[styles.intensityTaskHelper, { color: textSecondaryColor }]}>Tryk for at angive intensitet</Text>
              )}
            </View>

            <View style={styles.taskRightActions}>
              <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron_right" size={20} color={textSecondaryColor} />
            </View>
          </TouchableOpacity>
        );
      }

      const task = item;

      const templateId = resolveFeedbackTemplateId(task);
      const config = getFeedbackConfigForTemplate(templateId);
      const taskInstanceId = normalizeId(task.id ?? (task as any)?.task_id);
      const instanceFeedback = taskInstanceId ? selfFeedbackByTaskId[taskInstanceId] : undefined;
      const hasDuplicateTemplate = templateId ? (feedbackTemplateCounts[templateId] ?? 0) > 1 : false;
      const feedback =
        instanceFeedback ??
        (!hasDuplicateTemplate && templateId ? selfFeedbackByTemplate[templateId]?.current : undefined);

      const feedbackTemplateId = normalizeId(task.feedbackTemplateId ?? (task as any)?.feedback_template_id);
      const hasFeedbackTemplateId = !!feedbackTemplateId;
      const hasLocalFeedbackMarker =
        typeof task.description === 'string' && task.description.includes(FEEDBACK_PARENT_MARKER);
      const isFeedbackTaskLocal =
        task.isFeedbackTask === true ||
        isFeedbackTitle(task.title) ||
        isFeedbackTask(task) ||
        hasLocalFeedbackMarker ||
        (!!templateId && hasFeedbackTemplateId);
      const canManageTask = !isFeedbackTaskLocal;

      const isFeedbackCompleted = isFeedbackTaskLocal ? isFeedbackAnswered(feedback, config) : false;

      const scoreExplanation = isFeedbackTaskLocal && config.enableScore !== false ? (config.scoreExplanation ?? null) : null;

      const summary = isFeedbackTaskLocal ? buildFeedbackSummary(feedback, config) : null;

      let helperText = 'Tryk for at åbne';
      if (isFeedbackTaskLocal) {
        if (isFeedbackCompleted) {
          const parts = [summary].filter(Boolean) as string[];
          helperText = parts.length ? parts.join(' – ') : 'Feedback udfyldt';
        } else {
          if (config.enableScore !== false) {
            helperText = 'Tryk for at give feedback';
          } else if (config.enableNote !== false) {
            helperText = 'Tryk for at skrive note';
          } else {
            helperText = 'Tryk for at give feedback';
          }
        }
      }

      return (
        <TouchableOpacity
          style={[styles.taskRow, styles.taskCard, { backgroundColor: isDark ? '#111318' : '#ffffff' }]}
          onPress={() => handleTaskRowPress(task)}
          activeOpacity={0.7}
          testID={
            isFeedbackTaskLocal
              ? (isFeedbackCompleted ? 'activity.details.feedbackTaskButton.completed' : 'activity.details.feedbackTaskButton.incomplete')
              : (task.completed ? 'activity.details.taskButton.completed' : 'activity.details.taskButton.incomplete')
          }
        >
          <View testID={`activity.taskRow.${String(taskInstanceId ?? task.id ?? 'unknown')}`} />
          <View testID={`activity.details.task.loaded.${String(taskInstanceId ?? task.id ?? 'unknown')}`} />
          <View style={styles.taskLeftSlot}>
            <View
              style={[
                styles.taskCheckbox,
                task.completed && !isFeedbackTaskLocal && { backgroundColor: colors.success, borderColor: colors.success },
                isFeedbackTaskLocal && styles.feedbackTaskCheckbox,
                isFeedbackCompleted && { backgroundColor: colors.success, borderColor: colors.success },
              ]}
            >
              {!isFeedbackTaskLocal && task.completed && (
                <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color="#fff" />
              )}
              {isFeedbackTaskLocal &&
                (isFeedbackCompleted ? (
                  <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color="#fff" />
                ) : (
                  <IconSymbol ios_icon_name="bubble.left" android_material_icon_name="chat" size={16} color={colors.primary} />
                ))}
            </View>
          </View>

          <View style={styles.taskBody}>
            <Text
              style={[
                styles.taskTitle,
                { color: textColor },
                task.completed && !isFeedbackTaskLocal && styles.taskCompleted,
              ]}
            >
              {task.title}
            </Text>

            {isFeedbackTaskLocal && (
              <>
                {scoreExplanation ? (
                  <Text style={[styles.feedbackExplanationText, { color: textSecondaryColor }]}>{scoreExplanation}</Text>
                ) : null}
                <Text style={[styles.feedbackHelperText, { color: textSecondaryColor }]}>{helperText}</Text>
              </>
            )}
          </View>

          <View style={styles.taskRightActions}>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron_right" size={20} color={textSecondaryColor} />
            {canManageTask && (
              <>
                <TouchableOpacity
                  style={[styles.taskDeleteButton, { backgroundColor: isDark ? '#e8f1ff' : '#eaf2ff' }]}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    handleEditTask(task);
                  }}
                  activeOpacity={0.7}
                  testID={`activity.details.task.edit.${String(task.id)}`}
                >
                  <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.taskDeleteButton, { backgroundColor: isDark ? '#3a1a1a' : '#ffe5e5' }]}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    handleDeleteTask(String(task.id));
                  }}
                  activeOpacity={0.7}
                  disabled={deletingTaskId === String(task.id)}
                  testID={`activity.details.task.delete.${String(task.id)}`}
                >
                  {deletingTaskId === String(task.id) ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={22} color={colors.error} />
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [
      currentActivityIntensity,
      deletingTaskId,
      getFeedbackConfigForTemplate,
      handleDeleteTask,
      handleEditTask,
      handleIntensityRowPress,
      handleTaskRowPress,
      isDark,
      intensityTaskCompleted,
      resolveFeedbackTemplateId,
      feedbackTemplateCounts,
      selfFeedbackByTaskId,
      selfFeedbackByTemplate,
      textColor,
      textSecondaryColor,
    ],
  );

  const renderListHeader = useCallback(() => {
    const needsDaySelection = recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly';

    const editingContent = (
      <View>
        {activity.isExternal && (
          <View
            style={[
              styles.infoBox,
              {
                backgroundColor: infoBackgroundColor,
                marginHorizontal: 16,
                marginBottom: 16,
              },
            ]}
          >
            <Text style={{ color: infoTextColor, fontWeight: '700' }}>Ekstern aktivitet</Text>
            <Text style={{ color: textSecondaryColor, marginTop: 6 }}>
              Du kan ændre kategori og intensitet for eksterne aktiviteter.
            </Text>
          </View>
        )}

        <View style={[styles.section, { backgroundColor: cardBgColor }]}>
          <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Grundoplysninger</Text>

          {isInternalActivity && (
            <>
              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: textSecondaryColor }]}>Titel</Text>
                <TextInput
                  value={editTitle}
                  onChangeText={setEditTitle}
                  placeholder="Angiv titel"
                  placeholderTextColor={textSecondaryColor}
                  style={[
                    styles.input,
                    {
                      backgroundColor: fieldBackgroundColor,
                      color: textColor,
                      borderWidth: 1,
                      borderColor: fieldBorderColor,
                    },
                  ]}
                  testID="activity.details.edit.titleInput"
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: textSecondaryColor }]}>Lokation</Text>
                <TextInput
                  value={editLocation}
                  onChangeText={setEditLocation}
                  placeholder="Angiv lokation"
                  placeholderTextColor={textSecondaryColor}
                  style={[
                    styles.input,
                    {
                      backgroundColor: fieldBackgroundColor,
                      color: textColor,
                      borderWidth: 1,
                      borderColor: fieldBorderColor,
                    },
                  ]}
                  testID="activity.details.edit.locationInput"
                />
              </View>
            </>
          )}

          {renderCategorySelector()}
        </View>

        {isInternalActivity && (
          <>
            <View style={[styles.section, { backgroundColor: cardBgColor }]}>
              <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Dato & tid</Text>

              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: textSecondaryColor }]}>Dato</Text>
                <TouchableOpacity
                  style={[
                    styles.dateTimeButton,
                    {
                      backgroundColor: fieldBackgroundColor,
                      borderWidth: 1,
                      borderColor: fieldBorderColor,
                    },
                  ]}
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dateTimeText, { color: textColor }]}>{formatDate(editDate)}</Text>
                  <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand_more" size={18} color={textSecondaryColor} />
                </TouchableOpacity>
                {renderPicker({
                  visible: showDatePicker,
                  mode: 'date',
                  value: editDate,
                  onChange: handleDateChange,
                  onClose: () => setShowDatePicker(false),
                })}
              </View>

              <View style={{ marginTop: 12 }}>
                <View>
                  <Text style={[styles.fieldLabel, { color: textSecondaryColor }]}>Starttid</Text>
                  <TouchableOpacity
                    style={[
                      styles.dateTimeButton,
                      {
                        backgroundColor: fieldBackgroundColor,
                        borderWidth: 1,
                        borderColor: fieldBorderColor,
                      },
                    ]}
                    onPress={() => setShowTimePicker(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateTimeText, { color: textColor }]}>{formatTimeDisplay(editTime)}</Text>
                    <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand_more" size={18} color={textSecondaryColor} />
                  </TouchableOpacity>
                  {renderPicker({
                    visible: showTimePicker,
                    mode: 'time',
                    value: startTimeDate,
                    onChange: handleTimeChange,
                    onClose: () => setShowTimePicker(false),
                  })}
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={[styles.fieldLabel, { color: textSecondaryColor }]}>Sluttid</Text>
                  <TouchableOpacity
                    style={[
                      styles.dateTimeButton,
                      {
                        backgroundColor: fieldBackgroundColor,
                        borderWidth: 1,
                        borderColor: fieldBorderColor,
                      },
                    ]}
                    onPress={() => setShowEndTimePicker(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateTimeText, { color: textColor }]}>{editEndTime ? formatTimeDisplay(editEndTime) : 'Tilføj sluttid'}</Text>
                    <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand_more" size={18} color={textSecondaryColor} />
                  </TouchableOpacity>
                  {renderPicker({
                    visible: showEndTimePicker,
                    mode: 'time',
                    value: endTimeDate,
                    onChange: handleEndTimeChange,
                    onClose: () => setShowEndTimePicker(false),
                  })}
                </View>
              </View>
            </View>

            {renderIntensitySection()}

            {!activity.seriesId && (
              <View style={[styles.section, { backgroundColor: cardBgColor }]}>
                <Text style={[styles.sectionTitle, { color: sectionTitleColor }]}>Gentagelse</Text>
                <View style={[styles.recurringToggle, { backgroundColor: fieldBackgroundColor, paddingHorizontal: 16 }]}>
                  <View style={styles.recurringToggleLeft}>
                    <IconSymbol ios_icon_name="repeat" android_material_icon_name="repeat" size={18} color={colors.primary} />
                    <Text style={[styles.recurringToggleText, { color: textColor }]}>Gentag aktivitet</Text>
                  </View>
                  <Switch
                    value={convertToRecurring}
                    onValueChange={setConvertToRecurring}
                    trackColor={{ true: colors.primary, false: isDark ? '#3a3a3c' : '#d1d5db' }}
                    thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                  />
                </View>

                {convertToRecurring && (
                  <>
                    <Text style={[styles.fieldLabel, { color: textSecondaryColor, marginTop: 12 }]}>Frekvens</Text>
                    <View style={styles.recurrenceOptions}>
                      {RECURRENCE_OPTIONS.map((option) => {
                        const selected = recurrenceType === option.value;
                        return (
                          <TouchableOpacity
                            key={option.value}
                            style={[
                              styles.recurrenceOption,
                              {
                                backgroundColor: selected ? colors.primary : fieldBackgroundColor,
                                borderWidth: 1,
                                borderColor: selected ? colors.primary : fieldBorderColor,
                              },
                            ]}
                            onPress={() => setRecurrenceType(option.value)}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.recurrenceOptionText, { color: selected ? '#fff' : textColor }]}>{option.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {needsDaySelection && (
                      <>
                        <Text style={[styles.fieldLabel, { color: textSecondaryColor }]}>Dage</Text>
                        <View style={styles.daysContainer}>
                          {DAYS_OF_WEEK.map((day) => {
                            const selected = selectedDays.includes(day.value);
                            return (
                              <TouchableOpacity
                                key={String(day.value)}
                                style={[
                                  styles.dayButton,
                                  {
                                    backgroundColor: selected ? colors.primary : fieldBackgroundColor,
                                    borderWidth: 1,
                                    borderColor: selected ? colors.primary : fieldBorderColor,
                                  },
                                ]}
                                onPress={() => toggleDay(day.value)}
                                activeOpacity={0.8}
                              >
                                <Text style={[styles.dayButtonText, { color: selected ? '#fff' : textColor }]}>{day.label}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </>
                    )}

                    <View style={[styles.recurringToggle, { backgroundColor: fieldBackgroundColor, marginTop: 12, paddingHorizontal: 16 }]}>
                      <View style={styles.recurringToggleLeft}>
                        <IconSymbol ios_icon_name="calendar" android_material_icon_name="event" size={18} color={colors.primary} />
                        <Text style={[styles.recurringToggleText, { color: textColor }]}>Slutdato</Text>
                      </View>
                      <Switch
                        value={hasEndDate}
                        onValueChange={(value) => {
                          setHasEndDate(value);
                          if (!value) {
                            setShowEndDatePicker(false);
                          }
                        }}
                        trackColor={{ true: colors.primary, false: isDark ? '#3a3a3c' : '#d1d5db' }}
                        thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                      />
                    </View>

                    {hasEndDate && (
                      <View style={{ marginTop: 12 }}>
                        <TouchableOpacity
                          style={[
                            styles.dateTimeButton,
                            {
                              backgroundColor: fieldBackgroundColor,
                              borderWidth: 1,
                              borderColor: fieldBorderColor,
                            },
                          ]}
                          onPress={() => setShowEndDatePicker(true)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.dateTimeText, { color: textColor }]}>{formatDate(endDate)}</Text>
                          <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand_more" size={18} color={textSecondaryColor} />
                        </TouchableOpacity>
                        {renderPicker({
                          visible: showEndDatePicker,
                          mode: 'date',
                          value: endDate,
                          onChange: handleEndDateChange,
                          onClose: () => setShowEndDatePicker(false),
                        })}
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </>
        )}

        {!isInternalActivity ? renderIntensitySection() : null}
      </View>
    );

    const detailsContent = (
      <View>
        <Text style={styles.v2SectionTitle}>Detaljer</Text>

        <View style={styles.v2CardWrap}>
          <DetailsCard
            label="Dato & Tidspunkt"
            value={`${formatDateTime(activity.date, activity.time)}${activity.endTime ? ` - ${activity.endTime.substring(0, 5)}` : ''}`}
            backgroundColor={isDark ? '#ffffff0f' : '#ffffff'}
            textColor={textColor}
            secondaryTextColor={textSecondaryColor}
            fullWidth
            icon={{ ios: 'calendar', android: 'calendar_today' }}
            iconColor={colors.primary}
          />
        </View>

        <View style={styles.v2DetailsRowWrap}>
          <View style={styles.v2DetailBleedLeft}>
            <DetailsCard
              flex={1}
              label="Lokation"
              value={activity.location?.trim() ? activity.location : 'Ikke angivet'}
              backgroundColor={isDark ? '#ffffff0f' : '#ffffff'}
              textColor={textColor}
              secondaryTextColor={textSecondaryColor}
              icon={{ ios: 'mappin.and.ellipse', android: 'place' }}
              iconColor={primaryColor}
            />
          </View>

          <View style={{ width: 12 }} />

          <View style={styles.v2DetailBleedRight}>
            <DetailsCard
              flex={1}
              label="Kategori"
              value={activity.category?.name ?? 'Ukendt'}
              backgroundColor={isDark ? '#ffffff0f' : '#ffffff'}
              textColor={textColor}
              secondaryTextColor={textSecondaryColor}
              leadingEmoji={activity.category?.emoji}
            />
          </View>
        </View>

        {!isEditing && shouldShowActivityIntensityField ? (
          <View style={[styles.v2CardWrap, { marginTop: 12 }]}>
            <DetailsCard
              label="Intensitet"
              value={currentActivityIntensity !== null ? `${currentActivityIntensity}/10` : 'Ikke angivet'}
              backgroundColor={isDark ? '#ffffff0f' : '#ffffff'}
              textColor={textColor}
              secondaryTextColor={textSecondaryColor}
              fullWidth
              icon={{ ios: 'flame', android: 'local_fire_department' }}
              iconColor={colors.primary}
            />
          </View>
        ) : null}

        {!isEditing ? (
          <View style={[styles.v2CardWrap, { marginTop: 12 }]} testID="activity.details.latestFeedback.section">
            <View
              style={[
                styles.latestFeedbackCard,
                { backgroundColor: isDark ? '#ffffff0f' : '#ffffff' },
              ]}
            >
              <View style={styles.latestFeedbackHeaderRow}>
                <Text style={[styles.latestFeedbackTitle, { color: textColor }]}>Seneste feedback</Text>
                <TouchableOpacity
                  onPress={() => setIsLatestFeedbackExpanded((prev) => !prev)}
                  activeOpacity={0.7}
                  style={styles.latestFeedbackToggleButton}
                  testID="activity.details.latestFeedback.toggle"
                >
                  <IconSymbol
                    ios_icon_name={isLatestFeedbackExpanded ? 'chevron.up' : 'chevron.down'}
                    android_material_icon_name={isLatestFeedbackExpanded ? 'expand_less' : 'expand_more'}
                    size={18}
                    color={textSecondaryColor}
                  />
                </TouchableOpacity>
              </View>

              {!isLatestFeedbackExpanded ? null : isLatestCategoryFeedbackLoading ? (
                <View testID="activity.details.latestFeedback.loading">
                  {[1, 2, 3].map((item) => (
                    <View key={`latest-feedback-loading-${item}`} style={styles.latestFeedbackLoadingRow}>
                      <View
                        style={[
                          styles.latestFeedbackLoadingDate,
                          { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0' },
                        ]}
                      />
                      <View
                        style={[
                          styles.latestFeedbackLoadingNote,
                          { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0' },
                        ]}
                      />
                    </View>
                  ))}
                </View>
              ) : latestCategoryFeedback.length === 0 ? (
                <Text
                  style={[styles.latestFeedbackEmpty, { color: textSecondaryColor }]}
                  testID="activity.details.latestFeedback.empty"
                >
                  Ingen feedback endnu i denne kategori.
                </Text>
              ) : (
                <FlatList
                  data={latestCategoryFeedback}
                  scrollEnabled={false}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.latestFeedbackList}
                  renderItem={({ item }) => {
                    const hasScore = typeof item.rating === 'number';
                    const note = String(item.note ?? '').trim();
                    const hasNote = note.length > 0;
                    const dateLabel = formatShortDate(item.createdAt);

                    return (
                      <View style={styles.latestFeedbackRow} testID={`activity.details.latestFeedback.item.${item.id}`}>
                        <Text
                          style={[styles.latestFeedbackFocusPoint, { color: textColor }]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {item.focusPointTitle}
                        </Text>
                        <View style={styles.latestFeedbackRowTop}>
                          <Text style={[styles.latestFeedbackDate, { color: textSecondaryColor }]}>
                            {dateLabel || '-'}
                          </Text>
                          {hasScore ? (
                            <View style={[styles.latestFeedbackScoreChip, { backgroundColor: infoBackgroundColor }]}>
                              <Text style={[styles.latestFeedbackScoreChipText, { color: textColor }]}>
                                Score {item.rating}/10
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        {hasNote ? (
                          <Text
                            style={[styles.latestFeedbackNote, { color: textColor }]}
                            numberOfLines={3}
                            ellipsizeMode="tail"
                          >
                            {note}
                          </Text>
                        ) : null}
                      </View>
                    );
                  }}
                />
              )}
            </View>
          </View>
        ) : null}
      </View>
    );

    return (
      <View>
        {isEditing ? editingContent : detailsContent}

        <View style={styles.v2TasksHeaderRow}>
          <Text style={[styles.v2SectionTitle, styles.v2SectionTitleInRow]}>Opgaver</Text>
            {!activity.isExternal && !isEditing && (
              <TouchableOpacity
                style={[styles.addTaskHeaderButton, { backgroundColor: primaryColor }]}
                onPress={handleAddTask}
                activeOpacity={0.7}
                testID="activity.addTaskButton"
              >
              <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={20} color="#fff" />
              <Text style={styles.addTaskHeaderButtonText}>Tilføj opgave</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }, [
    activity,
    cardBgColor,
    primaryColor,
    convertToRecurring,
    editDate,
    editEndTime,
    editLocation,
    editTime,
    editTitle,
    endDate,
    fieldBackgroundColor,
    fieldBorderColor,
    handleAddTask,
    handleDateChange,
    handleEndDateChange,
    handleEndTimeChange,
    handleTimeChange,
    hasEndDate,
    infoBackgroundColor,
    infoTextColor,
    isDark,
    isEditing,
    isInternalActivity,
    recurrenceType,
    renderCategorySelector,
    renderIntensitySection,
    renderPicker,
    sectionTitleColor,
    selectedDays,
    showDatePicker,
    showEndDatePicker,
    showEndTimePicker,
    showTimePicker,
    startTimeDate,
    endTimeDate,
    latestCategoryFeedback,
    isLatestCategoryFeedbackLoading,
    isLatestFeedbackExpanded,
    textColor,
    textSecondaryColor,
    toggleDay,
    shouldShowActivityIntensityField,
    currentActivityIntensity,
  ]);

  const listHeaderComponent = useMemo(() => renderListHeader(), [renderListHeader]);

  const handleDeleteClick = useCallback(() => {
    if (activity?.isExternal) {
      Alert.alert(
        'Slet ekstern aktivitet',
        `Er du sikker på at du vil slette "${activity.title}"?\n\nDenne aktivitet er fra en ekstern kalender. Hvis du sletter den her, vil den blive importeret igen ved næste synkronisering, medmindre du sletter den i den eksterne kalender eller fjerner kalenderen fra din profil.`,
        [
          { text: 'Annuller', style: 'cancel' },
          { text: 'Slet', style: 'destructive', onPress: () => setPendingAction({ type: 'delete-external' }) },
        ],
      );
      return;
    }

    if (activity?.seriesId) {
      Alert.alert('Slet aktivitet', 'Vil du slette kun denne aktivitet eller hele serien?', [
        { text: 'Annuller', style: 'cancel' },
        { text: 'Slet kun denne', style: 'destructive', onPress: () => setPendingAction({ type: 'delete-single' }) },
        { text: 'Slet hele serien', style: 'destructive', onPress: () => setPendingAction({ type: 'delete-series' }) },
      ]);
      return;
    }

    Alert.alert('Slet aktivitet', `Er du sikker på at du vil slette "${activity?.title ?? ''}"?`, [
      { text: 'Annuller', style: 'cancel' },
      { text: 'Slet', style: 'destructive', onPress: () => setPendingAction({ type: 'delete-single' }) },
    ]);
  }, [activity]);

  useEffect(() => {
    if (!pendingAction) return;

    let cancelled = false;

    (async () => {
      const action = pendingAction;
      const currentActivity = activity;
      if (!currentActivity) {
        if (!cancelled) setPendingAction(null);
        return;
      }

      try {
        switch (action.type) {
          case 'duplicate': {
            if (currentActivity.isExternal) break;
            if (!cancelled) setIsDuplicating(true);
            try {
              await duplicateActivity(currentActivity.id);
              if (!cancelled) {
                Alert.alert('Succes', 'Aktiviteten er blevet duplikeret');
                router.replace('/(tabs)/(home)');
              }
            } catch (error: any) {
              console.error('Error duplicating activity:', error);
              if (!cancelled) {
                Alert.alert('Fejl', error?.message || 'Kunne ikke duplikere aktiviteten');
              }
            } finally {
              if (!cancelled) setIsDuplicating(false);
            }
            break;
          }
          case 'delete-task': {
            if (!cancelled) setDeletingTaskId(action.taskId);
            try {
              const existingTasks = tasksState;
              const deletedTask = existingTasks.find((task) => String(task.id) === String(action.taskId));
              const deletedTaskTemplateId = deletedTask
                ? normalizeId(deletedTask?.taskTemplateId ?? (deletedTask as any)?.task_template_id)
                : null;
              const deletedFeedbackTemplateId = deletedTask
                ? normalizeId(deletedTask?.feedbackTemplateId ?? (deletedTask as any)?.feedback_template_id)
                : null;
              const deletedIsManualOneOff = !!deletedTask && !deletedTaskTemplateId && !deletedFeedbackTemplateId;
              const deletedIsFeedback = deletedTask ? isFeedbackTask(deletedTask) : false;
              const rawParentTemplateId = deletedTaskTemplateId;
              const allowFeedbackCleanup = !deletedIsFeedback && !!rawParentTemplateId;
              const parentTemplateId = allowFeedbackCleanup ? rawParentTemplateId : null;
              const normalizedDeletedTitle = allowFeedbackCleanup ? normalizeTitle(deletedTask?.title ?? '') : '';

              const feedbackTaskIds = allowFeedbackCleanup
                ? existingTasks
                    .filter((task) => {
                      if (String(task.id) === String(action.taskId)) return false;
                      if (!isFeedbackTask(task)) return false;

                      const feedbackTemplateId = normalizeId(
                        task.feedbackTemplateId ?? (task as any)?.feedback_template_id,
                      );
                      if (parentTemplateId && feedbackTemplateId && feedbackTemplateId === parentTemplateId) {
                        return true;
                      }

                      const markerTemplateId = getMarkerTemplateId(task);
                      if (parentTemplateId && markerTemplateId === parentTemplateId) {
                        return true;
                      }

                      if (normalizedDeletedTitle && isFeedbackTitle(task.title)) {
                        const linkedTitle = normalizeTitle(stripLeadingFeedbackPrefix(task.title ?? ''));
                        if (linkedTitle && linkedTitle === normalizedDeletedTitle) {
                          return true;
                        }
                      }

                      return false;
                    })
                    .map((task) => String(task.id))
                : [];

              await deleteActivityTask(currentActivity.id, action.taskId);
              if (!cancelled) {
                if (feedbackTaskIds.length) {
                  try {
                    const table = currentActivity.isExternal ? 'external_event_tasks' : 'activity_tasks';
                    const { error } = await supabase.from(table).delete().in('id', feedbackTaskIds);
                    if (error) throw error;
                  } catch (error) {
                    if (__DEV__) {
                      console.log('[ActivityDetails] failed to delete feedback tasks', {
                        feedbackTaskIds,
                        error,
                      });
                    }
                  }
                }

                const removedIds = new Set([String(action.taskId), ...feedbackTaskIds]);
                setTasksState((prev) => prev.filter((task) => !removedIds.has(String(task.id))));
                refreshData();
                Alert.alert('Slettet', 'Opgaven er blevet slettet fra denne aktivitet');
              }
            } catch (error: any) {
              console.error('Error deleting task:', error);
              if (!cancelled) {
                Alert.alert('Fejl', `Kunne ikke slette opgaven: ${error?.message || 'Ukendt fejl'}`);
              }
            } finally {
              if (!cancelled) setDeletingTaskId(null);
            }
            break;
          }
          case 'delete-external': {
            if (!cancelled) setIsDeleting(true);
            try {
              const result = await deleteSingleExternalActivity(currentActivity.id);
              if (!result.success) {
                throw new Error(result.error || 'Kunne ikke slette aktiviteten');
              }
              if (!cancelled) {
                Promise.resolve(refreshData()).catch(() => {});
                router.replace('/(tabs)/(home)');
                setTimeout(() => {
                  Alert.alert('Slettet', 'Den eksterne aktivitet er blevet slettet fra din app');
                }, 300);
              }
            } catch (error: any) {
              console.error('Error deleting external activity:', error);
              if (!cancelled) {
                Alert.alert('Fejl', `Kunne ikke slette aktiviteten: ${error?.message || 'Ukendt fejl'}`);
              }
            } finally {
              if (!cancelled) setIsDeleting(false);
            }
            break;
          }
          case 'delete-single': {
            if (!cancelled) setIsDeleting(true);
            try {
              await deleteActivitySingle(currentActivity.id);
              if (!cancelled) {
                router.replace('/(tabs)/(home)');
                setTimeout(() => {
                  Alert.alert('Slettet', 'Aktiviteten er blevet slettet');
                }, 300);
              }
            } catch (error: any) {
              console.error('Error deleting activity:', error);
              if (!cancelled) {
                Alert.alert('Fejl', `Kunne ikke slette aktiviteten: ${error?.message || 'Ukendt fejl'}`);
              }
            } finally {
              if (!cancelled) setIsDeleting(false);
            }
            break;
          }
          case 'delete-series': {
            if (!currentActivity.seriesId) break;
            if (!cancelled) setIsDeleting(true);
            try {
              await deleteActivitySeries(currentActivity.seriesId);
              if (!cancelled) {
                router.replace('/(tabs)/(home)');
                setTimeout(() => {
                  Alert.alert('Slettet', 'Hele serien er blevet slettet');
                }, 300);
              }
            } catch (error: any) {
              console.error('Error deleting series:', error);
              if (!cancelled) {
                Alert.alert('Fejl', `Kunne ikke slette serien: ${error?.message || 'Ukendt fejl'}`);
              }
            } finally {
              if (!cancelled) setIsDeleting(false);
            }
            break;
          }
          default:
            break;
        }
      } finally {
        if (!cancelled) setPendingAction(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activity,
    deleteActivitySeries,
    deleteActivitySingle,
    deleteActivityTask,
    duplicateActivity,
    pendingAction,
    refreshData,
    router,
    tasksState,
  ]);

  const handleBackPress = useCallback(() => {
    if (isEditing) {
      Alert.alert('Afslut redigering', 'Du er i gang med at redigere. Vil du afslutte uden at gemme?', [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Afslut',
          style: 'destructive',
          onPress: () => {
            setIsEditing(false);
            safeDismiss();
          },
        },
      ]);
      return;
    }

    safeDismiss();
  }, [isEditing, safeDismiss]);

  const pendingDeepLinkTaskId = pendingFeedbackTaskId ?? pendingNormalTaskId;
  const isDeepLinkTaskLookupLoading =
    Boolean(pendingDeepLinkTaskId) && deepLinkTaskLookupState === 'loading';
  const isDeepLinkTaskLookupError =
    Boolean(pendingDeepLinkTaskId) && deepLinkTaskLookupState === 'error';

  if (isDeepLinkTaskLookupLoading) {
    return (
      <View style={[styles.container, { backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: textColor, marginTop: 12, fontSize: 16, fontWeight: '600' }}>Henter opgave...</Text>
        <Text style={{ color: textSecondaryColor, marginTop: 6, textAlign: 'center' }}>
          Vi opdaterer aktiviteten for at åbne den valgte opgave.
        </Text>
        <View testID="activity.details.taskLookup.loading" />
      </View>
    );
  }

  if (isDeepLinkTaskLookupError) {
    return (
      <View style={[styles.container, { backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <Text style={{ color: textColor, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Kunne ikke åbne opgaven</Text>
        <Text style={{ color: textSecondaryColor, textAlign: 'center', marginBottom: 14 }}>
          Opgaven blev ikke fundet. Prøv igen fra Hjem eller notifikationen.
        </Text>
        <TouchableOpacity
          style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 10 }}
          onPress={handleBackPress}
          activeOpacity={0.7}
          testID="activity.details.taskLookup.backButton"
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Tilbage</Text>
        </TouchableOpacity>
        <View testID="activity.details.taskLookup.error" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: bgColor }]}>
      <LinearGradient colors={headerGradientColors} style={[styles.header, styles.v2Topbar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerChevronWrap} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.headerChevronButton}
            hitSlop={HEADER_ACTION_HITSLOP}
            onPress={handleBackPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Luk aktivitet"
          >
            <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand_more" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.headerContent}>
          <Text style={styles.headerEmoji}>{activity.category.emoji}</Text>
          <Text style={styles.headerTitle} numberOfLines={2}>
            {activity.title}
          </Text>
          {activity.seriesId && (
            <View style={styles.seriesBadge}>
              <IconSymbol ios_icon_name="repeat" android_material_icon_name="repeat" size={16} color="#fff" />
              <Text style={styles.seriesBadgeText}>Serie</Text>
            </View>
          )}
        </View>

        <View style={styles.headerButtons}>
          {isEditing ? (
            <TouchableOpacity style={styles.headerButton} hitSlop={HEADER_ACTION_HITSLOP} onPress={handleSave} activeOpacity={0.7} disabled={isSaving} testID="activity.details.saveEditButton">
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={26} color="#fff" />
              )}
            </TouchableOpacity>
          ) : (
            <>
              {!activity.isExternal && (
                <TouchableOpacity
                  style={styles.headerButton}
                  hitSlop={HEADER_ACTION_HITSLOP}
                  onPress={handleDuplicate}
                  activeOpacity={0.7}
                  disabled={isDuplicating}
                  testID="activity.details.duplicateButton"
                >
                  {isDuplicating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <IconSymbol ios_icon_name="doc.on.doc" android_material_icon_name="content_copy" size={24} color="#fff" />
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.headerButton, !activity.isExternal ? styles.headerButtonGap : null]}
                hitSlop={HEADER_ACTION_HITSLOP}
                onPress={handleEditClick}
                activeOpacity={0.7}
                testID="activity.details.editButton"
              >
                <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={24} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.headerButton, styles.headerButtonGap]} hitSlop={HEADER_ACTION_HITSLOP} onPress={handleDeleteClick} activeOpacity={0.7} testID="activity.details.deleteButton">
                <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={24} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </LinearGradient>

      <View style={styles.v2Sheet}>
        <View pointerEvents="none" style={[styles.v2SheetFill, { backgroundColor: cardBgColor }]} />
        <View pointerEvents="none" style={styles.v2WaveOverlay}>
          <SheetWaveTop color={cardBgColor} />
        </View>

        <FlatList
          ref={listRef}
          data={taskListItems}
          keyExtractor={taskKeyExtractor}
          renderItem={renderTaskItem}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom: 32 + (!isEditing ? V2_CTA_HEIGHT + 24 : 0) + (insets.bottom ? insets.bottom : 0),
            },
          ]}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          ListHeaderComponent={listHeaderComponent}
        />
      </View>

      {selectedNormalTask && (
        <TaskDetailsModal
          visible={isNormalTaskModalVisible}
          title={String(selectedNormalTask.title ?? 'Opgave')}
          categoryColor={activity.category?.color ?? colors.primary}
          isDark={isDark}
          description={selectedNormalTask.description}
          reminderMinutes={selectedNormalTask.reminder_minutes ?? selectedNormalTask.reminder ?? null}
          videoUrl={normalTaskVideoUrl}
          completed={!!selectedNormalTask.completed}
          isSaving={isNormalTaskCompleting}
          onClose={handleNormalTaskModalClose}
          onComplete={handleNormalTaskComplete}
        />
      )}

      <Modal
        visible={externalIntensityModal.visible}
        transparent
        animationType="fade"
        onRequestClose={handleExternalIntensityCancel}
      >
        <View style={styles.intensityScopeModalBackdrop}>
          <View
            style={[styles.intensityScopeModalCard, { backgroundColor: cardBgColor }]}
            testID="activity.details.intensityScopeModal"
          >
            <Text style={[styles.intensityScopeModalTitle, { color: textColor }]}>
              {externalIntensityModal.nextEnabled
                ? 'Vil du tilføje intensitet til alle aktiviteter med samme kategori?'
                : 'Vil du fjerne intensitet fra alle aktiviteter med samme kategori?'}
            </Text>

            <TouchableOpacity
              style={[styles.intensityScopeModalButton, { backgroundColor: colors.primary }]}
              onPress={handleExternalIntensityApplyAll}
              activeOpacity={0.85}
              testID="activity.details.intensityScopeModal.all"
            >
              <Text style={styles.intensityScopeModalPrimaryText}>
                {externalIntensityModal.nextEnabled ? 'Ja, tilføj til alle' : 'Ja, fjern fra alle'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.intensityScopeModalButton, styles.intensityScopeModalSecondaryButton, { borderColor: fieldBorderColor }]}
              onPress={handleExternalIntensityApplySingle}
              activeOpacity={0.85}
              testID="activity.details.intensityScopeModal.single"
            >
              <Text style={[styles.intensityScopeModalSecondaryText, { color: textColor }]}>Nej, kun denne</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.intensityScopeModalCancelButton}
              onPress={handleExternalIntensityCancel}
              activeOpacity={0.85}
              testID="activity.details.intensityScopeModal.cancel"
            >
              <Text style={[styles.intensityScopeModalCancelText, { color: textSecondaryColor }]}>Annuller</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showTemplateTaskModal}
        transparent
        animationType="fade"
        onRequestClose={handleTemplateTaskModalClose}
      >
        <View style={styles.intensityScopeModalBackdrop}>
          <View style={[styles.templateTaskModalCard, { backgroundColor: cardBgColor }]}>
            <Text style={[styles.templateTaskModalTitle, { color: textColor }]}>Vælg opgaveskabelon</Text>
            <Text style={[styles.templateTaskModalSubtitle, { color: textSecondaryColor }]}>
              Opretter én opgave på denne aktivitet.
            </Text>

            <TextInput
              style={[
                styles.templateTaskSearchInput,
                { backgroundColor: fieldBackgroundColor, borderColor: fieldBorderColor, color: textColor },
              ]}
              value={templateTaskSearch}
              onChangeText={setTemplateTaskSearch}
              placeholder="Søg i opgaver..."
              placeholderTextColor={textSecondaryColor}
              editable={!isTemplateTaskSaving}
            />

            {filteredTemplateTasks.length === 0 ? (
              <Text style={[styles.templateTaskEmptyText, { color: textSecondaryColor }]}>
                Ingen opgaver fundet.
              </Text>
            ) : (
              <FlatList
                data={filteredTemplateTasks}
                keyExtractor={(item) => String(item.id)}
                style={styles.templateTaskList}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const meta = formatTemplateTaskMeta(item);
                  return (
                    <TouchableOpacity
                      style={[styles.templateTaskRow, { borderColor: fieldBorderColor }]}
                      onPress={() => handleCreateTaskFromTemplate(item)}
                      activeOpacity={0.75}
                      disabled={isTemplateTaskSaving}
                    >
                      <Text style={[styles.templateTaskRowTitle, { color: textColor }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {!!meta && (
                        <Text style={[styles.templateTaskRowMeta, { color: textSecondaryColor }]} numberOfLines={1}>
                          {meta}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <TouchableOpacity
              style={styles.intensityScopeModalCancelButton}
              onPress={handleTemplateTaskModalClose}
              activeOpacity={0.85}
              disabled={isTemplateTaskSaving}
            >
              <Text style={[styles.intensityScopeModalCancelText, { color: textSecondaryColor }]}>
                {isTemplateTaskSaving ? 'Opretter...' : 'Luk'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {showCreateTaskModal && (
        <CreateActivityTaskModal
          visible={showCreateTaskModal}
          onClose={handleTaskModalClose}
          onTaskCreated={handleTaskCreated}
          onTaskUpdated={handleTaskUpdated}
          editingTask={
            editingActivityTask
              ? {
                  ...editingActivityTask,
                  id: String(editingActivityTask.id),
                  reminder_minutes:
                    editingActivityTask.reminder_minutes ?? editingActivityTask.reminder ?? null,
                  after_training_enabled: editingActivityTask.afterTrainingEnabled === true,
                  after_training_delay_minutes:
                    typeof editingActivityTask.afterTrainingDelayMinutes === 'number'
                      ? editingActivityTask.afterTrainingDelayMinutes
                      : (editingActivityTask as any).after_training_delay_minutes ?? null,
                  task_duration_enabled:
                    editingActivityTask.taskDurationEnabled === true ||
                    (editingActivityTask as any).task_duration_enabled === true,
                  task_duration_minutes:
                    typeof editingActivityTask.taskDurationMinutes === 'number'
                      ? editingActivityTask.taskDurationMinutes
                      : (editingActivityTask as any).task_duration_minutes ?? null,
                }
              : undefined
          }
          activityId={activity.id}
          activityTitle={activity.title}
          activityDate={activity.date}
          activityTime={activity.time}
        />
      )}

    </KeyboardAvoidingView>
  );
}

export default function ActivityDetailsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const params = useLocalSearchParams<{
    id?: string | string[];
    activityId?: string | string[];
    activity_id?: string | string[];
    openFeedbackTaskId?: string | string[];
    openTaskId?: string | string[];
    openIntensity?: string | string[];
  }>();

  const { categories } = useFootball();
  const { userRole } = useUserRole();
  const isAdmin = userRole === 'admin' || userRole === 'trainer';

  const normalizeParam = useCallback((value?: string | string[] | null) => {
    const first = Array.isArray(value) ? value[0] : value;
    if (first === undefined || first === null) return null;
    let decoded = String(first);
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      decoded = String(first);
    }
    const trimmed = decoded.trim();
    const lowered = trimmed.toLowerCase();
    if (!trimmed.length || lowered === 'undefined' || lowered === 'null') return null;
    return trimmed;
  }, []);

  const activityId = normalizeParam(params.id ?? params.activityId ?? params.activity_id);
  const initialFeedbackTaskId = normalizeParam(params.openFeedbackTaskId);
  const initialOpenTaskId = normalizeParam(params.openTaskId);
  const openIntensityParam = normalizeParam(params.openIntensity);
  const initialOpenIntensity = openIntensityParam === '1' || openIntensityParam === 'true';

  const [activity, setActivity] = useState<Activity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    if (!activityId) {
      setActivity(null);
      setFetchError('missing-id');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const result = await fetchActivityFromDatabase(activityId);
      if (!result) {
        setActivity(null);
        setFetchError('not-found');
      } else {
        setActivity(result);
        setFetchError(null);
      }
    } catch (error) {
      console.error('[ActivityDetails] Failed to load activity:', error);
      setFetchError('fetch-failed');
    } finally {
      setIsLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    (async () => {
      await loadActivity();
    })();
  }, [loadActivity]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/(home)');
    }
  }, [router]);

  const handleActivityUpdated = useCallback((updated: Activity) => {
    setActivity(updated);
  }, []);

  const renderErrorView = (normalizedId: string | null) => (
    <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Kunne ikke åbne aktiviteten</Text>
      {__DEV__ && (
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 12, textAlign: 'center' }}>
          id: {JSON.stringify(normalizedId)}
          {'\n'}
          params: {JSON.stringify(params)}
        </Text>
      )}
      <TouchableOpacity
        style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 10 }}
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)/(home)');
          }
        }}
        activeOpacity={0.7}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Tilbage</Text>
      </TouchableOpacity>
    </View>
  );

  if (!activityId) {
    return renderErrorView(activityId);
  }

  if (isLoading) {
    return <ActivityDetailsSkeleton isDark={isDark} />;
  }

  if (fetchError || !activity) {
    return renderErrorView(activityId);
  }

  return (
    <ActivityDetailsContent
      activity={activity}
      categories={categories}
      isAdmin={isAdmin}
      isDark={isDark}
      onBack={handleBack}
      onActivityUpdated={handleActivityUpdated}
      initialFeedbackTaskId={initialFeedbackTaskId}
      initialOpenTaskId={initialOpenTaskId}
      initialOpenIntensity={initialOpenIntensity}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.highlight,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
  },
  headerEmoji: {
    fontSize: 32,
    lineHeight: 34,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 34,
  },
  seriesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  seriesBadgeText: {
    fontSize: 12,
    color: '#fff',
    marginLeft: 4,
  },
  headerButtons: {
    flexDirection: 'row',
    position: 'absolute',
    right: 16,
    top: 16,
    alignItems: 'center',
    zIndex: 3,
    elevation: 3,
  },
  headerButton: {
    width: HEADER_ACTION_BUTTON_SIZE,
    height: HEADER_ACTION_BUTTON_SIZE,
    borderRadius: HEADER_ACTION_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 0,
  },
  headerButtonGap: {
    marginLeft: HEADER_ACTION_BUTTON_GAP,
  },
  v2Topbar: {
    backgroundColor: 'transparent',
    paddingBottom: 64,
  },
  v2Sheet: {
    flex: 1,
    marginTop: -V2_WAVE_HEIGHT,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: V2_WAVE_HEIGHT,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  v2SheetFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: V2_WAVE_HEIGHT - 2,
  },
  v2WaveOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },

  v2SectionTitle: {
    marginHorizontal: 16,
    marginBottom: 12,
    fontSize: 22,
    fontWeight: '800',
    color: 'rgba(15, 23, 42, 0.40)',
  },
  v2TasksHeaderRow: {
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  v2SectionTitleInRow: {
    marginHorizontal: 0,
    marginBottom: 0,
  },

  v2CardWrap: {
    marginHorizontal: 16,
  },
  v2DetailsRowWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: 'row',
  },

  v2DetailBleedLeft: {
    flex: 1,
    marginLeft: -16,
    paddingLeft: 16,
  },
  v2DetailBleedRight: {
    flex: 1,
    marginRight: -16,
    paddingRight: 16,
  },

  v2DetailCard: {
    borderRadius: 16,
    padding: 16,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
  },
  v2DetailCardFullWidth: {
    width: '100%',
  },
  v2DetailCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  v2DetailIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    marginRight: 12,
  },
  v2DetailEmoji: {
    fontSize: 20,
    lineHeight: 22,
  },
  v2DetailCardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  v2DetailCardValue: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  latestFeedbackCard: {
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
  },
  latestFeedbackHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  latestFeedbackTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  latestFeedbackToggleButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  latestFeedbackList: {
    paddingBottom: 2,
  },
  latestFeedbackRow: {
    borderRadius: 12,
    padding: 10,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    marginBottom: 10,
  },
  latestFeedbackRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  latestFeedbackDate: {
    fontSize: 13,
    fontWeight: '600',
  },
  latestFeedbackFocusPoint: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  latestFeedbackScoreChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  latestFeedbackScoreChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  latestFeedbackNote: {
    fontSize: 14,
    lineHeight: 19,
  },
  latestFeedbackEmpty: {
    fontSize: 14,
    lineHeight: 20,
  },
  latestFeedbackLoadingRow: {
    borderRadius: 12,
    padding: 10,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    marginBottom: 8,
  },
  latestFeedbackLoadingDate: {
    width: 88,
    height: 14,
    borderRadius: 7,
    marginBottom: 8,
  },
  latestFeedbackLoadingNote: {
    width: '100%',
    height: 14,
    borderRadius: 7,
  },
  v2StickyCtaWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    paddingTop: 12,
  },
  v2StickyCtaButton: {
    height: V2_CTA_HEIGHT,
    borderRadius: V2_CTA_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  section: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 12,
  },
  dateTimeText: {
    fontSize: 16,
  },
  pickerContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  iosPicker: {
    width: '100%',
  },
  pickerDoneButton: {
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  pickerDoneText: {
    fontSize: 16,
    fontWeight: '500',
  },
  categoryScroll: {
    paddingVertical: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  categoryEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '500',
  },
  categoryIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  intensityToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  intensityToggleLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  switchLabel: {
    fontSize: 16,
    marginLeft: 8,
  },
  intensityHint: {
    fontSize: 14,
    marginTop: 4,
  },
  intensityPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    flexWrap: 'wrap',
  },
  intensityPickerChip: {
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  intensityPickerText: {
    fontSize: 16,
  },
  intensityPickerTextSelected: {
    color: '#fff',
    fontWeight: '500',
  },
  intensitySelectionText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
  },

  recurringToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 12,
  },
  recurringToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recurringToggleText: {
    fontSize: 16,
    marginLeft: 8,
  },

  recurrenceOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  recurrenceOption: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  recurrenceOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },

  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  dayButton: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  dayButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },

  infoBox: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },

  addTaskHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  addTaskHeaderButtonText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 8,
  },

  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskLeftSlot: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskBody: {
    flex: 1,
  },
  taskRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  taskCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackTaskCheckbox: {
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  taskDeleteButton: {
    marginLeft: 8,
    padding: 8,
    borderRadius: 10,
  },
  taskCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  intensityTaskValue: {
    fontSize: 14,
    marginLeft: 8,
  },
  intensityTaskHelper: {
    fontSize: 14,
  },
  feedbackExplanationText: {
    marginTop: 6,
    fontSize: 13,
  },
  feedbackHelperText: {
    fontSize: 13,
    marginTop: 4,
  },
  taskCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  intensityScopeModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  intensityScopeModalCard: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
  },
  intensityScopeModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 14,
  },
  intensityScopeModalButton: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  intensityScopeModalPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  intensityScopeModalSecondaryButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  intensityScopeModalSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
  },
  intensityScopeModalCancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 10,
  },
  intensityScopeModalCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  templateTaskModalCard: {
    width: '100%',
    maxHeight: '78%',
    borderRadius: 16,
    padding: 16,
  },
  templateTaskModalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  templateTaskModalSubtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '500',
  },
  templateTaskSearchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 10,
  },
  templateTaskList: {
    flexGrow: 0,
  },
  templateTaskRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  templateTaskRowTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  templateTaskRowMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
  },
  templateTaskEmptyText: {
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 12,
  },
  headerChevronWrap: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
    elevation: 2,
  },
  headerChevronButton: {
    width: HEADER_ACTION_BUTTON_SIZE,
    height: HEADER_ACTION_BUTTON_SIZE,
    borderRadius: HEADER_ACTION_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
