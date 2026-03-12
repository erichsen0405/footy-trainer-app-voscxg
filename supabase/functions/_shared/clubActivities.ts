// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { AppError } from './http.ts';

type QueryResult<T> = Promise<{ data: T | null; error: { message?: string } | null }>;

type ServiceClient = {
  from: (table: string) => {
    select: (columns: string) => any;
  };
  rpc: <T>(fn: string, args?: Record<string, unknown>) => QueryResult<T>;
};

type ClubMemberRow = {
  id: string;
  club_id: string;
  user_id: string;
  full_name: string | null;
  email: string;
  role: 'owner' | 'admin' | 'coach' | 'player';
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
};

type TeamRow = {
  id: string;
  club_id: string | null;
  name: string;
  admin_id: string | null;
  created_at: string | null;
};

type TeamMemberRow = {
  team_id: string;
  player_id: string;
};

type ExternalCalendarRow = {
  id: string;
  name: string;
};

type ActivityCategoryRow = {
  id: string;
  name: string;
  color: string | null;
  emoji: string | null;
};

type ActivityTargetType = 'member' | 'team';

export type ClubActivityMemberOption = {
  targetType: 'member';
  targetId: string;
  memberId: string;
  fullName: string | null;
  email: string;
  role: 'owner' | 'admin' | 'coach' | 'player';
  status: 'active' | 'inactive';
  label: string;
};

export type ClubActivityTeamOption = {
  targetType: 'team';
  targetId: string;
  teamId: string;
  name: string;
  adminUserId: string | null;
  adminName: string | null;
  memberCount: number;
  label: string;
};

export type ClubActivityFilters = {
  clubId: string;
  members: ClubActivityMemberOption[];
  teams: ClubActivityTeamOption[];
  defaultTarget: {
    targetType: ActivityTargetType;
    targetId: string;
  } | null;
};

export type ClubActivityFeedbackEntry = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  activityId: string;
  taskTemplateId: string;
  taskInstanceId: string | null;
  rating: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClubActivityCategory = {
  id: string | null;
  name: string | null;
  color: string | null;
  emoji: string | null;
};

export type ClubActivityTaskMirror = {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  reminderMinutes: number | null;
  afterTrainingEnabled: boolean;
  afterTrainingDelayMinutes: number | null;
  taskDurationEnabled: boolean;
  taskDurationMinutes: number | null;
  feedbackTemplateId: string | null;
  taskTemplateId: string | null;
  subtasks: Array<{
    id: string;
    title: string;
    completed: boolean;
    sortOrder: number;
  }>;
  feedback: ClubActivityFeedbackEntry | null;
  feedbackEntries: ClubActivityFeedbackEntry[];
};

export type ClubActivityMirrorItem = {
  id: string;
  sourceType: 'internal' | 'external';
  title: string;
  activityDate: string;
  activityTime: string;
  activityEndDate: string | null;
  activityEndTime: string | null;
  location: string | null;
  ownerUserId: string | null;
  playerId: string | null;
  teamId: string | null;
  intensity: number | null;
  intensityEnabled: boolean;
  intensityNote: string | null;
  externalCalendarId: string | null;
  externalCalendarName: string | null;
  externalEventId: string | null;
  externalEventRowId: string | null;
  durationMinutes: number;
  category: ClubActivityCategory | null;
  tasks: ClubActivityTaskMirror[];
};

export type ClubActivityDaySummary = {
  dayKey: string;
  activityCount: number;
  totalTasks: number;
  totalMinutes: number;
  totalHours: number;
  activityIds: string[];
};

export type ClubActivityWeekSummary = {
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  activityCount: number;
  totalTasks: number;
  totalMinutes: number;
  totalHours: number;
  dayKeys: string[];
  days: ClubActivityDaySummary[];
};

export type ClubActivityCalendarMonth = {
  monthKey: string;
  monthStart: string;
  monthEnd: string;
  dayKeys: string[];
};

export type ClubActivityMirrorResult = {
  clubId: string;
  target: ClubActivityMemberOption | ClubActivityTeamOption;
  dateRange: {
    dateFrom: string;
    dateTo: string;
  };
  totalActivities: number;
  totalTasks: number;
  totalMinutes: number;
  totalHours: number;
  activities: ClubActivityMirrorItem[];
  sections: {
    days: ClubActivityDaySummary[];
    weeks: ClubActivityWeekSummary[];
  };
  calendar: {
    days: ClubActivityDaySummary[];
    months: ClubActivityCalendarMonth[];
  };
};

type ClubActivityMirrorWorkItem = ClubActivityMirrorItem & {
  feedbackActivityIds: string[];
  rawTasks?: any[];
};

type ActivityFiltersInput = {
  clubId: string;
};

type ActivityMirrorInput = {
  clubId: string;
  targetType: ActivityTargetType;
  targetId: string;
  dateFrom: string | null;
  dateTo: string | null;
};

type ClubActivityActorAccess = {
  actorRole: 'platform_admin' | 'owner' | 'admin' | 'coach';
  linkedPlayerIds: string[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 1000;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('VALIDATION_ERROR', 'Request body must be an object.', 400);
  }

  return value as Record<string, unknown>;
}

function requireUuid(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a valid UUID.`, 400);
  }

  return value.trim();
}

function requireDateString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value.trim())) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a YYYY-MM-DD date.`, 400);
  }

  return value.trim();
}

