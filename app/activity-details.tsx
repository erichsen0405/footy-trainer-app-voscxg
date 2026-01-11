import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  useColorScheme,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SmartVideoPlayer from '@/components/SmartVideoPlayer';

import { useFootball } from '@/contexts/FootballContext';

// ✅ Robust import: avoid runtime crash if named export "colors" changes
import * as CommonStyles from '@/styles/commonStyles';

import { IconSymbol } from '@/components/IconSymbol';
import { Activity, ActivityCategory, Task, TaskTemplateSelfFeedback } from '@/types';
import EditSeriesDialog from '@/components/EditSeriesDialog';
import DeleteActivityDialog from '@/components/DeleteActivityDialog';
import { useUserRole } from '@/hooks/useUserRole';
import { CreateActivityTaskModal } from '@/components/CreateActivityTaskModal';
import { deleteSingleExternalActivity } from '@/utils/deleteExternalActivities';
import { TaskDescriptionRenderer } from '@/components/TaskDescriptionRenderer';
import { supabase } from '@/app/integrations/supabase/client';
import { TaskScoreNoteModal, TaskScoreNoteModalPayload } from '@/components/TaskScoreNoteModal';
import { fetchSelfFeedbackForTemplates, upsertSelfFeedback } from '@/services/feedbackService';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import { resolveActivityIntensityEnabled } from '@/utils/activityIntensity';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
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

const V2_WAVE_HEIGHT = 44; // Updated wave height
const V2_CTA_HEIGHT = 56;

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
      <Svg width="100%" height="100%" viewBox="0 0 1440 120" preserveAspectRatio="none">
        {/* one smooth dip; area above curve stays transparent */}
        <Path fill={color} d="M0,52 Q720,92 1440,52 L1440,120 L0,120 Z" />
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
  flex?: number; // Added flex prop
  icon?: { ios: string; android: string };
  iconColor?: string;
  leadingEmoji?: string; // ✅ category icon via emoji
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
  taskTemplateId?: string | null;
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

const getTaskVideoUrl = (task: any): string | null => {
  if (!task) return null;
  const camel = typeof task.videoUrl === 'string' ? task.videoUrl.trim() : '';
  if (camel) return camel;
  const snake = typeof task.video_url === 'string' ? task.video_url.trim() : '';
  return snake || null;
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
    task_template_id,
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
    task_template_id
  )
`;

const EXTERNAL_META_SELECT_WITH_VIDEO = `
  id,
  external_event_id,
  category_id,
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
    title,
    description,
    completed,
    reminder_minutes,
    video_url
  )
`;

const EXTERNAL_META_SELECT_NO_VIDEO = `
  id,
  external_event_id,
  category_id,
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
    title,
    description,
    completed,
    reminder_minutes
  )
