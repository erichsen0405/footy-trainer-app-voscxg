// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { AppError } from './http.ts';

type InviteRole = 'admin' | 'coach' | 'player';
type ClubRole = 'owner' | 'admin' | 'coach' | 'player';
type ActorRole = 'platform_admin' | 'owner' | 'admin' | 'coach';

type ServiceClient = {
  rpc?: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  from: (table: string) => {
    select: (columns: string) => any;
    insert: (values: Record<string, unknown> | Record<string, unknown>[]) => any;
    update: (values: Record<string, unknown>) => any;
    delete: () => any;
  };
};

type ClubMemberRow = {
  id: string;
  club_id: string;
  user_id: string;
  full_name: string | null;
  email: string;
  role: ClubRole;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
};

type TrainerPlayerLinkRow = {
  id: string;
  admin_id: string;
  player_id: string;
  created_at: string | null;
};

type TeamRow = {
  id: string;
  club_id: string | null;
  admin_id: string;
  name: string;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type TeamMemberRow = {
  team_id: string;
  player_id: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ClubManagementMember = {
  memberId: string;
  clubId: string;
  userId: string;
  fullName: string | null;
  email: string;
  role: ClubRole;
  isTrainerProfile: boolean;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
};

export type ClubTrainerPlayerLink = {
  id: string;
  coachUserId: string;
  coachMemberId: string;
  coachName: string | null;
  coachEmail: string;
  playerUserId: string;
  playerMemberId: string;
  playerName: string | null;
  playerEmail: string;
  createdAt: string | null;
};

export type ClubManagedTeam = {
  teamId: string;
  clubId: string;
  name: string;
  description: string | null;
  coachUserId: string;
  coachMemberId: string | null;
  coachName: string | null;
  coachEmail: string | null;
  memberCount: number;
  players: ClubTeamPlayer[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type ClubTeamPlayer = {
  playerUserId: string;
  playerMemberId: string;
  playerName: string | null;
  playerEmail: string;
};

export type ClubMemberManagementPermissions = {
  allowedInviteRoles: InviteRole[];
  canManageTeams: boolean;
  canAssignPlayersToAnyCoach: boolean;
};

export type ClubMemberManagementData = {
  clubId: string;
  actorRole: ActorRole;
  permissions: ClubMemberManagementPermissions;
  members: ClubManagementMember[];
  trainerPlayerLinks: ClubTrainerPlayerLink[];
  teams: ClubManagedTeam[];
};

type ClubIdInput = {
  clubId: string;
};

type CoachPlayerLinkInput = {
  clubId: string;
  coachUserId: string;
  playerUserId: string;
};

type CreateClubTeamInput = {
  clubId: string;
  name: string;
  description: string | null;
  coachUserId: string;
  playerUserIds: string[];
};

type UpdateClubTeamInput = CreateClubTeamInput & {
  teamId: string;
};

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

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} is required.`, 400);
  }

  return value.trim();
}

function optionalTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalUuidArray(value: unknown, fieldName: string): string[] {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be an array of UUIDs.`, 400);
  }

  return Array.from(new Set(value.map((entry) => requireUuid(entry, `${fieldName}[]`))));
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function normalizeName(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

export function isTrainerProfileRole(role: ClubRole): boolean {
  return role === 'admin' || role === 'coach';
}

function buildPermissions(actorRole: ActorRole): ClubMemberManagementPermissions {
  return {
    allowedInviteRoles: actorRole === 'coach' ? ['player'] : ['admin', 'coach', 'player'],
    canManageTeams: actorRole !== 'coach',
    canAssignPlayersToAnyCoach: actorRole !== 'coach',
  };
}

async function assertClubExists(client: ServiceClient, clubId: string): Promise<void> {
  const { data, error } = await client
    .from('clubs')
    .select('id')
    .eq('id', clubId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not verify club.', 500);
  }

  if (!data) {
    throw new AppError('CLUB_NOT_FOUND', 'Club not found.', 404);
  }
}

async function getActorRole(client: ServiceClient, actorUserId: string, clubId: string): Promise<ActorRole> {
  await assertClubExists(client, clubId);

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
    return 'platform_admin';
  }

  const { data: memberRow, error: memberError } = await client
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', actorUserId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (memberError) {
    throw new AppError('INTERNAL_ERROR', memberError.message || 'Could not verify club access.', 500);
  }

  if (!memberRow || !memberRow.role || memberRow.role === 'player') {
    throw new AppError('FORBIDDEN', 'You do not have access to this club.', 403);
  }

  return memberRow.role as ActorRole;
}