function optionalDateString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return requireDateString(value, fieldName);
}

function requireTargetType(value: unknown): ActivityTargetType {
  if (value !== 'member' && value !== 'team') {
    throw new AppError('VALIDATION_ERROR', 'targetType must be member or team.', 400);
  }

  return value;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

function sortByLabel<T extends { label: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.label.localeCompare(right.label, 'da'));
}

function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function getDefaultActivityDateRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  return {
    dateFrom: addMonths(now, -6).toISOString().slice(0, 10),
    dateTo: addMonths(now, 6).toISOString().slice(0, 10),
  };
}

function parseIsoDate(dateValue: string): Date {
  const [year, month, day] = dateValue.split('-').map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatIsoDateUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysUtc(dateValue: string, days: number): string {
  const date = parseIsoDate(dateValue);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDateUtc(date);
}

function getWeekStartIso(dateValue: string): string {
  const date = parseIsoDate(dateValue);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return formatIsoDateUtc(date);
}

function getMonthKey(dateValue: string): string {
  return dateValue.slice(0, 7);
}

function getMonthStartIso(monthKey: string): string {
  return `${monthKey}-01`;
}

function getMonthEndIso(monthKey: string): string {
  const [year, month] = monthKey.split('-').map((part) => Number(part));
  const nextMonth = new Date(Date.UTC(year, month, 1));
  nextMonth.setUTCDate(nextMonth.getUTCDate() - 1);
  return formatIsoDateUtc(nextMonth);
}

function roundHours(minutes: number): number {
  return Math.round((Math.max(0, minutes) / 60) * 10) / 10;
}

function mapActivityCategory(value: unknown): ClubActivityCategory | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = normalizeString(record.id);
  const name = normalizeString(record.name);
  const color = normalizeString(record.color);
  const emoji = normalizeString(record.emoji);

  if (!id && !name && !color && !emoji) {
    return null;
  }

  return { id, name, color, emoji };
}

function isFeedbackTask(task: Record<string, unknown>): boolean {
  return Boolean(normalizeString(task.feedback_template_id) || /^feedback\s+p[\u00e5a]/i.test(String(task.title ?? '').trim()));
}

function resolveTaskTemplateId(task: Record<string, unknown>): string | null {
  return normalizeString(task.task_template_id) ?? normalizeString(task.feedback_template_id);
}

function dedupeIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function getTaskDurationMinutes(task: ClubActivityTaskMirror): number {
  if (task.feedbackTemplateId) {
    return 0;
  }

  if (!task.taskDurationEnabled) {
    return 0;
  }

  return Math.max(0, task.taskDurationMinutes || 0);
}

function getActivityDurationMinutes(activity: ClubActivityMirrorItem): number {
  const internalStart = normalizeString(activity.activityDate)
    ? new Date(`${activity.activityDate}T${activity.activityTime || '00:00:00'}`)
    : null;
  const endDate = activity.activityEndDate || activity.activityDate;
  const internalEnd = activity.activityEndTime && endDate
    ? new Date(`${endDate}T${activity.activityEndTime}`)
    : null;

  if (internalStart && internalEnd) {
    const diffMinutes = (internalEnd.getTime() - internalStart.getTime()) / 60000;
    if (Number.isFinite(diffMinutes) && diffMinutes > 0) {
      return diffMinutes;
    }
  }

  return 0;
}

function getActivityEffectiveDurationMinutes(activity: ClubActivityMirrorItem): number {
  const hasTaskDuration = activity.tasks.some((task) => task.taskDurationEnabled && !task.feedbackTemplateId);
  if (hasTaskDuration) {
    return activity.tasks.reduce((sum, task) => sum + getTaskDurationMinutes(task), 0);
  }

  return getActivityDurationMinutes(activity);
}

function buildDaySummaries(activities: ClubActivityMirrorItem[]): ClubActivityDaySummary[] {
  const byDay = new Map<string, ClubActivityDaySummary>();

  activities.forEach((activity) => {
    const dayKey = activity.activityDate;
    const current = byDay.get(dayKey) || {
      dayKey,
      activityCount: 0,
      totalTasks: 0,
      totalMinutes: 0,
      totalHours: 0,
      activityIds: [],
    };

    current.activityCount += 1;
    current.totalTasks += activity.tasks.length;
    current.totalMinutes += getActivityEffectiveDurationMinutes(activity);
    current.activityIds.push(activity.id);
    current.totalHours = roundHours(current.totalMinutes);
    byDay.set(dayKey, current);
  });

  return Array.from(byDay.values()).sort((left, right) => left.dayKey.localeCompare(right.dayKey));
}

function buildWeekSummaries(days: ClubActivityDaySummary[]): ClubActivityWeekSummary[] {
  const byWeek = new Map<string, ClubActivityWeekSummary>();

  days.forEach((day) => {
    const weekStart = getWeekStartIso(day.dayKey);
    const current = byWeek.get(weekStart) || {
      weekKey: weekStart,
      weekStart,
      weekEnd: addDaysUtc(weekStart, 6),
      activityCount: 0,
      totalTasks: 0,
      totalMinutes: 0,
      totalHours: 0,
      dayKeys: [],
      days: [],
    };

    current.activityCount += day.activityCount;
    current.totalTasks += day.totalTasks;
    current.totalMinutes += day.totalMinutes;
    current.totalHours = roundHours(current.totalMinutes);
    current.dayKeys.push(day.dayKey);
    current.days.push(day);
    byWeek.set(weekStart, current);
  });

  return Array.from(byWeek.values())
    .map((week) => ({
      ...week,
      dayKeys: [...week.dayKeys].sort((left, right) => left.localeCompare(right)),
      days: [...week.days].sort((left, right) => left.dayKey.localeCompare(right.dayKey)),
    }))
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart));
}

