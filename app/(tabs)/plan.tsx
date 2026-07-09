import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { useUserRole } from '@/hooks/useUserRole';
import { getColors } from '@/styles/commonStyles';
import {
  TrainingTemplateItemInput,
  TrainingTemplateSummary,
  TrainingTemplateType,
  archiveOwnerTrainingTemplate,
  duplicateOwnerTrainingTemplate,
  fetchOwnerTrainingTemplates,
  fetchOwnerTrainingTemplatesContext,
  restoreOwnerTrainingTemplate,
  saveOwnerTrainingTemplate,
} from '@/services/trainingTemplateService';
import type { OwnerPlayerCrmWorkspace } from '@/services/ownerPlayerCrmService';

type PlanSection = 'templates' | 'tasks' | 'programs' | 'assignments';
type TemplateStatusFilter = 'active' | 'archived';
type TemplateTypeFilter = 'all' | TrainingTemplateType;

type DraftItem = TrainingTemplateItemInput & {
  localId: string;
};

type TemplateDraft = {
  id: string | null;
  templateType: TrainingTemplateType;
  title: string;
  description: string;
  folderId: string | null;
  focusInput: string;
  durationInput: string;
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
  { value: 'session', label: 'Session', icon: 'calendar', materialIcon: 'event' },
  { value: 'week', label: 'Week', icon: 'calendar.badge.clock', materialIcon: 'event_note' },
];

const PLAN_SECTIONS: {
  value: PlanSection;
  label: string;
  icon: string;
  materialIcon: string;
}[] = [
  { value: 'templates', label: 'Skabeloner', icon: 'rectangle.3.group', materialIcon: 'dashboard' },
  { value: 'tasks', label: 'Opgaver', icon: 'checklist', materialIcon: 'checklist' },
  { value: 'programs', label: 'Programmer', icon: 'list.bullet.rectangle', materialIcon: 'view_list' },
  { value: 'assignments', label: 'Tildelinger', icon: 'person.2.fill', materialIcon: 'groups' },
];

const ITEM_TYPES: {
  value: DraftItem['itemType'];
  label: string;
  icon: string;
  materialIcon: string;
}[] = [
  { value: 'task_template', label: 'Task', icon: 'checklist', materialIcon: 'checklist' },
  { value: 'activity', label: 'Activity', icon: 'calendar', materialIcon: 'event' },
  { value: 'session_template', label: 'Session', icon: 'rectangle.3.group', materialIcon: 'dashboard' },
  { value: 'focus', label: 'Focus', icon: 'scope', materialIcon: 'center_focus_strong' },
  { value: 'note', label: 'Note', icon: 'doc.text', materialIcon: 'description' },
];

const createLocalId = () => `item:${Date.now()}:${Math.random().toString(36).slice(2)}`;

function normalizeFocusInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    )
  ).slice(0, 12);
}

function parsePositiveInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : null;
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return 'No duration';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function templateTypeLabel(type: TrainingTemplateType): string {
  return TEMPLATE_TYPES.find((item) => item.value === type)?.label ?? type;
}

function getTemplateTone(type: TrainingTemplateType, colors: ReturnType<typeof getColors>): string {
  if (type === 'week') return colors.accent;
  if (type === 'session') return colors.secondary;
  return colors.primary;
}

function createEmptyDraft(type: TrainingTemplateType = 'session'): TemplateDraft {
  return {
    id: null,
    templateType: type,
    title: '',
    description: '',
    folderId: null,
    focusInput: '',
    durationInput: '',
    status: 'active',
    items: [],
  };
}