`;

function isMissingColumn(err: any, colName: string): boolean {
  const needle = String(colName ?? '').toLowerCase();
  if (!needle) return false;
  const hay = [
    err?.message,
    err?.details,
    err?.hint,
    err?.code,
  ]
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
  optionalColumnName: string; // e.g. 'video_url'
  context: string; // for dev logs
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

// Helper function to fetch activity directly from database
async function fetchActivityFromDatabase(activityId: string): Promise<Activity | null> {
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
        emoji: internalActivityAny.activity_categories?.emoji || '❓',
      };

      const tasks: FeedbackTask[] = (internalActivityAny.activity_tasks ?? []).map((task: any) => {
        const markerTemplateId = parseTemplateIdFromMarker(task.description || '');
        const isFeedbackTask = !task.task_template_id && !!markerTemplateId;
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
          subtasks: [],
          videoUrl: resolvedVideo ?? undefined,
          video_url: resolvedVideo,
          taskTemplateId: task.task_template_id,
          feedbackTemplateId: markerTemplateId,
          isFeedbackTask,
        };
        return mapped as FeedbackTask;
      });

      return {
        id: internalActivityAny.id,
        title: internalActivityAny.title,
        date: new Date(internalActivityAny.activity_date),
        time: internalActivityAny.activity_time,
        endTime: internalActivityAny.activity_end_time ?? undefined,
        location: internalActivityAny.location || '',
        category,
        tasks,
        isExternal: false,
        externalCalendarId: internalActivityAny.external_calendar_id ?? undefined,
        externalEventId: internalActivityAny.external_event_id ?? undefined,
        seriesId: internalActivityAny.series_id ?? undefined,
        seriesInstanceDate: internalActivityAny.series_instance_date
          ? new Date(internalActivityAny.series_instance_date)
          : undefined,
        intensity: typeof internalActivityAny.intensity === 'number' ? internalActivityAny.intensity : null,
        intensityEnabled: Boolean(internalActivityAny.intensity_enabled),
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
            emoji: '❓',
          },
        tasks: (localMetaAny.external_event_tasks || []).map((task: any) => {
          const markerTemplateId = parseTemplateIdFromMarker(task.description || '');
          const isFeedbackTask = !task.task_template_id && !!markerTemplateId;
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
            subtasks: [],
            videoUrl: resolvedVideo ?? undefined,
            video_url: resolvedVideo,
            taskTemplateId: task.task_template_id,
            feedbackTemplateId: markerTemplateId,
            isFeedbackTask,
          };
          return mapped as FeedbackTask;
        }),
        isExternal: true,
        externalCalendarId: externalEvent.provider_calendar_id,
        externalEventId: localMetaAny.external_event_id,
        intensity: null,
        intensityEnabled: false,
      };
    }

    // --- Extra fallback: events_external direct (prevents hard failure on iOS deep links) ---
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
          emoji: '❓',
        },
        tasks: [],
        isExternal: true,
        externalCalendarId: externalOnlyAny.provider_calendar_id ?? undefined,
        externalEventId: String(externalOnlyAny.id),
        intensity: null,
        intensityEnabled: false,
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
    console.error('❌ Error fetching activity from database:', error);
    return null;
  }
}

// Skeleton component for first paint
function ActivityDetailsSkeleton({ isDark }: { isDark: boolean }) {
  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const skeletonColor = isDark ? '#3a3a3a' : '#e0e0e0';
  const waveFillColor = isDark ? 'rgba(42,42,42,0.92)' : 'rgba(255,255,255,0.92)'; // ✅ subtle bleed-through
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Header Skeleton */}
      <LinearGradient
        colors={[skeletonColor, skeletonColor] as [string, string]}
        style={[styles.header, styles.v2Topbar, { paddingTop: insets.top + 8 }]}
      >
        <View style={[styles.backButtonHeader, { top: insets.top + 8 }]}>
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

      {/* ✅ sheet must be transparent; fill + wave provide the white background */}
      <View style={styles.v2Sheet}>
        <View pointerEvents="none" style={[styles.v2SheetFill, { backgroundColor: cardBgColor }]} />
        <View pointerEvents="none" style={styles.v2WaveOverlay}>
          <SheetWaveTop color={cardBgColor} />
        </View>

        <View style={{ paddingTop: 12, paddingBottom: 32 + V2_CTA_HEIGHT + 24 + insets.bottom }}>
          {/* Details cards skeleton */}
          <View style={[styles.section, { backgroundColor: 'transparent', marginBottom: 8 }]}>
            <View style={{ width: 100, height: 20, backgroundColor: skeletonColor, borderRadius: 10, marginBottom: 14 }} />
            <View style={{ width: '100%', height: 64, backgroundColor: skeletonColor, borderRadius: 16, marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', marginBottom: 12 }}>
              <View style={{ flex: 1, height: 64, backgroundColor: skeletonColor, borderRadius: 16 }} />
              <View style={{ width: 12 }} />
              <View style={{ flex: 1, height: 64, backgroundColor: skeletonColor, borderRadius: 16 }} />
            </View>
          </View>

          {/* Tasks list skeleton */}
          <View style={[styles.section, { backgroundColor: 'transparent' }]}>
            <View style={{ width: 100, height: 20, backgroundColor: skeletonColor, borderRadius: 10, marginBottom: 14 }} />
            <View style={{ width: '100%', height: 60, backgroundColor: skeletonColor, borderRadius: 16, marginBottom: 12 }} />
            <View style={{ width: '100%', height: 60, backgroundColor: skeletonColor, borderRadius: 16, marginBottom: 12 }} />
            <View style={{ width: '100%', height: 60, backgroundColor: skeletonColor, borderRadius: 16 }} />
          </View>
        </View>
      </View>

      {/* Sticky CTA skeleton */}
      <View style={[styles.v2StickyCtaWrap, { paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.v2StickyCtaButton, { backgroundColor: skeletonColor, opacity: 0.6 }]} />
      </View>
    </View>
  );
}

// Content component - only mounts after first paint
interface ActivityDetailsContentProps {
  activity: Activity;
  categories: ActivityCategory[];
  isAdmin: boolean;
  isDark: boolean;
  onBack: () => void;
  onActivityUpdated: (activity: Activity) => void;
  initialFeedbackTaskId?: string | null;
  initialOpenIntensity?: boolean;
}

interface TemplateFeedbackSummary {
  current?: TaskTemplateSelfFeedback;
  previous?: TaskTemplateSelfFeedback;
}

interface FeedbackModalTaskState {
  task: FeedbackTask;
  templateId: string;
}

interface AfterTrainingFeedbackConfig {
  enableScore: boolean;
  scoreExplanation?: string | null;
  enableNote: boolean;
}

interface PreviousFeedbackEntry {
  templateId: string;
  taskTitle: string;
  feedback?: TaskTemplateSelfFeedback;
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
    };
  }

  return {
    enableScore: row.after_training_feedback_enable_score ?? true,
    scoreExplanation: normalizeScoreExplanation(row.after_training_feedback_score_explanation),
    enableNote: row.after_training_feedback_enable_note ?? true,
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
    parts.push(
      typeof feedback.rating === 'number'
        ? `Score ${feedback.rating}/10`
        : 'Score mangler',
    );
  }

  return parts.length ? parts.join(' · ') : null;
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

function ActivityDetailsContent(props: ActivityDetailsContentProps) {
  const {
    activity,
    categories,
    isAdmin,
    isDark,
    onBack,
    onActivityUpdated,
    initialFeedbackTaskId,
    initialOpenIntensity,
  } = props;
  const router = useRouter();
  const insets = useSafeAreaInsets(); // ✅ Fix crash (insets used in header + paddingBottom)
  const safeDismiss = useCallback(() => {
    try {
      const r: any = router;
      if (typeof r.dismiss === 'function') return r.dismiss();
      if (router.canGoBack()) return router.back();
      return router.replace('/(tabs)');
    } catch {
      return router.replace('/(tabs)');
    }
  }, [router]);
  const {
    updateActivitySingle,
    updateActivitySeries,
    toggleTaskCompletion,
    deleteActivityTask,
    deleteActivitySingle,
    deleteActivitySeries,
    refreshData,
    createActivity,
    duplicateActivity,
  } = useFootball();
  const listRef = useRef<FlatList<TaskListItem>>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSeriesDialog, setShowSeriesDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [tasksState, setTasksState] = useState<FeedbackTask[]>((activity.tasks as FeedbackTask[]) || []);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // --- Feedback template configs + cached self feedback ---
  const [feedbackConfigByTemplate, setFeedbackConfigByTemplate] = useState<
    Record<string, AfterTrainingFeedbackConfig>
  >({});

  const [selfFeedbackByTemplate, setSelfFeedbackByTemplate] = useState<
    Record<string, TemplateFeedbackSummary>
  >({});

  // --- Currently opened feedback modal task ---
  const [feedbackModalTask, setFeedbackModalTask] = useState<FeedbackModalTaskState | null>(null);

  const [selectedNormalTask, setSelectedNormalTask] = useState<FeedbackTask | null>(null);
  const [isNormalTaskModalVisible, setIsNormalTaskModalVisible] = useState(false);
  const [isNormalTaskCompleting, setIsNormalTaskCompleting] = useState(false);
  const normalTaskVideoUrl = useMemo(
    () => (selectedNormalTask ? getTaskVideoUrl(selectedNormalTask) : null),
    [selectedNormalTask]
  );

  const handleNormalTaskComplete = useCallback(async () => {
    if (!selectedNormalTask || selectedNormalTask.completed) return;
    setIsNormalTaskCompleting(true);
    setTasksState(prev =>
      prev.map(t => (t.id === selectedNormalTask.id ? { ...t, completed: true } : t)),
    );
    try {
      await toggleTaskCompletion(activity.id, selectedNormalTask.id, true);
      Promise.resolve(refreshData()).catch(() => {});
      setIsNormalTaskModalVisible(false);
      setSelectedNormalTask(null);
    } catch (err) {
      setTasksState(prev =>
        prev.map(t => (t.id === selectedNormalTask.id ? { ...t, completed: false } : t)),
      );
      Alert.alert('Fejl', 'Kunne ikke markere opgaven som udført. Prøv igen.');
    } finally {
      setIsNormalTaskCompleting(false);
    }
  }, [selectedNormalTask, activity.id, toggleTaskCompletion, refreshData]);
  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#9aa0a6' : colors.textSecondary;
  const waveFillColor = isDark ? 'rgba(42,42,42,0.92)' : 'rgba(255,255,255,0.92)'; // ✅ subtle bleed-through
  const sectionTitleColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.35)';

  const headerGradientColors = useMemo(() => {
    const base = activity?.category?.color || colors.primary;
    return [darkenHex(base, 0.22), lightenHex(base, 0.12)] as [string, string];
  }, [activity?.category?.color]);

  const [isFeedbackSaving, setIsFeedbackSaving] = useState(false);
  const [feedbackModalError, setFeedbackModalError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [pendingFeedbackTaskId, setPendingFeedbackTaskId] = useState<string | null>(initialFeedbackTaskId ?? null);

  const [isIntensityModalVisible, setIsIntensityModalVisible] = useState(false);
  const [intensityModalDraft, setIntensityModalDraft] = useState<number | null>(
    typeof activity.intensity === 'number' ? activity.intensity : null
  );
  const [isIntensityModalSaving, setIsIntensityModalSaving] = useState(false);
  const [intensityModalError, setIntensityModalError] = useState<string | null>(null);

  const [pendingOpenIntensity, setPendingOpenIntensity] = useState<boolean>(initialOpenIntensity ?? false);

  const resolveFeedbackTemplateId = useCallback(
    (task: FeedbackTask | null | undefined): string | null =>
      task ? task.feedbackTemplateId ?? parseTemplateIdFromMarker(task.description || '') ?? null : null,
    []
  );

  const getFeedbackConfigForTemplate = useCallback(
    (templateId: string | null): AfterTrainingFeedbackConfig => {
      if (!templateId) return buildFeedbackConfig(undefined);
      return feedbackConfigByTemplate[templateId] ?? buildFeedbackConfig(undefined);
    },
    [feedbackConfigByTemplate]
  );

  // --- fetch current user id (used for feedback calls) ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          setCurrentUserId(null);
          return;
        }
        setCurrentUserId(data.session?.user?.id ?? null);
      } catch {
        if (!cancelled) setCurrentUserId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- keep tasksState in sync ---
  useEffect(() => {
    setTasksState((activity.tasks as FeedbackTask[]) || []);
  }, [activity.tasks]);

  // --- best-effort: fetch feedback configs + self feedback for templates (non-blocking) ---
  const feedbackTemplateIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tasksState) {
      const templateId = resolveFeedbackTemplateId(t);
      if (templateId) ids.add(String(templateId));
    }
    return Array.from(ids);
  }, [resolveFeedbackTemplateId, tasksState]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!feedbackTemplateIds.length) return;

      // configs (best-effort)
      try {
        const { data } = await supabase
          .from('task_templates')
          .select('id, after_training_feedback_enable_score, after_training_feedback_score_explanation, after_training_feedback_enable_note')
          .in('id', feedbackTemplateIds);

        if (!cancelled && Array.isArray(data)) {
          const next: Record<string, AfterTrainingFeedbackConfig> = {};
          for (const row of data as any[]) {
            if (!row?.id) continue;
            next[String(row.id)] = buildFeedbackConfig(row);
          }
          setFeedbackConfigByTemplate(prev => ({ ...prev, ...next }));
        }
      } catch (e) {
        if (__DEV__) console.log('[ActivityDetails] feedback config fetch skipped/failed', e);
      }

      // self feedback (best-effort)
      try {
        if (!currentUserId) return;
        const result = await (fetchSelfFeedbackForTemplates as any)(feedbackTemplateIds, currentUserId);
        if (cancelled) return;

        if (result && typeof result === 'object' && !Array.isArray(result)) {
          setSelfFeedbackByTemplate(result as Record<string, TemplateFeedbackSummary>);
        }
      } catch (e) {
        if (__DEV__) console.log('[ActivityDetails] self feedback fetch skipped/failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, feedbackTemplateIds]);

  // --- deep-link open feedback by task id ---
  useEffect(() => {
    if (!pendingFeedbackTaskId) return;

    const task = tasksState.find(t => String(t.id) === String(pendingFeedbackTaskId));
    if (!task) return;

    const templateId = resolveFeedbackTemplateId(task);
    if (!templateId) return;

    setFeedbackModalTask({ task, templateId });
    setFeedbackModalError(null);
  }, [pendingFeedbackTaskId, resolveFeedbackTemplateId, tasksState]);

  // Edit state
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
  const [editIntensityEnabled, setEditIntensityEnabled] = useState(resolveActivityIntensityEnabled(activity));
  const [editIntensity, setEditIntensity] = useState<number | null>(
    typeof activity.intensity === 'number' ? activity.intensity : null
  );
  const intensityOptions = useMemo(() => Array.from({ length: 10 }, (_, idx) => idx + 1), []);
  const activityIntensityEnabled = useMemo(() => resolveActivityIntensityEnabled(activity), [activity]);
  const isInternalActivity = !activity.isExternal;
  const currentActivityIntensity = typeof activity.intensity === 'number' ? activity.intensity : null;
  const shouldShowActivityIntensityField = isInternalActivity && !!activityIntensityEnabled;
  const showIntensityTaskRow = isInternalActivity && activityIntensityEnabled;
  const intensityTaskCompleted = showIntensityTaskRow && typeof activity.intensity === 'number';

  useEffect(() => {
    if (isIntensityModalVisible) return;
    setIntensityModalDraft(currentActivityIntensity);
  }, [currentActivityIntensity, isIntensityModalVisible]);

  useEffect(() => {
    setPendingOpenIntensity(initialOpenIntensity ?? false);
  }, [activity.id, initialOpenIntensity]);

  useEffect(() => {
    if (!pendingOpenIntensity) {
      return;
    }

    setPendingOpenIntensity(false);

    if (!showIntensityTaskRow) {
      const message = activity.isExternal
        ? 'Denne aktivitet kommer fra en ekstern kalender og understøtter ikke intensitet.'
        : 'Intensitet er ikke aktiveret for denne aktivitet.';
      Alert.alert('Intensitet ikke tilgængelig', message);
      return;
    }

    setIntensityModalDraft(currentActivityIntensity);
    setIntensityModalError(null);
    setIsIntensityModalVisible(true);
  }, [activity.isExternal, currentActivityIntensity, pendingOpenIntensity, showIntensityTaskRow]);

  // Recurring event conversion state
  const [convertToRecurring, setConvertToRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly'>('weekly');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  // Scroll to bottom when picker is shown
  useEffect(() => {
    if (showDatePicker || showTimePicker || showEndTimePicker || showEndDatePicker) {
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [showDatePicker, showTimePicker, showEndTimePicker, showEndDatePicker]);

  // --- sync edit state when activity changes ---
  useEffect(() => {
    setEditTitle(activity.title);
    setEditLocation(activity.location);
    setEditDate(activity.date);
    setEditTime(activity.time);
    setEditEndTime(activity.endTime);
    setEditCategory(activity.category);
    const resolvedFlag = resolveActivityIntensityEnabled(activity);
    setEditIntensityEnabled(resolvedFlag);
    setEditIntensity(typeof activity.intensity === 'number' ? activity.intensity : null);
  }, [activity]);

  useEffect(() => {
    setEditScope('single');
  }, [activity.id]);

  useEffect(() => {
    setPendingFeedbackTaskId(initialFeedbackTaskId ?? null);
  }, [activity.id, initialFeedbackTaskId]);

  const applyActivityUpdates = useCallback(
    (updates: Partial<Activity>) => {
      const nextActivity: Activity = {
        ...activity,
        ...updates,
        category: updates.category ?? activity.category,
        tasks: updates.tasks ?? activity.tasks,
        intensity: updates.intensity !== undefined ? updates.intensity : activity.intensity,
        intensityEnabled:
          updates.intensityEnabled !== undefined
            ? updates.intensityEnabled
            : activity.intensityEnabled,
      };
      onActivityUpdated(nextActivity);
    },
    [activity, onActivityUpdated]
  );

  const handleEditClick = () => {
    if (activity?.seriesId) {
      setEditScope('single');
      setShowSeriesDialog(true);
    } else {
      setEditScope('single');
      setIsEditing(true);
    }
  };

  const handleEditSingle = () => {
    setEditScope('single');
    setShowSeriesDialog(false);
    setIsEditing(true);
  };

  const handleEditAll = () => {
    setEditScope('series');
    setShowSeriesDialog(false);
    setIsEditing(true);
  };

  const handleDuplicate = () => {
    if (!activity) return;

    if (activity.isExternal) {
      Alert.alert(
        'Kan ikke duplikere',
        'Denne aktivitet er fra en ekstern kalender og kan ikke duplikeres. Kun manuelle aktiviteter kan duplikeres.'
      );
      return;
    }

    Alert.alert(
      'Duplikér aktivitet',
      `Er du sikker på at du vil duplikerte "${activity.title}"? En kopi vil blive oprettet med samme dato, tid, lokation og opgaver.`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Duplikér',
          onPress: () => setPendingAction({ type: 'duplicate' }),
        }
      ]
    );
  };

  const handleIntensityToggle = useCallback((value: boolean) => {
    setEditIntensityEnabled(value);
    if (!value) {
      setEditIntensity(null);
    }
  }, []);

  const handleIntensitySelect = useCallback(
    (value: number) => {
      if (!editIntensityEnabled) return;
      setEditIntensity(value);
    },
    [editIntensityEnabled]
  );

  const closeIntensityModal = useCallback(() => {
    if (isIntensityModalSaving) return;
    setIsIntensityModalVisible(false);
    setIntensityModalError(null);
  }, [isIntensityModalSaving]);

  const persistActivityIntensity = useCallback(
    async (value: number | null) => {
      if (!showIntensityTaskRow) return;
      setIsIntensityModalSaving(true);
      const previousIntensity = typeof activity.intensity === 'number' ? activity.intensity : null;

      setIntensityModalError(null);
      applyActivityUpdates({ intensity: value });

      try {
        await updateActivitySingle(activity.id, { intensity: value });
        setIsIntensityModalSaving(false);
        setIsIntensityModalVisible(false);
        setIntensityModalError(null);
        refreshData();
      } catch (error) {
        console.error('[Details] Error saving intensity:', error);
        applyActivityUpdates({ intensity: previousIntensity });
        setIsIntensityModalSaving(false);
        setIntensityModalError('Kunne ikke gemme intensitet. Prøv igen.');
      }
    },
    [activity.id, activity.intensity, applyActivityUpdates, refreshData, showIntensityTaskRow, updateActivitySingle]
  );

  const handleIntensityModalSave = useCallback(
    ({ score }: TaskScoreNoteModalPayload) => {
      persistActivityIntensity(typeof score === 'number' ? score : null);
    },
    [persistActivityIntensity]
  );

  const handleIntensityRowPress = useCallback(() => {
    if (!showIntensityTaskRow) return;
    if (isIntensityModalSaving) return;
    setIntensityModalDraft(typeof activity.intensity === 'number' ? activity.intensity : null);
    setIntensityModalError(null);
    setIsIntensityModalVisible(true);
  }, [activity.intensity, isIntensityModalSaving, showIntensityTaskRow]);

  const handleSave = async () => {
    if (!activity) return;

    const endTimePayload = isInternalActivity ? normalizeOptionalTime(editEndTime) : undefined;
    const intensityPayload = editIntensityEnabled ? editIntensity ?? null : null;
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
        if ((recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly') && selectedDays.length === 0) {
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
        });

        applyActivityUpdates({
          category: editCategory || activity.category,
        });

        await refreshData();

        Alert.alert('Gemt', 'Kategorien er blevet opdateret');
        setIsEditing(false);
        setEditScope('single');
        return;
      }

      if (activity.seriesId && editScope === 'series') {
        await updateActivitySeries(activity.seriesId, {
          title: editTitle,
          location: editLocation,
          categoryId: editCategory?.id,
          time: effectiveTime,
          endTime: endTimePayload,
          intensityEnabled: editIntensityEnabled,
          intensity: intensityPayload,
        });

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
        intensityEnabled: editIntensityEnabled,
        intensity: intensityPayload,
      });

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
      await refreshData();
    } catch (error) {
      console.error('Error saving activity:', error);
      Alert.alert('Fejl', 'Der opstod en fejl ved gemning');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (!activity) return;

    const resolvedFlag = resolveActivityIntensityEnabled(activity);
    const resolvedValue = typeof activity.intensity === 'number' ? activity.intensity : null;

    setEditTitle(activity.title);
    setEditLocation(activity.location);
    setEditDate(new Date(activity.date));
    setEditTime(activity.time);
    setEditEndTime(activity.endTime);
    setEditCategory(activity.category);
    setConvertToRecurring(false);
    setIsEditing(false);
    setEditScope('single');
    setEditIntensityEnabled(resolvedFlag);
    setEditIntensity(resolvedValue);
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setEditDate(selectedDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    if (selectedTime) {
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      setEditTime(`${hours}:${minutes}`);
    }
  };

  const handleWebTimeChange = (event: any) => {
    const value = event.target.value;
    if (value) {
      setEditTime(value);
    }
  };

  const handleEndTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndTimePicker(false);
    }
    if (selectedTime) {
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      setEditEndTime(`${hours}:${minutes}`);
    }
  };

  const handleWebEndTimeChange = (event: any) => {
    const value = event.target.value;
    setEditEndTime(value);
  };

  const handleEndDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndDatePicker(false);
    }
    if (selectedDate) {
      setEndDate(selectedDate);
    }
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  const handleTaskRowPress = useCallback((task: FeedbackTask) => {
    const templateId = resolveFeedbackTemplateId(task);
    const isFeedbackTaskLocal =
      task.isFeedbackTask === true ||
      (!!templateId && !task.taskTemplateId);

    if (isFeedbackTaskLocal && templateId) {
      setFeedbackModalTask({ task, templateId });
      setPendingFeedbackTaskId(String(task.id));
      return;
    }

    // --- C) Normal task: open shared modal, do not toggle directly ---
    setSelectedNormalTask(task);
    setIsNormalTaskModalVisible(true);
  }, [resolveFeedbackTemplateId]);

  const handleNormalTaskModalClose = useCallback(() => {
    if (isNormalTaskCompleting) return;
    setIsNormalTaskModalVisible(false);
    setSelectedNormalTask(null);
  }, [isNormalTaskCompleting]);

  const handleDeleteTask = useCallback((taskId: string) => {
    if (!activity || !isAdmin) return;

    Alert.alert(
      'Slet opgave',
      'Er du sikker på at du vil slette denne opgave? Dette sletter kun opgaven fra denne aktivitet, ikke opgaveskabelonen.',
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Slet',
          style: 'destructive',
          onPress: () => setPendingAction({ type: 'delete-task', taskId }),
        }
      ]
    );
  }, [activity, isAdmin]);

  const handleAddTask = () => {
    console.log('Opening create task modal for activity:', activity?.id);
    setShowCreateTaskModal(true);
  };

  const handleTaskCreated = useCallback(async () => {
    console.log('Task created successfully, refreshing activity data');
    setShowCreateTaskModal(false);
    try {
      const refreshedActivity = await fetchActivityFromDatabase(activity.id);
      if (refreshedActivity?.tasks) {
        setTasksState((refreshedActivity.tasks as FeedbackTask[]) || []);
      }
    } catch (error) {
      console.error('Error refreshing tasks after creation:', error);
    }
    refreshData();
  }, [activity.id, refreshData]);

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
            disabled={isIntensityModalSaving}
          >
            {/* ✅ Fixed left slot + body + right actions */}
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
                  <Text style={[styles.intensityTaskValue, { color: textSecondaryColor }]}>{`${activity.intensity}/10`}</Text>
                )}
              </View>
              {!intensityTaskCompleted && (
                <Text style={[styles.intensityTaskHelper, { color: textSecondaryColor }]}>
                  Tryk for at angive intensitet
                </Text>
              )}
            </View>

            <View style={styles.taskRightActions}>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron_right"
                size={20}
                color={textSecondaryColor}
              />
            </View>
          </TouchableOpacity>
        );
      }

      const task = item;

      const templateId = resolveFeedbackTemplateId(task);
      const config = getFeedbackConfigForTemplate(templateId);
      const feedback = templateId ? selfFeedbackByTemplate[templateId]?.current : undefined;

      const isFeedbackTaskLocal =
        task.isFeedbackTask === true ||
        (!!templateId && !task.taskTemplateId);

      const isFeedbackCompleted = isFeedbackTaskLocal
        ? isFeedbackAnswered(feedback, config)
        : false;

      const scoreExplanation =
        isFeedbackTaskLocal && config.enableScore !== false
          ? (config.scoreExplanation ?? null)
          : null;

      const summary = isFeedbackTaskLocal ? buildFeedbackSummary(feedback, config) : null;

      let helperText = 'Tryk for at åbne';
      if (isFeedbackTaskLocal) {
        if (isFeedbackCompleted) {
          const parts = [summary].filter(Boolean) as string[];
          helperText = parts.length ? parts.join(' · ') : 'Feedback udfyldt';
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
        >
          {/* ✅ Fixed left slot */}
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

          {/* ✅ Body: ALL text lives here, so x-start matches intensity row */}
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

            {!isFeedbackTaskLocal && task.description ? (
              <TaskDescriptionRenderer description={task.description} textColor={textSecondaryColor} />
            ) : null}

            {isFeedbackTaskLocal && (
              <>
                {scoreExplanation ? (
                  <Text style={[styles.feedbackExplanationText, { color: textSecondaryColor }]}>
                    {scoreExplanation}
                  </Text>
                ) : null}
                <Text style={[styles.feedbackHelperText, { color: textSecondaryColor }]}>{helperText}</Text>
              </>
            )}
          </View>

          <View style={styles.taskRightActions}>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron_right"
              size={20}
              color={textSecondaryColor}
            />
            {isAdmin && !isFeedbackTaskLocal && (
              <TouchableOpacity
                style={[styles.taskDeleteButton, { backgroundColor: isDark ? '#3a1a1a' : '#ffe5e5' }]}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  handleDeleteTask(String(task.id));
                }}
                activeOpacity={0.7}
                disabled={deletingTaskId === String(task.id)}
              >
                {deletingTaskId === String(task.id) ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={22} color={colors.error} />
                )}
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [
      activity.intensity,
      deletingTaskId,
      getFeedbackConfigForTemplate,
      handleDeleteTask,
      handleIntensityRowPress,
      handleTaskRowPress,
      isAdmin,
      isDark,
      isIntensityModalSaving,
      intensityTaskCompleted,
      resolveFeedbackTemplateId,
      selfFeedbackByTemplate,
      textColor,
      textSecondaryColor,
    ]
  );

  const taskKeyExtractor = useCallback((item: TaskListItem) => ('__type' in item ? item.key : String(item.id)), []);

  const handleDeleteClick = () => {
    if (activity?.isExternal) {
      Alert.alert(
        'Slet ekstern aktivitet',
        `Er du sikker på at du vil slette "${activity.title}"?\n\nDenne aktivitet er fra en ekstern kalender. Hvis du sletter den her, vil den blive importeret igen ved næste synkronisering, medmindre du sletter den i den eksterne kalender eller fjerner kalenderen fra din profil.`,
        [
          { text: 'Annuller', style: 'cancel' },
          {
            text: 'Slet',
            style: 'destructive',
            onPress: () => setPendingAction({ type: 'delete-external' }),
          }
        ]
      );
      return;
    }
    setShowDeleteDialog(true);
  };

  const handleDeleteSingle = useCallback(() => {
    setPendingAction({ type: 'delete-single' });
  }, []);

  const handleDeleteSeries = useCallback(() => {
    setPendingAction({ type: 'delete-series' });
  }, []);

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
                Alert.alert('Fejl', error?.message || 'Kunne ikke duplikerte aktiviteten');
              }
            } finally {
              if (!cancelled) setIsDuplicating(false);
            }
            break;
          }
          case 'delete-task': {
            if (!isAdmin) break;
            if (!cancelled) setDeletingTaskId(action.taskId);
            try {
              await deleteActivityTask(currentActivity.id, action.taskId);
              if (!cancelled) {
                setTasksState(prev => prev.filter(task => String(task.id) !== String(action.taskId)));
                refreshData();
                Alert.alert('Slettet', 'Opgaven er blevet slettet fra denne aktivitet');
              }
            } catch (error: any) {
              console.error('❌ Error deleting task:', error);
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
                router.replace('/(tabs)/(home)');
                setTimeout(() => {
                  Alert.alert('Slettet', 'Den eksterne aktivitet er blevet slettet fra din app');
                }, 300);
              }
            } catch (error: any) {
              console.error('❌ Error deleting external activity:', error);
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
              console.error('❌ Error deleting activity:', error);
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
              console.error('❌ Error deleting series:', error);
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
    isAdmin,
    pendingAction,
    refreshData,
    router,
  ]);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('da-DK', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatDateTime = (date: Date, time: string) => {
    const timeDisplay = time.substring(0, 5);
    return `${formatDate(date)} kl. ${timeDisplay}`;
  };

  const needsDaySelection =
    recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly';

  const handleFeedbackClose = useCallback(() => {
    setFeedbackModalTask(null);
    setPendingFeedbackTaskId(null);
    setFeedbackModalError(null);
  }, []);

  const handleFeedbackSave = useCallback(
    async ({ score, note }: TaskScoreNoteModalPayload) => {
      if (!feedbackModalTask) return;

      setFeedbackModalError(null);
      setIsFeedbackSaving(true);

      // --- A) Robust resolvedActivityId logic ---
      // Only try: a) activity?.id, b) feedbackModalTask.task.activity_id
      let resolvedActivityId: string | null = null;
      let triedActivityId: any = null;
      let triedFeedbackTaskActivityId: any = null;

      try {
        // a) Current activity.id (from ActivityDetails state)
        triedActivityId = activity?.id;
        if (typeof triedActivityId === 'string' && String(triedActivityId).trim().length > 0) {
          resolvedActivityId = String(triedActivityId).trim();
        }
        // b) feedbackModalTask.task.activity_id (if present)
        if (!resolvedActivityId) {
          triedFeedbackTaskActivityId = (feedbackModalTask.task as any)?.activity_id;
          if (typeof triedFeedbackTaskActivityId === 'string' && String(triedFeedbackTaskActivityId).trim().length > 0) {
            resolvedActivityId = String(triedFeedbackTaskActivityId).trim();
          }
        }
      } catch (err) {
        // Defensive: should never throw
        resolvedActivityId = null;
      }

      if (!resolvedActivityId) {
        console.error(
          '[ActivityDetails] Feedback save failed: missing activity_id',
          {
            triedActivityId,
            triedFeedbackTaskActivityId,
            feedbackModalTask,
            activity,
          }
        );
        Alert.alert(
          'Kunne ikke gemme',
          'Aktiviteten mangler et ID. Prøv at lukke og åbne aktiviteten igen.'
        );
        setIsFeedbackSaving(false);
        return;
      }

      if (!currentUserId) {
        console.error('[ActivityDetails] Feedback save failed: missing currentUserId', {
          currentUserId,
          feedbackModalTask,
          activity,
        });
        Alert.alert('Kunne ikke gemme', 'Bruger-ID mangler. Prøv at logge ind igen.');
        setIsFeedbackSaving(false);
        return;
      }

      try {
        await (upsertSelfFeedback as any)({
          templateId: feedbackModalTask.templateId,
          userId: currentUserId,
          rating: score,
          note,
          activity_id: String(resolvedActivityId).trim(),
          activityId: String(resolvedActivityId).trim(), // <-- back-compat: always send both
        });
        Promise.resolve(refreshData()).catch(() => {});
        handleFeedbackClose();
      } catch (e) {
        console.error('[ActivityDetails] feedback save failed:', e);
        setFeedbackModalError('Kunne ikke gemme feedback lige nu. Prøv igen.');
      } finally {
        setIsFeedbackSaving(false);
      }
    },
    [currentUserId, feedbackModalTask, handleFeedbackClose, refreshData, activity]
  );

  const feedbackModalConfig = useMemo(() => {
    if (!feedbackModalTask) return undefined;
    return getFeedbackConfigForTemplate(feedbackModalTask.templateId);
  }, [feedbackModalTask, getFeedbackConfigForTemplate]);

  const feedbackModalDefaults = useMemo(() => {
    if (!feedbackModalTask) return { rating: null as number | null, note: '' };
    const cur = selfFeedbackByTemplate[feedbackModalTask.templateId]?.current;
    return {
      rating: typeof cur?.rating === 'number' ? cur.rating : null,
      note: cur?.note ?? '',
    };
  }, [feedbackModalTask, selfFeedbackByTemplate]);

  // --- Helper: Strip leading "Feedback på" from a title (case-insensitive, trims) ---
  function stripLeadingFeedbackPrefix(title: string): string {
    if (typeof title !== 'string') return title;
    let t = title.trim();
    // Remove leading "Feedback på" (case-insensitive), plus any following whitespace
    t = t.replace(/^feedback på\s*/i, '');
    // Fallback: if empty, return original
    return t.length ? t : title;
  }

  const handleBackPress = useCallback(() => {
    if (isEditing) {
      Alert.alert(
        'Afslut redigering',
        'Du er i gang med at redigere. Vil du afslutte uden at gemme?',
        [
          { text: 'Annuller', style: 'cancel' },
          {
            text: 'Afslut',
            style: 'destructive',
            onPress: () => {
              setIsEditing(false);
              safeDismiss();
            },
          },
        ]
      );



    } else {
      safeDismiss();
    }
  }, [isEditing, safeDismiss]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: bgColor }]}
    >
      {/* Header */}
      <LinearGradient
        colors={headerGradientColors}
        style={[styles.header, styles.v2Topbar, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity
          style={[styles.backButtonHeader, { top: insets.top + 8 }]}
          onPress={handleBackPress}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={28}
            color="#fff"
          />
               </TouchableOpacity>

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

        <View style={[styles.headerButtons, { top: insets.top + 8 }]}>
          {isEditing ? (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleSave}
              activeOpacity={0.7}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <IconSymbol
                  ios_icon_name="checkmark"
                  android_material_icon_name="check"
                  size={26}
                  color="#fff"
                />
              )}
            </TouchableOpacity>
          ) : (

            <>
              {!activity.isExternal && (

                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={handleDuplicate}
                  activeOpacity={0.7}
                  disabled={isDuplicating}
                >
                  {isDuplicating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <IconSymbol
                      ios_icon_name="doc.on.doc"
                      android_material_icon_name="content_copy"
                      size={24}
                      color="#fff"
                    />
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.headerButton}
                onPress={handleEditClick}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="pencil"
                  android_material_icon_name="edit"
                  size={24}
                  color="#fff"
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.headerButton}
                onPress={handleDeleteClick}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="trash"
                  android_material_icon_name="delete"
                  size={24}
                  color="#fff"
                />
              </TouchableOpacity>
            </>
          )}
        </View>
      </LinearGradient>

      <View style={styles.v2Sheet}>
        {/* ✅ background fill behind list */}
        <View pointerEvents="none" style={[styles.v2SheetFill, { backgroundColor: cardBgColor }]} />
        <View pointerEvents="none" style={styles.v2WaveOverlay}>
          <SheetWaveTop color={cardBgColor} />
        </View>

        <FlatList
          ref={listRef}
          data={taskListItems}
          keyExtractor={taskKeyExtractor}
          renderItem={renderTaskItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom:
                32 + (!isEditing ? V2_CTA_HEIGHT + 24 : 0) + (insets.bottom ? insets.bottom : 0),
            },
          ]}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          ListHeaderComponent={
            <View>
              {/* ✅ Title aligned with task cards */
              }
              <Text style={styles.v2SectionTitle}>Detaljer</Text>

              {/* ✅ Dato card full-width aligned with task cards */
              }
              <View style={styles.v2CardWrap}>
                <DetailsCard
                  label="Dato & Tidspunkt"
                  value={`${formatDateTime(activity.date, activity.time)}${
                    activity.endTime ? ` - ${activity.endTime.substring(0, 5)}` : ''
                  }`}
                  backgroundColor={isDark ? '#ffffff0f' : '#ffffff'}
                  textColor={textColor}
                  secondaryTextColor={textSecondaryColor}
                  fullWidth
                  icon={{ ios: 'calendar', android: 'calendar_today' }}
                  iconColor={colors.primary}
                />
              </View>

              {/* ✅ Lokation/Kategori row: keep inner split, only “bleed” outwards */
              }
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
                    iconColor={colors.primary}
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
                    leadingEmoji={activity.category?.emoji} // ✅ system icon
                  />
                </View>
              </View>

              {/* ✅ Intensitet: same width as task cards + same spacing as other blocks */
              }
              {!activity.isExternal && !isEditing && shouldShowActivityIntensityField ? (
                <View style={[styles.v2CardWrap, { marginTop: 12 }]}>
                  <DetailsCard
                    label="Intensitet"
                    value={typeof activity.intensity === 'number' ? `${activity.intensity}/10` : 'Ikke angivet'}
                    backgroundColor={isDark ? '#ffffff0f' : '#ffffff'}
                    textColor={textColor}
                    secondaryTextColor={textSecondaryColor}
                    fullWidth
                    icon={{ ios: 'flame', android: 'local_fire_department' }}
                    iconColor={colors.primary}
                  />
                </View>
              ) : null}

              {/* ✅ “Opgaver” title: aligned left + spacing to first task matches “Detaljer”→Dato */
              }
              <View style={styles.v2TasksHeaderRow}>
                <Text style={styles.v2SectionTitle}>Opgaver</Text>
                {isAdmin && !activity.isExternal && (
                  <TouchableOpacity
                    style={[styles.addTaskHeaderButton, { backgroundColor: colors.primary }]}
                    onPress={handleAddTask}
                    activeOpacity={0.7}
                  >
                    <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={20} color="#fff" />
                    <Text style={styles.addTaskHeaderButtonText}>Tilføj opgave</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={{ height: 12 }} />
            </View>
          }
        />
      </View>

      {selectedNormalTask && (
        <TaskDetailsModal
          visible={isNormalTaskModalVisible}
          title={String(selectedNormalTask.title ?? 'Opgave')}
          categoryColor={activity.category?.color ?? colors.primary}
          isDark={isDark}
          description={selectedNormalTask.description}
          reminderMinutes={
            selectedNormalTask.reminder_minutes ?? selectedNormalTask.reminder ?? null
          }
          videoUrl={getTaskVideoUrl(selectedNormalTask)}
          completed={!!selectedNormalTask.completed}
          isSaving={isNormalTaskCompleting}
          onClose={handleNormalTaskModalClose}
          onComplete={handleNormalTaskComplete}
        />
      )}

      <TaskScoreNoteModal
        visible={Boolean(feedbackModalTask)}
        title={
          feedbackModalTask
            ? stripLeadingFeedbackPrefix(feedbackModalTask.task.title ?? 'Feedback')
            : 'Feedback'
        }
        introText={feedbackModalConfig?.scoreExplanation ?? 'Hvordan gik træningen?'}
        helperText="1 = let · 10 = maks"
        initialScore={feedbackModalDefaults.rating}
        initialNote={feedbackModalDefaults.note ?? ''}
        enableScore={feedbackModalConfig?.enableScore !== false}
        enableNote={feedbackModalConfig?.enableNote !== false}
        isSaving={isFeedbackSaving}
        error={feedbackModalError}
        onSave={handleFeedbackSave}
        onClose={handleFeedbackClose}
      />

      <TaskScoreNoteModal
        visible={isIntensityModalVisible}
        title="Intensitet"
        introText="Hvordan gik træningen?"
        helperText="1 = let · 10 = maks"
        initialScore={intensityModalDraft}
        initialNote=""
        enableScore
        enableNote={false}
        isSaving={isIntensityModalSaving}
        error={intensityModalError}
        onSave={handleIntensityModalSave}
        onClose={closeIntensityModal}
      />

      {showCreateTaskModal && (
        <CreateActivityTaskModal
          visible={showCreateTaskModal}
          onClose={() => setShowCreateTaskModal(false)}
          onTaskCreated={handleTaskCreated}
          activityId={activity.id}
          activityTitle={activity.title}
          activityDate={activity.date}
          activityTime={activity.time}
        />
      )}

      {/* ...existing dialogs/modals (DeleteActivityDialog, EditSeriesDialog, etc.) */}
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
    } catch (_err) {
      decoded = String(first);
    }
    const trimmed = decoded.trim();
    const lowered = trimmed.toLowerCase();
    if (!trimmed.length || lowered === 'undefined' || lowered === 'null') return null;
    return trimmed;
  }, []);

  const activityId = normalizeParam(params.id ?? params.activityId ?? params.activity_id);
  const initialFeedbackTaskId = normalizeParam(params.openFeedbackTaskId);
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

  const handleRefresh = useCallback(() => {
    return loadActivity();
  }, [loadActivity]);

  const renderErrorView = (normalizedId: string | null) => (
    <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
        Kunne ikke åbne aktiviteten
      </Text>
      {__DEV__ && (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 12,
            marginBottom: 12,
            textAlign: 'center',
          }}
        >
          id: {JSON.stringify(normalizedId)}{'\n'}
          params: {JSON.stringify(params)}
        </Text>
      )}
      <TouchableOpacity
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.primary,
          borderRadius: 10,
        }}
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)/(home)');
          }
        }}
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
  backButtonHeader: {
    position: 'absolute',
    left: 16,
    top: 20,
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
  headerIcon: {
    marginHorizontal: 8,
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
    top: 20,
    alignItems: 'center',
  },
  headerButton: {
    marginLeft: 12,
  },
  v2Topbar: {
    backgroundColor: 'transparent',
    paddingBottom: 64,
  },
  v2Sheet: {
    flex: 1,
    marginTop: -V2_WAVE_HEIGHT,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
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

  // ✅ shared section title (Detaljer + Opgaver)
  sectionHeaderTitle: {
    marginHorizontal: 16,
    marginBottom: 12,
    fontSize: 22,
    fontWeight: '800',
    color: 'rgba(15, 23, 42, 0.40)',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // ✅ detail card alignment wrappers (match taskCard gutter)
  v2CardWrap: {
    marginHorizontal: 16,
  },
  v2DetailsRowWrap: {
    marginHorizontal: 16,
    marginTop: 12, // ✅ matches Dato→row spacing
    flexDirection: 'row',
  },

  // ✅ directional widen: keep inner geometry, extend only outward
  v2DetailBleedLeft: {
    flex: 1,
    marginLeft: -16,   // widen left only
    paddingLeft: 16,   // keep content aligned
  },
  v2DetailBleedRight: {
    flex: 1,
    marginRight: -16,  // widen right only
    paddingRight: 16,  // keep content aligned
  },

  v2DetailCard: {
    borderRadius: 16,
    padding: 16,
    // marginHorizontal: 16,  // ❌ remove (caused double indents)
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
  v2StickyCtaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
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
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailContent: {
    marginLeft: 12,
    flex: 1,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
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
    marginBottom: 8, // ✅ replaces rowGap when wrapping
  },
  intensityPickerChipSelected: {
    backgroundColor: colors.primary,
  },
  intensityPickerText: {
    fontSize: 16,
  },
  intensityPickerTextSelected: {
    color: '#fff',
    fontWeight: '500',
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
  toggle: {
    width: 40,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    position: 'absolute',
    top: 2,
    left: 2,
  },
  toggleThumbActive: {
    left: 18,
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
    marginBottom: 8, // ✅ replaces rowGap when wrapping
  },
  dayButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },

  externalBadge: {
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  externalBadgeText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 8, // ✅ replaces rowGap
  },

  infoBox: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  feedbackInfoBox: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 16,
  },
  feedbackInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  feedbackInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8, // ✅ replaces rowGap
  },
  feedbackInfoRow: {
    marginBottom: 12,
  },
  feedbackInfoTaskTitle: {
    fontSize: 14,
  },
  feedbackInfoRating: {
    fontSize: 14,
    marginTop: 4,
  },
  feedbackInfoNote: {
    fontSize: 14,
    marginTop: 4,
  },

  tasksSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
    marginLeft: 8, // ✅ replaces rowGap between icon + text
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
    // marginRight: 12, // ❌ spacing controlled by taskLeftSlot
  },

  feedbackTaskCheckbox: {
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  taskDeleteButton: {
    marginLeft: 12,
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
  emptyTasksContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyTasksText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyTasksHint: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  videoSection: {
    marginTop: 12,
    marginBottom: 16,
  },
  videoContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  reminderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reminderText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 8, // ✅ replaces gap
  },
  footer: {
    marginTop: 20,
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // ✅ Restore original look + width for task boxes
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
});