function buildCalendarMonths(days: ClubActivityDaySummary[]): ClubActivityCalendarMonth[] {
  const byMonth = new Map<string, ClubActivityCalendarMonth>();

  days.forEach((day) => {
    const monthKey = getMonthKey(day.dayKey);
    const current = byMonth.get(monthKey) || {
      monthKey,
      monthStart: getMonthStartIso(monthKey),
      monthEnd: getMonthEndIso(monthKey),
      dayKeys: [],
    };

    current.dayKeys.push(day.dayKey);
    byMonth.set(monthKey, current);
  });

  return Array.from(byMonth.values())
    .map((month) => ({
      ...month,
      dayKeys: [...month.dayKeys].sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey));
}

async function fetchAllPages<T>(
  runPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message?: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await runPage(from, to);
    if (error) {
      throw new AppError('INTERNAL_ERROR', error.message || 'Backend query failed.', 500);
    }

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      return rows;
    }

    from += PAGE_SIZE;
  }
}

async function loadLinkedPlayerIds(client: ServiceClient, coachUserId: string): Promise<string[]> {
  const { data, error } = await client
    .from('admin_player_relationships')
    .select('player_id')
    .eq('admin_id', coachUserId);

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load coach-player links.', 500);
  }

  return dedupeIds((data || []).map((row: any) => normalizeString(row.player_id)));
}

async function getClubActivityActorAccess(
  client: ServiceClient,
  actorUserId: string,
  clubId: string,
): Promise<ClubActivityActorAccess> {
  const { data: platformAdminRow, error: platformAdminError } = await client
    .from('platform_admins')
    .select('id')
    .eq('user_id', actorUserId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (platformAdminError) {
    throw new AppError('INTERNAL_ERROR', platformAdminError.message || 'Could not verify platform admin.', 500);
  }

  if (platformAdminRow) {
    return {
      actorRole: 'platform_admin',
      linkedPlayerIds: [],
    };
  }

  const { data, error } = await client
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', actorUserId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not verify club access.', 500);
  }

  if (!data || !['owner', 'admin', 'coach'].includes(String((data as any).role ?? ''))) {
    throw new AppError('FORBIDDEN', 'You do not have access to this club.', 403);
  }

  const actorRole = String((data as any).role) as ClubActivityActorAccess['actorRole'];
  return {
    actorRole,
    linkedPlayerIds: actorRole === 'coach'
      ? await loadLinkedPlayerIds(client, actorUserId)
      : [],
  };
}

async function loadClubContext(client: ServiceClient, clubId: string) {
  const { data, error } = await client
    .from('club_members')
    .select('id, club_id, user_id, full_name, email, role, status, created_at, updated_at')
    .eq('club_id', clubId)
    .eq('status', 'active')
    .order('role')
    .order('email');

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load club members.', 500);
  }

  const members = ((data || []) as ClubMemberRow[]).filter((row) => UUID_PATTERN.test(String(row.user_id ?? '')));
  const userIds = dedupeIds(members.map((member) => member.user_id));

  const profilesByUserId = new Map<string, string | null>();
  if (userIds.length) {
    const { data: profiles, error: profilesError } = await client
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', userIds);

    if (profilesError) {
      throw new AppError('INTERNAL_ERROR', profilesError.message || 'Could not load profiles.', 500);
    }

    ((profiles || []) as ProfileRow[]).forEach((profile) => {
      profilesByUserId.set(profile.user_id, normalizeString(profile.full_name));
    });
  }

  return {
    members,
    userIds,
    profilesByUserId,
  };
}

async function loadDerivedTeams(
  client: ServiceClient,
  clubId: string,
  profilesByUserId: Map<string, string | null>,
) {
  const { data: directTeams, error: directTeamsError } = await client
    .from('teams')
    .select('id, club_id, name, admin_id, created_at')
    .eq('club_id', clubId);

  if (directTeamsError) {
    throw new AppError('INTERNAL_ERROR', directTeamsError.message || 'Could not load teams.', 500);
  }

  const directTeamRows = (directTeams || []) as TeamRow[];
  if (!directTeamRows.length) {
    return {
      teams: [] as ClubActivityTeamOption[],
      teamMemberRows: [] as TeamMemberRow[],
      teamsById: new Map<string, ClubActivityTeamOption>(),
    };
  }

  const { data: teamMemberRowsData, error: teamMembersError } = await client
    .from('team_members')
    .select('team_id, player_id')
    .in('team_id', directTeamRows.map((team) => team.id));

  if (teamMembersError) {
    throw new AppError('INTERNAL_ERROR', teamMembersError.message || 'Could not load team members.', 500);
  }

  const teamMemberRows = (teamMemberRowsData || []) as TeamMemberRow[];
  const memberCountByTeamId = new Map<string, number>();
  teamMemberRows.forEach((row) => {
    memberCountByTeamId.set(row.team_id, (memberCountByTeamId.get(row.team_id) || 0) + 1);
  });

  const teams = sortByLabel(
    directTeamRows.map((team) => {
      const adminName = team.admin_id ? profilesByUserId.get(team.admin_id) ?? null : null;
      const memberCount = memberCountByTeamId.get(team.id) || 0;
      return {
        targetType: 'team' as const,
        targetId: team.id,
        teamId: team.id,
        name: team.name,
        adminUserId: team.admin_id,
        adminName,
        memberCount,
        label: memberCount > 0 ? `${team.name} (${memberCount})` : team.name,
      };
    })
  );

  return {
    teams,
    teamMemberRows,
    teamsById: new Map(teams.map((team) => [team.teamId, team])),
  };
}