async function loadClubMembers(client: ServiceClient, clubId: string): Promise<ClubMemberRow[]> {
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

  return (data || []) as ClubMemberRow[];
}

async function loadProfileNames(client: ServiceClient, userIds: string[]): Promise<Map<string, string | null>> {
  const byUserId = new Map<string, string | null>();
  if (!userIds.length) {
    return byUserId;
  }

  const { data, error } = await client
    .from('profiles')
    .select('user_id, full_name')
    .in('user_id', userIds);

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load profiles.', 500);
  }

  ((data || []) as ProfileRow[]).forEach((profile) => {
    byUserId.set(profile.user_id, normalizeName(profile.full_name));
  });

  return byUserId;
}

function normalizeMembers(
  members: ClubMemberRow[],
  profileNamesByUserId: Map<string, string | null>,
): ClubMemberManagementData['members'] {
  const roleOrder: Record<ClubRole, number> = {
    owner: 0,
    admin: 1,
    coach: 2,
    player: 3,
  };

  return [...members]
    .sort((left, right) => {
      const roleDiff = roleOrder[left.role] - roleOrder[right.role];
      if (roleDiff !== 0) {
        return roleDiff;
      }

      const leftLabel = profileNamesByUserId.get(left.user_id) || normalizeName(left.full_name) || left.email;
      const rightLabel = profileNamesByUserId.get(right.user_id) || normalizeName(right.full_name) || right.email;
      return leftLabel.localeCompare(rightLabel, 'da');
    })
    .map((member) => ({
      memberId: member.id,
      clubId: member.club_id,
      userId: member.user_id,
      fullName: profileNamesByUserId.get(member.user_id) || normalizeName(member.full_name),
      email: member.email,
      role: member.role,
      isTrainerProfile: isTrainerProfileRole(member.role),
      status: member.status,
      createdAt: member.created_at,
      updatedAt: member.updated_at,
    }));
}

async function loadTrainerPlayerLinks(
  client: ServiceClient,
  actorRole: ActorRole,
  actorUserId: string,
  members: ClubMemberManagementData['members'],
): Promise<ClubTrainerPlayerLink[]> {
  const coachUserIds = members
    .filter((member) => member.isTrainerProfile)
    .map((member) => member.userId);
  const allowedCoachUserIds = actorRole === 'coach'
    ? coachUserIds.filter((userId) => userId === actorUserId)
    : coachUserIds;
  const playerUserIds = members.filter((member) => member.role === 'player').map((member) => member.userId);

  if (!allowedCoachUserIds.length || !playerUserIds.length) {
    return [];
  }

  const { data, error } = await client
    .from('admin_player_relationships')
    .select('id, admin_id, player_id, created_at')
    .in('admin_id', allowedCoachUserIds);

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load trainer-player links.', 500);
  }

  const memberByUserId = new Map(members.map((member) => [member.userId, member]));

  return ((data || []) as TrainerPlayerLinkRow[])
    .map((row) => {
      const coach = memberByUserId.get(row.admin_id);
      const player = memberByUserId.get(row.player_id);
      if (
        !coach ||
        !coach.isTrainerProfile ||
        !player ||
        player.role !== 'player' ||
        !playerUserIds.includes(row.player_id)
      ) {
        return null;
      }

      return {
        id: row.id,
        coachUserId: coach.userId,
        coachMemberId: coach.memberId,
        coachName: coach.fullName,
        coachEmail: coach.email,
        playerUserId: player.userId,
        playerMemberId: player.memberId,
        playerName: player.fullName,
        playerEmail: player.email,
        createdAt: row.created_at,
      };
    })
    .filter((row): row is ClubTrainerPlayerLink => Boolean(row));
}

