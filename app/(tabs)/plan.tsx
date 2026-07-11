import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import SwipeVideoPlayer from '@/components/SwipeVideoPlayer';
import { TaskMediaListEditor } from '@/components/TaskMediaListEditor';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useFootball } from '@/contexts/FootballContext';
import { useUserRole } from '@/hooks/useUserRole';
import { getColors } from '@/styles/commonStyles';
import { TaskLibrarySection } from './tasks';
import {
  TrainingTemplateExerciseTimer,
  TrainingTemplateItemInput,
  TrainingTemplateLibraryItem,
  TrainingTemplateSummary,
  TrainingTemplateTaskConfig,
  TrainingTemplateType,
  archiveOwnerTrainingTemplate,
  duplicateOwnerTrainingTemplate,
  fetchOwnerTrainingTemplates,
  fetchOwnerTrainingTemplatesContext,
  restoreOwnerTrainingTemplate,
  saveOwnerTrainingTemplate,
} from '@/services/trainingTemplateService';
import type { OwnerPlayerCrmWorkspace } from '@/services/ownerPlayerCrmService';
import { pickAndUploadTaskMedia } from '@/utils/taskVideoUpload';
import {
  buildTaskMediaNamePayload,
  buildTaskVideoPayload,
  getTaskMediaNameFromFileName,
  getTaskMediaType,
  isTaskMediaUrl,
  mergeTaskMedia,
  normalizeTaskMediaNames,
  normalizeTaskVideoUrls,
  removeTaskMediaAt,
  replaceTaskMediaName,
} from '@/utils/taskVideos';

type PlanSection = 'templates' | 'tasks' | 'assignments';
type TemplateStatusFilter = 'active' | 'archived';
type PlanFilterPicker = 'view' | null;
type TemplateSourceFilter = 'all' | 'mine' | 'workspace';
type ItemSourceMode = 'new' | 'saved' | 'library';
type ItemPickerMode = Extract<ItemSourceMode, 'saved' | 'library'> | null;
type PlanViewTarget = 'tasks' | 'exercise' | 'session' | 'week' | 'assignments';

type PlanSourceFilterOption = {
  value: TemplateSourceFilter;
  label: string;
  count: number;
};

type TemplateFocusTagOption = {
  value: string;
  label: string;
  count: number;
};

type TemplateCategoryOption = {
  id: string;
  name: string;
  color: string;
  emoji: string;
};

type DraftItem = TrainingTemplateItemInput & {
  localId: string;
};

type TaskConfigDraft = {
  categoryIds: string[];
  videoUrls: string[];
  mediaNames: string[];
  videoUrlInput: string;
  mediaNameInput: string;
  reminderEnabled: boolean;
  reminderMinutes: string;
  feedbackEnabled: boolean;
  feedbackDelayMinutes: string;
  feedbackScoreExplanation: string;
  autoAddToActivities: boolean;
};

type ExerciseTimerDraft = {
  activeSeconds: string;
  restSeconds: string;
  rounds: string;
};

type TemplateDraft = {
  id: string | null;
  templateType: TrainingTemplateType;
  title: string;
  description: string;
  folderId: string | null;
  focusInput: string;
  defaultActivityCategoryName: string;
  taskConfig: TaskConfigDraft;
  exerciseTimer: ExerciseTimerDraft;
  status: TemplateStatusFilter;
  items: DraftItem[];
};

const TEMPLATE_TYPES: {
  value: TrainingTemplateType;
  label: string;
  icon: string;
  materialIcon: string;
}[] = [
  { value: 'task', label: 'Task', icon: 'checklist', materialIcon: 'checklist' },
  { value: 'exercise', label: 'Exercise', icon: 'timer', materialIcon: 'timer' },
  { value: 'session', label: 'Session', icon: 'calendar', materialIcon: 'event' },
  { value: 'week', label: 'Week', icon: 'calendar.badge.clock', materialIcon: 'event_note' },
];

const CREATE_TEMPLATE_OPTIONS: {
  value: TrainingTemplateType;
  title: string;
  detail: string;
  icon: string;
  materialIcon: string;
}[] = [
  {
    value: 'task',
    title: 'Task',
    detail: 'A single task with video, images, feedback, and reminder fields.',
    icon: 'checklist',
    materialIcon: 'checklist',
  },
  {
    value: 'exercise',
    title: 'Exercise',
    detail: 'A task with an interval timer, work time, rest time, and rounds.',
    icon: 'timer',
    materialIcon: 'timer',
  },
  {
    value: 'session',
    title: 'Session',
    detail: 'A same-day activity built from tasks and exercises.',
    icon: 'calendar',
    materialIcon: 'event',
  },
  {
    value: 'week',
    title: 'Week',
    detail: 'A weekly plan with saved sessions distributed across days.',
    icon: 'calendar.badge.clock',
    materialIcon: 'event_note',
  },
];

const PLAN_VIEW_TARGETS: {
  value: PlanViewTarget;
  label: string;
  detail: string;
  icon: string;
  materialIcon: string;
  templateType?: TrainingTemplateType;
}[] = [
  { value: 'tasks', label: 'Tasks', detail: 'Task library and task templates', icon: 'checklist', materialIcon: 'checklist' },
  { value: 'exercise', label: 'Exercise', detail: 'Exercise templates with timers', icon: 'timer', materialIcon: 'timer', templateType: 'exercise' },
  { value: 'session', label: 'Session', detail: 'Session templates', icon: 'calendar', materialIcon: 'event', templateType: 'session' },
  { value: 'week', label: 'Week', detail: 'Weekly plans built from sessions', icon: 'calendar.badge.clock', materialIcon: 'event_note', templateType: 'week' },
  { value: 'assignments', label: 'Assignments', detail: 'A complete overview of assignments', icon: 'person.2.fill', materialIcon: 'groups' },
];

const ITEM_TYPES: {
  value: DraftItem['itemType'];
  label: string;
  icon: string;
  materialIcon: string;
}[] = [
  { value: 'task_template', label: 'Task', icon: 'checklist', materialIcon: 'checklist' },
  { value: 'exercise', label: 'Exercise', icon: 'timer', materialIcon: 'timer' },
  { value: 'session_template', label: 'Session', icon: 'rectangle.3.group', materialIcon: 'dashboard' },
  { value: 'focus', label: 'Focus', icon: 'scope', materialIcon: 'center_focus_strong' },
  { value: 'note', label: 'Note', icon: 'doc.text', materialIcon: 'description' },
  { value: 'feedback_requirement', label: 'Feedback', icon: 'text.bubble', materialIcon: 'rate_review' },
];

const ITEM_TYPES_BY_TEMPLATE: Record<TrainingTemplateType, DraftItem['itemType'][]> = {
  task: [],
  exercise: [],
  session: ['task_template', 'exercise', 'focus', 'note', 'feedback_requirement'],
  week: ['session_template'],
};

const DEFAULT_EXERCISE_TIMER: TrainingTemplateExerciseTimer = {
  activeSeconds: 45,
  restSeconds: 15,
  rounds: 3,
};

function getDefaultItemType(templateType: TrainingTemplateType): DraftItem['itemType'] {
  return ITEM_TYPES_BY_TEMPLATE[templateType][0] ?? 'task_template';
}

const createLocalId = () => `item:${Date.now()}:${Math.random().toString(36).slice(2)}`;

function createEmptyTaskConfigDraft(): TaskConfigDraft {
  return {
    categoryIds: [],
    videoUrls: [],
    mediaNames: [],
    videoUrlInput: '',
    mediaNameInput: '',
    reminderEnabled: false,
    reminderMinutes: '0',
    feedbackEnabled: false,
    feedbackDelayMinutes: '0',
    feedbackScoreExplanation: '',
    autoAddToActivities: false,
  };
}

function createEmptyExerciseTimerDraft(): ExerciseTimerDraft {
  return {
    activeSeconds: String(DEFAULT_EXERCISE_TIMER.activeSeconds),
    restSeconds: String(DEFAULT_EXERCISE_TIMER.restSeconds),
    rounds: String(DEFAULT_EXERCISE_TIMER.rounds),
  };
}

const LEGACY_FOCUS_TAG_TRANSLATIONS: Record<string, string> = {
  afslutning: 'Finishing',
  angreb: 'Attack',
  boldkontrol: 'Ball control',
  fysisk: 'Physical',
  forsvar: 'Defense',
  forsteberoring: 'First touch',
  'forste beroring': 'First touch',
  førsteberøring: 'First touch',
  'første berøring': 'First touch',
  hurtighed: 'Speed',
  malmand: 'Goalkeeper',
  målmand: 'Goalkeeper',
  midtbane: 'Midfielder',
  pasning: 'Passing',
  styrke: 'Strength',
  teknik: 'Technique',
  udholdenhed: 'Endurance',
};

function normalizeFocusTagDisplayValue(value: unknown): string {
  const tag = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!tag) return '';
  const key = normalizeFocusTagKey(tag);
  return LEGACY_FOCUS_TAG_TRANSLATIONS[key] ?? tag;
}

function normalizeFocusInput(value: string): string[] {
  return normalizeFocusTags(value.split(',')).slice(0, 12);
}

function normalizeFocusTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.reduce<string[]>((acc, item) => {
    const tag = normalizeFocusTagDisplayValue(item);
    const key = normalizeFocusTagKey(tag);
    if (!tag || seen.has(key)) return acc;
    seen.add(key);
    acc.push(tag);
    return acc;
  }, []);
}

function normalizeFocusTagKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function buildFocusInputFromTags(tags: string[]): string {
  return normalizeFocusTags(tags).join(', ');
}

function parsePositiveInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : null;
}

function parseNonNegativeInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded >= 0 ? rounded : null;
}

