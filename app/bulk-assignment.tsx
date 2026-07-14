import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { getColors } from '@/styles/commonStyles';
import {
  OWNER_BULK_ASSIGNMENTS_API_VERSION,
  OwnerBulkAssignmentBatchDetail,
  OwnerBulkAssignmentBatchItem,
  OwnerBulkAssignmentContentType,
  OwnerBulkAssignmentContext,
  OwnerBulkAssignmentFilter,
  OwnerBulkAssignmentOperation,
  OwnerBulkAssignmentPreview,
  OwnerBulkAssignmentPreviewInput,
  OwnerBulkAssignmentPreviewPerson,
  applyOwnerBulkAssignments,
  createOwnerBulkAssignmentIdempotencyKey,
  fetchOwnerBulkAssignmentBatchDetail,
  fetchOwnerBulkAssignmentContext,
  isOwnerBulkAssignmentPreviewStaleError,
  previewOwnerBulkAssignments,
  rollbackOwnerBulkAssignmentBatch,
} from '@/services/ownerBulkAssignments';

type WizardStep = 0 | 1 | 2 | 3 | 4;

type ContentChoice = {
  id: string;
  type: OwnerBulkAssignmentContentType;
  title: string;
  detail: string;
};

type ChoiceOption = {
  id: string;
  label: string;
  detail?: string;
  color?: string | null;
};

const WIZARD_STEPS = ['Content', 'Audience', 'Exclude', 'Preview', 'Result'];
const CONTENT_RENDER_LIMIT = 100;
const PLAYER_RENDER_LIMIT = 80;
const DETAIL_RENDER_LIMIT = 100;
const CONTENT_TYPES: { type: OwnerBulkAssignmentContentType; label: string; icon: string; materialIcon: string }[] = [
  { type: 'activity', label: 'Activities', icon: 'calendar', materialIcon: 'event' },
  { type: 'exercise', label: 'Exercises', icon: 'figure.soccer', materialIcon: 'sports_soccer' },
  { type: 'training_template', label: 'Templates', icon: 'doc.on.doc', materialIcon: 'content_copy' },
  { type: 'program', label: 'Programs', icon: 'list.bullet.clipboard', materialIcon: 'view_timeline' },
];
const OPERATIONS: { value: OwnerBulkAssignmentOperation; label: string; detail: string }[] = [
  { value: 'assign', label: 'Assign', detail: 'Create missing assignments' },
  { value: 'update', label: 'Update', detail: 'Update matching assignments' },
  { value: 'remove', label: 'Remove', detail: 'Remove matching assignments safely' },
];

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

function isContentType(value: string | null): value is OwnerBulkAssignmentContentType {
  return Boolean(value && CONTENT_TYPES.some((option) => option.type === value));
}

function isOperation(value: string | null): value is OwnerBulkAssignmentOperation {
  return value === 'assign' || value === 'update' || value === 'remove';
}