async function loadClubTeams(
  client: ServiceClient,
  actorRole: ActorRole,
  actorUserId: string,
  clubId: string,
  members: ClubMemberManagementData['members'],
): Promise<ClubManagedTeam[]> {
  let teamQuery = client
    .from('teams')
    .select('id, club_id, admin_id, name, description, created_at, updated_at')
    .eq('club_id', clubId);

  if (actorRole === 'coach') {
    teamQuery = teamQuery.eq('admin_id', actorUserId);
  }

  const { data, error } = await teamQuery.order('name');
  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load club teams.', 500);
  }

  const rows = (data || []) as TeamRow[];
  if (!rows.length) {
    return [];
  }

  const { data: teamMemberData, error: teamMembersError } = await client
    .from('team_members')
    .select('team_id, player_id')
    .in('team_id', rows.map((row) => row.id));

  if (teamMembersError) {
    throw new AppError('INTERNAL_ERROR', teamMembersError.message || 'Could not load team members.', 500);
  }

  const memberCountByTeamId = new Map<string, number>();
  const playersByTeamId = new Map<string, ClubTeamPlayer[]>();
  ((teamMemberData || []) as TeamMemberRow[]).forEach((row) => {
    memberCountByTeamId.set(row.team_id, (memberCountByTeamId.get(row.team_id) || 0) + 1);

    const player = members.find((member) => member.userId === row.player_id && member.role === 'player');
    if (!player) {
      return;
    }

    const existingPlayers = playersByTeamId.get(row.team_id) || [];
    existingPlayers.push({
      playerUserId: player.userId,
      playerMemberId: player.memberId,
      playerName: player.fullName,
      playerEmail: player.email,
    });
    playersByTeamId.set(row.team_id, existingPlayers);
  });

  const memberByUserId = new Map(members.map((member) => [member.userId, member]));

  return rows.map((team) => {
    const coach = memberByUserId.get(team.admin_id) || null;
    return {
      teamId: team.id,
      clubId,
      name: team.name,
      description: normalizeName(team.description),
      coachUserId: team.admin_id,
      coachMemberId: coach?.memberId ?? null,
      coachName: coach?.fullName ?? null,
      coachEmail: coach?.email ?? null,
      memberCount: memberCountByTeamId.get(team.id) || 0,
      players: (playersByTeamId.get(team.id) || []).sort((left, right) => {
        const leftLabel = left.playerName || left.playerEmail;
        const rightLabel = right.playerName || right.playerEmail;
        return leftLabel.localeCompare(rightLabel, 'da');
      }),
      createdAt: team.created_at,
      updatedAt: team.updated_at,
    };
  });
}

function requireTrainerMember(
  membersByUserId: Map<string, ClubMemberManagementData['members'][number]>,
  coachUserId: string,
): ClubMemberManagementData['members'][number] {
  const coach = membersByUserId.get(coachUserId);
  if (!coach || !coach.isTrainerProfile) {
    throw new AppError('MEMBER_NOT_FOUND', 'Trainer profile not found in this club.', 404);
  }

  return coach;
}

function requirePlayerMember(
  membersByUserId: Map<string, ClubMemberManagementData['members'][number]>,
  playerUserId: string,
): ClubMemberManagementData['members'][number] {
  const player = membersByUserId.get(playerUserId);
  if (!player || player.role !== 'player') {
    throw new AppError('MEMBER_NOT_FOUND', 'Player not found in this club.', 404);
  }

  return player;
}