function buildMemberOptions(members: ClubMemberRow[], profilesByUserId: Map<string, string | null>): ClubActivityMemberOption[] {
  const roleRank: Record<ClubMemberRow['role'], number> = {
    owner: 0,
    admin: 1,
    coach: 2,
    player: 3,
  };

  return [...members]
    .sort((left, right) => {
      const rankDiff = roleRank[left.role] - roleRank[right.role];
      if (rankDiff !== 0) {
        return rankDiff;
      }

      const leftName = profilesByUserId.get(left.user_id) || left.full_name || left.email;
      const rightName = profilesByUserId.get(right.user_id) || right.full_name || right.email;
      return leftName.localeCompare(rightName, 'da');
    })
    .map((member) => {
      const fullName = profilesByUserId.get(member.user_id) || normalizeString(member.full_name);
      const roleLabel = member.role === 'coach' ? 'træner' : member.role === 'player' ? 'spiller' : member.role;
      return {
        targetType: 'member',
        targetId: member.user_id,
        memberId: member.id,
        fullName,
        email: member.email,
        role: member.role,
        status: member.status,
        label: fullName ? `${fullName} (${roleLabel})` : `${member.email} (${roleLabel})`,
      };
    });
}

function resolveDefaultTarget(
  members: ClubActivityMemberOption[],
  teams: ClubActivityTeamOption[],
): ClubActivityFilters['defaultTarget'] {
  const preferredMember = members.find((member) => member.role === 'coach')
    || members.find((member) => member.role === 'player')
    || members[0];

  if (preferredMember) {
    return {
      targetType: 'member',
      targetId: preferredMember.targetId,
    };
  }

  const firstTeam = teams[0];
  if (firstTeam) {
    return {
      targetType: 'team',
      targetId: firstTeam.targetId,
    };
  }

  return null;
}

export function parseClubActivityFiltersBody(body: unknown): ActivityFiltersInput {
  const record = asRecord(body);
  return {
    clubId: requireUuid(record.clubId, 'clubId'),
  };
}

export function parseClubActivityMirrorBody(body: unknown): ActivityMirrorInput {
  const record = asRecord(body);
  return {
    clubId: requireUuid(record.clubId, 'clubId'),
    targetType: requireTargetType(record.targetType),
    targetId: requireUuid(record.targetId, 'targetId'),
    dateFrom: optionalDateString(record.dateFrom, 'dateFrom'),
    dateTo: optionalDateString(record.dateTo, 'dateTo'),
  };
}

export async function getClubActivityFiltersAction(
  client: ServiceClient,
  actorUserId: string,
  input: ActivityFiltersInput,
): Promise<ClubActivityFilters> {
  const access = await getClubActivityActorAccess(client, actorUserId, input.clubId);

  const { members, profilesByUserId } = await loadClubContext(client, input.clubId);
  const memberOptions = buildMemberOptions(members, profilesByUserId);
  const { teams } = await loadDerivedTeams(client, input.clubId, profilesByUserId);

  if (access.actorRole === 'coach') {
    const coachVisibleMembers = memberOptions.filter((member) =>
      member.targetId === actorUserId ||
      (member.role === 'player' && access.linkedPlayerIds.includes(member.targetId))
    );

    return {
      clubId: input.clubId,
      members: coachVisibleMembers,
      teams: [],
      defaultTarget: resolveDefaultTarget(
        coachVisibleMembers.sort((left, right) => {
          if (left.targetId === actorUserId) {
            return -1;
          }

          if (right.targetId === actorUserId) {
            return 1;
          }

          return left.label.localeCompare(right.label, 'da');
        }),
        [],
      ),
    };
  }

  return {
    clubId: input.clubId,
    members: memberOptions,
    teams,
    defaultTarget: resolveDefaultTarget(memberOptions, teams),
  };
}

function mapScopeFilter(userId: string, teamIds: string[]): string {
  const scopes = [
    `and(user_id.eq.${userId},player_id.is.null,team_id.is.null)`,
    `player_id.eq.${userId}`,
  ];

  if (teamIds.length) {
    scopes.push(`team_id.in.(${teamIds.join(',')})`);
  }

  return scopes.join(',');
}

async function fetchMemberTeamIds(client: ServiceClient, clubId: string, userId: string): Promise<string[]> {
  const { data, error } = await client
    .from('team_members')
    .select('team_id')
    .eq('player_id', userId);

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load member teams.', 500);
  }

  const rawTeamIds = dedupeIds((data || []).map((row: any) => normalizeString(row.team_id)));
  if (!rawTeamIds.length) {
    return [];
  }

  const { data: teamRows, error: teamRowsError } = await client
    .from('teams')
    .select('id')
    .eq('club_id', clubId)
    .in('id', rawTeamIds);

  if (teamRowsError) {
    throw new AppError('INTERNAL_ERROR', teamRowsError.message || 'Could not filter member teams.', 500);
  }

  return dedupeIds((teamRows || []).map((row: any) => normalizeString(row.id)));
}