function toggleSelection(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function cleanLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function todayIso(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function contentChoices(context: OwnerBulkAssignmentContext | null, type: OwnerBulkAssignmentContentType): ContentChoice[] {
  if (!context) return [];
  if (type === 'activity') {
    return context.content.activities.map((item) => ({
      id: item.id,
      type,
      title: item.title,
      detail: [item.activityDate, item.activityTime, item.location].filter(Boolean).join(' · ') || 'Active activity',
    }));
  }
  if (type === 'exercise') {
    return context.content.exercises.map((item) => ({
      id: item.id,
      type,
      title: item.title,
      detail: item.description || (item.isSystem ? 'System exercise' : 'Owner exercise'),
    }));
  }
  if (type === 'training_template') {
    return context.content.trainingTemplates.map((item) => ({
      id: item.id,
      type,
      title: item.title,
      detail: `${cleanLabel(item.templateType)} template${item.description ? ` · ${item.description}` : ''}`,
    }));
  }
  return context.content.programs.map((item) => ({
    id: item.id,
    type,
    title: item.title,
    detail: `${item.durationWeeks} week${item.durationWeeks === 1 ? '' : 's'}${item.level ? ` · ${cleanLabel(item.level)}` : ''}`,
  }));
}

function metricForOperation(preview: OwnerBulkAssignmentPreview): number {
  if (preview.operation === 'assign') return preview.summary.willCreate;
  if (preview.operation === 'update') return preview.summary.willUpdate;
  return preview.summary.willRemove;
}

function itemTone(status: string, colors: ReturnType<typeof getColors>): string {
  if (['created', 'updated', 'removed', 'rolled_back', 'create', 'update', 'remove'].includes(status)) return colors.success;
  if (['failed', 'conflict', 'rollback_conflict'].includes(status)) return colors.error;
  if (status === 'duplicate') return colors.warning;
  return colors.textSecondary;
}

export default function BulkAssignmentScreen() {
  const colors = getColors(useColorScheme());
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    ownerAccountId?: string | string[];
    contentType?: string | string[];
    contentId?: string | string[];
    operation?: string | string[];
    targetBatchId?: string | string[];
  }>();
  const { authReady, isAuthenticated } = useAuthSession();

  const routeOwnerAccountId = firstParam(params.ownerAccountId);
  const routeContentType = firstParam(params.contentType);
  const routeContentId = firstParam(params.contentId);
  const routeOperation = firstParam(params.operation);
  const routeTargetBatchId = firstParam(params.targetBatchId);

  const [step, setStep] = useState<WizardStep>(
    isContentType(routeContentType) && routeContentId ? 1 : 0,
  );
  const [context, setContext] = useState<OwnerBulkAssignmentContext | null>(null);
  const [activeOwnerAccountId, setActiveOwnerAccountId] = useState<string | null>(routeOwnerAccountId);
  const [targetBatchId, setTargetBatchId] = useState<string | null>(routeTargetBatchId);
  const [contextLoading, setContextLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [operation, setOperation] = useState<OwnerBulkAssignmentOperation>(
    isOperation(routeOperation) ? routeOperation : 'assign',
  );
  const [selectedContentType, setSelectedContentType] = useState<OwnerBulkAssignmentContentType>(
    isContentType(routeContentType) ? routeContentType : 'training_template',
  );
  const [selectedContentId, setSelectedContentId] = useState<string | null>(routeContentId);
  const [contentSearch, setContentSearch] = useState('');
  const [scheduleDate, setScheduleDate] = useState(
    routeContentType === 'activity' && routeOperation === 'update' ? '' : todayIso(),
  );
  const [scheduleTime, setScheduleTime] = useState('');
  const [assignmentLocation, setAssignmentLocation] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('');

  const [includeAllPlayers, setIncludeAllPlayers] = useState(false);
  const [explicitPlayerIds, setExplicitPlayerIds] = useState<string[]>([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [teamFilterIds, setTeamFilterIds] = useState<string[]>([]);
  const [tagFilterIds, setTagFilterIds] = useState<string[]>([]);
  const [crmStatuses, setCrmStatuses] = useState<string[]>([]);
  const [playingLevels, setPlayingLevels] = useState<string[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [ageMinimum, setAgeMinimum] = useState('');
  const [ageMaximum, setAgeMaximum] = useState('');
  const [enrollmentProgramId, setEnrollmentProgramId] = useState<string | null>(null);
  const [enrollmentStatuses, setEnrollmentStatuses] = useState<string[]>([]);

  const [excludedPlayerIds, setExcludedPlayerIds] = useState<string[]>([]);
  const [excludedTeamIds, setExcludedTeamIds] = useState<string[]>([]);
  const [exclusionSearch, setExclusionSearch] = useState('');

  const [preview, setPreview] = useState<OwnerBulkAssignmentPreview | null>(null);
  const [previewInput, setPreviewInput] = useState<OwnerBulkAssignmentPreviewInput | null>(null);
  const [previewFingerprint, setPreviewFingerprint] = useState<string | null>(null);
  const [applyIdempotencyKey, setApplyIdempotencyKey] = useState<string | null>(null);
  const [expandedRecipients, setExpandedRecipients] = useState(false);
  const [removeAcknowledged, setRemoveAcknowledged] = useState(false);
  const [result, setResult] = useState<OwnerBulkAssignmentBatchDetail | null>(null);
  const [rollbackIdempotencyKey, setRollbackIdempotencyKey] = useState<string | null>(null);

  const contextRequestRef = useRef(0);
  const previewRequestRef = useRef(0);
  const initialContentAppliedRef = useRef(false);

  const choices = useMemo(
    () => contentChoices(context, selectedContentType),
    [context, selectedContentType],
  );
  const selectedContent = useMemo(
    () => choices.find((item) => item.id === selectedContentId) ?? null,
    [choices, selectedContentId],
  );
  useEffect(() => {
    if (!context || !routeContentId || !isContentType(routeContentType)) return;
    const routeContentExists = contentChoices(context, routeContentType).some((item) => item.id === routeContentId);
    if (!routeContentExists) setStep(0);
  }, [context, routeContentId, routeContentType]);
  const visibleContent = useMemo(() => {
    const query = contentSearch.trim().toLowerCase();
    if (!query) return choices;
    return choices.filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(query));
  }, [choices, contentSearch]);
  const renderedContent = visibleContent.slice(0, CONTENT_RENDER_LIMIT);

  const visiblePlayers = useMemo(() => {
    const query = playerSearch.trim().toLowerCase();
    const roster = context?.roster ?? [];
    if (!query) return roster;
    return roster.filter((player) => {
      const searchable = [
        player.name,
        player.crmStatus,
        player.playingLevel ?? '',
        ...player.positions,
        ...player.tags.map((tag) => tag.name),
        ...player.teams.map((team) => team.name),
      ].join(' ').toLowerCase();
      return searchable.includes(query);
    });
  }, [context?.roster, playerSearch]);
  const visibleExclusionPlayers = useMemo(() => {
    const query = exclusionSearch.trim().toLowerCase();
    const roster = context?.roster ?? [];
    if (!query) return roster;
    return roster.filter((player) => player.name.toLowerCase().includes(query));
  }, [context?.roster, exclusionSearch]);
  const renderedPlayers = visiblePlayers.slice(0, PLAYER_RENDER_LIMIT);
  const renderedExclusionPlayers = visibleExclusionPlayers.slice(0, PLAYER_RENDER_LIMIT);

  const filters = useMemo<OwnerBulkAssignmentFilter[]>(() => {
    if (includeAllPlayers) return [];
    const next: OwnerBulkAssignmentFilter[] = [];
    if (teamFilterIds.length) next.push({ field: 'team', values: [...teamFilterIds].sort(), operator: 'in' });
    if (tagFilterIds.length) next.push({ field: 'tag', values: [...tagFilterIds].sort(), operator: 'in' });
    if (crmStatuses.length) next.push({ field: 'crm_status', values: [...crmStatuses].sort(), operator: 'in' });
    if (playingLevels.length) next.push({ field: 'playing_level', values: [...playingLevels].sort(), operator: 'in' });
    if (positions.length) next.push({ field: 'position', values: [...positions].sort(), operator: 'in' });
    if (ageMinimum && ageMaximum) {
      next.push({ field: 'age', values: [Number(ageMinimum), Number(ageMaximum)], operator: 'between' });
    }
    if (enrollmentProgramId && enrollmentStatuses.length) {
      next.push({
        field: 'program_enrollment',
        values: [...enrollmentStatuses].sort(),
        operator: 'in',
        programId: enrollmentProgramId,
      });
    }
    return next;
  }, [
    ageMaximum,
    ageMinimum,
    crmStatuses,
    enrollmentProgramId,
    enrollmentStatuses,
    includeAllPlayers,
    playingLevels,
    positions,
    tagFilterIds,
    teamFilterIds,
  ]);

  const audienceValidation = useMemo(() => {
    if (includeAllPlayers) return null;
    if ((ageMinimum && !ageMaximum) || (!ageMinimum && ageMaximum)) return 'Enter both minimum and maximum age.';
    if (ageMinimum && ageMaximum && Number(ageMinimum) > Number(ageMaximum)) return 'Minimum age cannot exceed maximum age.';
    if (ageMinimum && ageMaximum && (Number(ageMinimum) < 0 || Number(ageMaximum) > 120)) return 'Enter a valid age range.';
    if ((enrollmentProgramId && !enrollmentStatuses.length) || (!enrollmentProgramId && enrollmentStatuses.length)) {
      return 'Choose both a program and at least one enrollment status.';
    }
    if (!explicitPlayerIds.length && !filters.length) return 'Choose players, add a filter, or explicitly select all eligible players.';
    return null;
  }, [
    ageMaximum,
    ageMinimum,
    enrollmentProgramId,
    enrollmentStatuses.length,
    explicitPlayerIds.length,
    filters.length,
    includeAllPlayers,
  ]);

  const contentValidation = useMemo(() => {
    if (!activeOwnerAccountId) return 'Choose an owner workspace.';
    if (!selectedContent) return 'Choose content to continue.';
    const needsDate = operation !== 'remove' && (
      selectedContent.type === 'program' || selectedContent.type === 'training_template'
    );
    if (needsDate && !isIsoDate(scheduleDate)) {
      return 'Enter a valid date in YYYY-MM-DD format.';
    }
    if (selectedContent.type === 'activity' && operation === 'update' && scheduleDate.trim() && !isIsoDate(scheduleDate)) {
      return 'Enter a valid date override in YYYY-MM-DD format.';
    }
    return null;
  }, [activeOwnerAccountId, operation, scheduleDate, selectedContent]);

  const currentPreviewInput = useMemo<OwnerBulkAssignmentPreviewInput | null>(() => {
    if (!activeOwnerAccountId || !selectedContent || contentValidation || audienceValidation) return null;
    const assignment: NonNullable<OwnerBulkAssignmentPreviewInput['assignment']> = {};
    if (operation !== 'remove') {
      if (selectedContent.type === 'program' || selectedContent.type === 'training_template') assignment.startDate = scheduleDate;
      if (scheduleDate.trim() && selectedContent.type === 'activity' && operation === 'update') assignment.activityDate = scheduleDate.trim();
      if (scheduleTime.trim() && selectedContent.type === 'activity' && operation === 'update') assignment.activityTime = scheduleTime.trim();
      if (assignmentLocation.trim() && selectedContent.type === 'activity' && operation === 'update') assignment.location = assignmentLocation.trim();
      if (assignmentTitle.trim() && selectedContent.type === 'activity' && operation === 'update') assignment.title = assignmentTitle.trim();
    }
    const hasAssignment = Object.keys(assignment).length > 0;
    const hasExclusions = excludedPlayerIds.length > 0 || excludedTeamIds.length > 0;
    return {
      ownerAccountId: activeOwnerAccountId,
      operation,
      content: { type: selectedContent.type, id: selectedContent.id },
      includeAllPlayers: includeAllPlayers || undefined,
      filters: includeAllPlayers || !filters.length ? undefined : filters,
      playerIds: includeAllPlayers || !explicitPlayerIds.length ? undefined : [...explicitPlayerIds].sort(),
      exclusions: hasExclusions
        ? {
            playerIds: excludedPlayerIds.length ? [...excludedPlayerIds].sort() : undefined,
            teamIds: excludedTeamIds.length ? [...excludedTeamIds].sort() : undefined,
          }
        : undefined,
      assignment: hasAssignment ? assignment : undefined,
      targetBatchId: targetBatchId ?? undefined,
    };
  }, [
    activeOwnerAccountId,
    assignmentLocation,
    assignmentTitle,
    audienceValidation,
    contentValidation,
    excludedPlayerIds,
    excludedTeamIds,
    explicitPlayerIds,
    filters,
    includeAllPlayers,
    operation,
    scheduleDate,
    scheduleTime,
    selectedContent,
    targetBatchId,
  ]);
  const currentFingerprint = useMemo(
    () => (currentPreviewInput ? JSON.stringify(currentPreviewInput) : null),
    [currentPreviewInput],
  );
  const currentFingerprintRef = useRef(currentFingerprint);
  currentFingerprintRef.current = currentFingerprint;

  const loadContext = useCallback(async (ownerAccountId?: string | null) => {
    const requestId = ++contextRequestRef.current;
    setContextLoading(true);
    setError(null);
    try {
      const payload = await fetchOwnerBulkAssignmentContext(ownerAccountId);
      if (requestId !== contextRequestRef.current) return;
      if (payload.apiVersion !== OWNER_BULK_ASSIGNMENTS_API_VERSION) {
        throw new Error('Unsupported bulk assignment response version.');
      }
      const selectedOwnerAccountId = payload.selectedOwnerAccountId ?? payload.owner?.ownerAccountId ?? payload.workspaces[0]?.ownerAccountId ?? null;
      if (ownerAccountId && selectedOwnerAccountId !== ownerAccountId) {
        throw new Error('Owner context belongs to another workspace.');
      }
      setContext(payload);
      setActiveOwnerAccountId(selectedOwnerAccountId);
      if (!initialContentAppliedRef.current) {
        initialContentAppliedRef.current = true;
        if (isContentType(routeContentType)) setSelectedContentType(routeContentType);
        if (routeContentId) setSelectedContentId(routeContentId);
      }
    } catch (cause) {
      if (requestId !== contextRequestRef.current) return;
      setError(cause instanceof Error ? cause.message : 'Could not load bulk assignment data.');
    } finally {
      if (requestId === contextRequestRef.current) setContextLoading(false);
    }
  }, [routeContentId, routeContentType]);

  useEffect(() => {
    if (!authReady) return;
    if (!isAuthenticated) {
      setContextLoading(false);
      return;
    }
    void loadContext(routeOwnerAccountId);
  }, [authReady, isAuthenticated, loadContext, routeOwnerAccountId]);

  useEffect(() => {
    previewRequestRef.current += 1;
    if (!preview || !previewFingerprint || previewFingerprint === currentFingerprint) return;
    setPreview(null);
    setPreviewInput(null);
    setPreviewFingerprint(null);
    setApplyIdempotencyKey(null);
  }, [currentFingerprint, preview, previewFingerprint]);

  useEffect(() => {
    setRemoveAcknowledged(false);
  }, [preview?.previewToken]);

  const chooseWorkspace = useCallback((ownerAccountId: string) => {
    if (ownerAccountId === activeOwnerAccountId || contextLoading) return;
    previewRequestRef.current += 1;
    setContext(null);
    setActiveOwnerAccountId(ownerAccountId);
    setTargetBatchId(null);
    setSelectedContentId(null);
    setContentSearch('');
    setScheduleDate(todayIso());
    setScheduleTime('');
    setAssignmentLocation('');
    setAssignmentTitle('');
    setIncludeAllPlayers(false);
    setExplicitPlayerIds([]);
    setPlayerSearch('');
    setTeamFilterIds([]);
    setTagFilterIds([]);
    setCrmStatuses([]);
    setPlayingLevels([]);
    setPositions([]);
    setAgeMinimum('');
    setAgeMaximum('');
    setEnrollmentProgramId(null);
    setEnrollmentStatuses([]);
    setExcludedPlayerIds([]);
    setExcludedTeamIds([]);
    setExclusionSearch('');
    setPreview(null);
    setPreviewInput(null);
    setPreviewFingerprint(null);
    setApplyIdempotencyKey(null);
    setRemoveAcknowledged(false);
    setResult(null);
    setRollbackIdempotencyKey(null);
    void loadContext(ownerAccountId);
  }, [activeOwnerAccountId, contextLoading, loadContext]);

  const chooseContentType = useCallback((type: OwnerBulkAssignmentContentType) => {
    if (type !== selectedContentType) setTargetBatchId(null);
    setSelectedContentType(type);
    setSelectedContentId(null);
    setContentSearch('');
    setScheduleDate(todayIso());
    setScheduleTime('');
    setAssignmentLocation('');
    setAssignmentTitle('');
  }, [selectedContentType]);

  const chooseContent = useCallback((choice: ContentChoice) => {
    if (choice.type !== selectedContentType || choice.id !== selectedContentId) setTargetBatchId(null);
    setSelectedContentId(choice.id);
    setAssignmentTitle('');
    if (choice.type === 'activity') {
      setScheduleDate('');
      setScheduleTime('');
      setAssignmentLocation('');
      return;
    }
    setScheduleDate(todayIso());
    setScheduleTime('');
    setAssignmentLocation('');
  }, [selectedContentId, selectedContentType]);

  const runPreview = useCallback(async () => {
    if (!currentPreviewInput || busy) return;
    const requestId = ++previewRequestRef.current;
    const requestedInput = currentPreviewInput;
    const requestedFingerprint = JSON.stringify(requestedInput);
    setBusy(true);
    setError(null);
    try {
      const next = await previewOwnerBulkAssignments(requestedInput);
      if (requestId !== previewRequestRef.current || currentFingerprintRef.current !== requestedFingerprint) return;
      if (next.apiVersion !== OWNER_BULK_ASSIGNMENTS_API_VERSION) throw new Error('Unsupported preview response version.');
      if (next.ownerAccountId !== requestedInput.ownerAccountId) throw new Error('Preview belongs to another owner workspace.');
      if (next.operation !== requestedInput.operation) throw new Error('Preview operation does not match the request.');
      if (next.content.type !== requestedInput.content.type || next.content.id !== requestedInput.content.id) {
        throw new Error('Preview content does not match the request.');
      }
      setPreview(next);
      setPreviewInput(requestedInput);
      setPreviewFingerprint(requestedFingerprint);
      setApplyIdempotencyKey(createOwnerBulkAssignmentIdempotencyKey('apply'));
      setExpandedRecipients(false);
      setStep(3);
    } catch (cause) {
      if (requestId !== previewRequestRef.current || currentFingerprintRef.current !== requestedFingerprint) return;
      setError(cause instanceof Error ? cause.message : 'Could not build assignment preview.');
    } finally {
      setBusy(false);
    }
  }, [busy, currentPreviewInput]);

  const applyPreview = useCallback(async () => {
    if (!preview || !previewInput || !applyIdempotencyKey || busy) return;
    setBusy(true);
    setError(null);
    try {
      const applied = await applyOwnerBulkAssignments({
        ...previewInput,
        previewToken: preview.previewToken,
        idempotencyKey: applyIdempotencyKey,
      });
      if (applied.apiVersion !== OWNER_BULK_ASSIGNMENTS_API_VERSION) throw new Error('Unsupported batch response version.');
      if (applied.ownerAccountId !== previewInput.ownerAccountId || applied.batch.ownerAccountId !== previewInput.ownerAccountId) {
        throw new Error('Batch belongs to another owner workspace.');
      }
      if (
        applied.batch.operation !== previewInput.operation ||
        applied.batch.content.type !== previewInput.content.type ||
        applied.batch.content.id !== previewInput.content.id
      ) {
        throw new Error('Batch does not match the confirmed preview.');
      }
      let detail: OwnerBulkAssignmentBatchDetail;
      try {
        detail = await fetchOwnerBulkAssignmentBatchDetail({
          ownerAccountId: previewInput.ownerAccountId,
          batchId: applied.batch.batchId,
        });
        if (
          detail.apiVersion !== OWNER_BULK_ASSIGNMENTS_API_VERSION ||
          detail.ownerAccountId !== previewInput.ownerAccountId ||
          detail.batch.ownerAccountId !== previewInput.ownerAccountId ||
          detail.batch.batchId !== applied.batch.batchId ||
          detail.batch.operation !== previewInput.operation ||
          detail.batch.content.type !== previewInput.content.type ||
          detail.batch.content.id !== previewInput.content.id
        ) {
          throw new Error('Batch detail belongs to another owner workspace.');
        }
      } catch {
        detail = {
          ...applied,
          rollback: {
            eligible: false,
            eligibleCount: 0,
            conflictCount: 0,
            reasonCode: 'BATCH_DETAIL_UNAVAILABLE',
          },
        };
      }
      setResult(detail);
      setRollbackIdempotencyKey(createOwnerBulkAssignmentIdempotencyKey('rollback'));
      setStep(4);
    } catch (cause) {
      if (isOwnerBulkAssignmentPreviewStaleError(cause)) {
        setPreview(null);
        setPreviewInput(null);
        setPreviewFingerprint(null);
        setApplyIdempotencyKey(null);
        setError('The audience changed after preview. Build a fresh preview before confirming.');
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Could not apply the bulk assignment.');
    } finally {
      setBusy(false);
    }
  }, [applyIdempotencyKey, busy, preview, previewInput]);

  const confirmApply = useCallback(() => {
    if (!preview || metricForOperation(preview) === 0 || busy || (preview.operation === 'remove' && !removeAcknowledged)) return;
    const count = metricForOperation(preview);
    const action = preview.operation === 'assign' ? 'create' : preview.operation;
    Alert.alert(
      `${cleanLabel(preview.operation)} ${count} assignment${count === 1 ? '' : 's'}?`,
      `This will ${action} assignments for the exact recipients in this preview. ${preview.summary.conflicts} conflict${preview.summary.conflicts === 1 ? '' : 's'} will not be changed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', style: preview.operation === 'assign' ? 'default' : 'destructive', onPress: () => void applyPreview() },
      ],
    );
  }, [applyPreview, busy, preview, removeAcknowledged]);

  const runRollback = useCallback(async () => {
    if (!result?.rollback.eligible || !activeOwnerAccountId || !rollbackIdempotencyKey || busy) return;
    setBusy(true);
    setError(null);
    try {
      const rolledBack = await rollbackOwnerBulkAssignmentBatch({
        ownerAccountId: activeOwnerAccountId,
        batchId: result.batch.batchId,
        idempotencyKey: rollbackIdempotencyKey,
      });
      if (
        rolledBack.apiVersion !== OWNER_BULK_ASSIGNMENTS_API_VERSION ||
        rolledBack.ownerAccountId !== activeOwnerAccountId ||
        rolledBack.batch.ownerAccountId !== activeOwnerAccountId ||
        rolledBack.batch.batchId !== result.batch.batchId
      ) {
        throw new Error('Rollback response belongs to another owner workspace.');
      }
      let detail: OwnerBulkAssignmentBatchDetail;
      try {
        detail = await fetchOwnerBulkAssignmentBatchDetail({
          ownerAccountId: activeOwnerAccountId,
          batchId: result.batch.batchId,
        });
        if (
          detail.apiVersion !== OWNER_BULK_ASSIGNMENTS_API_VERSION ||
          detail.ownerAccountId !== activeOwnerAccountId ||
          detail.batch.ownerAccountId !== activeOwnerAccountId ||
          detail.batch.batchId !== result.batch.batchId
        ) {
          throw new Error('Rollback batch detail belongs to another owner workspace.');
        }
      } catch {
        detail = {
          ...rolledBack,
          batch: { ...rolledBack.batch, summary: rolledBack.summary },
          rollback: {
            eligible: false,
            eligibleCount: 0,
            conflictCount: rolledBack.summary.rollbackConflicts ?? 0,
            reasonCode: 'ROLLBACK_COMPLETED',
          },
        };
      }
      setResult(detail);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not roll back this batch.');
    } finally {
      setBusy(false);
    }
  }, [activeOwnerAccountId, busy, result, rollbackIdempotencyKey]);

  const confirmRollback = useCallback(() => {
    if (!result?.rollback.eligible || busy) return;
    Alert.alert(
      'Roll back this batch?',
      `${result.rollback.eligibleCount} untouched change${result.rollback.eligibleCount === 1 ? '' : 's'} can be rolled back. Later player progress or edits will be preserved as conflicts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Roll back safely', style: 'destructive', onPress: () => void runRollback() },
      ],
    );
  }, [busy, result?.rollback, runRollback]);

  const startAnother = useCallback(() => {
    setStep(0);
    setPreview(null);
    setPreviewInput(null);
    setPreviewFingerprint(null);
    setApplyIdempotencyKey(null);
    setResult(null);
    setRollbackIdempotencyKey(null);
    setExcludedPlayerIds([]);
    setExcludedTeamIds([]);
    setExplicitPlayerIds([]);
    setIncludeAllPlayers(false);
    setTeamFilterIds([]);
    setTagFilterIds([]);
    setCrmStatuses([]);
    setPlayingLevels([]);
    setPositions([]);
    setAgeMinimum('');
    setAgeMaximum('');
    setEnrollmentProgramId(null);
    setEnrollmentStatuses([]);
    setTargetBatchId(null);
  }, []);

  const goBack = useCallback(() => {
    if (busy) return;
    if (step === 0 || step === 4) {
      router.back();
      return;
    }
    setError(null);
    setStep((current) => Math.max(0, current - 1) as WizardStep);
  }, [busy, router, step]);

  if (!authReady || contextLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading bulk assignment…</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={32} color={colors.textSecondary} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Sign-in required</Text>
        <TouchableOpacity style={[styles.secondaryButton, { borderColor: colors.border }]} onPress={() => router.back()}>
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!context) {
    return (
      <View style={[styles.center, styles.centerPadded, { backgroundColor: colors.background }]}>
        <IconSymbol ios_icon_name="exclamationmark.triangle" android_material_icon_name="warning" size={32} color={colors.error} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Bulk assignment unavailable</Text>
        <Text style={[styles.centerText, { color: colors.textSecondary }]}>{error ?? 'No owner workspace is available.'}</Text>
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={() => void loadContext(activeOwnerAccountId ?? routeOwnerAccountId)}>
          <Text style={styles.primaryButtonText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryButton, { borderColor: colors.border }]} onPress={() => router.back()}>
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const teamOptions: ChoiceOption[] = context.filters.teams.map((team) => ({ id: team.id, label: team.name }));
  const tagOptions: ChoiceOption[] = context.filters.tags.map((tag) => ({ id: tag.id, label: tag.name, color: tag.color }));
  const statusOptions: ChoiceOption[] = context.filters.crmStatuses.map((status) => ({ id: status, label: cleanLabel(status) }));
  const levelOptions: ChoiceOption[] = context.filters.playingLevels.map((level) => ({ id: level, label: cleanLabel(level) }));
  const positionOptions: ChoiceOption[] = context.filters.positions.map((position) => ({ id: position, label: cleanLabel(position) }));
  const enrollmentStatusOptions: ChoiceOption[] = context.filters.enrollmentStatuses.map((status) => ({ id: status, label: cleanLabel(status) }));
  const programOptions: ChoiceOption[] = context.content.programs.map((program) => ({ id: program.id, label: program.title }));
  const activeWorkspace = context.workspaces.find((workspace) => workspace.ownerAccountId === activeOwnerAccountId) ?? null;

  const contentStep = (
    <View style={styles.stepContent} pointerEvents={busy ? 'none' : 'auto'} testID="bulkAssignment.step.content">
      {context.workspaces.length > 1 ? (
        <SectionCard title="Owner workspace" detail="Assignments never cross owner workspaces." colors={colors}>
          <View style={styles.chipWrap}>
            {context.workspaces.map((workspace) => (
              <ChoiceChip
                key={workspace.ownerAccountId}
                label={workspace.name}
                selected={workspace.ownerAccountId === activeOwnerAccountId}
                onPress={() => chooseWorkspace(workspace.ownerAccountId)}
                colors={colors}
                testID={`bulkAssignment.owner.${workspace.ownerAccountId}`}
              />
            ))}
          </View>
        </SectionCard>
      ) : null}

      <SectionCard title="Action" detail="Update and remove require an extra confirmation." colors={colors}>
        <View style={styles.operationGrid}>
          {OPERATIONS.map((option) => {
            const selected = operation === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.operationButton,
                  { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}14` : colors.background },
                ]}
                onPress={() => {
                  setOperation(option.value);
                  if (option.value === 'assign') setTargetBatchId(null);
                  if (selectedContentType === 'activity' && option.value === 'update' && option.value !== operation) {
                    setScheduleDate('');
                    setScheduleTime('');
                    setAssignmentLocation('');
                    setAssignmentTitle('');
                  }
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                testID={`bulkAssignment.operation.${option.value}`}
              >
                <Text style={[styles.operationTitle, { color: selected ? colors.primary : colors.text }]}>{option.label}</Text>
                <Text style={[styles.operationDetail, { color: colors.textSecondary }]}>{option.detail}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SectionCard>

      <View>
        <Text style={[styles.sectionHeading, { color: colors.text }]}>Choose content</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
          {CONTENT_TYPES.map((option) => {
            const selected = selectedContentType === option.type;
            return (
              <TouchableOpacity
                key={option.type}
                style={[styles.typeButton, { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border }]}
                onPress={() => chooseContentType(option.type)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                testID={`bulkAssignment.contentType.${option.type}`}
              >
                <IconSymbol ios_icon_name={option.icon} android_material_icon_name={option.materialIcon} size={17} color={selected ? '#FFFFFF' : colors.textSecondary} />
                <Text style={[styles.typeButtonText, { color: selected ? '#FFFFFF' : colors.text }]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <SearchInput value={contentSearch} onChangeText={setContentSearch} placeholder="Search content…" colors={colors} testID="bulkAssignment.content.search" />
      <View style={styles.listGap}>
        {renderedContent.map((choice) => (
          <SelectableRow
            key={choice.id}
            title={choice.title}
            detail={choice.detail}
            selected={selectedContentId === choice.id}
            onPress={() => chooseContent(choice)}
            colors={colors}
            testID={`bulkAssignment.content.${choice.type}.${choice.id}`}
          />
        ))}
        {visibleContent.length > renderedContent.length ? (
          <Text style={[styles.listLimitHint, { color: colors.textSecondary }]}>Showing the first {CONTENT_RENDER_LIMIT} of {visibleContent.length} items. Search to narrow the list.</Text>
        ) : null}
        {!visibleContent.length ? (
          <EmptyCard title="No content found" detail="Try another content type or search." colors={colors} />
        ) : null}
      </View>

      {selectedContent && operation !== 'remove' && (
        selectedContent.type === 'program' ||
        selectedContent.type === 'training_template' ||
        (selectedContent.type === 'activity' && operation === 'update')
      ) ? (
        <SectionCard
          title={selectedContent.type === 'program' ? 'Program start' : selectedContent.type === 'activity' ? 'Activity overrides' : 'Assignment schedule'}
          detail={selectedContent.type === 'activity' ? 'Only non-empty fields are changed. Existing recipient values are otherwise preserved.' : 'Dates are resolved server-side for every recipient.'}
          colors={colors}
        >
          <LabeledInput label={selectedContent.type === 'activity' ? 'Date override (optional, YYYY-MM-DD)' : 'Date (YYYY-MM-DD)'} value={scheduleDate} onChangeText={setScheduleDate} colors={colors} keyboardType="numbers-and-punctuation" />
          {selectedContent.type === 'activity' ? (
            <>
              <LabeledInput label="Time (optional, HH:MM)" value={scheduleTime} onChangeText={setScheduleTime} colors={colors} />
              <LabeledInput label="Location (optional)" value={assignmentLocation} onChangeText={setAssignmentLocation} colors={colors} />
            </>
          ) : null}
          {operation === 'update' && selectedContent.type === 'activity' ? (
            <LabeledInput label="Updated title (optional)" value={assignmentTitle} onChangeText={setAssignmentTitle} colors={colors} />
          ) : null}
        </SectionCard>
      ) : null}
    </View>
  );

  const audienceStep = (
    <View style={styles.stepContent} pointerEvents={busy ? 'none' : 'auto'} testID="bulkAssignment.step.audience">
      <SectionCard title="All eligible players" detail="This is always an explicit choice. Server eligibility rules still apply." colors={colors}>
        <View style={styles.switchRow}>
          <View style={styles.flexOne}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Use the full owner roster</Text>
            <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>Filters and direct player choices are ignored while enabled.</Text>
          </View>
          <Switch
            value={includeAllPlayers}
            onValueChange={setIncludeAllPlayers}
            trackColor={{ false: colors.border, true: colors.primary }}
            testID="bulkAssignment.audience.all"
          />
        </View>
      </SectionCard>

      {!includeAllPlayers ? (
        <>
          <SectionCard title="Specific players" detail="Direct players are added to the filter result. Exclusions still win." colors={colors}>
            <SearchInput value={playerSearch} onChangeText={setPlayerSearch} placeholder="Search players…" colors={colors} testID="bulkAssignment.players.search" />
            <View style={styles.listGap}>
              {renderedPlayers.map((player) => (
                <SelectableRow
                  key={player.playerId}
                  title={player.name}
                  detail={[cleanLabel(player.crmStatus), player.playingLevel, player.teams.map((team) => team.name).join(', ')].filter(Boolean).join(' · ')}
                  selected={explicitPlayerIds.includes(player.playerId)}
                  onPress={() => setExplicitPlayerIds((current) => toggleSelection(current, player.playerId))}
                  colors={colors}
                  compact
                  testID={`bulkAssignment.player.${player.playerId}`}
                />
              ))}
              {visiblePlayers.length > renderedPlayers.length ? (
                <Text style={[styles.listLimitHint, { color: colors.textSecondary }]}>Showing the first {PLAYER_RENDER_LIMIT} of {visiblePlayers.length} players. Search to narrow the list.</Text>
              ) : null}
            </View>
          </SectionCard>

          <Text style={[styles.logicNote, { color: colors.textSecondary }]}>Filter groups use AND. Multiple choices inside one group use OR.</Text>
          <ChoiceSection title="Teams" options={teamOptions} selected={teamFilterIds} onToggle={(id) => setTeamFilterIds((current) => toggleSelection(current, id))} colors={colors} />
          <ChoiceSection title="Tags" options={tagOptions} selected={tagFilterIds} onToggle={(id) => setTagFilterIds((current) => toggleSelection(current, id))} colors={colors} />
          <ChoiceSection title="CRM status" options={statusOptions} selected={crmStatuses} onToggle={(id) => setCrmStatuses((current) => toggleSelection(current, id))} colors={colors} />
          <ChoiceSection title="Playing level" options={levelOptions} selected={playingLevels} onToggle={(id) => setPlayingLevels((current) => toggleSelection(current, id))} colors={colors} />
          <ChoiceSection title="Position" options={positionOptions} selected={positions} onToggle={(id) => setPositions((current) => toggleSelection(current, id))} colors={colors} />

          <SectionCard title="Age range" detail="Both limits are inclusive." colors={colors}>
            <View style={styles.inlineFields}>
              <View style={styles.flexOne}>
                <LabeledInput label="Minimum" value={ageMinimum} onChangeText={(value) => setAgeMinimum(value.replace(/[^0-9]/g, ''))} colors={colors} keyboardType="number-pad" />
              </View>
              <View style={styles.flexOne}>
                <LabeledInput label="Maximum" value={ageMaximum} onChangeText={(value) => setAgeMaximum(value.replace(/[^0-9]/g, ''))} colors={colors} keyboardType="number-pad" />
              </View>
            </View>
          </SectionCard>

          <SectionCard title="Program enrollment" detail="Match enrollment status inside one published program." colors={colors}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Program</Text>
            <View style={styles.chipWrap}>
              {programOptions.map((option) => (
                <ChoiceChip key={option.id} label={option.label} selected={enrollmentProgramId === option.id} onPress={() => setEnrollmentProgramId(enrollmentProgramId === option.id ? null : option.id)} colors={colors} />
              ))}
            </View>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Enrollment status</Text>
            <View style={styles.chipWrap}>
              {enrollmentStatusOptions.map((option) => (
                <ChoiceChip key={option.id} label={option.label} selected={enrollmentStatuses.includes(option.id)} onPress={() => setEnrollmentStatuses((current) => toggleSelection(current, option.id))} colors={colors} />
              ))}
            </View>
          </SectionCard>
        </>
      ) : null}
    </View>
  );

  const exclusionStep = (
    <View style={styles.stepContent} pointerEvents={busy ? 'none' : 'auto'} testID="bulkAssignment.step.exclusions">
      <Notice
        title="Exclusions always win"
        detail="A player excluded directly or through a team is removed even if a filter or direct selection includes them. The server preview is the final recipient list."
        tone="info"
        colors={colors}
      />
      <ChoiceSection title="Exclude teams" detail={`${excludedTeamIds.length} selected`} options={teamOptions} selected={excludedTeamIds} onToggle={(id) => setExcludedTeamIds((current) => toggleSelection(current, id))} colors={colors} />
      <SectionCard title="Exclude individual players" detail={`${excludedPlayerIds.length} selected`} colors={colors}>
        <SearchInput value={exclusionSearch} onChangeText={setExclusionSearch} placeholder="Search players to exclude…" colors={colors} testID="bulkAssignment.exclusions.search" />
        <View style={styles.listGap}>
          {renderedExclusionPlayers.map((player) => (
            <SelectableRow
              key={player.playerId}
              title={player.name}
              detail={player.teams.map((team) => team.name).join(', ') || cleanLabel(player.crmStatus)}
              selected={excludedPlayerIds.includes(player.playerId)}
              onPress={() => setExcludedPlayerIds((current) => toggleSelection(current, player.playerId))}
              colors={colors}
              compact
              danger
              testID={`bulkAssignment.excludePlayer.${player.playerId}`}
            />
          ))}
          {visibleExclusionPlayers.length > renderedExclusionPlayers.length ? (
            <Text style={[styles.listLimitHint, { color: colors.textSecondary }]}>Showing the first {PLAYER_RENDER_LIMIT} of {visibleExclusionPlayers.length} players. Search to narrow the list.</Text>
          ) : null}
        </View>
      </SectionCard>
      <SectionCard title="Selection summary" colors={colors}>
        <SummaryLine label="Owner" value={activeWorkspace?.name ?? context.owner?.name ?? 'Workspace'} colors={colors} />
        <SummaryLine label="Action" value={cleanLabel(operation)} colors={colors} />
        <SummaryLine label="Content" value={selectedContent?.title ?? 'Not selected'} colors={colors} />
        <SummaryLine label="Direct players" value={includeAllPlayers ? 'All eligible' : String(explicitPlayerIds.length)} colors={colors} />
        <SummaryLine label="Filter groups" value={includeAllPlayers ? 'All eligible' : String(filters.length)} colors={colors} />
        <SummaryLine label="Exclusions" value={`${excludedPlayerIds.length} players · ${excludedTeamIds.length} teams`} colors={colors} />
      </SectionCard>
    </View>
  );

  const recipientRows = preview?.recipients ?? [];
  const visibleRecipientRows = expandedRecipients ? recipientRows.slice(0, DETAIL_RENDER_LIMIT) : recipientRows.slice(0, 20);
  const previewStep = preview ? (
    <View style={styles.stepContent} testID="bulkAssignment.step.preview">
      <Notice
        title="Server-calculated preview"
        detail={`Valid until ${formatDateTime(preview.expiresAt)}. Membership or assignment changes will make this preview stale.`}
        tone="success"
        colors={colors}
      />
      <MetricGrid
        items={[
          { label: 'Matched', value: preview.summary.matched },
          { label: 'Included', value: preview.summary.included },
          { label: 'Excluded', value: preview.summary.excluded },
          { label: 'Duplicates', value: preview.summary.duplicates },
          { label: 'Conflicts', value: preview.summary.conflicts },
          { label: operation === 'assign' ? 'Will create' : operation === 'update' ? 'Will update' : 'Will remove', value: metricForOperation(preview) },
        ]}
        colors={colors}
      />
      <PersonSection title="Recipients" people={visibleRecipientRows} totalCount={recipientRows.length} colors={colors} />
      {recipientRows.length > 20 ? (
        <TouchableOpacity style={[styles.secondaryButton, { borderColor: colors.border }]} onPress={() => setExpandedRecipients((current) => !current)}>
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
            {expandedRecipients ? 'Show first 20' : recipientRows.length > DETAIL_RENDER_LIMIT ? `Show first ${DETAIL_RENDER_LIMIT} recipients` : `Show all ${recipientRows.length} recipients`}
          </Text>
        </TouchableOpacity>
      ) : null}
      {preview.conflicts.length ? <PersonSection title="Conflicts" people={preview.conflicts.slice(0, DETAIL_RENDER_LIMIT)} totalCount={preview.conflicts.length} colors={colors} danger /> : null}
      {preview.excluded.length ? <PersonSection title="Excluded" people={preview.excluded.slice(0, DETAIL_RENDER_LIMIT)} totalCount={preview.excluded.length} colors={colors} muted /> : null}
      {preview.operation === 'remove' && metricForOperation(preview) > 0 ? (
        <SectionCard title="Removal acknowledgement" detail="This extra confirmation is required for bulk removal." colors={colors}>
          <View style={styles.switchRow}>
            <View style={styles.flexOne}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>I understand these assignments will be removed</Text>
              <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>Player progress and later changes remain protected by server-side conflict checks.</Text>
            </View>
            <Switch
              value={removeAcknowledged}
              onValueChange={setRemoveAcknowledged}
              trackColor={{ false: colors.border, true: colors.error }}
              testID="bulkAssignment.removeAcknowledged"
            />
          </View>
        </SectionCard>
      ) : null}
      {metricForOperation(preview) === 0 ? (
        <Notice title="Nothing to change" detail="Adjust the audience, exclusions, content, or operation and build a new preview." tone="warning" colors={colors} />
      ) : null}
    </View>
  ) : (
    <View style={styles.stepContent}>
      <EmptyCard title="Preview needs refreshing" detail="The selection changed or the previous preview is stale." colors={colors} />
      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={() => void runPreview()} disabled={!currentPreviewInput || busy}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Build fresh preview</Text>}
      </TouchableOpacity>
    </View>
  );

  const resultStep = result ? (
    <View style={styles.stepContent} testID="bulkAssignment.step.result">
      <Notice
        title={result.batch.status === 'applied' ? 'Batch applied' : cleanLabel(result.batch.status)}
        detail={`Batch ${result.batch.batchId} · ${formatDateTime(result.batch.appliedAt ?? result.batch.createdAt)}`}
        tone={
          result.batch.status === 'failed'
            ? 'error'
            : result.batch.status === 'partially_applied' || result.batch.status === 'partially_rolled_back'
              ? 'warning'
              : 'success'
        }
        colors={colors}
      />
      <MetricGrid
        items={[
          { label: 'Created', value: result.batch.summary.created },
          { label: 'Updated', value: result.batch.summary.updated },
          { label: 'Removed', value: result.batch.summary.removed },
          { label: 'Skipped', value: result.batch.summary.skipped },
          { label: 'Conflicts', value: result.batch.summary.conflicts },
          { label: 'Failed', value: result.batch.summary.failed },
        ]}
        colors={colors}
      />
      <SectionCard title="Safe rollback" detail="Rollback never removes player progress or overwrites later changes." colors={colors}>
        <SummaryLine label="Eligible changes" value={String(result.rollback.eligibleCount)} colors={colors} />
        <SummaryLine label="Protected conflicts" value={String(result.rollback.conflictCount)} colors={colors} />
        {result.rollback.eligible ? (
          <TouchableOpacity style={[styles.dangerButton, { borderColor: colors.error }]} onPress={confirmRollback} disabled={busy} testID="bulkAssignment.rollback">
            {busy ? <ActivityIndicator color={colors.error} /> : <Text style={[styles.dangerButtonText, { color: colors.error }]}>Roll back eligible changes</Text>}
          </TouchableOpacity>
        ) : (
          <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>No safely reversible changes remain{result.rollback.reasonCode ? ` · ${cleanLabel(result.rollback.reasonCode)}` : ''}.</Text>
        )}
      </SectionCard>
      <BatchItemSection items={result.items} colors={colors} />
      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={startAnother} disabled={busy}>
        <Text style={styles.primaryButtonText}>Start another bulk action</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.secondaryButton, { borderColor: colors.border }]} onPress={() => router.back()} disabled={busy}>
        <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Done</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  const activeStepContent = step === 0
    ? contentStep
    : step === 1
      ? audienceStep
      : step === 2
        ? exclusionStep
        : step === 3
          ? previewStep
          : resultStep;

  const nextDisabled = busy || (step === 0 && Boolean(contentValidation)) || (step === 1 && Boolean(audienceValidation));
  const footerVisible = step < 4;

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12), borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity style={[styles.headerButton, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={goBack} disabled={busy} accessibilityLabel={step === 0 ? 'Close' : 'Go back'}>
          <IconSymbol ios_icon_name={step === 0 ? 'xmark' : 'chevron.left'} android_material_icon_name={step === 0 ? 'close' : 'arrow_back'} size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Bulk assignment</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>{activeWorkspace?.name ?? context.owner?.name ?? 'Owner workspace'}</Text>
        </View>
        <View style={styles.headerButtonSpacer} />
      </View>

      <View style={[styles.progressWrap, { borderBottomColor: colors.border }]}>
        {WIZARD_STEPS.map((label, index) => {
          const active = index === step;
          const complete = index < step;
          return (
            <View key={label} style={styles.progressItem}>
              <View style={[styles.progressDot, { backgroundColor: active || complete ? colors.primary : colors.border }]}>
                {complete ? <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={11} color="#FFFFFF" /> : <Text style={styles.progressNumber}>{index + 1}</Text>}
              </View>
              <Text style={[styles.progressLabel, { color: active ? colors.text : colors.textSecondary }]} numberOfLines={1}>{label}</Text>
            </View>
          );
        })}
      </View>

      <ScrollView style={styles.flexOne} contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 16) + (footerVisible ? 16 : 0) }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {error ? <Notice title="Action could not be completed" detail={error} tone="error" colors={colors} /> : null}
        {activeStepContent}
      </ScrollView>

      {footerVisible ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: colors.border, backgroundColor: colors.background }]}>
          {step > 0 ? (
            <TouchableOpacity style={[styles.footerSecondary, { borderColor: colors.border }]} onPress={goBack} disabled={busy}>
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Back</Text>
            </TouchableOpacity>
          ) : <View />}
          {step === 0 || step === 1 ? (
            <TouchableOpacity
              style={[styles.footerPrimary, { backgroundColor: colors.primary, opacity: nextDisabled ? 0.45 : 1 }]}
              disabled={nextDisabled}
              onPress={() => {
                setError(null);
                setStep((step + 1) as WizardStep);
              }}
              testID="bulkAssignment.next"
            >
              <Text style={styles.primaryButtonText}>Next</Text>
              <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="arrow_forward" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          ) : step === 2 ? (
            <TouchableOpacity style={[styles.footerPrimary, { backgroundColor: colors.primary, opacity: currentPreviewInput && !busy ? 1 : 0.45 }]} disabled={!currentPreviewInput || busy} onPress={() => void runPreview()} testID="bulkAssignment.preview">
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.primaryButtonText}>Build preview</Text><IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="groups" size={16} color="#FFFFFF" /></>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.footerPrimary,
                {
                  backgroundColor: operation === 'assign' ? colors.primary : colors.error,
                  opacity: preview && metricForOperation(preview) > 0 && !busy && (operation !== 'remove' || removeAcknowledged) ? 1 : 0.45,
                },
              ]}
              disabled={!preview || metricForOperation(preview) === 0 || busy || (operation === 'remove' && !removeAcknowledged)}
              onPress={confirmApply}
              testID="bulkAssignment.confirm"
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.primaryButtonText}>Confirm {operation}</Text><IconSymbol ios_icon_name="checkmark.shield.fill" android_material_icon_name="verified_user" size={16} color="#FFFFFF" /></>}
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function SectionCard({ title, detail, colors, children }: { title: string; detail?: string; colors: ReturnType<typeof getColors>; children: React.ReactNode }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
        {detail ? <Text style={[styles.cardDetail, { color: colors.textSecondary }]}>{detail}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function ChoiceSection({ title, detail, options, selected, onToggle, colors }: { title: string; detail?: string; options: ChoiceOption[]; selected: string[]; onToggle: (id: string) => void; colors: ReturnType<typeof getColors> }) {
  if (!options.length) return null;
  return (
    <SectionCard title={title} detail={detail} colors={colors}>
      <View style={styles.chipWrap}>
        {options.map((option) => (
          <ChoiceChip key={option.id} label={option.label} selected={selected.includes(option.id)} onPress={() => onToggle(option.id)} colors={colors} color={option.color} />
        ))}
      </View>
    </SectionCard>
  );
}

function ChoiceChip({ label, selected, onPress, colors, color, testID }: { label: string; selected: boolean; onPress: () => void; colors: ReturnType<typeof getColors>; color?: string | null; testID?: string }) {
  const selectedColor = color || colors.primary;
  return (
    <TouchableOpacity
      style={[styles.chip, { borderColor: selected ? selectedColor : colors.border, backgroundColor: selected ? selectedColor : colors.background }]}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      testID={testID}
    >
      {selected ? <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={12} color="#FFFFFF" /> : null}
      <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SelectableRow({ title, detail, selected, onPress, colors, compact, danger, testID }: { title: string; detail?: string; selected: boolean; onPress: () => void; colors: ReturnType<typeof getColors>; compact?: boolean; danger?: boolean; testID?: string }) {
  const tone = danger ? colors.error : colors.primary;
  return (
    <TouchableOpacity
      style={[styles.selectableRow, compact && styles.selectableRowCompact, { borderColor: selected ? tone : colors.border, backgroundColor: selected ? `${tone}12` : colors.card }]}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      testID={testID}
    >
      <View style={styles.flexOne}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        {detail ? <Text style={[styles.rowDetail, { color: colors.textSecondary }]} numberOfLines={2}>{detail}</Text> : null}
      </View>
      <IconSymbol ios_icon_name={selected ? 'checkmark.circle.fill' : 'circle'} android_material_icon_name={selected ? 'check_circle' : 'radio_button_unchecked'} size={22} color={selected ? tone : colors.textSecondary} />
    </TouchableOpacity>
  );
}

function SearchInput({ value, onChangeText, placeholder, colors, testID }: { value: string; onChangeText: (value: string) => void; placeholder: string; colors: ReturnType<typeof getColors>; testID?: string }) {
  return (
    <View style={[styles.search, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={18} color={colors.textSecondary} />
      <TextInput style={[styles.searchInput, { color: colors.text }]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textSecondary} autoCorrect={false} testID={testID} />
      {value ? (
        <TouchableOpacity onPress={() => onChangeText('')} accessibilityLabel="Clear search">
          <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function LabeledInput({ label, value, onChangeText, colors, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; colors: ReturnType<typeof getColors>; keyboardType?: 'default' | 'number-pad' | 'numbers-and-punctuation' }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} value={value} onChangeText={onChangeText} placeholderTextColor={colors.textSecondary} keyboardType={keyboardType} />
    </View>
  );
}

function Notice({ title, detail, tone, colors }: { title: string; detail: string; tone: 'info' | 'success' | 'warning' | 'error'; colors: ReturnType<typeof getColors> }) {
  const color = tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : tone === 'error' ? colors.error : colors.secondary;
  return (
    <View style={[styles.notice, { borderColor: color, backgroundColor: `${color}10` }]}>
      <IconSymbol ios_icon_name={tone === 'success' ? 'checkmark.shield.fill' : tone === 'error' ? 'exclamationmark.triangle.fill' : 'info.circle.fill'} android_material_icon_name={tone === 'success' ? 'verified_user' : tone === 'error' ? 'warning' : 'info'} size={20} color={color} />
      <View style={styles.flexOne}>
        <Text style={[styles.noticeTitle, { color }]}>{title}</Text>
        <Text style={[styles.noticeDetail, { color: colors.textSecondary }]}>{detail}</Text>
      </View>
    </View>
  );
}

function EmptyCard({ title, detail, colors }: { title: string; detail: string; colors: ReturnType<typeof getColors> }) {
  return (
    <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <IconSymbol ios_icon_name="tray" android_material_icon_name="inbox" size={24} color={colors.textSecondary} />
      <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.centerText, { color: colors.textSecondary }]}>{detail}</Text>
    </View>
  );
}

function SummaryLine({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof getColors> }) {
  return (
    <View style={[styles.summaryLine, { borderBottomColor: colors.border }]}>
      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function MetricGrid({ items, colors }: { items: { label: string; value: number }[]; colors: ReturnType<typeof getColors> }) {
  return (
    <View style={styles.metricGrid}>
      {items.map((item) => (
        <View key={item.label} style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.metricValue, { color: colors.text }]}>{item.value}</Text>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function PersonSection({ title, people, totalCount = people.length, colors, danger, muted }: { title: string; people: OwnerBulkAssignmentPreviewPerson[]; totalCount?: number; colors: ReturnType<typeof getColors>; danger?: boolean; muted?: boolean }) {
  return (
    <SectionCard title={title} detail={totalCount === people.length ? `${people.length} shown` : `${people.length} of ${totalCount} shown`} colors={colors}>
      <View style={styles.listGap}>
        {people.map((person) => {
          const status = person.status ?? (danger ? 'conflict' : muted ? 'excluded' : 'included');
          const tone = danger ? colors.error : muted ? colors.textSecondary : itemTone(status, colors);
          return (
            <View key={`${title}-${person.playerId}`} style={[styles.personRow, { borderBottomColor: colors.border }]}>
              <View style={styles.flexOne}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{person.name}</Text>
                <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>{person.reasons.join(' · ') || 'Server selection'}</Text>
                {person.conflictCode ? <Text style={[styles.reasonCode, { color: colors.error }]}>{cleanLabel(person.conflictCode)}</Text> : null}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${tone}18` }]}>
                <Text style={[styles.statusBadgeText, { color: tone }]}>{cleanLabel(status)}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </SectionCard>
  );
}

function BatchItemSection({ items, colors }: { items: OwnerBulkAssignmentBatchItem[]; colors: ReturnType<typeof getColors> }) {
  const visibleItems = items.slice(0, DETAIL_RENDER_LIMIT);
  return (
    <SectionCard title="Batch results" detail={`${items.length} item${items.length === 1 ? '' : 's'}`} colors={colors}>
      <View style={styles.listGap}>
        {visibleItems.map((item) => {
          const tone = itemTone(item.status, colors);
          return (
            <View key={item.itemId} style={[styles.personRow, { borderBottomColor: colors.border }]}>
              <View style={styles.flexOne}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>{item.name || `Player ${item.playerId.slice(0, 8)}`}</Text>
                {item.message ? <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>{item.message}</Text> : null}
                {item.reasonCode ? <Text style={[styles.reasonCode, { color: tone }]}>{cleanLabel(item.reasonCode)}</Text> : null}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${tone}18` }]}>
                <Text style={[styles.statusBadgeText, { color: tone }]}>{cleanLabel(item.status)}</Text>
              </View>
            </View>
          );
        })}
        {items.length > visibleItems.length ? (
          <Text style={[styles.listLimitHint, { color: colors.textSecondary }]}>Showing the first {visibleItems.length} of {items.length} results.</Text>
        ) : null}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flexOne: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  centerPadded: { paddingHorizontal: 24 },
  centerText: { textAlign: 'center', lineHeight: 20 },
  loadingText: { fontSize: 14 },
  emptyTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerButton: { width: 40, height: 40, borderWidth: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerButtonSpacer: { width: 40 },
  headerCopy: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 19, fontWeight: '800' },
  headerSubtitle: { fontSize: 12, marginTop: 2 },
  progressWrap: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  progressItem: { flex: 1, alignItems: 'center', gap: 4 },
  progressDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  progressNumber: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  progressLabel: { fontSize: 10, fontWeight: '600' },
  scrollContent: { padding: 16 },
  stepContent: { gap: 14 },
  sectionHeading: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 16, padding: 15, gap: 12 },
  cardHeader: { gap: 3 },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  cardDetail: { fontSize: 13, lineHeight: 18 },
  operationGrid: { flexDirection: 'row', gap: 8 },
  operationButton: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 11, gap: 4 },
  operationTitle: { fontSize: 14, fontWeight: '800' },
  operationDetail: { fontSize: 10, lineHeight: 14 },
  typeRow: { gap: 8, paddingBottom: 2 },
  typeButton: { borderWidth: 1, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeButtonText: { fontSize: 13, fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipText: { fontSize: 13, fontWeight: '600' },
  search: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15 },
  listGap: { gap: 8 },
  listLimitHint: { fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8, paddingVertical: 4 },
  selectableRow: { minHeight: 70, borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  selectableRowCompact: { minHeight: 58, paddingVertical: 10 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowDetail: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logicNote: { fontSize: 13, lineHeight: 18, paddingHorizontal: 3 },
  inlineFields: { flexDirection: 'row', gap: 10 },
  field: { gap: 5 },
  fieldLabel: { fontSize: 12, fontWeight: '700' },
  input: { minHeight: 45, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  notice: { borderWidth: 1, borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  noticeTitle: { fontSize: 14, fontWeight: '800' },
  noticeDetail: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  emptyCard: { borderWidth: 1, borderRadius: 14, padding: 20, alignItems: 'center', gap: 7 },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingBottom: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  summaryLabel: { fontSize: 13 },
  summaryValue: { flex: 1, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricCard: { width: '31%', flexGrow: 1, minWidth: 95, borderWidth: 1, borderRadius: 13, padding: 12 },
  metricValue: { fontSize: 22, fontWeight: '900' },
  metricLabel: { fontSize: 11, marginTop: 3 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  statusBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5 },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  reasonCode: { fontSize: 10, fontWeight: '700', marginTop: 3 },
  primaryButton: { minHeight: 48, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondaryButton: { minHeight: 46, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  dangerButton: { minHeight: 46, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dangerButtonText: { fontSize: 14, fontWeight: '800' },
  footer: { minHeight: 68, paddingTop: 10, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  footerSecondary: { minWidth: 90, minHeight: 46, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  footerPrimary: { minWidth: 142, minHeight: 46, borderRadius: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
});