export function resolveMemberUserId(
  members: ClubMemberManagementData['members'],
  candidateId: string,
): string {
  const byUserId = members.find((member) => member.userId === candidateId);
  if (byUserId) {
    return byUserId.userId;
  }

  const byMemberId = members.find((member) => member.memberId === candidateId);
  if (byMemberId) {
    return byMemberId.userId;
  }

  return candidateId;
}

async function syncClubMemberAccess(client: ServiceClient, userId: string): Promise<void> {
  if (!client.rpc) {
    return;
  }

  const { error } = await client.rpc('sync_club_member_access', {
    p_user_id: userId,
  });

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not sync club member access.', 500);
  }
}

async function normalizeSingleTeam(
  client: ServiceClient,
  teamId: string,
  clubId: string,
  members: ClubMemberManagementData['members'],
): Promise<ClubManagedTeam> {
  const teams = await loadClubTeams(client, 'platform_admin', '', clubId, members);
  const team = teams.find((candidate) => candidate.teamId === teamId);
  if (!team) {
    throw new AppError('TEAM_NOT_FOUND', 'Team not found.', 404);
  }

  return team;
}

export function parseClubMemberManagementBody(body: unknown): ClubIdInput {
  const record = asRecord(body);
  return {
    clubId: requireUuid(record.clubId, 'clubId'),
  };
}

export function parseCoachPlayerLinkBody(body: unknown): CoachPlayerLinkInput {
  const record = asRecord(body);
  return {
    clubId: requireUuid(record.clubId, 'clubId'),
    coachUserId: requireUuid(record.coachUserId, 'coachUserId'),
    playerUserId: requireUuid(record.playerUserId, 'playerUserId'),
  };
}

export function parseCreateClubTeamBody(body: unknown): CreateClubTeamInput {
  const record = asRecord(body);
  return {
    clubId: requireUuid(record.clubId, 'clubId'),
    name: requireString(record.name, 'name'),
    description: optionalTrimmedString(record.description),
    coachUserId: requireUuid(record.coachUserId, 'coachUserId'),
    playerUserIds: optionalUuidArray(record.playerUserIds, 'playerUserIds'),
  };
}

export function parseUpdateClubTeamBody(body: unknown): UpdateClubTeamInput {
  const record = asRecord(body);
  return {
    teamId: requireUuid(record.teamId, 'teamId'),
    clubId: requireUuid(record.clubId, 'clubId'),
    name: requireString(record.name, 'name'),
    description: optionalTrimmedString(record.description),
    coachUserId: requireUuid(record.coachUserId, 'coachUserId'),
    playerUserIds: optionalUuidArray(record.playerUserIds, 'playerUserIds'),
  };
}

async function loadCoachLinkedPlayerIds(
  client: ServiceClient,
  coachUserId: string,
): Promise<Set<string>> {
  const { data, error } = await client
    .from('admin_player_relationships')
    .select('player_id')
    .eq('admin_id', coachUserId);

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load trainer-player links.', 500);
  }

  return new Set(
    ((data || []) as Array<{ player_id: string | null }>)
      .map((row) => row.player_id)
      .filter((playerId): playerId is string => Boolean(playerId)),
  );
}

function validateTeamPlayerAssignments(
  membersByUserId: Map<string, ClubMemberManagementData['members'][number]>,
  linkedPlayerIds: Set<string>,
  playerUserIds: string[],
): string[] {
  return Array.from(new Set(playerUserIds)).map((playerUserId) => {
    const resolvedPlayerUserId = requirePlayerMember(membersByUserId, playerUserId).userId;
    if (!linkedPlayerIds.has(resolvedPlayerUserId)) {
      throw new AppError(
        'FORBIDDEN',
        'Selected player must already be linked to the chosen trainer profile.',
        403,
      );
    }

    return resolvedPlayerUserId;
  });
}