async function fetchInternalActivities(
  client: ServiceClient,
  targetType: ActivityTargetType,
  targetId: string,
  teamScopeIds: string[],
  dateFrom: string,
  dateTo: string,
): Promise<any[]> {
  if (targetType === 'team') {
    return fetchAllPages<any>((from, to) =>
      client
        .from('activities')
        .select('id, user_id, player_id, team_id, title, activity_date, activity_time, activity_end_time, location, category_id, intensity, intensity_note, intensity_enabled, created_at, updated_at, activity_categories ( id, name, color, emoji ), activity_tasks ( *, activity_task_subtasks ( * ) )')
        .eq('team_id', targetId)
        .gte('activity_date', dateFrom)
        .lte('activity_date', dateTo)
        .order('activity_date', { ascending: true })
        .order('activity_time', { ascending: true })
        .order('created_at', { ascending: true })
        .range(from, to)
    );
  }

  const scopeFilter = mapScopeFilter(targetId, teamScopeIds);
  return fetchAllPages<any>((from, to) =>
    client
      .from('activities')
      .select('id, user_id, player_id, team_id, title, activity_date, activity_time, activity_end_time, location, category_id, intensity, intensity_note, intensity_enabled, created_at, updated_at, activity_categories ( id, name, color, emoji ), activity_tasks ( *, activity_task_subtasks ( * ) )')
      .or(scopeFilter)
      .gte('activity_date', dateFrom)
      .lte('activity_date', dateTo)
      .order('activity_date', { ascending: true })
      .order('activity_time', { ascending: true })
      .order('created_at', { ascending: true })
      .range(from, to)
  );
}

async function fetchExternalActivitiesForMember(
  client: ServiceClient,
  userId: string,
  teamScopeIds: string[],
  dateFrom: string,
  dateTo: string,
): Promise<{ activities: any[]; calendarNamesById: Map<string, string> }> {
  const { data: calendars, error: calendarsError } = await client
    .from('external_calendars')
    .select('id, name')
    .eq('user_id', userId)
    .eq('enabled', true);

  if (calendarsError) {
    throw new AppError('INTERNAL_ERROR', calendarsError.message || 'Could not load calendars.', 500);
  }

  const calendarRows = (calendars || []) as ExternalCalendarRow[];
  if (!calendarRows.length) {
    return {
      activities: [],
      calendarNamesById: new Map(),
    };
  }

  const calendarIds = calendarRows.map((calendar) => calendar.id);
  const calendarNamesById = new Map(calendarRows.map((calendar) => [calendar.id, calendar.name]));

  const events = await fetchAllPages<any>((from, to) =>
    client
      .from('events_external')
      .select('id, provider_event_uid, provider_calendar_id, title, location, start_date, start_time, end_date, end_time')
      .in('provider_calendar_id', calendarIds)
      .eq('deleted', false)
      .gte('start_date', dateFrom)
      .lte('start_date', dateTo)
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true })
      .range(from, to)
  );

  if (!events.length) {
    return {
      activities: [],
      calendarNamesById,
    };
  }

  const eventRowIds = dedupeIds(events.map((event) => normalizeString(event.id)));
  const providerUids = dedupeIds(events.map((event) => normalizeString(event.provider_event_uid)));
  const scopeFilter = mapScopeFilter(userId, teamScopeIds);
  const metaSelect = 'id, external_event_id, external_event_uid, user_id, player_id, team_id, local_title_override, category_id, intensity, intensity_note, intensity_enabled, activity_categories ( id, name, color, emoji ), external_event_tasks ( * )';

  const metaByEventId = eventRowIds.length
    ? await client
        .from('events_local_meta')
        .select(metaSelect)
        .or(scopeFilter)
        .in('external_event_id', eventRowIds)
    : { data: [], error: null };
  const metaByUid = providerUids.length
    ? await client
        .from('events_local_meta')
        .select(metaSelect)
        .or(scopeFilter)
        .in('external_event_uid', providerUids)
    : { data: [], error: null };

  if (metaByEventId.error) {
    throw new AppError('INTERNAL_ERROR', metaByEventId.error.message || 'Could not load external metadata.', 500);
  }
  if (metaByUid.error) {
    throw new AppError('INTERNAL_ERROR', metaByUid.error.message || 'Could not load external metadata.', 500);
  }

  const metaMap = new Map<string, any>();
  [...(metaByEventId.data || []), ...(metaByUid.data || [])].forEach((row: any) => {
    if (row?.id) {
      metaMap.set(String(row.id), row);
    }
  });

  const mergedMeta = Array.from(metaMap.values());
  const activities = events.map((event) => {
    const meta = mergedMeta.find((row) =>
      String(row?.external_event_id ?? '') === String(event.id) ||
      String(row?.external_event_uid ?? '') === String(event.provider_event_uid)
    );

    return {
      id: meta?.id || event.id,
      sourceType: 'external',
      title: normalizeString(meta?.local_title_override) || String(event.title ?? ''),
      activityDate: String(event.start_date),
      activityTime: normalizeString(event.start_time) || '12:00:00',
      activityEndDate: normalizeString(event.end_date) || String(event.start_date),
      activityEndTime: normalizeString(event.end_time),
      location: normalizeString(event.location),
      ownerUserId: normalizeString(meta?.user_id) || userId,
      playerId: normalizeString(meta?.player_id),
      teamId: normalizeString(meta?.team_id),
      intensity: normalizeNumber(meta?.intensity),
      intensityEnabled: meta?.intensity_enabled === true || normalizeNumber(meta?.intensity) !== null,
      intensityNote: normalizeString(meta?.intensity_note),
      externalCalendarId: normalizeString(event.provider_calendar_id),
      externalCalendarName: calendarNamesById.get(String(event.provider_calendar_id ?? '')) ?? null,
      externalEventId: normalizeString(event.provider_event_uid),
      externalEventRowId: normalizeString(event.id),
      durationMinutes: 0,
      category: mapActivityCategory(meta?.activity_categories),
      feedbackActivityIds: dedupeIds([normalizeString(meta?.id), normalizeString(event.id)]),
      rawTasks: Array.isArray(meta?.external_event_tasks) ? meta.external_event_tasks : [],
    };
  });

  return {
    activities,
    calendarNamesById,
  };
}