function createDraftFromTemplate(template: TrainingTemplateSummary): TemplateDraft {
  return {
    id: template.id,
    templateType: template.templateType,
    title: template.title,
    description: template.description ?? '',
    folderId: template.folderId,
    focusInput: template.focusAreas.join(', '),
    durationInput: template.durationMinutes ? String(template.durationMinutes) : '',
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
      dayOffset: item.dayOffset,
      startTime: item.startTime,
      durationMinutes: item.durationMinutes,
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
  const { userRole, loading: roleLoading } = useUserRole();
  const [context, setContext] = useState<{ workspaces: OwnerPlayerCrmWorkspace[]; defaultOwnerAccountId: string | null } | null>(null);
  const [activeOwnerAccountId, setActiveOwnerAccountId] = useState<string | null>(null);
  const [payload, setPayload] = useState<Awaited<ReturnType<typeof fetchOwnerTrainingTemplates>> | null>(null);
  const [activeSection, setActiveSection] = useState<PlanSection>('templates');
  const [statusFilter, setStatusFilter] = useState<TemplateStatusFilter>('active');
  const [typeFilter, setTypeFilter] = useState<TemplateTypeFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftVisible, setDraftVisible] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft>(() => createEmptyDraft());
  const [itemTitle, setItemTitle] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemType, setItemType] = useState<DraftItem['itemType']>('task_template');
  const [itemDayOffset, setItemDayOffset] = useState('');
  const [itemDuration, setItemDuration] = useState('');

  const canAccessPlan = userRole === 'admin' || userRole === 'trainer';

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
    return (payload?.templates ?? []).filter((template) => {
      if (template.status !== statusFilter) return false;
      if (typeFilter !== 'all' && template.templateType !== typeFilter) return false;
      return true;
    });
  }, [payload?.templates, statusFilter, typeFilter]);

  const resetItemDraft = useCallback(() => {
    setItemTitle('');
    setItemDescription('');
    setItemType('task_template');
    setItemDayOffset('');
    setItemDuration('');
  }, []);

  const openCreate = useCallback((type: TrainingTemplateType = 'session') => {
    setDraft(createEmptyDraft(type));
    resetItemDraft();
    setDraftVisible(true);
  }, [resetItemDraft]);

  const openEdit = useCallback((template: TrainingTemplateSummary) => {
    setDraft(createDraftFromTemplate(template));
    resetItemDraft();
    setDraftVisible(true);
  }, [resetItemDraft]);

  const onRefresh = useCallback(async () => {
    if (!activeOwnerAccountId) return;
    setRefreshing(true);
    try {
      await loadTemplates(activeOwnerAccountId);
    } finally {
      setRefreshing(false);
    }
  }, [activeOwnerAccountId, loadTemplates]);

  const addDraftItem = useCallback(() => {
    const title = itemTitle.trim();
    if (!title) return;
    setDraft((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          localId: createLocalId(),
          itemType,
          title,
          description: itemDescription.trim() || null,
          dayOffset: parsePositiveInt(itemDayOffset) ?? 0,
          durationMinutes: parsePositiveInt(itemDuration),
          sortOrder: current.items.length,
          config: {},
        },
      ],
    }));
    resetItemDraft();
  }, [itemDayOffset, itemDescription, itemDuration, itemTitle, itemType, resetItemDraft]);

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
      const next = await saveOwnerTrainingTemplate({
        id: draft.id,
        ownerAccountId: activeOwnerAccountId,
        templateType: draft.templateType,
        title,
        description: draft.description.trim() || null,
        folderId: draft.folderId,
        focusAreas: normalizeFocusInput(draft.focusInput),
        durationMinutes: parsePositiveInt(draft.durationInput),
        status: draft.status,
        items: draft.items.map((item, sortOrder) => ({
          ...item,
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

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]} testID="plan.screen">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 16) + 10 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
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

        <View style={styles.sectionSelector} testID="plan.sectionSelector">
          {PLAN_SECTIONS.map((section) => {
            const active = activeSection === section.value;
            return (
              <TouchableOpacity
                key={section.value}
                style={[
                  styles.sectionButton,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setActiveSection(section.value)}
                activeOpacity={0.84}
                testID={`plan.section.${section.value}`}
              >
                <IconSymbol
                  ios_icon_name={section.icon as any}
                  android_material_icon_name={section.materialIcon as any}
                  size={18}
                  color={active ? '#FFFFFF' : colors.textSecondary}
                />
                <Text style={[styles.sectionButtonText, { color: active ? '#FFFFFF' : colors.text }]} numberOfLines={1}>
                  {section.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {error ? (
          <View style={[styles.notice, { borderColor: colors.error, backgroundColor: colors.card }]}>
            <Text style={[styles.noticeTitle, { color: colors.error }]}>Could not load plan</Text>
            <Text style={[styles.noticeText, { color: colors.textSecondary }]}>{error}</Text>
          </View>
        ) : null}

        {activeSection === 'templates' ? (
          <>
            <View style={styles.summaryGrid}>
              <SummaryTile label="Active" value={String(payload?.summary.active ?? 0)} colors={colors} tone={colors.success} />
              <SummaryTile label="Sessions" value={String(payload?.summary.session ?? 0)} colors={colors} tone={colors.secondary} />
              <SummaryTile label="Weeks" value={String(payload?.summary.week ?? 0)} colors={colors} tone={colors.accent} />
            </View>

            <View style={styles.filterBlock}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                <FilterChip label="Active" active={statusFilter === 'active'} onPress={() => setStatusFilter('active')} colors={colors} />
                <FilterChip label="Archived" active={statusFilter === 'archived'} onPress={() => setStatusFilter('archived')} colors={colors} />
                <FilterChip label="All types" active={typeFilter === 'all'} onPress={() => setTypeFilter('all')} colors={colors} />
                {TEMPLATE_TYPES.map((type) => (
                  <FilterChip
                    key={type.value}
                    label={type.label}
                    active={typeFilter === type.value}
                    onPress={() => setTypeFilter(type.value)}
                    colors={colors}
                  />
                ))}
              </ScrollView>
            </View>

            <View style={styles.actionRow}>
              {TEMPLATE_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[styles.createButton, { backgroundColor: getTemplateTone(type.value, colors) }]}
                  onPress={() => openCreate(type.value)}
                  activeOpacity={0.88}
                  testID={`plan.template.create.${type.value}`}
                >
                  <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={16} color="#FFFFFF" />
                  <Text style={styles.createButtonText}>{type.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.templateList} testID="plan.templates.list">
              {templates.length ? (
                templates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    colors={colors}
                    onEdit={() => openEdit(template)}
                    onDuplicate={() => duplicateTemplate(template)}
                    onArchive={() => toggleArchive(template)}
                    busy={saving}
                  />
                ))
              ) : (
                <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <IconSymbol ios_icon_name="rectangle.3.group" android_material_icon_name="dashboard" size={34} color={colors.textSecondary} />
                  <Text style={[styles.emptyCardText, { color: colors.textSecondary }]}>
                    No templates in this view.
                  </Text>
                </View>
              )}
            </View>
          </>
        ) : null}

        {activeSection === 'tasks' ? (
          <PlanShortcutCard
            title="Task templates"
            detail="Task library"
            icon="checklist"
            materialIcon="checklist"
            colors={colors}
            onPress={() => router.push('/(tabs)/tasks' as any)}
          />
        ) : null}

        {activeSection === 'programs' ? (
          <PlanShortcutCard
            title="Programmer"
            detail="Program builder"
            icon="list.bullet"
            materialIcon="view_list"
            colors={colors}
            onPress={() => undefined}
          />
        ) : null}

        {activeSection === 'assignments' ? (
          <PlanShortcutCard
            title="Tildelinger"
            detail="Bulk assignment"
            icon="person.2.fill"
            materialIcon="groups"
            colors={colors}
            onPress={() => undefined}
          />
        ) : null}
      </ScrollView>

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
                    onPress={() => setDraft((current) => ({ ...current, templateType: type.value }))}
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
            <LabeledInput
              label="Focus areas"
              value={draft.focusInput}
              onChangeText={(value) => setDraft((current) => ({ ...current, focusInput: value }))}
              colors={colors}
              placeholder="Finishing, first touch, scanning"
            />
            <LabeledInput
              label="Duration minutes"
              value={draft.durationInput}
              onChangeText={(value) => setDraft((current) => ({ ...current, durationInput: value.replace(/[^0-9]/g, '') }))}
              colors={colors}
              placeholder="60"
              keyboardType="number-pad"
            />

            <View style={styles.modalSectionHeader}>
              <Text style={[styles.modalSectionTitle, { color: colors.text }]}>Items</Text>
              <Text style={[styles.modalSectionCount, { color: colors.textSecondary }]}>{draft.items.length}</Text>
            </View>

            <View style={[styles.itemComposer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.itemTypeRow}>
                {ITEM_TYPES.map((type) => {
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
                      onPress={() => setItemType(type.value)}
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
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={itemTitle}
                onChangeText={setItemTitle}
                placeholder="Item title"
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
              <View style={styles.itemMetaRow}>
                <TextInput
                  style={[styles.input, styles.itemMetaInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={itemDayOffset}
                  onChangeText={(value) => setItemDayOffset(value.replace(/[^0-9]/g, ''))}
                  placeholder="Day"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                />
                <TextInput
                  style={[styles.input, styles.itemMetaInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={itemDuration}
                  onChangeText={(value) => setItemDuration(value.replace(/[^0-9]/g, ''))}
                  placeholder="Min"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                />
                <TouchableOpacity
                  style={[styles.addItemButton, { backgroundColor: colors.primary, opacity: itemTitle.trim() ? 1 : 0.55 }]}
                  onPress={addDraftItem}
                  disabled={!itemTitle.trim()}
                >
                  <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={16} color="#FFFFFF" />
                  <Text style={styles.addItemText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>

            {draft.items.map((item, index) => (
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
                    {item.dayOffset ? ` · day ${item.dayOffset + 1}` : ''}
                    {item.durationMinutes ? ` · ${formatDuration(item.durationMinutes)}` : ''}
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
            ))}

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
    </View>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  colors,
}: {
  label: string;
  value: string;
  tone: string;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <View style={[styles.summaryTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.summaryValue, { color: tone }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.filterChip,
        {
          backgroundColor: active ? colors.primary : colors.card,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.84}
    >
      <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TemplateCard({
  template,
  colors,
  onEdit,
  onDuplicate,
  onArchive,
  busy,
}: {
  template: TrainingTemplateSummary;
  colors: ReturnType<typeof getColors>;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  busy: boolean;
}) {
  const tone = getTemplateTone(template.templateType, colors);
  return (
    <View style={[styles.templateCard, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`plan.template.${template.templateType}`}>
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
            {templateTypeLabel(template.templateType)} · v{template.versionNumber} · {template.itemCount} items
          </Text>
        </View>
        <View style={[styles.statusBadge, { borderColor: template.status === 'archived' ? colors.textSecondary : colors.success }]}>
          <Text style={[styles.statusBadgeText, { color: template.status === 'archived' ? colors.textSecondary : colors.success }]}>
            {template.status}
          </Text>
        </View>
      </View>

      {template.description ? (
        <Text style={[styles.templateDescription, { color: colors.textSecondary }]} numberOfLines={2}>
          {template.description}
        </Text>
      ) : null}

      <View style={styles.templatePills}>
        <InfoPill text={formatDuration(template.durationMinutes)} colors={colors} />
        {template.folderName ? <InfoPill text={template.folderName} colors={colors} /> : null}
        {template.focusAreas.slice(0, 3).map((focus) => (
          <InfoPill key={focus} text={focus} colors={colors} />
        ))}
      </View>

      <View style={styles.cardActions}>
        <TemplateAction label="Edit" icon="pencil" materialIcon="edit" colors={colors} onPress={onEdit} disabled={busy} />
        <TemplateAction label="Copy" icon="doc.on.doc" materialIcon="content_copy" colors={colors} onPress={onDuplicate} disabled={busy} />
        <TemplateAction
          label={template.status === 'archived' ? 'Restore' : 'Archive'}
          icon={template.status === 'archived' ? 'arrow.uturn.backward.circle' : 'archivebox'}
          materialIcon={template.status === 'archived' ? 'unarchive' : 'archive'}
          colors={colors}
          onPress={onArchive}
          disabled={busy}
        />
      </View>
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

function TemplateAction({
  label,
  icon,
  materialIcon,
  colors,
  onPress,
  disabled,
}: {
  label: string;
  icon: string;
  materialIcon: string;
  colors: ReturnType<typeof getColors>;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.cardActionButton, { borderColor: colors.border, opacity: disabled ? 0.5 : 1 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.84}
    >
      <IconSymbol ios_icon_name={icon as any} android_material_icon_name={materialIcon as any} size={16} color={colors.primary} />
      <Text style={[styles.cardActionText, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
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
  keyboardType?: 'default' | 'number-pad';
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

function PlanShortcutCard({
  title,
  detail,
  icon,
  materialIcon,
  colors,
  onPress,
}: {
  title: string;
  detail: string;
  icon: string;
  materialIcon: string;
  colors: ReturnType<typeof getColors>;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.shortcutCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.84}
    >
      <View style={[styles.shortcutIcon, { backgroundColor: `${colors.primary}18`, borderColor: colors.primary }]}>
        <IconSymbol ios_icon_name={icon as any} android_material_icon_name={materialIcon as any} size={22} color={colors.primary} />
      </View>
      <View style={styles.shortcutBody}>
        <Text style={[styles.shortcutTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.shortcutDetail, { color: colors.textSecondary }]}>{detail}</Text>
      </View>
      <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron_right" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
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
  sectionSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  sectionButton: {
    width: '48.5%',
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 7,
  },
  sectionButtonText: {
    fontSize: 13,
    fontWeight: '900',
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
  summaryGrid: {
    flexDirection: 'row',
    columnGap: 8,
    marginBottom: 12,
  },
  summaryTile: {
    flex: 1,
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  summaryValue: {
    fontSize: 23,
    fontWeight: '900',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  filterBlock: {
    marginBottom: 12,
  },
  filterRow: {
    columnGap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    columnGap: 8,
    marginBottom: 14,
  },
  createButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 6,
    paddingHorizontal: 8,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  templateList: {
    rowGap: 10,
  },
  templateCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
  },
  templateIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  templateTitle: {
    fontSize: 16,
    fontWeight: '900',
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
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 9,
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
  shortcutCard: {
    minHeight: 76,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 12,
  },
  shortcutIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutBody: {
    flex: 1,
    minWidth: 0,
  },
  shortcutTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  shortcutDetail: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
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
  },
  addItemText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
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