async function syncTeamPlayers(
  client: ServiceClient,
  teamId: string,
  playerUserIds: string[],
): Promise<string[]> {
  const desiredPlayerIds = Array.from(new Set(playerUserIds));
  const { data: existingRows, error: existingError } = await client
    .from('team_members')
    .select('player_id')
    .eq('team_id', teamId);

  if (existingError) {
    throw new AppError('INTERNAL_ERROR', existingError.message || 'Could not load current team players.', 500);
  }

  const currentPlayerIds = ((existingRows || []) as Array<{ player_id: string | null }>)
    .map((row) => row.player_id)
    .filter((playerId): playerId is string => Boolean(playerId));

  const currentSet = new Set(currentPlayerIds);
  const desiredSet = new Set(desiredPlayerIds);
  const playerIdsToInsert = desiredPlayerIds.filter((playerId) => !currentSet.has(playerId));
  const playerIdsToDelete = currentPlayerIds.filter((playerId) => !desiredSet.has(playerId));

  if (playerIdsToDelete.length) {
    const { error: deleteError } = await client
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .in('player_id', playerIdsToDelete);

    if (deleteError) {
      throw new AppError('INTERNAL_ERROR', deleteError.message || 'Could not remove players from team.', 500);
    }
  }

  if (playerIdsToInsert.length) {
    const { error: insertError } = await client
      .from('team_members')
      .insert(playerIdsToInsert.map((playerId) => ({
        team_id: teamId,
        player_id: playerId,
      })));

    if (insertError) {
      throw new AppError('INTERNAL_ERROR', insertError.message || 'Could not add players to team.', 500);
    }
  }

  const { data: finalRows, error: finalError } = await client
    .from('team_members')
    .select('player_id')
    .eq('team_id', teamId);

  if (finalError) {
    throw new AppError('INTERNAL_ERROR', finalError.message || 'Could not verify saved team players.', 500);
  }

  const finalPlayerIds = ((finalRows || []) as Array<{ player_id: string | null }>)
    .map((row) => row.player_id)
    .filter((playerId): playerId is string => Boolean(playerId));

  if (finalPlayerIds.length !== desiredPlayerIds.length) {
    console.error('[club-team] sync mismatch', {
      teamId,
      desiredPlayerIds,
      finalPlayerIds,
    });
  }

  return finalPlayerIds;
}

function buildTeamPlayersFromUserIds(
  membersByUserId: Map<string, ClubMemberManagementData['members'][number]>,
  playerUserIds: string[],
): ClubTeamPlayer[] {
  return Array.from(new Set(playerUserIds))
    .map((playerUserId) => {
      const player = membersByUserId.get(playerUserId);
      if (!player || player.role !== 'player') {
        return null;
      }

      return {
        playerUserId: player.userId,
        playerMemberId: player.memberId,
        playerName: player.fullName,
        playerEmail: player.email,
      };
    })
    .filter((player): player is ClubTeamPlayer => Boolean(player))
    .sort((left, right) => {
      const leftLabel = left.playerName || left.playerEmail;
      const rightLabel = right.playerName || right.playerEmail;
      return leftLabel.localeCompare(rightLabel, 'da');
    });
}

export async function getClubMemberManagementDataAction(
  client: ServiceClient,
  actorUserId: string,
  body: unknown,
): Promise<ClubMemberManagementData> {
  const input = parseClubMemberManagementBody(body);
  const actorRole = await getActorRole(client, actorUserId, input.clubId);
  const memberRows = await loadClubMembers(client, input.clubId);
  const profileNamesByUserId = await loadProfileNames(client, uniqueIds(memberRows.map((member) => member.user_id)));
  const members = normalizeMembers(memberRows, profileNamesByUserId);

  return {
    clubId: input.clubId,
    actorRole,
    permissions: buildPermissions(actorRole),
    members,
    trainerPlayerLinks: await loadTrainerPlayerLinks(client, actorRole, actorUserId, members),
    teams: await loadClubTeams(client, actorRole, actorUserId, input.clubId, members),
  };
}