function clampNumber(value: number | null, fallback: number, min: number, max: number): number {
  if (value === null) return fallback;
  return Math.max(min, Math.min(max, value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function createTaskConfigDraftFromConfig(config: unknown): TaskConfigDraft {
  const record = asRecord(config);
  const videoUrls = normalizeTaskVideoUrls(record.videoUrls ?? record.video_urls ?? record.videoUrl ?? record.video_url);
  const mediaNames = normalizeTaskMediaNames(record.mediaNames ?? record.media_names, videoUrls);
  const rawCategoryIds = record.categoryIds ?? record.category_ids;
  const categoryIds = Array.isArray(rawCategoryIds)
    ? rawCategoryIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];

  return {
    categoryIds: Array.from(new Set(categoryIds)),
    videoUrls,
    mediaNames,
    videoUrlInput: '',
    mediaNameInput: '',
    reminderEnabled: typeof record.reminderMinutes === 'number' || typeof record.reminder === 'number',
    reminderMinutes: String(record.reminderMinutes ?? record.reminder ?? record.reminder_minutes ?? 0),
    feedbackEnabled: record.afterTrainingEnabled === true || record.after_training_enabled === true,
    feedbackDelayMinutes: String(record.afterTrainingDelayMinutes ?? record.after_training_delay_minutes ?? 0),
    feedbackScoreExplanation: String(record.afterTrainingFeedbackScoreExplanation ?? record.after_training_feedback_score_explanation ?? ''),
    autoAddToActivities: record.autoAddToActivities === true || record.auto_add_to_activities === true,
  };
}

function createExerciseTimerDraftFromConfig(config: unknown): ExerciseTimerDraft {
  const record = asRecord(config);
  return {
    activeSeconds: String(record.activeSeconds ?? record.workSeconds ?? DEFAULT_EXERCISE_TIMER.activeSeconds),
    restSeconds: String(record.restSeconds ?? record.pauseSeconds ?? DEFAULT_EXERCISE_TIMER.restSeconds),
    rounds: String(record.rounds ?? DEFAULT_EXERCISE_TIMER.rounds),
  };
}

function createTaskConfigDraftFromLibraryItem(item: TrainingTemplateLibraryItem): TaskConfigDraft {
  const videoUrls = normalizeTaskVideoUrls(item.videoUrls.length ? item.videoUrls : item.videoUrl);
  return {
    ...createEmptyTaskConfigDraft(),
    videoUrls,
    mediaNames: normalizeTaskMediaNames(item.mediaNames, videoUrls),
  };
}

function getTaskConfigMediaCount(value: unknown): number {
  const record = asRecord(value);
  return normalizeTaskVideoUrls(record.videoUrls ?? record.video_urls ?? record.videoUrl ?? record.video_url).length;
}

function getTaskConfigMediaUrls(value: unknown): string[] {
  const record = asRecord(value);
  return normalizeTaskVideoUrls(record.videoUrls ?? record.video_urls ?? record.videoUrl ?? record.video_url);
}

function getTemplateTaskConfig(template: TrainingTemplateSummary): Record<string, unknown> {
  return asRecord(asRecord(template.metadata).task);
}

function getTemplateTimer(template: TrainingTemplateSummary): TrainingTemplateExerciseTimer | null {
  const timer = asRecord(asRecord(template.metadata).timer);
  return typeof timer.activeSeconds === 'number' ? timer as unknown as TrainingTemplateExerciseTimer : null;
}

function getTemplateMediaUrls(template: TrainingTemplateSummary): string[] {
  const urls = new Set<string>();
  getTaskConfigMediaUrls(getTemplateTaskConfig(template)).forEach((url) => urls.add(url));
  template.items.forEach((item) => {
    const config = asRecord(item.config);
    getTaskConfigMediaUrls(config.task).forEach((url) => urls.add(url));
  });
  return Array.from(urls);
}

function formatExerciseTimer(timer: TrainingTemplateExerciseTimer | null): string | null {
  if (!timer) return null;
  return `${timer.rounds} rounds · ${timer.activeSeconds}s work · ${timer.restSeconds}s rest`;
}

function buildTaskConfigPayload(title: string, description: string | null, config: TaskConfigDraft): TrainingTemplateTaskConfig {
  const videoPayload = buildTaskVideoPayload(config.videoUrls);
  const mediaNamePayload = buildTaskMediaNamePayload(config.mediaNames, videoPayload.videoUrls);

  return {
    title,
    description,
    categoryIds: Array.from(new Set(config.categoryIds.filter(Boolean))),
    subtasks: [],
    videoUrl: videoPayload.videoUrl,
    videoUrls: videoPayload.videoUrls,
    mediaNames: mediaNamePayload.mediaNames,
    reminderMinutes: config.reminderEnabled ? clampNumber(parseNonNegativeInt(config.reminderMinutes), 0, 0, 1440) : null,
    afterTrainingEnabled: config.feedbackEnabled,
    afterTrainingDelayMinutes: config.feedbackEnabled ? clampNumber(parseNonNegativeInt(config.feedbackDelayMinutes), 0, 0, 240) : null,
    afterTrainingFeedbackEnableScore: true,
    afterTrainingFeedbackScoreExplanation: config.feedbackEnabled ? config.feedbackScoreExplanation.trim() || null : null,
    afterTrainingFeedbackEnableIntensity: config.feedbackEnabled,
    afterTrainingFeedbackEnableNote: true,
    taskDurationEnabled: false,
    taskDurationMinutes: null,
    autoAddToActivities: config.autoAddToActivities,
  };
}

function buildTaskConfigPayloadFromTemplate(
  template: TrainingTemplateSummary,
  title: string,
  description: string | null
): TrainingTemplateTaskConfig {
  const metadata = asRecord(template.metadata);
  const taskRecord = asRecord(metadata.task);
  const draft = createTaskConfigDraftFromConfig(taskRecord);
  const payload = buildTaskConfigPayload(title, description, draft);
  const categoryIds = Array.isArray(taskRecord.categoryIds)
    ? taskRecord.categoryIds.filter((id): id is string => typeof id === 'string')
    : [];
  return {
    ...payload,
    categoryIds,
  };
}

function buildTaskConfigPayloadFromLibraryItem(
  item: TrainingTemplateLibraryItem,
  title: string,
  description: string | null
): TrainingTemplateTaskConfig {
  return buildTaskConfigPayload(title, description, createTaskConfigDraftFromLibraryItem(item));
}

function buildExerciseTimerPayload(config: ExerciseTimerDraft): TrainingTemplateExerciseTimer {
  return {
    activeSeconds: clampNumber(parsePositiveInt(config.activeSeconds), DEFAULT_EXERCISE_TIMER.activeSeconds, 5, 3600),
    restSeconds: clampNumber(parseNonNegativeInt(config.restSeconds), DEFAULT_EXERCISE_TIMER.restSeconds, 0, 1800),
    rounds: clampNumber(parsePositiveInt(config.rounds), DEFAULT_EXERCISE_TIMER.rounds, 1, 99),
  };
}

function getTaskConfigFromItem(item: DraftItem): TrainingTemplateTaskConfig | null {
  const config = asRecord(item.config);
  const task = asRecord(config.task);
  return task.title ? task as unknown as TrainingTemplateTaskConfig : null;
}

function getExerciseTimerFromItem(item: DraftItem): TrainingTemplateExerciseTimer | null {
  const config = asRecord(item.config);
  const timer = asRecord(config.timer);
  return typeof timer.activeSeconds === 'number' ? timer as unknown as TrainingTemplateExerciseTimer : null;
}

function getTaskMediaLabel(url: string): string {
  const mediaType = getTaskMediaType(url);
  if (mediaType === 'image') return 'Image';
  if (mediaType === 'pdf') return 'PDF';
  if (mediaType === 'video') return 'Video';
  return 'Media';
}

type TaskConfigUpdate = TaskConfigDraft | ((current: TaskConfigDraft) => TaskConfigDraft);

function templateTypeLabel(type: TrainingTemplateType): string {
  return TEMPLATE_TYPES.find((item) => item.value === type)?.label ?? type;
}

function getTemplateTone(type: TrainingTemplateType, colors: ReturnType<typeof getColors>): string {
  if (type === 'week') return colors.accent;
  if (type === 'session') return colors.secondary;
  if (type === 'exercise') return colors.warning;
  return colors.primary;
}

function getTemplateSourceKind(template: TrainingTemplateSummary, actorUserId: string | null): Exclude<TemplateSourceFilter, 'all'> {
  return actorUserId && template.createdBy === actorUserId ? 'mine' : 'workspace';
}

function getTemplateCategoryItems(
  template: TrainingTemplateSummary,
  categories: TemplateCategoryOption[],
): TemplateCategoryOption[] {
  const task = getTemplateTaskConfig(template);
  const rawCategoryIds = task.categoryIds ?? task.category_ids;
  if (!Array.isArray(rawCategoryIds)) return [];
  const selectedIds = new Set(
    rawCategoryIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
  );
  return categories.filter((category) => selectedIds.has(category.id));
}

function getTemplateFacts(
  template: TrainingTemplateSummary,
  timer: TrainingTemplateExerciseTimer | null = getTemplateTimer(template),
  categories: TemplateCategoryOption[] = [],
): { label: string; value: string }[] {
  const task = getTemplateTaskConfig(template);
  const rawCategoryIds = task.categoryIds ?? task.category_ids;
  const categoryIds = Array.isArray(rawCategoryIds)
    ? rawCategoryIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  const categoryNames = getTemplateCategoryItems(template, categories)
    .map((category) => `${category.emoji ? `${category.emoji} ` : ''}${category.name}`.trim());
  const categoryLabel = categoryNames.length
    ? categoryNames.join(', ')
    : template.defaultActivityCategoryName?.trim() || (categoryIds.length ? `${categoryIds.length} selected` : null);

  if (template.templateType === 'session' || template.templateType === 'week') {
    return [
      { label: template.templateType === 'week' ? 'Sessions' : 'Items', value: String(template.itemCount) },
      { label: 'Category', value: categoryLabel },
    ].filter((item): item is { label: string; value: string } => typeof item.value === 'string' && item.value.length > 0);
  }

  const durationEnabled = task.taskDurationEnabled === true || task.task_duration_enabled === true;
  const rawDurationMinutes = task.taskDurationMinutes ?? task.task_duration_minutes;
  const durationMinutes = rawDurationMinutes === null || rawDurationMinutes === undefined || rawDurationMinutes === ''
    ? null
    : Number(rawDurationMinutes);
  const rawReminderMinutes = task.reminderMinutes ?? task.reminder ?? task.reminder_minutes;
  const reminderMinutes = rawReminderMinutes === null || rawReminderMinutes === undefined || rawReminderMinutes === ''
    ? null
    : Number(rawReminderMinutes);
  const feedbackEnabled = task.afterTrainingEnabled === true || task.after_training_enabled === true;
  const rawFeedbackDelayMinutes = task.afterTrainingDelayMinutes ?? task.after_training_delay_minutes;
  const feedbackDelayMinutes = rawFeedbackDelayMinutes === null || rawFeedbackDelayMinutes === undefined || rawFeedbackDelayMinutes === ''
    ? null
    : Number(rawFeedbackDelayMinutes);
  const autoAdd = task.autoAddToActivities === true || task.auto_add_to_activities === true;

  return [
    { label: 'Category', value: categoryLabel ?? 'None' },
    { label: 'Auto-add', value: autoAdd ? 'On' : 'Off' },
    {
      label: 'Task duration',
      value: durationEnabled && durationMinutes !== null && Number.isFinite(durationMinutes) && durationMinutes > 0
        ? `${durationMinutes} min`
        : 'Not set',
    },
    {
      label: 'Reminder',
      value: reminderMinutes !== null && Number.isFinite(reminderMinutes) && reminderMinutes >= 0
        ? `${reminderMinutes} min before`
        : 'Off',
    },
    {
      label: 'Feedback',
      value: feedbackEnabled
        ? feedbackDelayMinutes !== null && Number.isFinite(feedbackDelayMinutes) && feedbackDelayMinutes > 0
          ? `${feedbackDelayMinutes} min after`
          : 'After activity'
        : 'Off',
    },
    { label: 'Timer', value: formatExerciseTimer(timer) },
  ].filter((item): item is { label: string; value: string } => typeof item.value === 'string' && item.value.length > 0);
}

function buildTemplateFocusTagOptions(templates: TrainingTemplateSummary[]): TemplateFocusTagOption[] {
  const byKey = new Map<string, TemplateFocusTagOption>();
  templates.forEach((template) => {
    normalizeFocusTags(template.focusAreas).forEach((tag) => {
      const key = normalizeFocusTagKey(tag);
      const current = byKey.get(key);
      if (current) {
        current.count += 1;
      } else {
        byKey.set(key, { value: tag, label: tag, count: 1 });
      }
    });
  });
  return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function buildTemplateSourceFilterOptions(
  templates: TrainingTemplateSummary[],
  actorUserId: string | null
): PlanSourceFilterOption[] {
  const mine = templates.filter((template) => getTemplateSourceKind(template, actorUserId) === 'mine').length;
  const workspace = templates.length - mine;
  const options: PlanSourceFilterOption[] = [{ value: 'all', label: 'All', count: templates.length }];
  if (mine > 0) options.push({ value: 'mine', label: 'My', count: mine });
  if (workspace > 0) options.push({ value: 'workspace', label: 'Workspace', count: workspace });
  return options;
}

function createEmptyDraft(type: TrainingTemplateType = 'session'): TemplateDraft {
  return {
    id: null,
    templateType: type,
    title: '',
    description: '',
    folderId: null,
    focusInput: '',
    defaultActivityCategoryName: '',
    taskConfig: createEmptyTaskConfigDraft(),
    exerciseTimer: createEmptyExerciseTimerDraft(),
    status: 'active',
    items: [],
  };
}

function createDraftFromTemplate(template: TrainingTemplateSummary): TemplateDraft {
  const metadata = asRecord(template.metadata);
  return {
    id: template.id,
    templateType: template.templateType,
    title: template.title,
    description: template.description ?? '',
    folderId: template.folderId,
    focusInput: buildFocusInputFromTags(template.focusAreas),
    defaultActivityCategoryName: template.defaultActivityCategoryName ?? '',
    taskConfig: createTaskConfigDraftFromConfig(metadata.task),
    exerciseTimer: createExerciseTimerDraftFromConfig(metadata.timer),
    status: template.status,
    items: template.items.map((item) => ({
      localId: item.id,
      id: item.id,
      parentItemId: item.parentItemId,
      itemType: item.itemType,
      sourceTaskTemplateId: item.sourceTaskTemplateId,
      sourceActivitySeriesId: item.sourceActivitySeriesId,
      linkedTemplateId: item.linkedTemplateId,
      title: item.title,
      description: item.description,
      dayOffset: template.templateType === 'session' ? 0 : item.dayOffset,
      startTime: null,
      durationMinutes: null,
      sortOrder: item.sortOrder,
      config: item.config,
    })),
  };
}

export default function PlanScreen() {
  const colorScheme = useColorScheme();
  const colors = getColors(colorScheme);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const footballData = useFootball() as any;
  const { userRole, loading: roleLoading } = useUserRole();
  const [context, setContext] = useState<{ workspaces: OwnerPlayerCrmWorkspace[]; defaultOwnerAccountId: string | null } | null>(null);
  const [activeOwnerAccountId, setActiveOwnerAccountId] = useState<string | null>(null);
  const [payload, setPayload] = useState<Awaited<ReturnType<typeof fetchOwnerTrainingTemplates>> | null>(null);
  const [activeSection, setActiveSection] = useState<PlanSection>('tasks');
  const [statusFilter, setStatusFilter] = useState<TemplateStatusFilter>('active');
  const [selectedTemplateTypes, setSelectedTemplateTypes] = useState<TrainingTemplateType[]>([]);
  const [planFilterPicker, setPlanFilterPicker] = useState<PlanFilterPicker>(null);
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  const [templateSourceFilter, setTemplateSourceFilter] = useState<TemplateSourceFilter>('all');
  const [templateFocusTagFilter, setTemplateFocusTagFilter] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createPickerVisible, setCreatePickerVisible] = useState(false);
  const [draftVisible, setDraftVisible] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft>(() => createEmptyDraft());
  const [itemTitle, setItemTitle] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemType, setItemType] = useState<DraftItem['itemType']>('task_template');
  const [itemDayOffset, setItemDayOffset] = useState('');
  const [itemTaskConfig, setItemTaskConfig] = useState<TaskConfigDraft>(() => createEmptyTaskConfigDraft());
  const [itemExerciseTimer, setItemExerciseTimer] = useState<ExerciseTimerDraft>(() => createEmptyExerciseTimerDraft());
  const [itemSourceMode, setItemSourceMode] = useState<ItemSourceMode>('new');
  const [selectedReusableTemplateId, setSelectedReusableTemplateId] = useState<string | null>(null);
  const [selectedLibraryItemId, setSelectedLibraryItemId] = useState<string | null>(null);
  const [itemPickerMode, setItemPickerMode] = useState<ItemPickerMode>(null);
  const [focusTagInput, setFocusTagInput] = useState('');
  const [uploadingTemplateMedia, setUploadingTemplateMedia] = useState(false);
  const [uploadingItemMedia, setUploadingItemMedia] = useState(false);
  const { user } = useAuthSession();

  const canAccessPlan = userRole === 'admin' || userRole === 'trainer';
  const contextCategories = footballData?.categories;
  const templateCategories = useMemo<TemplateCategoryOption[]>(() => {
    const seen = new Set<string>();
    return ((contextCategories ?? []) as any[]).reduce<TemplateCategoryOption[]>((acc, category) => {
      const id = String(category?.id ?? '').trim();
      if (!id || seen.has(id)) return acc;
      seen.add(id);
      acc.push({
        id,
        name: String(category?.name ?? ''),
        color: category?.color || colors.primary,
        emoji: String(category?.emoji ?? ''),
      });
      return acc;
    }, []);
  }, [colors.primary, contextCategories]);

  const activeWorkspace = useMemo(
    () => context?.workspaces.find((workspace) => workspace.ownerAccountId === activeOwnerAccountId) ?? null,
    [activeOwnerAccountId, context?.workspaces]
  );

  const loadContext = useCallback(async () => {
    const next = await fetchOwnerTrainingTemplatesContext();
    setContext(next);
    setActiveOwnerAccountId((current) => {
      if (current && next.workspaces.some((workspace) => workspace.ownerAccountId === current)) {
        return current;
      }
      return next.defaultOwnerAccountId ?? next.workspaces[0]?.ownerAccountId ?? null;
    });
  }, []);

  const loadTemplates = useCallback(async (ownerAccountId: string) => {
    const next = await fetchOwnerTrainingTemplates(ownerAccountId);
    setPayload(next);
    setError(null);
  }, []);

  useEffect(() => {
    if (roleLoading) return;
    if (!canAccessPlan) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    loadContext()
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load plan context.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canAccessPlan, loadContext, roleLoading]);

  useEffect(() => {
    if (!activeOwnerAccountId || !canAccessPlan) return;
    void loadTemplates(activeOwnerAccountId).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Could not load templates.');
    });
  }, [activeOwnerAccountId, canAccessPlan, loadTemplates]);

  const templates = useMemo(() => {
    const supportsArchive = selectedTemplateTypes.length === 1 && ['task', 'exercise'].includes(selectedTemplateTypes[0]);
    const effectiveStatusFilter = supportsArchive ? statusFilter : 'active';
    return (payload?.templates ?? []).filter((template) => {
      if (template.status !== effectiveStatusFilter) return false;
      if (selectedTemplateTypes.length && !selectedTemplateTypes.includes(template.templateType)) return false;
      return true;
    });
  }, [payload?.templates, selectedTemplateTypes, statusFilter]);
  const templateViewSupportsArchive =
    activeSection === 'templates' &&
    selectedTemplateTypes.length === 1 &&
    ['task', 'exercise'].includes(selectedTemplateTypes[0]);
  const selectedTypeLabel = selectedTemplateTypes.length
    ? selectedTemplateTypes.map((value) => templateTypeLabel(value)).join(', ')
    : 'All types';
  const assignmentTemplates = useMemo(
    () => (payload?.templates ?? []).filter((template) => template.status === 'active'),
    [payload?.templates]
  );
  const currentPlanTemplates = activeSection === 'assignments' ? assignmentTemplates : templates;
  const actorUserId = payload?.actor.userId ?? user?.id ?? null;
  const searchedPlanTemplates = useMemo(() => {
    const q = templateSearchQuery.trim().toLowerCase();
    if (!q) return currentPlanTemplates;
    return currentPlanTemplates.filter((template) => {
      const haystack = [
        template.title,
        template.description ?? '',
        template.folderName ?? '',
        template.defaultActivityCategoryName ?? '',
        templateTypeLabel(template.templateType),
        ...template.focusAreas,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [currentPlanTemplates, templateSearchQuery]);
  const templateSourceOptions = useMemo(
    () => buildTemplateSourceFilterOptions(searchedPlanTemplates, actorUserId),
    [actorUserId, searchedPlanTemplates]
  );
  const effectiveTemplateSourceFilter = templateSourceOptions.some((option) => option.value === templateSourceFilter)
    ? templateSourceFilter
    : 'all';
  const sourceFilteredPlanTemplates = useMemo(() => {
    if (effectiveTemplateSourceFilter === 'all') return searchedPlanTemplates;
    return searchedPlanTemplates.filter((template) => getTemplateSourceKind(template, actorUserId) === effectiveTemplateSourceFilter);
  }, [actorUserId, effectiveTemplateSourceFilter, searchedPlanTemplates]);
  const templateFocusTagOptions = useMemo(
    () => buildTemplateFocusTagOptions(sourceFilteredPlanTemplates),
    [sourceFilteredPlanTemplates]
  );
  const effectiveTemplateFocusTagFilter = useMemo(() => {
    const availableKeys = new Set(templateFocusTagOptions.map((option) => normalizeFocusTagKey(option.value)));
    return templateFocusTagFilter.filter((tag) => availableKeys.has(normalizeFocusTagKey(tag)));
  }, [templateFocusTagFilter, templateFocusTagOptions]);
  const visiblePlanTemplates = useMemo(() => {
    if (!effectiveTemplateFocusTagFilter.length) return sourceFilteredPlanTemplates;
    const selectedKeys = new Set(effectiveTemplateFocusTagFilter.map(normalizeFocusTagKey));
    return sourceFilteredPlanTemplates.filter((template) =>
      normalizeFocusTags(template.focusAreas).some((tag) => selectedKeys.has(normalizeFocusTagKey(tag)))
    );
  }, [effectiveTemplateFocusTagFilter, sourceFilteredPlanTemplates]);
  const allFocusTags = useMemo(
    () => buildTemplateFocusTagOptions(payload?.templates ?? []).map((option) => option.value),
    [payload?.templates]
  );

  const allowedItemTypes = useMemo(
    () => ITEM_TYPES.filter((type) => ITEM_TYPES_BY_TEMPLATE[draft.templateType].includes(type.value)),
    [draft.templateType]
  );

  const reusableTemplateType =
    itemType === 'task_template' ? 'task' : itemType === 'exercise' ? 'exercise' : itemType === 'session_template' ? 'session' : null;
  const reusableTemplates = useMemo(
    () =>
      reusableTemplateType
        ? (payload?.templates ?? []).filter(
            (template) => template.status === 'active' && template.templateType === reusableTemplateType
          )
        : [],
    [payload?.templates, reusableTemplateType]
  );
  const libraryItems = useMemo(() => payload?.libraryItems ?? [], [payload?.libraryItems]);
  const selectedReusableTemplate = useMemo(
    () => reusableTemplates.find((template) => template.id === selectedReusableTemplateId) ?? null,
    [reusableTemplates, selectedReusableTemplateId]
  );
  const selectedLibraryItem = useMemo(
    () => libraryItems.find((item) => item.id === selectedLibraryItemId) ?? null,
    [libraryItems, selectedLibraryItemId]
  );
  const itemUsesLibrarySource = itemType === 'task_template' || itemType === 'exercise';
  const itemSourceOptions = useMemo<{ value: ItemSourceMode; label: string }[]>(() => {
    if (itemType === 'session_template') return [{ value: 'saved', label: 'Saved' }];
    if (itemUsesLibrarySource) {
      return [
        { value: 'new', label: 'New' },
        { value: 'saved', label: 'Saved' },
        { value: 'library', label: 'Library' },
      ];
    }
    return [];
  }, [itemType, itemUsesLibrarySource]);
  const itemUsesReusableSource = itemSourceOptions.length > 0;
  const canAddItem =
    reusableTemplateType && itemSourceMode === 'saved'
      ? Boolean(selectedReusableTemplate)
      : itemUsesLibrarySource && itemSourceMode === 'library'
        ? Boolean(selectedLibraryItem)
        : Boolean(itemTitle.trim());

  const resetItemDraft = useCallback((templateType: TrainingTemplateType = 'session') => {
    const defaultItemType = getDefaultItemType(templateType);
    setItemTitle('');
    setItemDescription('');
    setItemType(defaultItemType);
    setItemDayOffset('');
    setItemTaskConfig(createEmptyTaskConfigDraft());
    setItemExerciseTimer(createEmptyExerciseTimerDraft());
    setItemSourceMode(defaultItemType === 'session_template' ? 'saved' : 'new');
    setSelectedReusableTemplateId(null);
    setSelectedLibraryItemId(null);
    setItemPickerMode(null);
  }, []);

  const openCreate = useCallback((type: TrainingTemplateType = 'session') => {
    setDraft(createEmptyDraft(type));
    setFocusTagInput('');
    resetItemDraft(type);
    setDraftVisible(true);
  }, [resetItemDraft]);

  const openCreateFromPicker = useCallback((type: TrainingTemplateType) => {
    setCreatePickerVisible(false);
    openCreate(type);
  }, [openCreate]);

  const selectPlanViewTarget = useCallback((target: (typeof PLAN_VIEW_TARGETS)[number]) => {
    setPlanFilterPicker(null);
    setTemplateSourceFilter('all');
    setTemplateFocusTagFilter([]);
    if (target.value === 'tasks') {
      setActiveSection('tasks');
      setSelectedTemplateTypes([]);
      return;
    }
    if (target.value === 'assignments') {
      setActiveSection('assignments');
      setSelectedTemplateTypes([]);
      return;
    }
    if (target.templateType) {
      setActiveSection('templates');
      setStatusFilter('active');
      setSelectedTemplateTypes([target.templateType]);
    }
  }, []);

  const openEdit = useCallback((template: TrainingTemplateSummary) => {
    setDraft(createDraftFromTemplate(template));
    setFocusTagInput('');
    resetItemDraft(template.templateType);
    setDraftVisible(true);
  }, [resetItemDraft]);

  const toggleTemplateFocusTagFilter = useCallback((tag: string) => {
    const key = normalizeFocusTagKey(tag);
    setTemplateFocusTagFilter((current) =>
      current.some((selected) => normalizeFocusTagKey(selected) === key)
        ? current.filter((selected) => normalizeFocusTagKey(selected) !== key)
        : [...current, tag]
    );
  }, []);

  const updateDraftFocusTags = useCallback((tags: string[]) => {
    setDraft((current) => ({ ...current, focusInput: buildFocusInputFromTags(tags) }));
  }, []);

  const addDraftFocusTag = useCallback((tag: string) => {
    const normalized = tag.trim();
    if (!normalized) return;
    const currentTags = normalizeFocusInput(draft.focusInput);
    const exists = currentTags.some((item) => normalizeFocusTagKey(item) === normalizeFocusTagKey(normalized));
    if (!exists) {
      updateDraftFocusTags([...currentTags, normalized]);
    }
    setFocusTagInput('');
  }, [draft.focusInput, updateDraftFocusTags]);

  const removeDraftFocusTag = useCallback((tag: string) => {
    updateDraftFocusTags(
      normalizeFocusInput(draft.focusInput).filter((item) => normalizeFocusTagKey(item) !== normalizeFocusTagKey(tag))
    );
  }, [draft.focusInput, updateDraftFocusTags]);

  const onRefresh = useCallback(async () => {
    if (!activeOwnerAccountId) return;
    setRefreshing(true);
    try {
      await loadTemplates(activeOwnerAccountId);
    } finally {
      setRefreshing(false);
    }
  }, [activeOwnerAccountId, loadTemplates]);

  const changeDraftTemplateType = useCallback((templateType: TrainingTemplateType) => {
    setDraft((current) => {
      const allowed = new Set(ITEM_TYPES_BY_TEMPLATE[templateType]);
      return {
        ...current,
        templateType,
        defaultActivityCategoryName: templateType === 'session' ? current.defaultActivityCategoryName : '',
        status: templateType === 'task' || templateType === 'exercise' ? current.status : 'active',
        items: current.items
          .filter((item) => allowed.has(item.itemType))
          .map((item, sortOrder) => ({
            ...item,
            dayOffset: templateType === 'session' ? 0 : item.dayOffset,
            startTime: null,
            durationMinutes: null,
            sortOrder,
          })),
      };
    });
    resetItemDraft(templateType);
  }, [resetItemDraft]);

  const changeItemType = useCallback((nextItemType: DraftItem['itemType']) => {
    setItemType(nextItemType);
    setItemSourceMode(nextItemType === 'session_template' ? 'saved' : 'new');
    setSelectedReusableTemplateId(null);
    setSelectedLibraryItemId(null);
    setItemPickerMode(null);
  }, []);

  const changeItemSourceMode = useCallback((nextSourceMode: ItemSourceMode) => {
    if (itemType === 'session_template' && nextSourceMode !== 'saved') return;
    setItemSourceMode(nextSourceMode);
    setSelectedReusableTemplateId(null);
    setSelectedLibraryItemId(null);
    setItemPickerMode(nextSourceMode === 'saved' || nextSourceMode === 'library' ? nextSourceMode : null);
  }, [itemType]);

  const addDraftItem = useCallback(() => {
    if (!ITEM_TYPES_BY_TEMPLATE[draft.templateType].includes(itemType)) return;
    const usingReusableSource = Boolean(reusableTemplateType) && itemSourceMode === 'saved';
    const usingLibrarySource = itemUsesLibrarySource && itemSourceMode === 'library';
    const reusableTemplate = usingReusableSource ? selectedReusableTemplate : null;
    const libraryItem = usingLibrarySource ? selectedLibraryItem : null;
    if (usingReusableSource && !reusableTemplate) {
      Alert.alert('Choose template', `Select a saved ${reusableTemplateType ?? 'template'} template first.`);
      return;
    }
    if (usingLibrarySource && !libraryItem) {
      Alert.alert('Choose library item', 'Select a library exercise first.');
      return;
    }

    const fallbackTitle = reusableTemplate?.title ?? libraryItem?.title ?? '';
    const title = itemTitle.trim() || fallbackTitle;
    if (!title) return;
    const description = itemDescription.trim() || reusableTemplate?.description || libraryItem?.description || null;
    const config: Record<string, unknown> = {};
    if (itemType === 'task_template' || itemType === 'exercise') {
      if (reusableTemplate) {
        config.task = buildTaskConfigPayloadFromTemplate(reusableTemplate, title, description);
        config.source = { kind: 'saved_template', templateId: reusableTemplate.id };
      } else if (libraryItem) {
        config.task = buildTaskConfigPayloadFromLibraryItem(libraryItem, title, description);
        config.libraryExerciseId = libraryItem.id;
        config.source = { kind: 'exercise_library', libraryExerciseId: libraryItem.id };
      } else {
        config.task = buildTaskConfigPayload(title, description, itemTaskConfig);
        config.source = { kind: 'inline_template_item' };
      }
    }
    if (itemType === 'exercise') {
      const templateMetadata = reusableTemplate ? asRecord(reusableTemplate.metadata) : {};
      const templateTimer = reusableTemplate ? asRecord(templateMetadata.timer) : {};
      config.timer = reusableTemplate && typeof templateTimer.activeSeconds === 'number'
        ? templateTimer
        : buildExerciseTimerPayload(itemExerciseTimer);
    }
    if (itemType === 'session_template' && reusableTemplate) {
      config.source = { kind: 'saved_template', templateId: reusableTemplate.id };
    }

    setDraft((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          localId: createLocalId(),
          itemType,
          linkedTemplateId: reusableTemplate?.id ?? null,
          title,
          description,
          dayOffset: draft.templateType === 'week' ? parsePositiveInt(itemDayOffset) ?? 0 : 0,
          startTime: null,
          durationMinutes: null,
          sortOrder: current.items.length,
          config,
        },
      ],
    }));
    resetItemDraft(draft.templateType);
  }, [
    draft.templateType,
    itemDayOffset,
    itemDescription,
    itemExerciseTimer,
    itemSourceMode,
    itemTaskConfig,
    itemTitle,
    itemType,
    itemUsesLibrarySource,
    resetItemDraft,
    reusableTemplateType,
    selectedLibraryItem,
    selectedReusableTemplate,
  ]);

  const moveDraftItem = useCallback((localId: string, direction: -1 | 1) => {
    setDraft((current) => {
      const index = current.items.findIndex((item) => item.localId === localId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.items.length) return current;
      const items = [...current.items];
      const [item] = items.splice(index, 1);
      items.splice(nextIndex, 0, item);
      return {
        ...current,
        items: items.map((nextItem, sortOrder) => ({ ...nextItem, sortOrder })),
      };
    });
  }, []);

  const removeDraftItem = useCallback((localId: string) => {
    setDraft((current) => ({
      ...current,
      items: current.items
        .filter((item) => item.localId !== localId)
        .map((item, sortOrder) => ({ ...item, sortOrder })),
    }));
  }, []);

  const saveDraft = useCallback(async () => {
    if (!activeOwnerAccountId || saving) return;
    const title = draft.title.trim();
    if (!title) {
      Alert.alert('Missing title', 'Give the template a title before saving.');
      return;
    }
    setSaving(true);
    try {
      const taskConfig = draft.templateType === 'task' || draft.templateType === 'exercise'
        ? buildTaskConfigPayload(title, draft.description.trim() || null, draft.taskConfig)
        : null;
      const exerciseTimer = draft.templateType === 'exercise' ? buildExerciseTimerPayload(draft.exerciseTimer) : null;
      const allowed = new Set(ITEM_TYPES_BY_TEMPLATE[draft.templateType]);
      const next = await saveOwnerTrainingTemplate({
        id: draft.id,
        ownerAccountId: activeOwnerAccountId,
        templateType: draft.templateType,
        title,
        description: draft.description.trim() || null,
        folderId: draft.folderId,
        focusAreas: normalizeFocusInput(draft.focusInput),
        metadata: undefined,
        sessionStartTime: null,
        durationMinutes: null,
        defaultActivityCategoryName: draft.templateType === 'session' ? draft.defaultActivityCategoryName.trim() || null : null,
        status: draft.templateType === 'task' || draft.templateType === 'exercise' ? draft.status : 'active',
        taskConfig,
        exerciseTimer,
        items: draft.templateType === 'task' || draft.templateType === 'exercise'
          ? []
          : draft.items
              .filter((item) => allowed.has(item.itemType))
              .map((item, sortOrder) => ({
                ...item,
                dayOffset: draft.templateType === 'session' ? 0 : item.dayOffset,
                startTime: null,
                durationMinutes: null,
                sortOrder,
              })),
        changeNote: draft.id ? 'Mobile edit' : 'Mobile create',
      });
      setPayload(next);
      setDraftVisible(false);
      setError(null);
    } catch (saveError) {
      Alert.alert('Template not saved', saveError instanceof Error ? saveError.message : 'Could not save the template.');
    } finally {
      setSaving(false);
    }
  }, [activeOwnerAccountId, draft, saving]);

  const duplicateTemplate = useCallback(async (template: TrainingTemplateSummary) => {
    if (!activeOwnerAccountId) return;
    setSaving(true);
    try {
      const next = await duplicateOwnerTrainingTemplate({ ownerAccountId: activeOwnerAccountId, templateId: template.id });
      setPayload(next);
    } catch (duplicateError) {
      Alert.alert('Template not duplicated', duplicateError instanceof Error ? duplicateError.message : 'Could not duplicate template.');
    } finally {
      setSaving(false);
    }
  }, [activeOwnerAccountId]);

  const toggleArchive = useCallback(async (template: TrainingTemplateSummary) => {
    if (!activeOwnerAccountId) return;
    setSaving(true);
    try {
      const next =
        template.status === 'archived'
          ? await restoreOwnerTrainingTemplate({ ownerAccountId: activeOwnerAccountId, templateId: template.id })
          : await archiveOwnerTrainingTemplate({ ownerAccountId: activeOwnerAccountId, templateId: template.id });
      setPayload(next);
    } catch (archiveError) {
      Alert.alert('Template not updated', archiveError instanceof Error ? archiveError.message : 'Could not update template.');
    } finally {
      setSaving(false);
    }
  }, [activeOwnerAccountId]);

  const openAssignTemplate = useCallback((template: TrainingTemplateSummary) => {
    Alert.alert(
      'Assign template',
      `The Assign button is ready on the card. The final assignment flow for "${template.title}" requires the backend link that materializes this ${templateTypeLabel(template.templateType).toLowerCase()} into the player calendar.`,
    );
  }, []);

  const updateDraftTaskConfig = useCallback((update: TaskConfigUpdate) => {
    setDraft((current) => ({
      ...current,
      taskConfig: typeof update === 'function' ? update(current.taskConfig) : update,
    }));
  }, []);

  const addTaskMediaLink = useCallback((scope: 'template' | 'item') => {
    const updateConfig = scope === 'template' ? updateDraftTaskConfig : setItemTaskConfig;
    updateConfig((current) => {
      const url = current.videoUrlInput.trim();
      if (!url || !isTaskMediaUrl(url)) {
        Alert.alert('Invalid media', 'Use a video, image, or PDF link.');
        return current;
      }
      const nextMedia = mergeTaskMedia(current.videoUrls, current.mediaNames, url, current.mediaNameInput);
      return {
        ...current,
        videoUrls: nextMedia.urls,
        mediaNames: nextMedia.names,
        videoUrlInput: '',
        mediaNameInput: '',
      };
    });
  }, [updateDraftTaskConfig]);

  const pickTaskMedia = useCallback(async (scope: 'template' | 'item') => {
    if (!user?.id) {
      Alert.alert('Upload unavailable', 'You must be logged in to upload files.');
      return;
    }

    const updateConfig = scope === 'template' ? updateDraftTaskConfig : setItemTaskConfig;
    const setUploading = scope === 'template' ? setUploadingTemplateMedia : setUploadingItemMedia;
    setUploading(true);
    try {
      const uploadedMedia = await pickAndUploadTaskMedia(user.id);
      if (!uploadedMedia) return;
      updateConfig((current) => {
        const nextMedia = mergeTaskMedia(
          current.videoUrls,
          current.mediaNames,
          uploadedMedia.publicUrl,
          current.mediaNameInput || getTaskMediaNameFromFileName(uploadedMedia.fileName)
        );
        return {
          ...current,
          videoUrls: nextMedia.urls,
          mediaNames: nextMedia.names,
          mediaNameInput: '',
        };
      });
      Alert.alert('File uploaded', 'The file has been added.');
    } catch (uploadError) {
      Alert.alert('Upload failed', uploadError instanceof Error ? uploadError.message : 'Could not upload file.');
    } finally {
      setUploading(false);
    }
  }, [updateDraftTaskConfig, user?.id]);

  const removeTaskMedia = useCallback((scope: 'template' | 'item', index: number) => {
    const updateConfig = scope === 'template' ? updateDraftTaskConfig : setItemTaskConfig;
    updateConfig((current) => {
      const nextMedia = removeTaskMediaAt(current.videoUrls, current.mediaNames, index);
      return {
        ...current,
        videoUrls: nextMedia.urls,
        mediaNames: nextMedia.names,
      };
    });
  }, [updateDraftTaskConfig]);

  const activePlanViewLabel =
    activeSection === 'tasks'
      ? 'Tasks'
      : activeSection === 'assignments'
        ? 'Assignments'
        : selectedTemplateTypes.length
          ? selectedTypeLabel
          : 'All types';
  const currentTemplateViewTitle =
    activeSection === 'assignments'
      ? 'Assignments'
      : selectedTemplateTypes.length === 1
        ? templateTypeLabel(selectedTemplateTypes[0])
        : 'Templates';
  const currentTemplateViewDetail =
    activeSection === 'assignments'
      ? 'Templates ready to assign'
      : selectedTemplateTypes.length === 1
        ? `${templateTypeLabel(selectedTemplateTypes[0])} templates`
        : 'All templates';

  if (roleLoading || loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!canAccessPlan) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={30} color={colors.textSecondary} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Coach access required</Text>
      </View>
    );
  }

  const renderPlanChrome = () => (
    <>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: colors.text }]}>Plan</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {activeWorkspace?.name ?? payload?.ownerAccount.name ?? 'Owner workspace'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.headerIconButton, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => router.push('/(tabs)/profile' as any)}
            activeOpacity={0.84}
            accessibilityLabel="Open profile and settings"
            testID="plan.profileButton"
          >
            <IconSymbol ios_icon_name="person.crop.circle" android_material_icon_name="account_circle" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {context && context.workspaces.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.workspaceRow}>
          {context.workspaces.map((workspace) => {
            const active = workspace.ownerAccountId === activeOwnerAccountId;
            return (
              <TouchableOpacity
                key={workspace.ownerAccountId}
                style={[
                  styles.workspaceChip,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary : colors.card,
                  },
                ]}
                onPress={() => setActiveOwnerAccountId(workspace.ownerAccountId)}
                activeOpacity={0.84}
              >
                <Text style={[styles.workspaceText, { color: active ? '#FFFFFF' : colors.text }]} numberOfLines={1}>
                  {workspace.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      <TouchableOpacity
        style={[styles.primaryCreateCard, { backgroundColor: colors.primary }]}
        onPress={() => setCreatePickerVisible(true)}
        activeOpacity={0.86}
        accessibilityLabel="Create template"
        testID="plan.create.open"
      >
        <View style={styles.primaryCreateCopy}>
          <Text style={styles.primaryCreateTitle}>Create</Text>
          <Text style={styles.primaryCreateDetail}>Task, exercise, session, or week</Text>
        </View>
        <View style={styles.primaryCreateIcon}>
          <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={22} color={colors.primary} />
        </View>
      </TouchableOpacity>

      <View style={styles.sectionBlock}>
        <PlanFilterSelect
          label="View"
          value={activePlanViewLabel}
          icon="line.3.horizontal.decrease.circle"
          materialIcon="filter_list"
          active={planFilterPicker === 'view'}
          colors={colors}
          onPress={() => setPlanFilterPicker((current) => (current === 'view' ? null : 'view'))}
        />

        {planFilterPicker === 'view' ? (
          <View style={[styles.planFilterPanel, { backgroundColor: colors.card, borderColor: colors.border }]} testID="plan.viewDropdown">
            {PLAN_VIEW_TARGETS.map((section) => {
              const active =
                section.value === 'tasks'
                  ? activeSection === 'tasks'
                  : section.value === 'assignments'
                    ? activeSection === 'assignments'
                    : activeSection === 'templates' &&
                      selectedTemplateTypes.length === 1 &&
                      selectedTemplateTypes[0] === section.templateType;
              return (
                <PlanFilterOption
                  key={section.value}
                  label={section.label}
                  detail={section.detail}
                  active={active}
                  colors={colors}
                  onPress={() => selectPlanViewTarget(section)}
                />
              );
            })}
          </View>
        ) : null}
      </View>

      {error ? (
        <View style={[styles.notice, { borderColor: colors.error, backgroundColor: colors.card }]}>
          <Text style={[styles.noticeTitle, { color: colors.error }]}>Could not load plan</Text>
          <Text style={[styles.noticeText, { color: colors.textSecondary }]}>{error}</Text>
        </View>
      ) : null}
    </>
  );
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]} testID="plan.screen">
      {activeSection === 'tasks' ? (
        <>
          <View style={[styles.embeddedPlanChrome, { paddingTop: Math.max(insets.top, 16) + 10 }]}>
            {renderPlanChrome()}
          </View>
          <TaskLibrarySection embedded />
        </>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 16) + 10 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {renderPlanChrome()}

          {activeSection === 'templates' || activeSection === 'assignments' ? (
            <PlanTemplateLibraryView
              title={currentTemplateViewTitle}
              detail={currentTemplateViewDetail}
              templates={visiblePlanTemplates}
              totalCount={currentPlanTemplates.length}
              searchQuery={templateSearchQuery}
              onSearchChange={setTemplateSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              sourceOptions={templateSourceOptions}
              sourceFilter={effectiveTemplateSourceFilter}
              onSourceFilterChange={setTemplateSourceFilter}
              focusTagOptions={templateFocusTagOptions}
              selectedFocusTags={effectiveTemplateFocusTagFilter}
              onToggleFocusTag={toggleTemplateFocusTagFilter}
              onClearFocusTags={() => setTemplateFocusTagFilter([])}
              actorUserId={actorUserId}
              categories={templateCategories}
              colors={colors}
              onEdit={openEdit}
              onDuplicate={duplicateTemplate}
              onArchive={toggleArchive}
              onAssign={openAssignTemplate}
              showStatusControls={templateViewSupportsArchive}
              busy={saving}
            />
          ) : null}
      </ScrollView>
      )}

      <Modal visible={draftVisible} animationType="slide" onRequestClose={() => !saving && setDraftVisible(false)}>
        <View style={[styles.modalScreen, { backgroundColor: colors.background }]}>
          <ScrollView
            contentContainerStyle={[styles.modalContent, { paddingTop: Math.max(insets.top, 16) + 10 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHeader}>
              <View style={styles.headerCopy}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{draft.id ? 'Edit template' : 'New template'}</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{templateTypeLabel(draft.templateType)}</Text>
              </View>
              <TouchableOpacity
                style={[styles.headerIconButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={() => !saving && setDraftVisible(false)}
                activeOpacity={0.84}
              >
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.typeSelector}>
              {TEMPLATE_TYPES.map((type) => {
                const active = draft.templateType === type.value;
                return (
                  <TouchableOpacity
                    key={type.value}
                    style={[
                      styles.typeButton,
                      {
                        backgroundColor: active ? getTemplateTone(type.value, colors) : colors.card,
                        borderColor: active ? getTemplateTone(type.value, colors) : colors.border,
                      },
                    ]}
                    onPress={() => changeDraftTemplateType(type.value)}
                  >
                    <IconSymbol
                      ios_icon_name={type.icon as any}
                      android_material_icon_name={type.materialIcon as any}
                      size={17}
                      color={active ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text style={[styles.typeButtonText, { color: active ? '#FFFFFF' : colors.text }]}>{type.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <LabeledInput
              label="Title"
              value={draft.title}
              onChangeText={(value) => setDraft((current) => ({ ...current, title: value }))}
              colors={colors}
              placeholder="Finishing week, speed session..."
            />
            <LabeledInput
              label="Description"
              value={draft.description}
              onChangeText={(value) => setDraft((current) => ({ ...current, description: value }))}
              colors={colors}
              placeholder="Purpose, coaching notes, setup..."
              multiline
            />
            <FocusTagEditor
              selectedTags={normalizeFocusInput(draft.focusInput)}
              availableTags={allFocusTags}
              inputValue={focusTagInput}
              onInputChange={setFocusTagInput}
              onAddTag={addDraftFocusTag}
              onRemoveTag={removeDraftFocusTag}
              colors={colors}
            />
            {draft.templateType === 'session' ? (
              <LabeledInput
                label="Default category"
                value={draft.defaultActivityCategoryName}
                onChangeText={(value) => setDraft((current) => ({ ...current, defaultActivityCategoryName: value }))}
                colors={colors}
                placeholder="Training"
              />
            ) : null}

            {draft.templateType === 'task' || draft.templateType === 'exercise' ? (
              <>
                <TaskFieldsEditor
                  title={draft.templateType === 'exercise' ? 'Exercise task fields' : 'Task fields'}
                  config={draft.taskConfig}
                  onChange={updateDraftTaskConfig}
                  colors={colors}
                  uploading={uploadingTemplateMedia}
                  onAddMediaLink={() => addTaskMediaLink('template')}
                  onPickMedia={() => pickTaskMedia('template')}
                  onRemoveMedia={(index) => removeTaskMedia('template', index)}
                  categories={templateCategories}
                />
                {draft.templateType === 'exercise' ? (
                  <ExerciseTimerEditor
                    timer={draft.exerciseTimer}
                    onChange={(update) =>
                      setDraft((current) => ({
                        ...current,
                        exerciseTimer: typeof update === 'function' ? update(current.exerciseTimer) : update,
                      }))
                    }
                    colors={colors}
                  />
                ) : null}
              </>
            ) : (
              <>
                <View style={styles.modalSectionHeader}>
                  <Text style={[styles.modalSectionTitle, { color: colors.text }]}>Items</Text>
                  <Text style={[styles.modalSectionCount, { color: colors.textSecondary }]}>{draft.items.length}</Text>
                </View>

                <View style={[styles.itemComposer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.itemTypeRow}>
                    {allowedItemTypes.map((type) => {
                      const active = itemType === type.value;
                      return (
                        <TouchableOpacity
                          key={type.value}
                          style={[
                            styles.itemTypeButton,
                            {
                              backgroundColor: active ? colors.primary : colors.background,
                              borderColor: active ? colors.primary : colors.border,
                            },
                          ]}
                          onPress={() => changeItemType(type.value)}
                        >
                          <IconSymbol
                            ios_icon_name={type.icon as any}
                            android_material_icon_name={type.materialIcon as any}
                            size={15}
                            color={active ? '#FFFFFF' : colors.textSecondary}
                          />
                          <Text style={[styles.itemTypeText, { color: active ? '#FFFFFF' : colors.text }]}>{type.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {itemUsesReusableSource ? (
                    <>
                      <View style={styles.itemSourceRow}>
                        {itemSourceOptions.map((source) => {
                          const active = itemSourceMode === source.value;
                          return (
                            <TouchableOpacity
                              key={source.value}
                              style={[
                                styles.itemSourceButton,
                                {
                                  backgroundColor: active ? colors.secondary : colors.background,
                                  borderColor: active ? colors.secondary : colors.border,
                                },
                              ]}
                              onPress={() => changeItemSourceMode(source.value as ItemSourceMode)}
                              activeOpacity={0.84}
                            >
                              <Text style={[styles.itemSourceText, { color: active ? '#FFFFFF' : colors.text }]}>
                                {source.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {itemSourceMode === 'saved' ? (
                        <PickerTrigger
                          title={selectedReusableTemplate?.title ?? 'Choose saved template'}
                          detail={
                            selectedReusableTemplate
                              ? `${templateTypeLabel(selectedReusableTemplate.templateType)} template`
                              : itemType === 'session_template'
                                ? 'Saved sessions open in a popup'
                                : 'Saved tasks and exercises open in a popup'
                          }
                          icon={selectedReusableTemplate?.templateType === 'exercise' ? 'timer' : itemType === 'session_template' ? 'rectangle.3.group' : 'checklist'}
                          materialIcon={selectedReusableTemplate?.templateType === 'exercise' ? 'timer' : itemType === 'session_template' ? 'dashboard' : 'checklist'}
                          colors={colors}
                          selected={Boolean(selectedReusableTemplate)}
                          onPress={() => setItemPickerMode('saved')}
                        />
                      ) : null}

                      {itemSourceMode === 'library' ? (
                        <PickerTrigger
                          title={selectedLibraryItem?.title ?? 'Choose from library'}
                          detail={selectedLibraryItem?.categoryPath ?? 'Library exercises open in a popup'}
                          icon="books.vertical"
                          materialIcon="library_books"
                          colors={colors}
                          selected={Boolean(selectedLibraryItem)}
                          onPress={() => setItemPickerMode('library')}
                        />
                      ) : null}
                    </>
                  ) : null}

                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={itemTitle}
                    onChangeText={setItemTitle}
                    placeholder={itemSourceMode === 'new' || !itemUsesReusableSource ? 'Item title' : 'Title override'}
                    placeholderTextColor={colors.textSecondary}
                  />
                  <TextInput
                    style={[
                      styles.input,
                      styles.multilineInput,
                      { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
                    ]}
                    value={itemDescription}
                    onChangeText={setItemDescription}
                    placeholder="Item notes"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                  />

                  {(itemType === 'task_template' || itemType === 'exercise') && itemSourceMode === 'new' ? (
                    <TaskFieldsEditor
                      title={itemType === 'exercise' ? 'Exercise task fields' : 'Task fields'}
                      config={itemTaskConfig}
                      onChange={setItemTaskConfig}
                      colors={colors}
                      uploading={uploadingItemMedia}
                      onAddMediaLink={() => addTaskMediaLink('item')}
                      onPickMedia={() => pickTaskMedia('item')}
                      onRemoveMedia={(index) => removeTaskMedia('item', index)}
                      categories={templateCategories}
                    />
                  ) : null}

                  {itemType === 'exercise' && itemSourceMode !== 'saved' ? (
                    <ExerciseTimerEditor
                      timer={itemExerciseTimer}
                      onChange={setItemExerciseTimer}
                      colors={colors}
                    />
                  ) : null}

                  {draft.templateType === 'week' ? (
                    <View style={styles.itemMetaRow}>
                      <TextInput
                        style={[styles.input, styles.itemMetaInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                        value={itemDayOffset}
                        onChangeText={(value) => setItemDayOffset(value.replace(/[^0-9]/g, ''))}
                        placeholder="Day"
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="number-pad"
                      />
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.addItemButton, { backgroundColor: colors.primary, opacity: canAddItem ? 1 : 0.55 }]}
                    onPress={addDraftItem}
                    disabled={!canAddItem}
                  >
                    <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={16} color="#FFFFFF" />
                    <Text style={styles.addItemText}>Add item</Text>
                  </TouchableOpacity>
                </View>

                {draft.items.map((item, index) => {
                  const timer = getExerciseTimerFromItem(item);
                  const taskConfig = getTaskConfigFromItem(item);
                  return (
                    <View key={item.localId} style={[styles.draftItemRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={styles.draftItemOrder}>
                        <Text style={[styles.draftItemIndex, { color: colors.textSecondary }]}>{index + 1}</Text>
                      </View>
                      <View style={styles.draftItemBody}>
                        <Text style={[styles.draftItemTitle, { color: colors.text }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[styles.draftItemMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                          {ITEM_TYPES.find((type) => type.value === item.itemType)?.label ?? item.itemType}
                          {draft.templateType === 'week' && item.dayOffset ? ` · day ${item.dayOffset + 1}` : ''}
                          {timer ? ` · ${timer.rounds} x ${timer.activeSeconds}s/${timer.restSeconds}s` : ''}
                          {taskConfig?.videoUrls.length ? ` · ${taskConfig.videoUrls.length} media` : ''}
                        </Text>
                      </View>
                      <View style={styles.draftItemActions}>
                        <TouchableOpacity
                          style={[styles.itemIconButton, { borderColor: colors.border }]}
                          onPress={() => moveDraftItem(item.localId, -1)}
                          disabled={index === 0}
                        >
                          <IconSymbol ios_icon_name="arrow.up" android_material_icon_name="arrow_upward" size={16} color={index === 0 ? colors.textSecondary : colors.text} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.itemIconButton, { borderColor: colors.border }]}
                          onPress={() => moveDraftItem(item.localId, 1)}
                          disabled={index === draft.items.length - 1}
                        >
                          <IconSymbol ios_icon_name="arrow.down" android_material_icon_name="arrow_downward" size={16} color={index === draft.items.length - 1 ? colors.textSecondary : colors.text} />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.itemIconButton, { borderColor: colors.border }]} onPress={() => removeDraftItem(item.localId)}>
                          <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={16} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.primary, opacity: saving ? 0.65 : 1 }]}
              onPress={saveDraft}
              disabled={saving}
              testID="plan.template.saveButton"
            >
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={18} color="#FFFFFF" />}
              <Text style={styles.saveButtonText}>Save template</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <ReusableItemPickerModal
        visible={itemPickerMode !== null}
        mode={itemPickerMode}
        itemType={itemType}
        templates={reusableTemplates}
        libraryItems={libraryItems}
        selectedTemplateId={selectedReusableTemplateId}
        selectedLibraryItemId={selectedLibraryItemId}
        colors={colors}
        onClose={() => setItemPickerMode(null)}
        onSelectTemplate={(template) => {
          setSelectedReusableTemplateId(template.id);
          setItemPickerMode(null);
        }}
        onSelectLibraryItem={(libraryItem) => {
          setSelectedLibraryItemId(libraryItem.id);
          setItemPickerMode(null);
        }}
      />
      <CreateTemplatePickerModal
        visible={createPickerVisible}
        colors={colors}
        onClose={() => setCreatePickerVisible(false)}
        onSelect={openCreateFromPicker}
      />
    </View>
  );
}

function PlanTemplateLibraryView({
  title,
  detail,
  templates,
  totalCount,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sourceOptions,
  sourceFilter,
  onSourceFilterChange,
  focusTagOptions,
  selectedFocusTags,
  onToggleFocusTag,
  onClearFocusTags,
  actorUserId,
  categories,
  colors,
  onEdit,
  onDuplicate,
  onArchive,
  onAssign,
  showStatusControls,
  busy,
}: {
  title: string;
  detail: string;
  templates: TrainingTemplateSummary[];
  totalCount: number;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: TemplateStatusFilter;
  onStatusFilterChange: (value: TemplateStatusFilter) => void;
  sourceOptions: PlanSourceFilterOption[];
  sourceFilter: TemplateSourceFilter;
  onSourceFilterChange: (value: TemplateSourceFilter) => void;
  focusTagOptions: TemplateFocusTagOption[];
  selectedFocusTags: string[];
  onToggleFocusTag: (value: string) => void;
  onClearFocusTags: () => void;
  actorUserId: string | null;
  categories: TemplateCategoryOption[];
  colors: ReturnType<typeof getColors>;
  onEdit: (template: TrainingTemplateSummary) => void;
  onDuplicate: (template: TrainingTemplateSummary) => void;
  onArchive: (template: TrainingTemplateSummary) => void;
  onAssign: (template: TrainingTemplateSummary) => void;
  showStatusControls: boolean;
  busy: boolean;
}) {
  return (
    <View style={styles.planLibraryView} testID="plan.templates.libraryView">
      <View style={[styles.planSearchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={[styles.planSearchInput, { color: colors.text }]}
          placeholder={`Search ${title.toLowerCase()}...`}
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={onSearchChange}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          testID="plan.templates.searchInput"
        />
        {searchQuery.trim().length ? (
          <TouchableOpacity onPress={() => onSearchChange('')} style={styles.planSearchClearButton} activeOpacity={0.8}>
            <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {sourceOptions.length > 1 ? (
        <PlanSourceSelector
          options={sourceOptions}
          selected={sourceFilter}
          onSelect={onSourceFilterChange}
          colors={colors}
        />
      ) : null}

      {focusTagOptions.length ? (
        <PlanFocusTagDropdown
          options={focusTagOptions}
          selectedTags={selectedFocusTags}
          colors={colors}
          onToggle={onToggleFocusTag}
          onClear={onClearFocusTags}
        />
      ) : null}

      <View style={styles.planSectionDivider}>
        <Text style={[styles.planSectionDividerText, { color: colors.textSecondary }]}>{title}</Text>
        <View style={[styles.planSectionDividerLine, { backgroundColor: colors.border }]} />
      </View>

      {showStatusControls ? (
        <View style={[styles.planTemplateViewToggle, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={[styles.planTemplateViewToggleButton, statusFilter === 'active' && { backgroundColor: colors.primary }]}
            onPress={() => onStatusFilterChange('active')}
            activeOpacity={0.85}
            testID="plan.templates.status.active"
          >
            <Text style={[styles.planTemplateViewToggleText, { color: statusFilter === 'active' ? '#FFFFFF' : colors.text }]}>Active</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.planTemplateViewToggleButton, statusFilter === 'archived' && { backgroundColor: colors.primary }]}
            onPress={() => onStatusFilterChange('archived')}
            activeOpacity={0.85}
            testID="plan.templates.status.archived"
          >
            <Text style={[styles.planTemplateViewToggleText, { color: statusFilter === 'archived' ? '#FFFFFF' : colors.text }]}>Archived</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.planTemplateList} testID="plan.templates.list">
        {templates.length ? (
          templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              sourceLabel={getTemplateSourceKind(template, actorUserId) === 'mine' ? 'My template' : 'Workspace'}
              categories={categories}
              colors={colors}
              onEdit={() => onEdit(template)}
              onDuplicate={() => onDuplicate(template)}
              onArchive={() => onArchive(template)}
              onAssign={() => onAssign(template)}
              showStatusControls={showStatusControls}
              busy={busy}
            />
          ))
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <IconSymbol ios_icon_name="tray" android_material_icon_name="inbox" size={34} color={colors.textSecondary} />
            <Text style={[styles.emptyCardText, { color: colors.textSecondary }]}>
              {searchQuery.trim() || sourceFilter !== 'all'
                ? 'No templates match your filters.'
                : showStatusControls
                  ? `No ${statusFilter} templates in this view.`
                  : 'No templates in this view.'}
            </Text>
            {totalCount === 0 ? (
              <Text style={[styles.planEmptyDetail, { color: colors.textSecondary }]}>{detail}</Text>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

function PlanSourceSelector({
  options,
  selected,
  onSelect,
  colors,
}: {
  options: PlanSourceFilterOption[];
  selected: TemplateSourceFilter;
  onSelect: (value: TemplateSourceFilter) => void;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <View style={styles.planSourceFilterRow} testID="plan.templates.sourceFilter">
      {options.map((option) => {
        const active = selected === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.planSourcePill,
              {
                backgroundColor: active ? colors.primary : colors.card,
                borderColor: active ? colors.primary : colors.border,
              },
            ]}
            onPress={() => onSelect(option.value)}
            activeOpacity={0.84}
            testID={`plan.templates.source.${option.value}`}
          >
            <Text style={[styles.planSourceFilterText, { color: active ? '#FFFFFF' : colors.text }]}>
              {option.label}
            </Text>
            <Text style={[styles.planSourceFilterCount, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
              {option.count}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function PlanFocusTagDropdown({
  options,
  selectedTags,
  colors,
  onToggle,
  onClear,
}: {
  options: TemplateFocusTagOption[];
  selectedTags: string[];
  colors: ReturnType<typeof getColors>;
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedKeys = new Set(selectedTags.map(normalizeFocusTagKey));
  const label = selectedTags.length ? selectedTags.join(', ') : 'All focus tags';

  return (
    <View style={styles.planFocusFilterWrap} testID="plan.templates.focusTagFilter">
      <TouchableOpacity
        style={[styles.planFocusFilterButton, { backgroundColor: colors.card, borderColor: selectedTags.length ? colors.primary : colors.border }]}
        onPress={() => setOpen((current) => !current)}
        activeOpacity={0.84}
        testID="plan.templates.focusTagFilter.button"
      >
        <View style={styles.planFocusFilterCopy}>
          <Text style={[styles.planFilterSelectLabel, { color: colors.textSecondary }]}>Focus tags</Text>
          <Text style={[styles.planFilterSelectValue, { color: colors.text }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <IconSymbol ios_icon_name={open ? 'chevron.up' : 'chevron.down'} android_material_icon_name={open ? 'expand_less' : 'expand_more'} size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      {open ? (
        <View style={[styles.planFocusFilterPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {selectedTags.length ? (
            <TouchableOpacity
              style={[styles.planFocusClearButton, { borderColor: colors.border, backgroundColor: colors.background }]}
              onPress={onClear}
              activeOpacity={0.84}
              testID="plan.templates.focusTagFilter.clear"
            >
              <Text style={[styles.planFocusClearText, { color: colors.text }]}>Clear focus tags</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.planFocusTagGrid}>
            {options.map((option) => {
              const selected = selectedKeys.has(normalizeFocusTagKey(option.value));
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.planFocusTagOption,
                    {
                      backgroundColor: selected ? colors.primary : colors.background,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => onToggle(option.value)}
                  activeOpacity={0.84}
                  testID={`plan.templates.focusTagFilter.option.${option.value}`}
                >
                  <Text style={[styles.planFocusTagOptionText, { color: selected ? '#FFFFFF' : colors.text }]} numberOfLines={1}>
                    {option.label}
                  </Text>
                  <Text style={[styles.planFocusTagOptionCount, { color: selected ? '#FFFFFF' : colors.textSecondary }]}>
                    {option.count}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CreateTemplatePickerModal({
  visible,
  colors,
  onClose,
  onSelect,
}: {
  visible: boolean;
  colors: ReturnType<typeof getColors>;
  onClose: () => void;
  onSelect: (type: TrainingTemplateType) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.pickerOverlay}>
        <View style={[styles.createSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.pickerHeader}>
            <View style={styles.headerCopy}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>Create template</Text>
              <Text style={[styles.pickerSubtitle, { color: colors.textSecondary }]}>Choose type</Text>
            </View>
            <TouchableOpacity
              style={[styles.headerIconButton, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={onClose}
              activeOpacity={0.84}
              testID="plan.create.close"
            >
              <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.createOptionList}>
            {CREATE_TEMPLATE_OPTIONS.map((option) => {
              const tone = getTemplateTone(option.value, colors);
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.createOptionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => onSelect(option.value)}
                  activeOpacity={0.86}
                  testID={`plan.create.type.${option.value}`}
                >
                  <View style={[styles.createOptionIcon, { backgroundColor: `${tone}18`, borderColor: tone }]}>
                    <IconSymbol ios_icon_name={option.icon as any} android_material_icon_name={option.materialIcon as any} size={21} color={tone} />
                  </View>
                  <View style={styles.createOptionBody}>
                    <View style={styles.createOptionTitleRow}>
                      <Text style={[styles.createOptionTitle, { color: colors.text }]}>{option.title}</Text>
                      <IconSymbol ios_icon_name="info.circle" android_material_icon_name="info" size={16} color={colors.textSecondary} />
                    </View>
                    <Text style={[styles.createOptionDetail, { color: colors.textSecondary }]}>{option.detail}</Text>
                  </View>
                  <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron_right" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PickerTrigger({
  title,
  detail,
  icon,
  materialIcon,
  selected,
  colors,
  onPress,
}: {
  title: string;
  detail: string;
  icon: string;
  materialIcon: string;
  selected: boolean;
  colors: ReturnType<typeof getColors>;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.pickerTrigger,
        {
          backgroundColor: colors.background,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.84}
    >
      <View style={[styles.pickerTriggerIcon, { backgroundColor: `${colors.primary}18`, borderColor: colors.primary }]}>
        <IconSymbol ios_icon_name={icon as any} android_material_icon_name={materialIcon as any} size={18} color={colors.primary} />
      </View>
      <View style={styles.pickerTriggerBody}>
        <Text style={[styles.pickerTriggerTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.pickerTriggerDetail, { color: colors.textSecondary }]} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron_right" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

function ReusableItemPickerModal({
  visible,
  mode,
  itemType,
  templates,
  libraryItems,
  selectedTemplateId,
  selectedLibraryItemId,
  colors,
  onClose,
  onSelectTemplate,
  onSelectLibraryItem,
}: {
  visible: boolean;
  mode: ItemPickerMode;
  itemType: DraftItem['itemType'];
  templates: TrainingTemplateSummary[];
  libraryItems: TrainingTemplateLibraryItem[];
  selectedTemplateId: string | null;
  selectedLibraryItemId: string | null;
  colors: ReturnType<typeof getColors>;
  onClose: () => void;
  onSelectTemplate: (template: TrainingTemplateSummary) => void;
  onSelectLibraryItem: (item: TrainingTemplateLibraryItem) => void;
}) {
  const isSaved = mode === 'saved';
  const title = isSaved
    ? `Choose saved ${itemType === 'exercise' ? 'exercise' : itemType === 'session_template' ? 'session' : 'task'}`
    : 'Choose from library';
  const emptyText = isSaved ? 'No saved templates yet.' : 'No library items available.';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.pickerOverlay}>
        <View style={[styles.pickerSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.pickerHeader}>
            <View style={styles.headerCopy}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>{title}</Text>
              <Text style={[styles.pickerSubtitle, { color: colors.textSecondary }]}>
                {isSaved ? 'Saved templates' : 'Exercise library'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.headerIconButton, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={onClose}
              activeOpacity={0.84}
            >
              <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.pickerList} showsVerticalScrollIndicator={false}>
            {isSaved ? (
              templates.length ? (
                templates.map((template) => (
                  <TemplatePickerCard
                    key={template.id}
                    template={template}
                    selected={selectedTemplateId === template.id}
                    colors={colors}
                    onPress={() => onSelectTemplate(template)}
                  />
                ))
              ) : (
                <PickerEmptyState text={emptyText} colors={colors} />
              )
            ) : libraryItems.length ? (
              libraryItems.map((libraryItem) => (
                <LibraryPickerCard
                  key={libraryItem.id}
                  item={libraryItem}
                  selected={selectedLibraryItemId === libraryItem.id}
                  colors={colors}
                  onPress={() => onSelectLibraryItem(libraryItem)}
                />
              ))
            ) : (
              <PickerEmptyState text={emptyText} colors={colors} />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function TemplatePickerCard({
  template,
  selected,
  colors,
  onPress,
}: {
  template: TrainingTemplateSummary;
  selected: boolean;
  colors: ReturnType<typeof getColors>;
  onPress: () => void;
}) {
  const tone = getTemplateTone(template.templateType, colors);
  const taskConfig = getTemplateTaskConfig(template);
  const timer = getTemplateTimer(template);
  const mediaCount = getTaskConfigMediaCount(taskConfig);

  return (
    <TouchableOpacity
      style={[
        styles.templateCard,
        styles.pickerCard,
        {
          backgroundColor: colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.86}
    >
      <View style={styles.templateHeader}>
        <View style={[styles.templateIcon, { backgroundColor: `${tone}18`, borderColor: tone }]}>
          <IconSymbol
            ios_icon_name={TEMPLATE_TYPES.find((type) => type.value === template.templateType)?.icon as any}
            android_material_icon_name={TEMPLATE_TYPES.find((type) => type.value === template.templateType)?.materialIcon as any}
            size={20}
            color={tone}
          />
        </View>
        <View style={styles.templateTitleBlock}>
          <Text style={[styles.templateTitle, { color: colors.text }]} numberOfLines={1}>
            {template.title}
          </Text>
          <Text style={[styles.templateMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {templateTypeLabel(template.templateType)} · v{template.versionNumber}
            {timer ? ` · ${timer.rounds} x ${timer.activeSeconds}s/${timer.restSeconds}s` : ''}
          </Text>
        </View>
        {selected ? (
          <View style={[styles.statusBadge, { borderColor: colors.primary }]}>
            <Text style={[styles.statusBadgeText, { color: colors.primary }]}>Selected</Text>
          </View>
        ) : null}
      </View>

      {template.description ? (
        <Text style={[styles.templateDescription, { color: colors.textSecondary }]} numberOfLines={2}>
          {template.description}
        </Text>
      ) : null}

      <View style={styles.templatePills}>
        {mediaCount ? <InfoPill text={`${mediaCount} media`} colors={colors} /> : null}
        {template.focusAreas.slice(0, 2).map((focus) => (
          <InfoPill key={focus} text={focus} colors={colors} />
        ))}
      </View>
    </TouchableOpacity>
  );
}

function LibraryPickerCard({
  item,
  selected,
  colors,
  onPress,
}: {
  item: TrainingTemplateLibraryItem;
  selected: boolean;
  colors: ReturnType<typeof getColors>;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.templateCard,
        styles.pickerCard,
        {
          backgroundColor: colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.86}
    >
      <View style={styles.templateHeader}>
        <View style={[styles.templateIcon, { backgroundColor: `${colors.warning}18`, borderColor: colors.warning }]}>
          <IconSymbol ios_icon_name="books.vertical" android_material_icon_name="library_books" size={20} color={colors.warning} />
        </View>
        <View style={styles.templateTitleBlock}>
          <Text style={[styles.templateTitle, { color: colors.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.templateMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            Library · {item.isSystem ? 'FootballCoach' : 'Coach'}
          </Text>
        </View>
        {selected ? (
          <View style={[styles.statusBadge, { borderColor: colors.primary }]}>
            <Text style={[styles.statusBadgeText, { color: colors.primary }]}>Selected</Text>
          </View>
        ) : null}
      </View>

      {item.description ? (
        <Text style={[styles.templateDescription, { color: colors.textSecondary }]} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}

      <View style={styles.templatePills}>
        {item.categoryPath ? <InfoPill text={item.categoryPath} colors={colors} /> : null}
        {item.videoUrls.length ? <InfoPill text={`${item.videoUrls.length} media`} colors={colors} /> : null}
      </View>
    </TouchableOpacity>
  );
}

function PickerEmptyState({ text, colors }: { text: string; colors: ReturnType<typeof getColors> }) {
  return (
    <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <IconSymbol ios_icon_name="tray" android_material_icon_name="inbox" size={28} color={colors.textSecondary} />
      <Text style={[styles.emptyCardText, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

function PlanFilterSelect({
  label,
  value,
  icon,
  materialIcon,
  active,
  colors,
  onPress,
}: {
  label: string;
  value: string;
  icon: string;
  materialIcon: string;
  active: boolean;
  colors: ReturnType<typeof getColors>;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.planFilterSelect,
        {
          backgroundColor: active ? `${colors.primary}12` : colors.card,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.84}
    >
      <View style={[styles.planFilterSelectIcon, { backgroundColor: active ? `${colors.primary}18` : colors.background, borderColor: active ? colors.primary : colors.border }]}>
        <IconSymbol ios_icon_name={icon as any} android_material_icon_name={materialIcon as any} size={17} color={active ? colors.primary : colors.textSecondary} />
      </View>
      <View style={styles.planFilterSelectText}>
        <Text style={[styles.planFilterSelectLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.planFilterSelectValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
      </View>
      <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand_more" size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

function PlanFilterOption({
  label,
  detail,
  active,
  colors,
  onPress,
}: {
  label: string;
  detail: string;
  active: boolean;
  colors: ReturnType<typeof getColors>;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.planFilterOption,
        {
          backgroundColor: active ? `${colors.primary}12` : colors.background,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.86}
    >
      <View style={styles.planFilterOptionText}>
        <Text style={[styles.planFilterOptionLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.planFilterOptionDetail, { color: colors.textSecondary }]}>{detail}</Text>
      </View>
      {active ? (
        <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check_circle" size={19} color={colors.primary} />
      ) : null}
    </TouchableOpacity>
  );
}

function TemplateCard({
  template,
  sourceLabel,
  categories,
  colors,
  onEdit,
  onDuplicate,
  onArchive,
  onAssign,
  showStatusControls,
  busy,
}: {
  template: TrainingTemplateSummary;
  sourceLabel?: string;
  categories: TemplateCategoryOption[];
  colors: ReturnType<typeof getColors>;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onAssign: () => void;
  showStatusControls: boolean;
  busy: boolean;
}) {
  const tone = getTemplateTone(template.templateType, colors);
  const mediaUrls = getTemplateMediaUrls(template);
  const timer = getTemplateTimer(template);
  const templateFacts = getTemplateFacts(template, timer, categories);
  const categoryItems = getTemplateCategoryItems(template, categories);
  const categoryFact = templateFacts.find((fact) => fact.label === 'Category');
  const autoAddFact = templateFacts.find((fact) => fact.label === 'Auto-add');
  const feedbackFact = templateFacts.find((fact) => fact.label === 'Feedback');
  const visibleMetadataFacts = templateFacts.filter(
    (fact) => !['Category', 'Auto-add', 'Feedback'].includes(fact.label) && !['Off', 'Not set'].includes(fact.value),
  );
  const focusTags = normalizeFocusTags(template.focusAreas);
  const typeMeta = TEMPLATE_TYPES.find((type) => type.value === template.templateType);
  const normalizedSourceLabel = sourceLabel?.toLowerCase() ?? '';
  const sourceVisual = normalizedSourceLabel.includes('coach') || normalizedSourceLabel.includes('trainer') || normalizedSourceLabel.startsWith('from')
    ? { iosIcon: 'person.2.fill', materialIcon: 'sports', color: colors.secondary }
    : normalizedSourceLabel.includes('workspace')
      ? { iosIcon: 'building.2.fill', materialIcon: 'business', color: colors.accent }
      : { iosIcon: 'person.crop.circle.fill', materialIcon: 'account_circle', color: colors.primary };
  return (
    <View
      style={[
        styles.templateCard,
        styles.templateCardShadow,
        { backgroundColor: colors.card, borderColor: 'rgba(148,163,184,0.28)' },
      ]}
      testID={`plan.template.${template.templateType}`}
    >
      <View style={styles.templateHeader}>
        <View style={styles.templateHeaderLeft}>
          <View style={[styles.templateIcon, { backgroundColor: `${tone}18` }]}>
            <IconSymbol
              ios_icon_name={typeMeta?.icon as any}
              android_material_icon_name={typeMeta?.materialIcon as any}
              size={18}
              color={tone}
            />
          </View>
          <View style={styles.templateTitleBlock}>
            <Text style={[styles.templateTitle, { color: colors.text }]} numberOfLines={2}>
              {template.title}
            </Text>
          </View>
        </View>

        <View style={styles.templateActions}>
          {sourceLabel ? (
            <TouchableOpacity
              style={[
                styles.templateActionButton,
                styles.templateSourceButton,
                { backgroundColor: `${sourceVisual.color}14` },
              ]}
              onPress={() => Alert.alert('Source', sourceLabel)}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel={`Source: ${sourceLabel}`}
              accessibilityHint="Shows whether this is your own, coach, or workspace template"
              testID={`plan.template.source.${template.templateType}`}
            >
              <IconSymbol
                ios_icon_name={sourceVisual.iosIcon as any}
                android_material_icon_name={sourceVisual.materialIcon as any}
                size={18}
                color={sourceVisual.color}
              />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.templateActionButton, { opacity: busy ? 0.5 : 1 }]}
            onPress={onDuplicate}
            disabled={busy}
            activeOpacity={0.84}
            testID={`plan.template.duplicate.${template.templateType}`}
          >
            <IconSymbol ios_icon_name="doc.on.doc" android_material_icon_name="content_copy" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.templateActionButton, { opacity: busy ? 0.5 : 1 }]}
            onPress={onEdit}
            disabled={busy}
            activeOpacity={0.84}
            testID={`plan.template.edit.${template.templateType}`}
          >
            <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          {showStatusControls ? (
            <TouchableOpacity
              style={[styles.templateActionButton, { opacity: busy ? 0.5 : 1 }]}
              onPress={onArchive}
              disabled={busy}
              activeOpacity={0.84}
              testID={`plan.template.archive.${template.templateType}`}
            >
              <IconSymbol
                ios_icon_name={template.status === 'archived' ? 'arrow.uturn.backward.circle' : 'archivebox'}
                android_material_icon_name={template.status === 'archived' ? 'unarchive' : 'archive'}
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {template.description ? (
        <View style={styles.templateDescriptionIndented}>
          <Text style={[styles.templateDescription, { color: colors.textSecondary }]} numberOfLines={3}>
            {template.description}
          </Text>
        </View>
      ) : null}

      {mediaUrls.length ? (
        <View style={styles.templateMediaSection} testID={`plan.template.media.${template.templateType}`}>
          <View style={styles.templateSectionHeader}>
            <Text style={[styles.templateFactLabel, { color: colors.textSecondary }]}>Media</Text>
            <Text style={[styles.templateSectionMeta, { color: colors.textSecondary }]}>
              {mediaUrls.length} {mediaUrls.length === 1 ? 'file' : 'files'}
            </Text>
          </View>
          <View style={styles.templateMediaPlayer}>
            <SwipeVideoPlayer
              urls={mediaUrls}
              minHeight={92}
              showHint={mediaUrls.length > 1}
              hintVariant="counter"
              surfaceColor={colors.background}
              testID={`plan.template.mediaPlayer.${template.templateType}`}
            />
          </View>
        </View>
      ) : null}

      {visibleMetadataFacts.length || feedbackFact || autoAddFact ? (
        <View style={styles.templateMetadataRows} testID={`plan.template.facts.${template.templateType}`}>
          {visibleMetadataFacts.map((fact) => {
            const icon = fact.label === 'Task duration'
              ? { ios: 'clock', android: 'schedule', color: colors.textSecondary }
              : fact.label === 'Timer'
                ? { ios: 'timer', android: 'timer', color: colors.primary }
                : fact.label === 'Reminder'
                  ? { ios: 'bell', android: 'notifications_none', color: colors.textSecondary }
                  : fact.label === 'Feedback'
                    ? { ios: 'bubble.left', android: 'chat_bubble_outline', color: colors.textSecondary }
                    : { ios: 'list.bullet', android: 'format_list_bulleted', color: colors.textSecondary };
            const value = fact.label === 'Task duration'
              ? `${fact.value} task time`
              : fact.label === 'Items'
                ? `${fact.value} items`
                : fact.label === 'Sessions'
                  ? `${fact.value} sessions`
                  : fact.label === 'Reminder'
                    ? `Reminder: ${fact.value}`
                    : fact.value;
            return (
              <View key={`${fact.label}-${fact.value}`} style={styles.templateMetadataRow}>
                <View style={styles.templateMetadataKey}>
                  <IconSymbol
                    ios_icon_name={icon.ios as any}
                    android_material_icon_name={icon.android as any}
                    size={14}
                    color={icon.color}
                  />
                  <Text style={[styles.templateMetadataLabel, { color: colors.textSecondary }]}>{fact.label}</Text>
                </View>
                <Text style={[styles.templateMetadataText, { color: colors.text }]}>{value}</Text>
              </View>
            );
          })}

          {feedbackFact ? (
            <View
              style={styles.templateMetadataRow}
              testID={`plan.template.feedback.${template.templateType}`}
              accessibilityLabel={`Feedback: ${feedbackFact.value === 'Off' ? 'Off' : 'On'}`}
            >
              <View style={styles.templateMetadataKey}>
                <IconSymbol ios_icon_name="bubble.left" android_material_icon_name="chat_bubble_outline" size={14} color={colors.textSecondary} />
                <Text style={[styles.templateMetadataLabel, { color: colors.textSecondary }]}>Feedback</Text>
              </View>
              <View style={[styles.templateStatusBadge, { backgroundColor: `${feedbackFact.value === 'Off' ? colors.textSecondary : colors.primary}14` }]}>
                <Text style={[styles.templateStatusBadgeText, { color: feedbackFact.value === 'Off' ? colors.textSecondary : colors.primary }]}>
                  {feedbackFact.value === 'Off' ? 'Off' : 'On'}
                </Text>
              </View>
            </View>
          ) : null}

          {autoAddFact ? (
            <View
              style={styles.templateMetadataRow}
              testID={`plan.template.autoAdd.${template.templateType}`}
              accessibilityLabel={`Auto-add to activities: ${autoAddFact.value}`}
            >
              <View style={styles.templateMetadataKey}>
                <IconSymbol
                  ios_icon_name={autoAddFact.value === 'On' ? 'checkmark.circle.fill' : 'minus.circle'}
                  android_material_icon_name={autoAddFact.value === 'On' ? 'check_circle' : 'remove_circle_outline'}
                  size={14}
                  color={autoAddFact.value === 'On' ? colors.primary : colors.textSecondary}
                />
                <Text style={[styles.templateMetadataLabel, { color: colors.textSecondary }]}>Auto-add</Text>
              </View>
              <View style={[styles.templateStatusBadge, { backgroundColor: `${autoAddFact.value === 'On' ? colors.primary : colors.textSecondary}14` }]}>
                <Text style={[styles.templateStatusBadgeText, { color: autoAddFact.value === 'On' ? colors.primary : colors.textSecondary }]}>
                  {autoAddFact.value}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {categoryItems.length || (categoryFact && categoryFact.value !== 'None') ? (
        <View style={styles.templateTaxonomySection} testID={`plan.template.categories.${template.templateType}`}>
          <View style={styles.templateTaxonomyLabelRow}>
            <IconSymbol ios_icon_name="tag.fill" android_material_icon_name="label" size={14} color={colors.textSecondary} />
            <Text style={[styles.templateTaxonomyLabel, { color: colors.textSecondary }]}>Categories</Text>
          </View>
          <View style={styles.templateTagRow}>
            {categoryItems.length ? categoryItems.map((category) => (
              <View
                key={category.id}
                style={[
                  styles.templateTagChip,
                  { backgroundColor: `${category.color}14`, borderColor: category.color },
                ]}
              >
                {category.emoji ? <Text style={styles.templateCategoryEmoji}>{category.emoji}</Text> : null}
                <Text style={[styles.templateTagChipText, { color: category.color }]} numberOfLines={1}>{category.name}</Text>
              </View>
            )) : (
              <View style={[styles.templateTagChip, { backgroundColor: `${tone}14`, borderColor: tone }]}>
                <Text style={[styles.templateTagChipText, { color: tone }]} numberOfLines={1}>{categoryFact?.value}</Text>
              </View>
            )}
          </View>
        </View>
      ) : null}

      {focusTags.length ? (
        <View style={styles.templateTaxonomySection} testID={`plan.template.focusTags.${template.templateType}`}>
          <View style={styles.templateTaxonomyLabelRow}>
            <IconSymbol ios_icon_name="scope" android_material_icon_name="track_changes" size={14} color={colors.textSecondary} />
            <Text style={[styles.templateTaxonomyLabel, { color: colors.textSecondary }]}>Focus</Text>
          </View>
          <View style={styles.templateTagRow}>
            {focusTags.map((tag) => (
              <View key={tag} style={[styles.templateTagChip, { backgroundColor: `${colors.primary}14`, borderColor: colors.primary }]}>
                <Text style={[styles.templateTagChipText, { color: colors.primary }]} numberOfLines={1}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.templateAssignButton, { backgroundColor: colors.primary, opacity: busy ? 0.65 : 1 }]}
        onPress={onAssign}
        disabled={busy}
        activeOpacity={0.86}
        testID={`plan.template.assign.${template.templateType}`}
      >
        <IconSymbol ios_icon_name="person.badge.plus" android_material_icon_name="assignment_ind" size={17} color="#FFFFFF" />
        <Text style={styles.templateAssignButtonText}>Assign</Text>
      </TouchableOpacity>
    </View>
  );
}

function InfoPill({ text, colors }: { text: string; colors: ReturnType<typeof getColors> }) {
  return (
    <View style={[styles.infoPill, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <Text style={[styles.infoPillText, { color: colors.textSecondary }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function FocusTagEditor({
  selectedTags,
  availableTags,
  inputValue,
  onInputChange,
  onAddTag,
  onRemoveTag,
  colors,
}: {
  selectedTags: string[];
  availableTags: string[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onAddTag: (value: string) => void;
  onRemoveTag: (value: string) => void;
  colors: ReturnType<typeof getColors>;
}) {
  const selectedKeys = new Set(selectedTags.map(normalizeFocusTagKey));
  const suggestions = normalizeFocusTags(availableTags).filter((tag) => !selectedKeys.has(normalizeFocusTagKey(tag)));
  const canAdd = inputValue.trim().length > 0;

  return (
    <View style={styles.inputGroup} testID="plan.template.focusTagEditor">
      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Focus tags</Text>
      <View style={styles.focusTagSelectedRow}>
        {selectedTags.length ? (
          selectedTags.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={[styles.focusTagChip, { backgroundColor: `${colors.primary}18`, borderColor: colors.primary }]}
              onPress={() => onRemoveTag(tag)}
              activeOpacity={0.84}
              testID={`plan.template.focusTag.remove.${tag}`}
            >
              <Text style={[styles.focusTagChipText, { color: colors.primary }]} numberOfLines={1}>
                {tag}
              </Text>
              <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={12} color={colors.primary} />
            </TouchableOpacity>
          ))
        ) : (
          <Text style={[styles.focusTagEmptyText, { color: colors.textSecondary }]}>No focus tags selected</Text>
        )}
      </View>

      {suggestions.length ? (
        <View style={styles.focusTagSuggestionRow}>
          {suggestions.slice(0, 12).map((tag) => (
            <TouchableOpacity
              key={tag}
              style={[styles.focusTagSuggestion, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => onAddTag(tag)}
              activeOpacity={0.84}
              testID={`plan.template.focusTag.suggestion.${tag}`}
            >
              <Text style={[styles.focusTagSuggestionText, { color: colors.text }]} numberOfLines={1}>
                {tag}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.focusTagInputRow}>
        <TextInput
          style={[styles.focusTagInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
          value={inputValue}
          onChangeText={onInputChange}
          placeholder="Add new tag"
          placeholderTextColor={colors.textSecondary}
          returnKeyType="done"
          onSubmitEditing={() => canAdd && onAddTag(inputValue)}
          testID="plan.template.focusTag.input"
        />
        <TouchableOpacity
          style={[styles.focusTagAddButton, { backgroundColor: canAdd ? colors.primary : colors.border }]}
          onPress={() => onAddTag(inputValue)}
          disabled={!canAdd}
          activeOpacity={0.84}
          testID="plan.template.focusTag.add"
        >
          <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  colors,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  colors: ReturnType<typeof getColors>;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'numbers-and-punctuation';
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          multiline ? styles.multilineInput : null,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.card },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        multiline={multiline}
        keyboardType={keyboardType ?? 'default'}
      />
    </View>
  );
}

function TaskFieldsEditor({
  title,
  config,
  onChange,
  colors,
  uploading,
  onAddMediaLink,
  onPickMedia,
  onRemoveMedia,
  categories,
}: {
  title: string;
  config: TaskConfigDraft;
  onChange: (update: TaskConfigUpdate) => void;
  colors: ReturnType<typeof getColors>;
  uploading: boolean;
  onAddMediaLink: () => void;
  onPickMedia: () => void;
  onRemoveMedia: (index: number) => void;
  categories: TemplateCategoryOption[];
}) {
  const update = useCallback((patch: Partial<TaskConfigDraft>) => {
    onChange((current) => ({ ...current, ...patch }));
  }, [onChange]);
  const toggleCategory = useCallback((categoryId: string) => {
    onChange((current) => {
      const selected = new Set(current.categoryIds);
      if (selected.has(categoryId)) {
        selected.delete(categoryId);
      } else {
        selected.add(categoryId);
      }
      return { ...current, categoryIds: Array.from(selected) };
    });
  }, [onChange]);

  return (
    <View style={[styles.taskFieldsCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Text style={[styles.taskFieldsTitle, { color: colors.text }]}>{title}</Text>

      <View style={styles.mediaInputRow}>
        <TextInput
          style={[styles.input, styles.mediaUrlInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
          value={config.videoUrlInput}
          onChangeText={(value) => update({ videoUrlInput: value })}
          placeholder="Video, image, or PDF link"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <TouchableOpacity
          style={[styles.mediaIconButton, { borderColor: colors.border, backgroundColor: colors.card }]}
          onPress={onAddMediaLink}
          disabled={!config.videoUrlInput.trim()}
        >
          <IconSymbol ios_icon_name="link.badge.plus" android_material_icon_name="add_link" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
        value={config.mediaNameInput}
        onChangeText={(value) => update({ mediaNameInput: value })}
        placeholder="Media name"
        placeholderTextColor={colors.textSecondary}
      />
      <TouchableOpacity
        style={[styles.uploadMediaButton, { borderColor: colors.primary, opacity: uploading ? 0.6 : 1 }]}
        onPress={onPickMedia}
        disabled={uploading}
      >
        <IconSymbol ios_icon_name="square.and.arrow.up" android_material_icon_name="upload_file" size={18} color={colors.primary} />
        <Text style={[styles.uploadMediaText, { color: colors.primary }]}>{uploading ? 'Uploading...' : 'Choose media'}</Text>
      </TouchableOpacity>

      {config.videoUrls.length ? (
        <TaskMediaListEditor
          urls={config.videoUrls}
          names={config.mediaNames}
          onChange={(urls, names) => update({ videoUrls: urls, mediaNames: names })}
          getLabel={getTaskMediaLabel}
          onRemove={onRemoveMedia}
          onRename={(index, name) => update({ mediaNames: replaceTaskMediaName(config.mediaNames, config.videoUrls, index, name) })}
          disabled={uploading}
          backgroundColor={colors.card}
          borderColor={colors.border}
          textColor={colors.text}
          secondaryTextColor={colors.textSecondary}
          accentColor={colors.primary}
          dangerColor={colors.error}
          testIDPrefix="plan.template.taskMedia"
        />
      ) : null}

      <ToggleNumberRow
        label="Reminder before start"
        enabled={config.reminderEnabled}
        value={config.reminderMinutes}
        onToggle={(value) => update({ reminderEnabled: value, reminderMinutes: value ? config.reminderMinutes || '0' : '0' })}
        onChangeValue={(value) => update({ reminderMinutes: value.replace(/[^0-9]/g, '') })}
        colors={colors}
        placeholder="Min"
      />
      <ToggleNumberRow
        label="Post-training feedback"
        enabled={config.feedbackEnabled}
        value={config.feedbackDelayMinutes}
        onToggle={(value) => update({ feedbackEnabled: value, feedbackDelayMinutes: value ? config.feedbackDelayMinutes || '0' : '0' })}
        onChangeValue={(value) => update({ feedbackDelayMinutes: value.replace(/[^0-9]/g, '') })}
        colors={colors}
        placeholder="Delay"
      />
      {config.feedbackEnabled ? (
        <TextInput
          style={[styles.input, styles.multilineInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
          value={config.feedbackScoreExplanation}
          onChangeText={(value) => update({ feedbackScoreExplanation: value })}
          placeholder="Score explanation"
          placeholderTextColor={colors.textSecondary}
          multiline
        />
      ) : null}
      <View style={[styles.taskFeatureRow, { borderColor: colors.border }]}>
        <Text style={[styles.toggleNumberText, { color: colors.text }]} numberOfLines={1}>
          Auto-add to matching activities
        </Text>
        <Switch
          value={config.autoAddToActivities}
          onValueChange={(value) => update({ autoAddToActivities: value })}
        />
      </View>
      <View style={[styles.categoryPickerBlock, { borderColor: colors.border }]}>
        <Text style={[styles.taskFieldsSubtitle, { color: colors.textSecondary }]}>Activity categories</Text>
        <View style={styles.categoryPillGrid} testID="plan.template.taskCategories">
          {categories.length ? (
            categories.map((category, index) => {
              const selected = config.categoryIds.includes(category.id);
              return (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryPill,
                    {
                      backgroundColor: selected ? category.color : colors.card,
                      borderColor: category.color,
                    },
                  ]}
                  onPress={() => toggleCategory(category.id)}
                  activeOpacity={0.84}
                  testID={`plan.template.taskCategory.${index}`}
                >
                  {category.emoji ? <Text style={styles.categoryPillEmoji}>{category.emoji}</Text> : null}
                  <Text style={[styles.categoryPillText, { color: selected ? '#FFFFFF' : colors.text }]} numberOfLines={1}>
                    {category.name}
                  </Text>
                </TouchableOpacity>
              );
            })
          ) : (
            <Text style={[styles.emptyCategoryText, { color: colors.textSecondary }]}>No categories</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function ToggleNumberRow({
  label,
  enabled,
  value,
  onToggle,
  onChangeValue,
  colors,
  placeholder,
}: {
  label: string;
  enabled: boolean;
  value: string;
  onToggle: (value: boolean) => void;
  onChangeValue: (value: string) => void;
  colors: ReturnType<typeof getColors>;
  placeholder: string;
}) {
  return (
    <View style={[styles.toggleNumberRow, { borderColor: colors.border }]}>
      <View style={styles.toggleNumberLabel}>
        <Text style={[styles.toggleNumberText, { color: colors.text }]} numberOfLines={1}>{label}</Text>
      </View>
      <Switch value={enabled} onValueChange={onToggle} />
      {enabled ? (
        <TextInput
          style={[styles.input, styles.toggleNumberInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
          value={value}
          onChangeText={onChangeValue}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
        />
      ) : null}
    </View>
  );
}

function ExerciseTimerEditor({
  timer,
  onChange,
  colors,
}: {
  timer: ExerciseTimerDraft;
  onChange: (update: ExerciseTimerDraft | ((current: ExerciseTimerDraft) => ExerciseTimerDraft)) => void;
  colors: ReturnType<typeof getColors>;
}) {
  const update = useCallback((patch: Partial<ExerciseTimerDraft>) => {
    onChange((current) => ({ ...current, ...patch }));
  }, [onChange]);

  return (
    <View style={[styles.timerEditor, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Text style={[styles.taskFieldsSubtitle, { color: colors.textSecondary }]}>Interval timer</Text>
      <View style={styles.timerInputRow}>
        <View style={styles.timerInputGroup}>
          <Text style={[styles.timerInputLabel, { color: colors.text }]}>Work time</Text>
          <TextInput
            style={[styles.input, styles.timerInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            value={timer.activeSeconds}
            onChangeText={(value) => update({ activeSeconds: value.replace(/[^0-9]/g, '') })}
            placeholder="45"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
          />
          <Text style={[styles.timerInputHint, { color: colors.textSecondary }]}>Seconds of active work</Text>
        </View>
        <View style={styles.timerInputGroup}>
          <Text style={[styles.timerInputLabel, { color: colors.text }]}>Rest</Text>
          <TextInput
            style={[styles.input, styles.timerInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            value={timer.restSeconds}
            onChangeText={(value) => update({ restSeconds: value.replace(/[^0-9]/g, '') })}
            placeholder="15"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
          />
          <Text style={[styles.timerInputHint, { color: colors.textSecondary }]}>Seconds between rounds</Text>
        </View>
        <View style={styles.timerInputGroup}>
          <Text style={[styles.timerInputLabel, { color: colors.text }]}>Rounds</Text>
          <TextInput
            style={[styles.input, styles.timerInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            value={timer.rounds}
            onChangeText={(value) => update({ rounds: value.replace(/[^0-9]/g, '') })}
            placeholder="3"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
          />
          <Text style={[styles.timerInputHint, { color: colors.textSecondary }]}>Number of rounds</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 132,
  },
  embeddedPlanChrome: {
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    marginBottom: 14,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: 0,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workspaceRow: {
    paddingBottom: 14,
    columnGap: 8,
  },
  workspaceChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 210,
  },
  workspaceText: {
    fontSize: 13,
    fontWeight: '700',
  },
  primaryCreateCard: {
    minHeight: 68,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 12,
  },
  primaryCreateCopy: {
    flex: 1,
    minWidth: 0,
  },
  primaryCreateTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  primaryCreateDetail: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  primaryCreateIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBlock: {
    marginBottom: 14,
  },
  planLibraryView: {
    rowGap: 12,
  },
  planSearchBar: {
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
  },
  planSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '700',
  },
  planSearchClearButton: {
    padding: 4,
  },
  planSourceFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  planSourcePill: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
  },
  planSourceFilterText: {
    fontSize: 12,
    fontWeight: '900',
  },
  planSourceFilterCount: {
    fontSize: 12,
    fontWeight: '900',
  },
  planSectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
    marginTop: 4,
  },
  planSectionDividerText: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  planSectionDividerLine: {
    flex: 1,
    height: 2,
    borderRadius: 999,
  },
  planTemplateViewToggle: {
    minHeight: 46,
    borderRadius: 8,
    padding: 4,
    flexDirection: 'row',
    columnGap: 4,
  },
  planTemplateViewToggleButton: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  planTemplateViewToggleText: {
    fontSize: 14,
    fontWeight: '900',
  },
  planTemplateList: {
    rowGap: 8,
  },
  planEmptyDetail: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
    textAlign: 'center',
  },
  notice: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  noticeText: {
    fontSize: 14,
    lineHeight: 20,
  },
  planFilterSelect: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 9,
  },
  planFilterSelectIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planFilterSelectText: {
    flex: 1,
    minWidth: 0,
  },
  planFilterSelectLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  planFilterSelectValue: {
    fontSize: 14,
    fontWeight: '900',
    marginTop: 2,
  },
  planFilterPanel: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    rowGap: 8,
  },
  planFilterOption: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
  },
  planFilterOptionText: {
    flex: 1,
    minWidth: 0,
  },
  planFilterOptionLabel: {
    fontSize: 14,
    fontWeight: '900',
  },
  planFilterOptionDetail: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  planFocusFilterWrap: {
    marginBottom: 12,
  },
  planFocusFilterButton: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
  },
  planFocusFilterCopy: {
    flex: 1,
    minWidth: 0,
  },
  planFocusFilterPanel: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    rowGap: 8,
  },
  planFocusTagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  planFocusTagOption: {
    minHeight: 34,
    maxWidth: '100%',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  planFocusTagOptionText: {
    fontSize: 12,
    fontWeight: '900',
  },
  planFocusTagOptionCount: {
    fontSize: 11,
    fontWeight: '900',
  },
  planFocusClearButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  planFocusClearText: {
    fontSize: 12,
    fontWeight: '900',
  },
  templateCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  templateCardShadow: {
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 8,
    marginBottom: 6,
  },
  templateHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    columnGap: 10,
    minWidth: 0,
  },
  templateIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  templateTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  templateActions: {
    flexDirection: 'row',
    columnGap: 3,
    flexShrink: 0,
  },
  templateActionButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  templateSourceButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  templateMeta: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: 96,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  templateDescription: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  templateDescriptionIndented: {
    marginLeft: 42,
    marginTop: -2,
    marginBottom: 10,
  },
  templateLabeledBlock: {
    marginBottom: 10,
    rowGap: 4,
  },
  templateFactGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 2,
    marginBottom: 10,
  },
  templateFactChip: {
    minHeight: 42,
    maxWidth: '100%',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    justifyContent: 'center',
  },
  templateFactLabel: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  templateFactValue: {
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
  },
  templateTagSection: {
    marginBottom: 10,
    rowGap: 6,
  },
  templateTagRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  templateTagChip: {
    minHeight: 28,
    maxWidth: '100%',
    borderRadius: 999,
    borderWidth: 0,
    paddingHorizontal: 9,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 5,
    justifyContent: 'center',
  },
  templateTagChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  templateCategoryEmoji: {
    fontSize: 13,
  },
  templateMetadataRows: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.24)',
    paddingTop: 8,
    marginBottom: 2,
  },
  templateMetadataRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
  },
  templateMetadataKey: {
    width: 86,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 7,
  },
  templateMetadataLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  templateMetadataText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  templateStatusBadge: {
    minHeight: 25,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  templateStatusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  templateAutoAddBadge: {
    alignSelf: 'flex-start',
    minHeight: 28,
    maxWidth: '100%',
    borderRadius: 8,
    borderWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 4,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
  },
  templateAutoAddText: {
    fontSize: 12,
    fontWeight: '700',
  },
  templateTaxonomySection: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    columnGap: 10,
  },
  templateTaxonomyLabelRow: {
    width: 86,
    minHeight: 27,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 5,
  },
  templateTaxonomyLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  templateSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 7,
  },
  templateSectionMeta: {
    fontSize: 12,
    fontWeight: '800',
  },
  templateMediaSection: {
    marginTop: 4,
    marginBottom: 12,
  },
  templateMediaPlayer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  templateAssignButton: {
    minHeight: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 7,
    marginTop: 12,
    marginBottom: 0,
  },
  templateAssignButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  templatePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  infoPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: 150,
  },
  infoPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  cardActions: {
    flexDirection: 'row',
    columnGap: 8,
    marginTop: 12,
  },
  cardActionButton: {
    flex: 1,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 5,
    paddingHorizontal: 5,
  },
  cardActionText: {
    fontSize: 12,
    fontWeight: '900',
  },
  emptyCard: {
    minHeight: 140,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  emptyCardText: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  modalScreen: {
    flex: 1,
  },
  modalContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 12,
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
  },
  typeSelector: {
    flexDirection: 'row',
    columnGap: 8,
    marginBottom: 12,
  },
  typeButton: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    columnGap: 6,
  },
  typeButtonText: {
    fontSize: 12,
    fontWeight: '900',
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 14,
    fontWeight: '700',
  },
  focusTagSelectedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 8,
  },
  focusTagChip: {
    minHeight: 32,
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  focusTagChipText: {
    fontSize: 12,
    fontWeight: '900',
  },
  focusTagEmptyText: {
    fontSize: 13,
    fontWeight: '700',
  },
  focusTagSuggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 8,
  },
  focusTagSuggestion: {
    minHeight: 30,
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    justifyContent: 'center',
  },
  focusTagSuggestionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  focusTagInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  focusTagInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 14,
    fontWeight: '700',
  },
  focusTagAddButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  multilineInput: {
    minHeight: 86,
    textAlignVertical: 'top',
  },
  modalSectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 8,
  },
  modalSectionTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  modalSectionCount: {
    fontSize: 13,
    fontWeight: '800',
  },
  itemComposer: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  itemTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  itemTypeButton: {
    minHeight: 32,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    paddingHorizontal: 8,
  },
  itemTypeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  itemSourceRow: {
    flexDirection: 'row',
    columnGap: 6,
    marginBottom: 8,
  },
  itemSourceButton: {
    flex: 1,
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  itemSourceText: {
    fontSize: 11,
    fontWeight: '900',
  },
  pickerTrigger: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
    padding: 10,
    marginBottom: 8,
  },
  pickerTriggerIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerTriggerBody: {
    flex: 1,
    minWidth: 0,
  },
  pickerTriggerTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  pickerTriggerDetail: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    maxHeight: '84%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 12,
    marginBottom: 12,
  },
  pickerTitle: {
    fontSize: 21,
    fontWeight: '900',
  },
  pickerSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  pickerList: {
    rowGap: 10,
    paddingBottom: 12,
  },
  createSheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
  },
  createOptionList: {
    rowGap: 10,
  },
  createOptionCard: {
    minHeight: 84,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 11,
  },
  createOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createOptionBody: {
    flex: 1,
    minWidth: 0,
  },
  createOptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
  },
  createOptionTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  createOptionDetail: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  pickerCard: {
    borderWidth: 2,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    marginTop: 8,
  },
  itemMetaInput: {
    flex: 1,
    minWidth: 0,
  },
  addItemButton: {
    minHeight: 44,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 5,
    paddingHorizontal: 13,
    marginTop: 8,
  },
  addItemText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  taskFieldsCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    rowGap: 8,
    marginTop: 8,
  },
  taskFieldsTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  taskFieldsSubtitle: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  mediaInputRow: {
    flexDirection: 'row',
    columnGap: 8,
    alignItems: 'center',
  },
  mediaUrlInput: {
    flex: 1,
    minWidth: 0,
  },
  mediaIconButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadMediaButton: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 7,
  },
  uploadMediaText: {
    fontSize: 13,
    fontWeight: '900',
  },
  toggleNumberRow: {
    minHeight: 48,
    borderTopWidth: 1,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  toggleNumberLabel: {
    flex: 1,
    minWidth: 0,
  },
  toggleNumberText: {
    fontSize: 13,
    fontWeight: '800',
  },
  toggleNumberInput: {
    width: 82,
    minHeight: 40,
  },
  taskFeatureRow: {
    minHeight: 48,
    borderTopWidth: 1,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  categoryPickerBlock: {
    borderTopWidth: 1,
    paddingTop: 8,
    rowGap: 8,
  },
  categoryPillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryPill: {
    minHeight: 36,
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 5,
  },
  categoryPillEmoji: {
    fontSize: 14,
  },
  categoryPillText: {
    maxWidth: 190,
    fontSize: 12,
    fontWeight: '900',
  },
  emptyCategoryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  timerEditor: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    rowGap: 8,
    marginTop: 8,
  },
  timerInputRow: {
    flexDirection: 'row',
    columnGap: 8,
  },
  timerInputGroup: {
    flex: 1,
    minWidth: 0,
    rowGap: 4,
  },
  timerInputLabel: {
    fontSize: 12,
    fontWeight: '900',
  },
  timerInputHint: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
  },
  timerInput: {
    width: '100%',
  },
  draftItemRow: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 8,
    padding: 9,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    marginBottom: 8,
  },
  draftItemOrder: {
    width: 24,
    alignItems: 'center',
  },
  draftItemIndex: {
    fontSize: 12,
    fontWeight: '900',
  },
  draftItemBody: {
    flex: 1,
    minWidth: 0,
  },
  draftItemTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  draftItemMeta: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  draftItemActions: {
    flexDirection: 'row',
    columnGap: 5,
  },
  itemIconButton: {
    width: 30,
    height: 30,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    minHeight: 50,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
    marginTop: 10,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 12,
  },
});