async function fetchExternalActivitiesForTeam(
  client: ServiceClient,
  teamId: string,
  dateFrom: string,
  dateTo: string,
): Promise<ClubActivityMirrorItem[]> {
  const { data: metaRows, error: metaError } = await client
    .from('events_local_meta')
    .select('id, external_event_id, external_event_uid, user_id, player_id, team_id, local_title_override, category_id, intensity, intensity_note, intensity_enabled, activity_categories ( id, name, color, emoji ), external_event_tasks ( * )')
    .eq('team_id', teamId);

  if (metaError) {
    throw new AppError('INTERNAL_ERROR', metaError.message || 'Could not load team external metadata.', 500);
  }

  const rows = Array.isArray(metaRows) ? metaRows : [];
  const eventIds = dedupeIds(rows.map((row: any) => normalizeString(row.external_event_id)));
  if (!eventIds.length) {
    return [];
  }

  const { data: events, error: eventsError } = await client
    .from('events_external')
    .select('id, provider_event_uid, provider_calendar_id, title, location, start_date, start_time, end_date, end_time')
    .in('id', eventIds)
    .eq('deleted', false)
    .gte('start_date', dateFrom)
    .lte('start_date', dateTo)
    .order('start_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (eventsError) {
    throw new AppError('INTERNAL_ERROR', eventsError.message || 'Could not load team external events.', 500);
  }

  return ((events || []) as any[]).map((event) => {
    const meta = rows.find((row: any) => String(row.external_event_id ?? '') === String(event.id));
    return {
      id: String(meta?.id || event.id),
      sourceType: 'external' as const,
      title: normalizeString(meta?.local_title_override) || String(event.title ?? ''),
      activityDate: String(event.start_date),
      activityTime: normalizeString(event.start_time) || '12:00:00',
      activityEndDate: normalizeString(event.end_date) || String(event.start_date),
      activityEndTime: normalizeString(event.end_time),
      location: normalizeString(event.location),
      ownerUserId: normalizeString(meta?.user_id),
      playerId: normalizeString(meta?.player_id),
      teamId: normalizeString(meta?.team_id),
      intensity: normalizeNumber(meta?.intensity),
      intensityEnabled: meta?.intensity_enabled === true || normalizeNumber(meta?.intensity) !== null,
      intensityNote: normalizeString(meta?.intensity_note),
      externalCalendarId: normalizeString(event.provider_calendar_id),
      externalCalendarName: null,
      externalEventId: normalizeString(event.provider_event_uid),
      externalEventRowId: normalizeString(event.id),
      durationMinutes: 0,
      category: mapActivityCategory(meta?.activity_categories),
      feedbackActivityIds: dedupeIds([normalizeString(meta?.id), normalizeString(event.id)]),
      tasks: [],
      rawTasks: Array.isArray(meta?.external_event_tasks) ? meta.external_event_tasks : [],
    } as ClubActivityMirrorItem & { rawTasks: any[] };
  });
}