export async function assignClubPlayerToCoachAction(
  client: ServiceClient,
  actorUserId: string,
  body: unknown,
): Promise<ClubTrainerPlayerLink> {
  const input = parseCoachPlayerLinkBody(body);
  const actorRole = await getActorRole(client, actorUserId, input.clubId);

  const memberRows = await loadClubMembers(client, input.clubId);
  const profileNamesByUserId = await loadProfileNames(client, uniqueIds(memberRows.map((member) => member.user_id)));
  const members = normalizeMembers(memberRows, profileNamesByUserId);
  const resolvedCoachUserId = resolveMemberUserId(members, input.coachUserId);
  const resolvedPlayerUserId = resolveMemberUserId(members, input.playerUserId);

  if (actorRole === 'coach' && resolvedCoachUserId !== actorUserId) {
    throw new AppError('FORBIDDEN', 'Coach can only manage their own linked players.', 403);
  }

  const membersByUserId = new Map(members.map((member) => [member.userId, member]));
  const coach = requireTrainerMember(membersByUserId, resolvedCoachUserId);
  const player = requirePlayerMember(membersByUserId, resolvedPlayerUserId);

  await syncClubMemberAccess(client, coach.userId);

  const { data: existingLink, error: existingError } = await client
    .from('admin_player_relationships')
    .select('id, admin_id, player_id, created_at')
    .eq('admin_id', coach.userId)
    .eq('player_id', player.userId)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new AppError('INTERNAL_ERROR', existingError.message || 'Could not verify existing trainer-player link.', 500);
  }

  let linkRow = existingLink as TrainerPlayerLinkRow | null;
  if (!linkRow) {
    const { data: inserted, error: insertError } = await client
      .from('admin_player_relationships')
      .insert({
        admin_id: coach.userId,
        player_id: player.userId,
      })
      .select('id, admin_id, player_id, created_at')
      .single();

    if (insertError) {
      throw new AppError('INTERNAL_ERROR', insertError.message || 'Could not assign player to coach.', 500);
    }

    linkRow = inserted as TrainerPlayerLinkRow;
  }

  return {
    id: linkRow.id,
    coachUserId: coach.userId,
    coachMemberId: coach.memberId,
    coachName: coach.fullName,
    coachEmail: coach.email,
    playerUserId: player.userId,
    playerMemberId: player.memberId,
    playerName: player.fullName,
    playerEmail: player.email,
    createdAt: linkRow.created_at,
  };
}

export async function removeClubPlayerFromCoachAction(
  client: ServiceClient,
  actorUserId: string,
  body: unknown,
): Promise<{ coachUserId: string; playerUserId: string; removed: boolean }> {
  const input = parseCoachPlayerLinkBody(body);
  const actorRole = await getActorRole(client, actorUserId, input.clubId);

  const memberRows = await loadClubMembers(client, input.clubId);
  const profileNamesByUserId = await loadProfileNames(client, uniqueIds(memberRows.map((member) => member.user_id)));
  const members = normalizeMembers(memberRows, profileNamesByUserId);
  const resolvedCoachUserId = resolveMemberUserId(members, input.coachUserId);
  const resolvedPlayerUserId = resolveMemberUserId(members, input.playerUserId);

  if (actorRole === 'coach' && resolvedCoachUserId !== actorUserId) {
    throw new AppError('FORBIDDEN', 'Coach can only manage their own linked players.', 403);
  }

  const membersByUserId = new Map(members.map((member) => [member.userId, member]));
  requireTrainerMember(membersByUserId, resolvedCoachUserId);
  requirePlayerMember(membersByUserId, resolvedPlayerUserId);

  const { data: deletedRows, error } = await client
    .from('admin_player_relationships')
    .delete()
    .eq('admin_id', resolvedCoachUserId)
    .eq('player_id', resolvedPlayerUserId)
    .select('id');

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not remove trainer-player link.', 500);
  }

  return {
    coachUserId: resolvedCoachUserId,
    playerUserId: resolvedPlayerUserId,
    removed: Array.isArray(deletedRows) ? deletedRows.length > 0 : false,
  };
}

