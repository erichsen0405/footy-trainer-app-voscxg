import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { endOfWeek, format, getWeek, parseISO, startOfWeek } from "date-fns";
import { enUS } from "date-fns/locale";
import { useLocalSearchParams, useRouter } from "expo-router";
import { IconSymbol } from "@/components/IconSymbol";
import TaskDetailsModal from "@/components/TaskDetailsModal";
import { usePlayerProgramExperience } from "@/hooks/usePlayerProgramExperience";
import type {
  PlayerProgramExperienceEnrollment,
  PlayerProgramExperienceItem,
} from "@/services/trainingProgramService";
import { setPlayerProgramItemCompletion } from "@/services/trainingProgramService";
import { getColors } from "@/styles/commonStyles";

type SelectedProgramTask = {
  enrollment: PlayerProgramExperienceEnrollment;
  item: PlayerProgramExperienceItem;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeDate(value: string) {
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function itemStatusLabel(status: PlayerProgramExperienceItem["status"]) {
  if (status === "today") return "Today";
  if (status === "overdue") return "Needs attention";
  if (status === "completed") return "Done";
  if (status === "skipped") return "Skipped";
  return "Upcoming";
}

function isCompletable(item: PlayerProgramExperienceItem) {
  return Boolean(item.taskId || item.activityId);
}

function progressForItems(items: PlayerProgramExperienceItem[]) {
  const countableItems = items.filter(isCompletable);
  const completedItems = countableItems.filter(
    (item) => item.status === "completed",
  ).length;
  const totalItems = countableItems.length;
  return {
    completedItems,
    totalItems,
    percent:
      totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
  };
}

function itemKind(item: PlayerProgramExperienceItem) {
  if (item.activityId) return "Activity";
  if (item.taskId) return "Task";
  return "Focus";
}

function weekKey(value: string) {
  const date = safeDate(value);
  return date
    ? format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd")
    : value;
}

function groupItemsByDate(items: PlayerProgramExperienceItem[]) {
  const groups = new Map<string, PlayerProgramExperienceItem[]>();
  items.forEach((item) =>
    groups.set(item.scheduledDate, [
      ...(groups.get(item.scheduledDate) ?? []),
      item,
    ]),
  );
  return [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

function groupItemsByWeek(items: PlayerProgramExperienceItem[]) {
  const groups = new Map<string, PlayerProgramExperienceItem[]>();
  items.forEach((item) => {
    const key = weekKey(item.scheduledDate);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  return [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

function OwnerIdentity({
  enrollment,
}: {
  enrollment: PlayerProgramExperienceEnrollment;
}) {
  return (
    <View style={styles.ownerRow}>
      {enrollment.owner.logoUrl ? (
        <Image source={{ uri: enrollment.owner.logoUrl }} style={styles.logo} />
      ) : null}
      <Text style={styles.ownerText} numberOfLines={1}>
        {enrollment.owner.displayName}
      </Text>
    </View>
  );
}

function ProgressBar({
  percent,
  color,
  track,
}: {
  percent: number;
  color: string;
  track: string;
}) {
  return (
    <View style={[styles.progressTrack, { backgroundColor: track }]}>
      <View
        style={[
          styles.progressFill,
          {
            backgroundColor: color,
            width: `${Math.max(0, Math.min(100, percent))}%`,
          },
        ]}
      />
    </View>
  );
}

function ProgramItemRow({
  item,
  accent,
  isDark,
  busy,
  onOpen,
  onToggle,
}: {
  item: PlayerProgramExperienceItem;
  accent: string;
  isDark: boolean;
  busy: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const colors = getColors(isDark ? "dark" : "light");
  const kind = itemKind(item);
  const openable = Boolean(item.activityId || item.taskId);
  const done = item.status === "completed";
  const icon = item.activityId
    ? { ios: "calendar", android: "calendar_today" }
    : item.taskId
      ? { ios: "checklist", android: "checklist" }
      : { ios: "scope", android: "flag" };

  return (
    <View
      testID={`playerPrograms.item.${item.id}`}
      style={[
        styles.programItemCard,
        {
          backgroundColor: isDark ? "#2A2A2A" : colors.card,
          borderColor: done ? `${accent}70` : colors.border,
        },
      ]}
    >
      <Pressable
        accessibilityRole={openable ? "button" : undefined}
        accessibilityLabel={openable ? `Open ${item.title}` : undefined}
        disabled={!openable}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.programItemMain,
          pressed && openable && styles.pressed,
        ]}
      >
        <View style={[styles.itemIcon, { backgroundColor: `${accent}18` }]}>
          <IconSymbol
            ios_icon_name={icon.ios as any}
            android_material_icon_name={icon.android as any}
            size={18}
            color={accent}
          />
        </View>
        <View style={styles.grow}>
          <View style={styles.itemTitleRow}>
            <Text style={[styles.itemTitle, { color: colors.text }]}>
              {item.title}
            </Text>
            <Text
              style={[
                styles.kindChip,
                { color: accent, borderColor: `${accent}45` },
              ]}
            >
              {kind}
            </Text>
          </View>
          {item.description ? (
            <Text
              style={{ color: colors.textSecondary }}
              numberOfLines={kind === "Focus" ? 3 : 2}
            >
              {item.description}
            </Text>
          ) : null}
          <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
            {item.phaseTitle ? `${item.phaseTitle} · ` : ""}
            {itemStatusLabel(item.status)}
          </Text>
        </View>
        {openable ? (
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={18}
            color={colors.textSecondary}
          />
        ) : null}
      </Pressable>

      {item.taskId ? (
        <Pressable
          testID={`playerPrograms.item.${item.id}.complete`}
          accessibilityRole="button"
          accessibilityLabel={
            done
              ? `Mark ${item.title} as not completed`
              : `Mark ${item.title} as completed`
          }
          disabled={busy}
          onPress={onToggle}
          style={({ pressed }) => [
            styles.quickComplete,
            {
              borderColor: `${accent}55`,
              backgroundColor: done ? `${accent}16` : "transparent",
            },
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <>
              <IconSymbol
                ios_icon_name={done ? "checkmark.circle.fill" : "circle"}
                android_material_icon_name={
                  done ? "check-circle" : "radio-button-unchecked"
                }
                size={17}
                color={accent}
              />
              <Text style={{ color: accent, fontWeight: "800" }}>
                {done ? "Undo" : "Done"}
              </Text>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

function ProgramDays({
  enrollment,
  items,
  isDark,
  busyItemId,
  onOpenTask,
  onOpenActivity,
  onToggle,
}: {
  enrollment: PlayerProgramExperienceEnrollment;
  items: PlayerProgramExperienceItem[];
  isDark: boolean;
  busyItemId: string | null;
  onOpenTask: (selection: SelectedProgramTask) => void;
  onOpenActivity: (item: PlayerProgramExperienceItem) => void;
  onToggle: (item: PlayerProgramExperienceItem) => void;
}) {
  const colors = getColors(isDark ? "dark" : "light");
  const accent = enrollment.owner.brandColors.accent || colors.primary;

  return (
    <View style={styles.days}>
      {groupItemsByDate(items).map(([dateKey, dayItems]) => {
        const date = safeDate(dateKey);
        const tasks = dayItems.filter((item) => Boolean(item.taskId)).length;
        const activities = dayItems.filter((item) =>
          Boolean(item.activityId),
        ).length;
        return (
          <View key={dateKey} style={styles.dayGroup}>
            <View
              style={[
                styles.dayHeader,
                {
                  backgroundColor: isDark ? "#21342A" : "#EEF7F1",
                  borderColor: `${accent}28`,
                },
              ]}
            >
              <View>
                <Text
                  style={[
                    styles.dayTitle,
                    { color: isDark ? "#D8EFE1" : "#1D3A2A" },
                  ]}
                >
                  {date ? format(date, "EEEE", { locale: enUS }) : dateKey}
                </Text>
                <Text style={{ color: colors.textSecondary }}>
                  {date ? format(date, "MMM d") : ""}
                </Text>
              </View>
              <View style={styles.dayCounts}>
                {activities ? (
                  <Text
                    style={[styles.dayCount, { color: colors.textSecondary }]}
                  >
                    Activities {activities}
                  </Text>
                ) : null}
                {tasks ? (
                  <Text
                    style={[styles.dayCount, { color: colors.textSecondary }]}
                  >
                    Tasks {tasks}
                  </Text>
                ) : null}
              </View>
            </View>
            {dayItems.map((item) => (
              <ProgramItemRow
                key={item.id}
                item={item}
                accent={accent}
                isDark={isDark}
                busy={busyItemId === item.id}
                onOpen={() => {
                  if (item.activityId) onOpenActivity(item);
                  else if (item.taskId) onOpenTask({ enrollment, item });
                }}
                onToggle={() => onToggle(item)}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function EnrollmentHeader({
  enrollment,
  compact = false,
  progress = enrollment.progress,
}: {
  enrollment: PlayerProgramExperienceEnrollment;
  compact?: boolean;
  progress?: PlayerProgramExperienceEnrollment["progress"];
}) {
  const colors = getColors(useColorScheme());
  const accent = enrollment.owner.brandColors.accent || colors.primary;
  return (
    <View style={styles.enrollmentHeader}>
      <OwnerIdentity enrollment={enrollment} />
      <View style={styles.row}>
        <View style={styles.grow}>
          <Text
            style={[
              compact ? styles.compactProgramTitle : styles.title,
              { color: colors.text },
            ]}
          >
            {enrollment.program.title}
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            {enrollment.startDate} – {enrollment.endDate}
          </Text>
        </View>
        <Text style={[styles.percent, { color: accent }]}>
          {progress.percent}%
        </Text>
      </View>
      <ProgressBar
        percent={progress.percent}
        color={accent}
        track={colors.border}
      />
      <Text style={{ color: colors.textSecondary }}>
        {progress.completedItems}/{progress.totalItems} tasks and activities
        completed
      </Text>
    </View>
  );
}

function useProgramItemActions(refresh: () => Promise<void>) {
  const router = useRouter();
  const [selectedTask, setSelectedTask] = useState<SelectedProgramTask | null>(
    null,
  );
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const toggle = async (item: PlayerProgramExperienceItem) => {
    if (!item.taskId) return;
    setBusyItemId(item.id);
    try {
      await setPlayerProgramItemCompletion(
        item.id,
        item.status !== "completed",
      );
      await refresh();
    } catch (cause) {
      Alert.alert(
        "Could not update task",
        cause instanceof Error ? cause.message : "Try again.",
      );
    } finally {
      setBusyItemId(null);
    }
  };

  const openActivity = (item: PlayerProgramExperienceItem) => {
    if (!item.activityId) return;
    router.push({
      pathname: "/activity-details",
      params: {
        id: item.activityId,
        activityId: item.activityId,
        ...(item.taskId ? { openTaskId: item.taskId } : {}),
      },
    } as any);
  };

  return { selectedTask, setSelectedTask, busyItemId, toggle, openActivity };
}

function ProgramTaskModal({
  selection,
  busy,
  onClose,
  onToggle,
}: {
  selection: SelectedProgramTask | null;
  busy: boolean;
  onClose: () => void;
  onToggle: (item: PlayerProgramExperienceItem) => void;
}) {
  const isDark = useColorScheme() === "dark";
  if (!selection) return null;
  const accent = selection.enrollment.owner.brandColors.accent || "#4CAF50";
  return (
    <TaskDetailsModal
      visible
      title={selection.item.title}
      description={selection.item.description ?? undefined}
      reminderMinutes={selection.item.reminderMinutes}
      categoryColor={accent}
      isDark={isDark}
      completed={selection.item.status === "completed"}
      isSaving={busy}
      onClose={onClose}
      onComplete={() => onToggle(selection.item)}
    />
  );
}

export function PlayerProgramHomeCard() {
  const router = useRouter();
  const isDark = useColorScheme() === "dark";
  const colors = getColors(isDark ? "dark" : "light");
  const { experience, loading, error, refresh } = usePlayerProgramExperience();
  const actions = useProgramItemActions(refresh);
  const currentWeek = useMemo(() => {
    const today =
      safeDate(experience?.today ?? new Date().toISOString().slice(0, 10)) ??
      new Date();
    return {
      start: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      end: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    };
  }, [experience?.today]);
  const relevant = useMemo(() => {
    const overlapping = (experience?.enrollments ?? [])
      .filter(
        (enrollment) =>
          enrollment.status !== "cancelled" &&
          enrollment.startDate <= currentWeek.end &&
          enrollment.endDate >= currentWeek.start,
      )
      .map((enrollment) => ({
        enrollment,
        items: enrollment.items.filter(
          (item) =>
            item.scheduledDate >= currentWeek.start &&
            item.scheduledDate <= currentWeek.end,
        ),
      }));
    const scheduled = overlapping.filter(({ items }) => items.length > 0);
    if (scheduled.length) return scheduled;
    return overlapping
      .filter(
        ({ enrollment }) => enrollment.id === experience?.activeEnrollmentId,
      )
      .slice(0, 1);
  }, [
    currentWeek.end,
    currentWeek.start,
    experience?.activeEnrollmentId,
    experience?.enrollments,
  ]);

  if (loading && !experience)
    return (
      <View testID="home.playerProgram.loading" style={styles.homeLoading}>
        <ActivityIndicator />
      </View>
    );
  if (error || !relevant.length) return null;

  return (
    <View
      testID="home.playerProgram.card"
      style={[styles.homeProgramSection, { borderColor: colors.border }]}
    >
      <View style={styles.sectionHeadingRow}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
            PROGRAMS THIS WEEK
          </Text>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Coach-assigned plan
          </Text>
        </View>
        <Pressable
          testID="home.playerProgram.open"
          onPress={() => router.push("/(tabs)/programs" as any)}
          style={({ pressed }) => [
            styles.openProgramsButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={{ color: colors.primary, fontWeight: "800" }}>
            Full program
          </Text>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={16}
            color={colors.primary}
          />
        </Pressable>
      </View>

      {relevant.map(({ enrollment, items }) => (
        <View
          key={enrollment.id}
          style={[
            styles.homeEnrollment,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <EnrollmentHeader
            enrollment={enrollment}
            compact
            progress={progressForItems(items)}
          />
          {items.length ? (
            <ProgramDays
              enrollment={enrollment}
              items={items}
              isDark={isDark}
              busyItemId={actions.busyItemId}
              onOpenTask={actions.setSelectedTask}
              onOpenActivity={actions.openActivity}
              onToggle={(item) => void actions.toggle(item)}
            />
          ) : (
            <View
              style={[
                styles.noWeekItems,
                { backgroundColor: isDark ? "#21342A" : "#EEF7F1" },
              ]}
            >
              <IconSymbol
                ios_icon_name="calendar"
                android_material_icon_name="calendar_today"
                size={17}
                color={colors.textSecondary}
              />
              <Text style={{ color: colors.textSecondary }}>
                No program activities or tasks scheduled this week.
              </Text>
            </View>
          )}
        </View>
      ))}
      <ProgramTaskModal
        selection={actions.selectedTask}
        busy={actions.busyItemId === actions.selectedTask?.item.id}
        onClose={() => actions.setSelectedTask(null)}
        onToggle={(item) => {
          void actions
            .toggle(item)
            .finally(() => actions.setSelectedTask(null));
        }}
      />
    </View>
  );
}

export function PlayerProgramProgressCard() {
  const router = useRouter();
  const colors = getColors(useColorScheme());
  const { experience, loading } = usePlayerProgramExperience();
  const active =
    experience?.enrollments.find(
      (item) => item.id === experience.activeEnrollmentId,
    ) ?? null;
  if (loading && !experience) return null;
  if (!active) return null;
  const accent = active.owner.brandColors.accent || colors.primary;

  return (
    <Pressable
      testID="performance.playerProgram.card"
      style={({ pressed }) => [
        styles.progressCard,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
      onPress={() =>
        router.push({
          pathname: "/(tabs)/programs",
          params: { enrollmentId: active.id },
        } as any)
      }
    >
      <View style={styles.row}>
        <View style={styles.grow}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
            PROGRAM PROGRESS
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>
            {active.program.title}
          </Text>
        </View>
        <Text style={[styles.percent, { color: accent }]}>
          {active.progress.percent}%
        </Text>
      </View>
      <ProgressBar
        percent={active.progress.percent}
        color={accent}
        track={colors.border}
      />
      <Text style={{ color: colors.textSecondary }}>
        {active.progress.completedItems}/{active.progress.totalItems} tasks and
        activities complete
      </Text>
    </Pressable>
  );
}

export function PlayerProgramsExperienceScreen() {
  const params = useLocalSearchParams<{
    enrollmentId?: string | string[];
    itemId?: string | string[];
  }>();
  const requestedEnrollmentId = firstParam(params.enrollmentId);
  const requestedItemId = firstParam(params.itemId);
  const isDark = useColorScheme() === "dark";
  const colors = getColors(isDark ? "dark" : "light");
  const { experience, loading, refreshing, error, refresh } =
    usePlayerProgramExperience();
  const actions = useProgramItemActions(refresh);
  const openedRequestRef = useRef<string | null>(null);
  const enrollments = useMemo(() => {
    const rows =
      experience?.enrollments.filter((item) => item.status !== "cancelled") ??
      [];
    if (!requestedEnrollmentId) return rows;
    return [...rows].sort(
      (a, b) =>
        Number(b.id === requestedEnrollmentId) -
        Number(a.id === requestedEnrollmentId),
    );
  }, [experience?.enrollments, requestedEnrollmentId]);

  useEffect(() => {
    if (!requestedItemId || openedRequestRef.current === requestedItemId)
      return;
    for (const enrollment of enrollments) {
      const item = enrollment.items.find(
        (candidate) => candidate.id === requestedItemId,
      );
      if (!item) continue;
      openedRequestRef.current = requestedItemId;
      if (item.activityId) actions.openActivity(item);
      else if (item.taskId) actions.setSelectedTask({ enrollment, item });
      break;
    }
  }, [actions, enrollments, requestedItemId]);

  if (loading && !experience)
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
      </View>
    );

  return (
    <ScrollView
      testID="playerPrograms.screen"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.screenContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
        />
      }
    >
      <View>
        <Text style={[styles.screenTitle, { color: colors.text }]}>
          My programs
        </Text>
        <Text style={{ color: colors.textSecondary }}>
          Your normal weekly plan, organized by coach program.
        </Text>
      </View>
      {error ? (
        <View
          style={[
            styles.messageCard,
            { borderColor: colors.error, backgroundColor: colors.card },
          ]}
        >
          <Text style={{ color: colors.error, fontWeight: "700" }}>
            Could not load your programs
          </Text>
          <Text style={{ color: colors.textSecondary }}>{error}</Text>
          <Pressable onPress={() => void refresh()}>
            <Text style={{ color: colors.primary, fontWeight: "800" }}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : null}
      {!error && !enrollments.length ? (
        <View
          testID="playerPrograms.empty"
          style={[
            styles.messageCard,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
        >
          <Text style={[styles.title, { color: colors.text }]}>
            No coach program yet
          </Text>
          <Text style={{ color: colors.textSecondary }}>
            Your personal activities and tasks are still available. A program
            will appear here when a coach assigns one.
          </Text>
        </View>
      ) : null}

      {enrollments.map((enrollment) => {
        const accent = enrollment.owner.brandColors.accent || colors.primary;
        return (
          <View
            key={enrollment.id}
            testID={`playerPrograms.enrollment.${enrollment.id}`}
            style={[
              styles.enrollmentCard,
              {
                backgroundColor: colors.card,
                borderColor:
                  enrollment.id === requestedEnrollmentId
                    ? accent
                    : colors.border,
              },
            ]}
          >
            <EnrollmentHeader enrollment={enrollment} />
            {enrollment.program.description ? (
              <Text style={{ color: colors.text }}>
                {enrollment.program.description}
              </Text>
            ) : null}
            {groupItemsByWeek(enrollment.items).map(([startKey, items]) => {
              const start = safeDate(startKey);
              const end = start ? endOfWeek(start, { weekStartsOn: 1 }) : null;
              return (
                <View key={startKey} style={styles.programWeek}>
                  <View style={styles.weekHeading}>
                    <View>
                      <Text
                        style={[
                          styles.eyebrow,
                          { color: colors.textSecondary },
                        ]}
                      >
                        PROGRAM WEEK
                      </Text>
                      <Text style={[styles.weekTitle, { color: colors.text }]}>
                        {start
                          ? `Week ${getWeek(start, { weekStartsOn: 1, locale: enUS })}`
                          : startKey}
                      </Text>
                    </View>
                    <Text style={{ color: colors.textSecondary }}>
                      {start && end
                        ? `${format(start, "MMM d")} – ${format(end, "MMM d")}`
                        : ""}
                    </Text>
                  </View>
                  <ProgramDays
                    enrollment={enrollment}
                    items={items}
                    isDark={isDark}
                    busyItemId={actions.busyItemId}
                    onOpenTask={actions.setSelectedTask}
                    onOpenActivity={actions.openActivity}
                    onToggle={(item) => void actions.toggle(item)}
                  />
                </View>
              );
            })}
          </View>
        );
      })}
      <ProgramTaskModal
        selection={actions.selectedTask}
        busy={actions.busyItemId === actions.selectedTask?.item.id}
        onClose={() => actions.setSelectedTask(null)}
        onToggle={(item) => {
          void actions
            .toggle(item)
            .finally(() => actions.setSelectedTask(null));
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  ownerRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  logo: { width: 24, height: 24, borderRadius: 7 },
  ownerText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  title: { fontSize: 20, fontWeight: "800" },
  compactProgramTitle: { fontSize: 18, fontWeight: "800" },
  sectionTitle: { fontSize: 21, fontWeight: "800" },
  screenTitle: { fontSize: 28, fontWeight: "900" },
  percent: { fontSize: 20, fontWeight: "900" },
  progressTrack: { height: 8, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  pressed: { opacity: 0.72 },
  homeLoading: { marginHorizontal: 16, padding: 20 },
  homeProgramSection: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
    gap: 12,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  openProgramsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 8,
  },
  homeEnrollment: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  enrollmentHeader: { gap: 8 },
  noWeekItems: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    padding: 12,
  },
  days: { gap: 14 },
  dayGroup: { gap: 8 },
  dayHeader: {
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayTitle: { fontSize: 17, fontWeight: "800" },
  dayCounts: { alignItems: "flex-end", gap: 2 },
  dayCount: { fontSize: 12, fontWeight: "700" },
  programItemCard: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  programItemMain: {
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemTitle: { flex: 1, fontSize: 16, fontWeight: "800" },
  kindChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  itemMeta: { fontSize: 12, marginTop: 3, fontWeight: "600" },
  quickComplete: {
    minHeight: 42,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  progressCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    gap: 10,
    marginBottom: 18,
  },
  screenContent: { padding: 16, paddingTop: 24, paddingBottom: 120, gap: 16 },
  messageCard: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 8 },
  enrollmentCard: { borderWidth: 1.5, borderRadius: 24, padding: 16, gap: 16 },
  programWeek: {
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(100,116,139,0.25)",
    paddingTop: 14,
  },
  weekHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
  },
  weekTitle: { fontSize: 22, fontWeight: "800" },
});