function normalizeFeedbackRows(rows: any[], userNamesById: Map<string, { fullName: string | null; email: string | null }>): ClubActivityFeedbackEntry[] {
  return rows.map((row) => {
    const userId = String(row.user_id);
    const userInfo = userNamesById.get(userId) ?? { fullName: null, email: null };
    return {
      id: String(row.id),
      userId,
      userName: userInfo.fullName,
      userEmail: userInfo.email,
      activityId: String(row.activity_id),
      taskTemplateId: String(row.task_template_id),
      taskInstanceId: normalizeString(row.task_instance_id),
      rating: normalizeNumber(row.rating),
      note: normalizeString(row.note),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  });
}

function attachTasks(
  rawTasks: any[],
  feedbackEntries: ClubActivityFeedbackEntry[],
  preferSingleFeedback: boolean,
): ClubActivityTaskMirror[] {
  return (Array.isArray(rawTasks) ? rawTasks : []).map((task: any) => {
    const record = task as Record<string, unknown>;
    const taskId = String(record.id ?? '');
    const taskTemplateId = resolveTaskTemplateId(record);
    const isFeedback = isFeedbackTask(record);
    const matchedFeedbackEntries = isFeedback
      ? feedbackEntries.filter((entry) => {
          const sameTaskInstance = entry.taskInstanceId && entry.taskInstanceId === taskId;
          const sameTemplate = taskTemplateId && entry.taskTemplateId === taskTemplateId;
          return sameTaskInstance || sameTemplate;
        })
      : [];

    const subtasks = Array.isArray(record.activity_task_subtasks)
      ? record.activity_task_subtasks
          .map((subtask: any) => ({
            id: String(subtask.id),
            title: String(subtask.title ?? ''),
            completed: subtask.completed === true,
            sortOrder: typeof subtask.sort_order === 'number' ? subtask.sort_order : 0,
          }))
          .sort((left, right) => left.sortOrder - right.sortOrder)
      : [];

    return {
      id: taskId,
      title: String(record.title ?? ''),
      description: normalizeString(record.description),
      completed: record.completed === true,
      reminderMinutes: normalizeNumber(record.reminder_minutes),
      afterTrainingEnabled: normalizeBoolean(record.after_training_enabled),
      afterTrainingDelayMinutes: normalizeNumber(record.after_training_delay_minutes),
      taskDurationEnabled: normalizeBoolean(record.task_duration_enabled),
      taskDurationMinutes: normalizeNumber(record.task_duration_minutes),
      feedbackTemplateId: normalizeString(record.feedback_template_id),
      taskTemplateId,
      subtasks,
      feedback: preferSingleFeedback ? matchedFeedbackEntries[0] ?? null : null,
      feedbackEntries: matchedFeedbackEntries,
    };
  });
}

export async function getClubActivityMirrorAction(
  client: ServiceClient,
  actorUserId: string,
  input: ActivityMirrorInput,
): Promise<ClubActivityMirrorResult> {
  const access = await getClubActivityActorAccess(client, actorUserId, input.clubId);

  const { members, profilesByUserId } = await loadClubContext(client, input.clubId);
  const memberOptions = buildMemberOptions(members, profilesByUserId);
  const { teams, teamMemberRows, teamsById } = await loadDerivedTeams(client, input.clubId, profilesByUserId);

  const dateRange = {
    ...getDefaultActivityDateRange(),
    ...(input.dateFrom ? { dateFrom: input.dateFrom } : {}),
    ...(input.dateTo ? { dateTo: input.dateTo } : {}),
  };

  const selectedMember = input.targetType === 'member'
    ? memberOptions.find((member) => member.targetId === input.targetId) ?? null
    : null;
  const selectedTeam = input.targetType === 'team'
    ? teamsById.get(input.targetId) ?? null
    : null;

  if (input.targetType === 'member' && !selectedMember) {
    throw new AppError('MEMBER_NOT_FOUND', 'Member not found.', 404);
  }

  if (input.targetType === 'team' && !selectedTeam) {
    throw new AppError('VALIDATION_ERROR', 'Selected team is not linked to this club.', 400);
  }

  if (access.actorRole === 'coach') {
    if (input.targetType === 'team') {
      throw new AppError('FORBIDDEN', 'Coach can only view own and linked player activities.', 403);
    }

    if (
      selectedMember &&
      selectedMember.targetId !== actorUserId &&
      !access.linkedPlayerIds.includes(selectedMember.targetId)
    ) {
      throw new AppError('FORBIDDEN', 'Coach can only view own and linked player activities.', 403);
    }
  }

  const userNamesById = new Map<string, { fullName: string | null; email: string | null }>();
  memberOptions.forEach((member) => {
    userNamesById.set(member.targetId, {
      fullName: member.fullName,
      email: member.email,
    });
  });

  let activities: ClubActivityMirrorWorkItem[] = [];
  let feedbackRows: ClubActivityFeedbackEntry[] = [];

  if (selectedMember) {
    const teamScopeIds = await fetchMemberTeamIds(client, input.clubId, selectedMember.targetId);
    const [internalActivities, externalPayload] = await Promise.all([
      fetchInternalActivities(
        client,
        'member',
        selectedMember.targetId,
        teamScopeIds,
        dateRange.dateFrom,
        dateRange.dateTo,
      ),
      fetchExternalActivitiesForMember(
        client,
        selectedMember.targetId,
        teamScopeIds,
        dateRange.dateFrom,
        dateRange.dateTo,
      ),
    ]);

    const mappedInternal = internalActivities.map((activity: any) => ({
      id: String(activity.id),
      sourceType: 'internal' as const,
      title: String(activity.title ?? ''),
      activityDate: String(activity.activity_date),
      activityTime: String(activity.activity_time ?? '00:00:00'),
      activityEndDate: String(activity.activity_date),
      activityEndTime: normalizeString(activity.activity_end_time),
      location: normalizeString(activity.location),
      ownerUserId: normalizeString(activity.user_id),
      playerId: normalizeString(activity.player_id),
      teamId: normalizeString(activity.team_id),
      intensity: normalizeNumber(activity.intensity),
      intensityEnabled: activity.intensity_enabled === true || normalizeNumber(activity.intensity) !== null,
      intensityNote: normalizeString(activity.intensity_note),
      externalCalendarId: null,
      externalCalendarName: null,
      externalEventId: null,
      externalEventRowId: null,
      durationMinutes: 0,
      category: mapActivityCategory(activity.activity_categories),
      feedbackActivityIds: [String(activity.id)],
      rawTasks: Array.isArray(activity.activity_tasks) ? activity.activity_tasks : [],
      tasks: [],
    }));

    const mappedExternal = externalPayload.activities.map((activity: any) => ({
      ...activity,
      tasks: [],
    })) as ClubActivityMirrorWorkItem[];

    activities = [...mappedInternal, ...mappedExternal]
      .sort((left, right) => {
        const leftKey = `${left.activityDate}T${left.activityTime}`;
        const rightKey = `${right.activityDate}T${right.activityTime}`;
        return leftKey.localeCompare(rightKey);
      });

    const feedbackActivityIds = dedupeIds(activities.flatMap((activity) => activity.feedbackActivityIds));
    if (feedbackActivityIds.length) {
      const { data, error } = await client
        .from('task_template_self_feedback')
        .select('id, user_id, task_template_id, task_instance_id, activity_id, rating, note, created_at, updated_at')
        .eq('user_id', selectedMember.targetId)
        .in('activity_id', feedbackActivityIds)
        .order('created_at', { ascending: false });

      if (error) {
        throw new AppError('INTERNAL_ERROR', error.message || 'Could not load feedback.', 500);
      }

      feedbackRows = normalizeFeedbackRows(data || [], userNamesById);
    }
  } else if (selectedTeam) {
    const teamMemberIds = dedupeIds(
      teamMemberRows
        .filter((row) => row.team_id === selectedTeam.teamId)
        .map((row) => row.player_id)
    );

    const [internalActivities, externalActivities] = await Promise.all([
      fetchInternalActivities(
        client,
        'team',
        selectedTeam.teamId,
        [],
        dateRange.dateFrom,
        dateRange.dateTo,
      ),
      fetchExternalActivitiesForTeam(
        client,
        selectedTeam.teamId,
        dateRange.dateFrom,
        dateRange.dateTo,
      ),
    ]);

    const mappedInternal = internalActivities.map((activity: any) => ({
      id: String(activity.id),
      sourceType: 'internal' as const,
      title: String(activity.title ?? ''),
      activityDate: String(activity.activity_date),
      activityTime: String(activity.activity_time ?? '00:00:00'),
      activityEndDate: String(activity.activity_date),
      activityEndTime: normalizeString(activity.activity_end_time),
      location: normalizeString(activity.location),
      ownerUserId: normalizeString(activity.user_id),
      playerId: normalizeString(activity.player_id),
      teamId: normalizeString(activity.team_id),
      intensity: normalizeNumber(activity.intensity),
      intensityEnabled: activity.intensity_enabled === true || normalizeNumber(activity.intensity) !== null,
      intensityNote: normalizeString(activity.intensity_note),
      externalCalendarId: null,
      externalCalendarName: null,
      externalEventId: null,
      externalEventRowId: null,
      durationMinutes: 0,
      category: mapActivityCategory(activity.activity_categories),
      feedbackActivityIds: [String(activity.id)],
      rawTasks: Array.isArray(activity.activity_tasks) ? activity.activity_tasks : [],
      tasks: [],
    }));

    activities = [...mappedInternal, ...externalActivities]
      .sort((left, right) => {
        const leftKey = `${left.activityDate}T${left.activityTime}`;
        const rightKey = `${right.activityDate}T${right.activityTime}`;
        return leftKey.localeCompare(rightKey);
      }) as ClubActivityMirrorWorkItem[];

    const feedbackActivityIds = dedupeIds(activities.flatMap((activity) => activity.feedbackActivityIds));
    if (feedbackActivityIds.length && teamMemberIds.length) {
      const { data, error } = await client
        .from('task_template_self_feedback')
        .select('id, user_id, task_template_id, task_instance_id, activity_id, rating, note, created_at, updated_at')
        .in('user_id', teamMemberIds)
        .in('activity_id', feedbackActivityIds)
        .order('created_at', { ascending: false });

      if (error) {
        throw new AppError('INTERNAL_ERROR', error.message || 'Could not load team feedback.', 500);
      }

      feedbackRows = normalizeFeedbackRows(data || [], userNamesById);
    }
  }

  const hydratedActivities = activities.map((activity) => {
    const activityFeedback = feedbackRows.filter((entry) => activity.feedbackActivityIds.includes(entry.activityId));
    const tasks = attachTasks(activity.rawTasks || [], activityFeedback, input.targetType === 'member');
    const { rawTasks: _rawTasks, feedbackActivityIds: _feedbackActivityIds, ...rest } = activity;
    const durationMinutes = getActivityEffectiveDurationMinutes({
      ...(rest as ClubActivityMirrorItem),
      tasks,
    });
    return {
      ...rest,
      durationMinutes,
      tasks,
    };
  });

  const daySummaries = buildDaySummaries(hydratedActivities);
  const weekSummaries = buildWeekSummaries(daySummaries);
  const calendarMonths = buildCalendarMonths(daySummaries);
  const totalTasks = hydratedActivities.reduce((sum, activity) => sum + activity.tasks.length, 0);
  const totalMinutes = hydratedActivities.reduce((sum, activity) => sum + activity.durationMinutes, 0);

  return {
    clubId: input.clubId,
    target: selectedMember ?? (selectedTeam as ClubActivityTeamOption),
    dateRange,
    totalActivities: hydratedActivities.length,
    totalTasks,
    totalMinutes,
    totalHours: roundHours(totalMinutes),
    activities: hydratedActivities,
    sections: {
      days: daySummaries,
      weeks: weekSummaries,
    },
    calendar: {
      days: daySummaries,
      months: calendarMonths,
    },
  };
}