export async function createClubTeamAction(
  client: ServiceClient,
  actorUserId: string,
  body: unknown,
): Promise<ClubManagedTeam> {
  const input = parseCreateClubTeamBody(body);
  const actorRole = await getActorRole(client, actorUserId, input.clubId);
  if (actorRole === 'coach') {
    throw new AppError('FORBIDDEN', 'Coach cannot manage club teams.', 403);
  }

  const memberRows = await loadClubMembers(client, input.clubId);
  const profileNamesByUserId = await loadProfileNames(client, uniqueIds(memberRows.map((member) => member.user_id)));
  const members = normalizeMembers(memberRows, profileNamesByUserId);
  const membersByUserId = new Map(members.map((member) => [member.userId, member]));
  const coach = requireTrainerMember(membersByUserId, input.coachUserId);
  const linkedPlayerIds = await loadCoachLinkedPlayerIds(client, coach.userId);
  const playerUserIds = validateTeamPlayerAssignments(membersByUserId, linkedPlayerIds, input.playerUserIds);

  const { data, error } = await client
    .from('teams')
    .insert({
      club_id: input.clubId,
      admin_id: input.coachUserId,
      name: input.name,
      description: input.description,
    })
    .select('id')
    .single();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not create club team.', 500);
  }

  const savedPlayerUserIds = await syncTeamPlayers(client, String(data.id), playerUserIds);
  const normalizedTeam = await normalizeSingleTeam(client, String(data.id), input.clubId, members);
  if (savedPlayerUserIds.length && normalizedTeam.memberCount === 0) {
    return {
      ...normalizedTeam,
      memberCount: savedPlayerUserIds.length,
      players: buildTeamPlayersFromUserIds(membersByUserId, savedPlayerUserIds),
    };
  }

  return normalizedTeam;
}

export async function updateClubTeamAction(
  client: ServiceClient,
  actorUserId: string,
  body: unknown,
): Promise<ClubManagedTeam> {
  const input = parseUpdateClubTeamBody(body);
  const actorRole = await getActorRole(client, actorUserId, input.clubId);
  if (actorRole === 'coach') {
    throw new AppError('FORBIDDEN', 'Coach cannot manage club teams.', 403);
  }

  const memberRows = await loadClubMembers(client, input.clubId);
  const profileNamesByUserId = await loadProfileNames(client, uniqueIds(memberRows.map((member) => member.user_id)));
  const members = normalizeMembers(memberRows, profileNamesByUserId);
  const membersByUserId = new Map(members.map((member) => [member.userId, member]));
  const coach = requireTrainerMember(membersByUserId, input.coachUserId);
  const linkedPlayerIds = await loadCoachLinkedPlayerIds(client, coach.userId);
  const playerUserIds = validateTeamPlayerAssignments(membersByUserId, linkedPlayerIds, input.playerUserIds);

  const { data: existingTeam, error: existingError } = await client
    .from('teams')
    .select('id')
    .eq('id', input.teamId)
    .eq('club_id', input.clubId)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new AppError('INTERNAL_ERROR', existingError.message || 'Could not verify club team.', 500);
  }

  if (!existingTeam) {
    throw new AppError('TEAM_NOT_FOUND', 'Team not found.', 404);
  }

  const { error } = await client
    .from('teams')
    .update({
      admin_id: input.coachUserId,
      name: input.name,
      description: input.description,
    })
    .eq('id', input.teamId)
    .eq('club_id', input.clubId);

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not update club team.', 500);
  }

  const savedPlayerUserIds = await syncTeamPlayers(client, input.teamId, playerUserIds);
  const normalizedTeam = await normalizeSingleTeam(client, input.teamId, input.clubId, members);
  if (savedPlayerUserIds.length && normalizedTeam.memberCount === 0) {
    return {
      ...normalizedTeam,
      memberCount: savedPlayerUserIds.length,
      players: buildTeamPlayersFromUserIds(membersByUserId, savedPlayerUserIds),
    };
  }

  return normalizedTeam;
}
