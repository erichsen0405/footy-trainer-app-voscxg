// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { AppError, type ErrorCode } from './http.ts';

type DbError = { message?: string } | null;

type QueryClient = {
  rpc?: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: DbError }>;
  from: (table: string) => any;
};

type OwnerCrmAction =
  | 'context'
  | 'list'
  | 'detail'
  | 'updateProfile'
  | 'createNote'
  | 'updateNote'
  | 'deleteNote'
  | 'upsertTag'
  | 'deleteTag'
  | 'setPlayerTags'
  | 'createGuardianContact'
  | 'updateGuardianContact'
  | 'deleteGuardianContact';

type OwnerAccountRow = {
  id: string;
  owner_type: 'club' | 'private_coach_business';
  name: string;
  status: string;
  coach_account_id: string | null;
  club_id: string | null;
};

type OwnerPlayerRow = {
  id: string;
  owner_account_id: string;
  player_id: string;
  status: string;
  source: string;
  linked_by: string | null;
  first_linked_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  phone_number: string | null;
  player_positions: string[] | null;
  club_name: string | null;
  playing_level: string | null;
};

type CrmProfileRow = {
  id: string;
  owner_account_id: string;
  player_id: string;
  crm_status: 'active' | 'paused' | 'former' | 'trial';
  positions: string[];
  playing_level: string | null;
  club_name: string | null;
  date_of_birth: string | null;
  phone_number: string | null;
  email: string | null;
  email_visible_to_staff: boolean;
  phone_visible_to_staff: boolean;
  created_at: string;
  updated_at: string;
};

type TagRow = {
  id: string;
  owner_account_id: string;
  name: string;
  normalized_name: string;
  color: string;
  created_at: string;
  updated_at: string;
};

type TagLinkRow = {
  player_id: string;
  tag_id: string;
};

type NoteRow = {
  id: string;
  owner_account_id: string;
  player_id: string;
  body: string;
  visibility: 'coach_private';
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type GuardianContactRow = {
  id: string;
  owner_account_id: string;
  player_id: string;
  guardian_user_id: string | null;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  relation: 'parent' | 'guardian' | 'other';
  notes: string | null;
  status: 'active' | 'pending' | 'inactive' | 'removed';
  permissions: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type TeamRow = {
  id: string;
  admin_id: string;
  club_id: string | null;
  name: string;
  description: string | null;
};

type TeamMemberRow = {
  team_id: string;
  player_id: string;
};

type ActivityRow = {
  id: string;
  title: string;
  activity_date: string;
  activity_time: string | null;
  created_at: string | null;
};

type ReflectionRow = {
  id: string;
  activity_id: string;
  rating: number | null;
  note: string | null;
  created_at: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CRM_STATUSES = new Set(['active', 'paused', 'former', 'trial']);
const GUARDIAN_RELATIONS = new Set(['parent', 'guardian', 'other']);
const GUARDIAN_STATUSES = new Set(['active', 'pending', 'inactive', 'removed']);
const COACH_ACCESS_ROLES = new Set(['owner', 'admin', 'coach', 'assistant_coach']);
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

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

function optionalUuid(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return requireUuid(value, fieldName);
}

function optionalTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function requiredTrimmedString(value: unknown, fieldName: string): string {
  const normalized = optionalTrimmedString(value);
  if (!normalized) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} is required.`, 400);
  }

  return normalized;
}

function optionalLowerEmail(value: unknown): string | null {
  const normalized = optionalTrimmedString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function optionalBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function optionalStringArray(value: unknown, fieldName: string): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be an array.`, 400);
  }

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
    )
  ).slice(0, 8);
}

function optionalDate(value: unknown, fieldName: string): string | null {
  const normalized = optionalTrimmedString(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00.000Z`))) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a YYYY-MM-DD date.`, 400);
  }

  return normalized;
}

function normalizeTagName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function mapRpcError(error: DbError): AppError | null {
  const message = error?.message?.trim();
  if (!message) {
    return null;
  }

  const map: Record<string, { code: ErrorCode; message: string; status: number }> = {
    UNAUTHORIZED: { code: 'UNAUTHORIZED', message: 'Unauthorized.', status: 401 },
    FORBIDDEN: { code: 'FORBIDDEN', message: 'You do not have access to this owner account.', status: 403 },
    OWNER_ACCOUNT_NOT_FOUND: { code: 'OWNER_ACCOUNT_NOT_FOUND', message: 'Owner account not found.', status: 404 },
    VALIDATION_ERROR: { code: 'VALIDATION_ERROR', message: 'Request payload is invalid.', status: 400 },
    LICENSE_INACTIVE: { code: 'LICENSE_INACTIVE', message: 'The owner account license is not active.', status: 409 },
    SEAT_LIMIT_REACHED: { code: 'SEAT_LIMIT_REACHED', message: 'The owner account has no available seats for this role.', status: 409 },
  };

  const mapped = map[message];
  return mapped ? new AppError(mapped.code, mapped.message, mapped.status) : new AppError('INTERNAL_ERROR', message, 500);
}

async function callRpc<T>(client: QueryClient, fn: string, args: Record<string, unknown>): Promise<T> {
  if (!client.rpc) {
    throw new AppError('INTERNAL_ERROR', 'RPC client is not available.', 500);
  }

  const { data, error } = await client.rpc(fn, args);
  const mappedError = mapRpcError(error);
  if (mappedError) {
    throw mappedError;
  }

  return data as T;
}

function normalizeOwnerProfileInput(value: unknown) {
  const record = asRecord(value);
  const crmStatus = optionalTrimmedString(record.crmStatus) ?? 'active';
  if (!CRM_STATUSES.has(crmStatus)) {
    throw new AppError('VALIDATION_ERROR', 'crmStatus must be active, paused, former or trial.', 400);
  }

  return {
    crm_status: crmStatus,
    positions: optionalStringArray(record.positions, 'positions'),
    playing_level: optionalTrimmedString(record.playingLevel),
    club_name: optionalTrimmedString(record.clubName),
    date_of_birth: optionalDate(record.dateOfBirth, 'dateOfBirth'),
    phone_number: optionalTrimmedString(record.phoneNumber),
    email: optionalLowerEmail(record.email),
    email_visible_to_staff: optionalBoolean(record.emailVisibleToStaff, true),
    phone_visible_to_staff: optionalBoolean(record.phoneVisibleToStaff, true),
  };
}

function parseTagIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new AppError('VALIDATION_ERROR', 'tagIds must be an array of UUIDs.', 400);
  }

  return Array.from(new Set(value.map((entry) => requireUuid(entry, 'tagIds[]'))));
}

function parseAction(body: unknown): { action: OwnerCrmAction; record: Record<string, unknown> } {
  const record = asRecord(body);
  const action = record.action;
  if (typeof action !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'action is required.', 400);
  }

  const knownActions = new Set<OwnerCrmAction>([
    'context',
    'list',
    'detail',
    'updateProfile',
    'createNote',
    'updateNote',
    'deleteNote',
    'upsertTag',
    'deleteTag',
    'setPlayerTags',
    'createGuardianContact',
    'updateGuardianContact',
    'deleteGuardianContact',
  ]);

  if (!knownActions.has(action as OwnerCrmAction)) {
    throw new AppError('VALIDATION_ERROR', 'action is not supported.', 400);
  }

  return { action: action as OwnerCrmAction, record };
}

export function parseOwnerPlayerCrmBody(body: unknown) {
  const { action, record } = parseAction(body);
  if (action === 'context') {
    return { action };
  }

  const ownerAccountId = requireUuid(record.ownerAccountId, 'ownerAccountId');

  if (action === 'list') {
    return { action, ownerAccountId };
  }

  if (action === 'detail') {
    return { action, ownerAccountId, playerId: requireUuid(record.playerId, 'playerId') };
  }

  if (action === 'updateProfile') {
    return {
      action,
      ownerAccountId,
      playerId: requireUuid(record.playerId, 'playerId'),
      profile: normalizeOwnerProfileInput(record.profile),
    };
  }

  if (action === 'createNote') {
    return {
      action,
      ownerAccountId,
      playerId: requireUuid(record.playerId, 'playerId'),
      body: requiredTrimmedString(record.body, 'body'),
    };
  }

  if (action === 'updateNote') {
    return {
      action,
      ownerAccountId,
      playerId: requireUuid(record.playerId, 'playerId'),
      noteId: requireUuid(record.noteId, 'noteId'),
      body: requiredTrimmedString(record.body, 'body'),
    };
  }

  if (action === 'deleteNote') {
    return {
      action,
      ownerAccountId,
      playerId: requireUuid(record.playerId, 'playerId'),
      noteId: requireUuid(record.noteId, 'noteId'),
    };
  }

  if (action === 'upsertTag') {
    const name = requiredTrimmedString(record.name, 'name');
    const color = optionalTrimmedString(record.color) ?? '#2563eb';
    if (!COLOR_PATTERN.test(color)) {
      throw new AppError('VALIDATION_ERROR', 'color must be a hex color.', 400);
    }

    return {
      action,
      ownerAccountId,
      name,
      normalizedName: normalizeTagName(name),
      color,
    };
  }

  if (action === 'deleteTag') {
    return { action, ownerAccountId, tagId: requireUuid(record.tagId, 'tagId') };
  }

  if (action === 'setPlayerTags') {
    return {
      action,
      ownerAccountId,
      playerId: requireUuid(record.playerId, 'playerId'),
      tagIds: parseTagIds(record.tagIds),
    };
  }

  if (action === 'createGuardianContact' || action === 'updateGuardianContact') {
    const relation = optionalTrimmedString(record.relation) ?? 'parent';
    const status = optionalTrimmedString(record.status) ?? 'active';
    if (!GUARDIAN_RELATIONS.has(relation)) {
      throw new AppError('VALIDATION_ERROR', 'relation must be parent, guardian or other.', 400);
    }
    if (!GUARDIAN_STATUSES.has(status)) {
      throw new AppError('VALIDATION_ERROR', 'status must be active, pending, inactive or removed.', 400);
    }

    return {
      action,
      ownerAccountId,
      playerId: requireUuid(record.playerId, 'playerId'),
      contactId: action === 'updateGuardianContact' ? requireUuid(record.contactId, 'contactId') : null,
      guardianUserId: optionalUuid(record.guardianUserId, 'guardianUserId'),
      fullName: requiredTrimmedString(record.fullName, 'fullName'),
      email: optionalLowerEmail(record.email),
      phoneNumber: optionalTrimmedString(record.phoneNumber),
      relation,
      status,
      notes: optionalTrimmedString(record.notes),
    };
  }

  return {
    action,
    ownerAccountId,
    playerId: requireUuid(record.playerId, 'playerId'),
    contactId: requireUuid(record.contactId, 'contactId'),
  };
}

async function isPlatformAdmin(client: QueryClient, actorUserId: string): Promise<boolean> {
  const { data, error } = await client
    .from('platform_admins')
    .select('id')
    .eq('user_id', actorUserId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not verify platform admin.', 500);
  }

  return Boolean(data);
}

async function loadOwnerAccount(client: QueryClient, ownerAccountId: string): Promise<OwnerAccountRow> {
  const { data, error } = await client
    .from('owner_accounts')
    .select('id, owner_type, name, status, coach_account_id, club_id')
    .eq('id', ownerAccountId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load owner account.', 500);
  }

  if (!data) {
    throw new AppError('OWNER_ACCOUNT_NOT_FOUND', 'Owner account not found.', 404);
  }

  return data as OwnerAccountRow;
}

async function assertOwnerCoachAccess(
  client: QueryClient,
  actorUserId: string,
  ownerAccountId: string
): Promise<OwnerAccountRow> {
  const owner = await loadOwnerAccount(client, ownerAccountId);
  const [hasCoachAccess, platformAdmin] = await Promise.all([
    callRpc<boolean>(client, 'has_owner_account_coach_access', {
      p_owner_account_id: ownerAccountId,
      p_user_id: actorUserId,
    }),
    isPlatformAdmin(client, actorUserId),
  ]);

  if (!hasCoachAccess && !platformAdmin) {
    throw new AppError('FORBIDDEN', 'You do not have access to this owner account.', 403);
  }

  return owner;
}

async function assertOwnerPlayerExists(
  client: QueryClient,
  ownerAccountId: string,
  playerId: string
): Promise<OwnerPlayerRow> {
  const { data, error } = await client
    .from('owner_players')
    .select('id, owner_account_id, player_id, status, source, linked_by, first_linked_at, created_at, updated_at')
    .eq('owner_account_id', ownerAccountId)
    .eq('player_id', playerId)
    .neq('status', 'removed')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not verify owner player.', 500);
  }

  if (!data) {
    throw new AppError('PLAYER_NOT_FOUND', 'Player not found in this owner account.', 404);
  }

  return data as OwnerPlayerRow;
}

function mapBy<T, K extends string>(rows: T[], getKey: (row: T) => K): Map<K, T> {
  return new Map(rows.map((row) => [getKey(row), row]));
}

async function loadOwnerTeams(client: QueryClient, owner: OwnerAccountRow): Promise<{
  teams: Array<TeamRow & { memberCount: number }>;
  teamsByPlayerId: Map<string, TeamRow[]>;
}> {
  const { data: memberships, error: membershipError } = await client
    .from('owner_memberships')
    .select('user_id')
    .eq('owner_account_id', owner.id)
    .eq('status', 'active');

  if (membershipError) {
    throw new AppError('INTERNAL_ERROR', membershipError.message || 'Could not load owner staff.', 500);
  }

  const staffUserIds = Array.from(new Set(((memberships || []) as Array<{ user_id: string }>).map((row) => row.user_id)));
  const teamRows: TeamRow[] = [];

  if (staffUserIds.length) {
    const { data, error } = await client
      .from('teams')
      .select('id, admin_id, club_id, name, description')
      .in('admin_id', staffUserIds);

    if (error) {
      throw new AppError('INTERNAL_ERROR', error.message || 'Could not load owner teams.', 500);
    }

    teamRows.push(...((data || []) as TeamRow[]));
  }

  if (owner.club_id) {
    const { data, error } = await client
      .from('teams')
      .select('id, admin_id, club_id, name, description')
      .eq('club_id', owner.club_id);

    if (error) {
      throw new AppError('INTERNAL_ERROR', error.message || 'Could not load club teams.', 500);
    }

    teamRows.push(...((data || []) as TeamRow[]));
  }

  const teams = Array.from(new Map(teamRows.map((team) => [team.id, team])).values())
    .sort((left, right) => left.name.localeCompare(right.name, 'da'));

  if (!teams.length) {
    return { teams: [], teamsByPlayerId: new Map() };
  }

  const { data: members, error: memberError } = await client
    .from('team_members')
    .select('team_id, player_id')
    .in('team_id', teams.map((team) => team.id));

  if (memberError) {
    throw new AppError('INTERNAL_ERROR', memberError.message || 'Could not load team members.', 500);
  }

  const memberRows = (members || []) as TeamMemberRow[];
  const countByTeamId = new Map<string, number>();
  const teamsByPlayerId = new Map<string, TeamRow[]>();
  const teamById = mapBy(teams, (team) => team.id);

  for (const member of memberRows) {
    countByTeamId.set(member.team_id, (countByTeamId.get(member.team_id) || 0) + 1);
    const team = teamById.get(member.team_id);
    if (!team) continue;
    const existing = teamsByPlayerId.get(member.player_id) || [];
    existing.push(team);
    teamsByPlayerId.set(member.player_id, existing);
  }

  return {
    teams: teams.map((team) => ({
      ...team,
      memberCount: countByTeamId.get(team.id) || 0,
    })),
    teamsByPlayerId,
  };
}

function toAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const birthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(birthDate.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function previewNote(body: string): string {
  return body.length > 110 ? `${body.slice(0, 107)}...` : body;
}

async function loadOwnerCrmList(client: QueryClient, owner: OwnerAccountRow) {
  const { data: ownerPlayersData, error: ownerPlayersError } = await client
    .from('owner_players')
    .select('id, owner_account_id, player_id, status, source, linked_by, first_linked_at, created_at, updated_at')
    .eq('owner_account_id', owner.id)
    .neq('status', 'removed')
    .order('created_at', { ascending: true });

  if (ownerPlayersError) {
    throw new AppError('INTERNAL_ERROR', ownerPlayersError.message || 'Could not load owner players.', 500);
  }

  const ownerPlayers = (ownerPlayersData || []) as OwnerPlayerRow[];
  const playerIds = ownerPlayers.map((row) => row.player_id);

  const [profilesResult, crmProfilesResult, tagsResult, tagLinksResult, notesResult, guardiansResult, teamPayload] =
    await Promise.all([
      playerIds.length
        ? client
            .from('profiles')
            .select('user_id, full_name, phone_number, player_positions, club_name, playing_level')
            .in('user_id', playerIds)
        : Promise.resolve({ data: [], error: null }),
      playerIds.length
        ? client.from('owner_player_crm_profiles').select('*').eq('owner_account_id', owner.id).in('player_id', playerIds)
        : Promise.resolve({ data: [], error: null }),
      client.from('owner_player_tags').select('*').eq('owner_account_id', owner.id).order('name'),
      playerIds.length
        ? client.from('owner_player_tag_links').select('player_id, tag_id').eq('owner_account_id', owner.id).in('player_id', playerIds)
        : Promise.resolve({ data: [], error: null }),
      playerIds.length
        ? client
            .from('owner_player_notes')
            .select('id, owner_account_id, player_id, body, visibility, created_by, updated_by, created_at, updated_at')
            .eq('owner_account_id', owner.id)
            .in('player_id', playerIds)
            .order('updated_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      playerIds.length
        ? client
            .from('owner_player_guardian_contacts')
            .select('*')
            .eq('owner_account_id', owner.id)
            .in('player_id', playerIds)
            .neq('status', 'removed')
        : Promise.resolve({ data: [], error: null }),
      loadOwnerTeams(client, owner),
    ]);

  for (const result of [profilesResult, crmProfilesResult, tagsResult, tagLinksResult, notesResult, guardiansResult]) {
    if (result.error) {
      throw new AppError('INTERNAL_ERROR', result.error.message || 'Could not load CRM data.', 500);
    }
  }

  const profilesByPlayerId = mapBy((profilesResult.data || []) as ProfileRow[], (row) => row.user_id);
  const crmByPlayerId = mapBy((crmProfilesResult.data || []) as CrmProfileRow[], (row) => row.player_id);
  const tags = (tagsResult.data || []) as TagRow[];
  const tagsById = mapBy(tags, (row) => row.id);
  const tagLinks = (tagLinksResult.data || []) as TagLinkRow[];
  const notes = (notesResult.data || []) as NoteRow[];
  const guardians = (guardiansResult.data || []) as GuardianContactRow[];

  const tagsByPlayerId = new Map<string, TagRow[]>();
  for (const link of tagLinks) {
    const tag = tagsById.get(link.tag_id);
    if (!tag) continue;
    const existing = tagsByPlayerId.get(link.player_id) || [];
    existing.push(tag);
    tagsByPlayerId.set(link.player_id, existing);
  }

  const notesByPlayerId = new Map<string, NoteRow[]>();
  for (const note of notes) {
    const existing = notesByPlayerId.get(note.player_id) || [];
    existing.push(note);
    notesByPlayerId.set(note.player_id, existing);
  }

  const guardiansByPlayerId = new Map<string, GuardianContactRow[]>();
  for (const guardian of guardians) {
    const existing = guardiansByPlayerId.get(guardian.player_id) || [];
    existing.push(guardian);
    guardiansByPlayerId.set(guardian.player_id, existing);
  }

  const players = ownerPlayers
    .map((ownerPlayer) => {
      const profile = profilesByPlayerId.get(ownerPlayer.player_id) || null;
      const crm = crmByPlayerId.get(ownerPlayer.player_id) || null;
      const playerTags = (tagsByPlayerId.get(ownerPlayer.player_id) || []).sort((left, right) =>
        left.name.localeCompare(right.name, 'da')
      );
      const playerNotes = notesByPlayerId.get(ownerPlayer.player_id) || [];
      const latestNote = playerNotes[0] || null;
      const guardianContacts = guardiansByPlayerId.get(ownerPlayer.player_id) || [];
      const teams = (teamPayload.teamsByPlayerId.get(ownerPlayer.player_id) || []).sort((left, right) =>
        left.name.localeCompare(right.name, 'da')
      );
      const positions = crm?.positions?.length ? crm.positions : profile?.player_positions || [];
      const dateOfBirth = crm?.date_of_birth ?? null;

      return {
        ownerPlayerId: ownerPlayer.id,
        playerId: ownerPlayer.player_id,
        displayName: profile?.full_name || 'Unavngivet',
        ownerRosterStatus: ownerPlayer.status,
        source: ownerPlayer.source,
        crmStatus: crm?.crm_status || 'active',
        positions,
        primaryPosition: positions[0] || null,
        playingLevel: crm?.playing_level ?? profile?.playing_level ?? null,
        clubName: crm?.club_name ?? profile?.club_name ?? null,
        dateOfBirth,
        age: toAge(dateOfBirth),
        phoneNumber: crm?.phone_number ?? profile?.phone_number ?? null,
        email: crm?.email ?? null,
        emailVisibleToStaff: crm?.email_visible_to_staff ?? true,
        phoneVisibleToStaff: crm?.phone_visible_to_staff ?? true,
        tags: playerTags.map(normalizeTagPayload),
        teams: teams.map((team) => ({
          id: team.id,
          name: team.name,
          description: team.description,
        })),
        guardianContactsCount: guardianContacts.length,
        notesCount: playerNotes.length,
        latestNotePreview: latestNote ? previewNote(latestNote.body) : null,
        updatedAt: crm?.updated_at ?? ownerPlayer.updated_at ?? ownerPlayer.created_at,
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'da'));

  return {
    ownerAccount: normalizeOwnerPayload(owner),
    players,
    tags: tags.map(normalizeTagPayload),
    teams: teamPayload.teams.map((team) => ({
      id: team.id,
      name: team.name,
      description: team.description,
      memberCount: team.memberCount,
    })),
  };
}

function normalizeOwnerPayload(owner: OwnerAccountRow) {
  return {
    ownerAccountId: owner.id,
    ownerType: owner.owner_type,
    name: owner.name,
    status: owner.status,
    coachAccountId: owner.coach_account_id,
    clubId: owner.club_id,
  };
}

function normalizeTagPayload(tag: TagRow) {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
  };
}

async function loadOwnerCrmContext(client: QueryClient, actorUserId: string) {
  const platformAdmin = await isPlatformAdmin(client, actorUserId);
  const { data: membershipRows, error: membershipError } = await client
    .from('owner_memberships')
    .select('owner_account_id')
    .eq('user_id', actorUserId)
    .eq('status', 'active');

  if (membershipError) {
    throw new AppError('INTERNAL_ERROR', membershipError.message || 'Could not load owner memberships.', 500);
  }

  const ownerIds = Array.from(new Set(((membershipRows || []) as Array<{ owner_account_id: string }>).map((row) => row.owner_account_id)));
  let ownerRows: OwnerAccountRow[] = [];
  if (ownerIds.length) {
    const { data, error } = await client
      .from('owner_accounts')
      .select('id, owner_type, name, status, coach_account_id, club_id')
      .in('id', ownerIds)
      .eq('status', 'active');

    if (error) {
      throw new AppError('INTERNAL_ERROR', error.message || 'Could not load owner accounts.', 500);
    }
    ownerRows = (data || []) as OwnerAccountRow[];
  } else if (platformAdmin) {
    const { data, error } = await client
      .from('owner_accounts')
      .select('id, owner_type, name, status, coach_account_id, club_id')
      .eq('status', 'active')
      .order('name')
      .limit(50);

    if (error) {
      throw new AppError('INTERNAL_ERROR', error.message || 'Could not load platform owner accounts.', 500);
    }
    ownerRows = (data || []) as OwnerAccountRow[];
  }

  let rolesByOwner = new Map<string, string[]>();
  if (ownerIds.length) {
    const { data, error } = await client
      .from('owner_membership_roles')
      .select('owner_account_id, role')
      .eq('user_id', actorUserId)
      .eq('status', 'active')
      .in('owner_account_id', ownerIds);

    if (error) {
      throw new AppError('INTERNAL_ERROR', error.message || 'Could not load owner roles.', 500);
    }

    rolesByOwner = ((data || []) as Array<{ owner_account_id: string; role: string }>).reduce((map, row) => {
      const existing = map.get(row.owner_account_id) || [];
      existing.push(row.role);
      map.set(row.owner_account_id, existing);
      return map;
    }, new Map<string, string[]>());
  }

  const workspaces = ownerRows
    .map((owner) => {
      const roles = platformAdmin && !rolesByOwner.has(owner.id) ? ['platform_admin'] : rolesByOwner.get(owner.id) || [];
      const canAccessCrm = platformAdmin || roles.some((role) => COACH_ACCESS_ROLES.has(role));
      return {
        ...normalizeOwnerPayload(owner),
        roles,
        canAccessCrm,
      };
    })
    .filter((owner) => owner.canAccessCrm)
    .sort((left, right) => {
      if (left.ownerType !== right.ownerType) {
        return left.ownerType === 'private_coach_business' ? -1 : 1;
      }
      return left.name.localeCompare(right.name, 'da');
    });

  return {
    isPlatformAdmin: platformAdmin,
    workspaces,
    defaultOwnerAccountId: workspaces[0]?.ownerAccountId ?? null,
  };
}

async function loadOwnerPlayerCrmDetail(client: QueryClient, owner: OwnerAccountRow, playerId: string) {
  await assertOwnerPlayerExists(client, owner.id, playerId);
  const list = await loadOwnerCrmList(client, owner);
  const player = list.players.find((candidate) => candidate.playerId === playerId);
  if (!player) {
    throw new AppError('PLAYER_NOT_FOUND', 'Player not found in this owner account.', 404);
  }

  const [notesResult, guardiansResult, activitiesResult, reflectionsResult] = await Promise.all([
    client
      .from('owner_player_notes')
      .select('id, owner_account_id, player_id, body, visibility, created_by, updated_by, created_at, updated_at')
      .eq('owner_account_id', owner.id)
      .eq('player_id', playerId)
      .order('updated_at', { ascending: false }),
    client
      .from('owner_player_guardian_contacts')
      .select('*')
      .eq('owner_account_id', owner.id)
      .eq('player_id', playerId)
      .neq('status', 'removed')
      .order('created_at', { ascending: false }),
    client
      .from('activities')
      .select('id, title, activity_date, activity_time, created_at')
      .or(`user_id.eq.${playerId},player_id.eq.${playerId}`)
      .order('activity_date', { ascending: false })
      .limit(10),
    client
      .from('training_reflections')
      .select('id, activity_id, rating, note, created_at')
      .eq('user_id', playerId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  for (const result of [notesResult, guardiansResult, activitiesResult, reflectionsResult]) {
    if (result.error) {
      throw new AppError('INTERNAL_ERROR', result.error.message || 'Could not load player CRM detail.', 500);
    }
  }

  const activities = (activitiesResult.data || []) as ActivityRow[];
  const reflections = (reflectionsResult.data || []) as ReflectionRow[];
  const timeline = [
    ...activities.map((activity) => ({
      id: `activity:${activity.id}`,
      type: 'activity',
      title: activity.title,
      subtitle: activity.activity_time,
      occurredAt: `${activity.activity_date}T${activity.activity_time || '00:00:00'}`,
    })),
    ...reflections.map((reflection) => ({
      id: `feedback:${reflection.id}`,
      type: 'feedback',
      title: reflection.rating == null ? 'Feedback note' : `Feedback rating ${reflection.rating}`,
      subtitle: reflection.note,
      occurredAt: reflection.created_at,
    })),
  ].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)).slice(0, 16);

  return {
    ...list,
    player,
    notes: ((notesResult.data || []) as NoteRow[]).map((note) => ({
      id: note.id,
      body: note.body,
      visibility: note.visibility,
      createdBy: note.created_by,
      updatedBy: note.updated_by,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    })),
    guardianContacts: ((guardiansResult.data || []) as GuardianContactRow[]).map((contact) => ({
      id: contact.id,
      guardianUserId: contact.guardian_user_id,
      fullName: contact.full_name,
      email: contact.email,
      phoneNumber: contact.phone_number,
      relation: contact.relation,
      status: contact.status,
      notes: contact.notes,
      permissions: contact.permissions,
      createdAt: contact.created_at,
      updatedAt: contact.updated_at,
    })),
    timeline,
  };
}

async function upsertCrmProfile(client: QueryClient, actorUserId: string, input: ReturnType<typeof parseOwnerPlayerCrmBody>) {
  if (input.action !== 'updateProfile') throw new AppError('VALIDATION_ERROR', 'Invalid action.', 400);
  const owner = await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
  await assertOwnerPlayerExists(client, owner.id, input.playerId);

  const { error } = await client
    .from('owner_player_crm_profiles')
    .upsert(
      {
        owner_account_id: owner.id,
        player_id: input.playerId,
        ...input.profile,
        updated_by: actorUserId,
      },
      { onConflict: 'owner_account_id,player_id' }
    );

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not update CRM profile.', 500);
  }

  return loadOwnerPlayerCrmDetail(client, owner, input.playerId);
}

async function createNote(client: QueryClient, actorUserId: string, input: ReturnType<typeof parseOwnerPlayerCrmBody>) {
  if (input.action !== 'createNote') throw new AppError('VALIDATION_ERROR', 'Invalid action.', 400);
  const owner = await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
  await assertOwnerPlayerExists(client, owner.id, input.playerId);

  const { error } = await client.from('owner_player_notes').insert({
    owner_account_id: owner.id,
    player_id: input.playerId,
    body: input.body,
    created_by: actorUserId,
    updated_by: actorUserId,
  });

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not create player note.', 500);
  }

  return loadOwnerPlayerCrmDetail(client, owner, input.playerId);
}

async function updateNote(client: QueryClient, actorUserId: string, input: ReturnType<typeof parseOwnerPlayerCrmBody>) {
  if (input.action !== 'updateNote') throw new AppError('VALIDATION_ERROR', 'Invalid action.', 400);
  const owner = await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
  await assertOwnerPlayerExists(client, owner.id, input.playerId);

  const { data, error } = await client
    .from('owner_player_notes')
    .update({ body: input.body, updated_by: actorUserId })
    .eq('id', input.noteId)
    .eq('owner_account_id', owner.id)
    .eq('player_id', input.playerId)
    .select('id');

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not update player note.', 500);
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new AppError('NOTE_NOT_FOUND', 'Player note not found.', 404);
  }

  return loadOwnerPlayerCrmDetail(client, owner, input.playerId);
}

async function deleteNote(client: QueryClient, actorUserId: string, input: ReturnType<typeof parseOwnerPlayerCrmBody>) {
  if (input.action !== 'deleteNote') throw new AppError('VALIDATION_ERROR', 'Invalid action.', 400);
  const owner = await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
  await assertOwnerPlayerExists(client, owner.id, input.playerId);

  const { error } = await client
    .from('owner_player_notes')
    .delete()
    .eq('id', input.noteId)
    .eq('owner_account_id', owner.id)
    .eq('player_id', input.playerId);

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not delete player note.', 500);
  }

  return loadOwnerPlayerCrmDetail(client, owner, input.playerId);
}

async function upsertTag(client: QueryClient, actorUserId: string, input: ReturnType<typeof parseOwnerPlayerCrmBody>) {
  if (input.action !== 'upsertTag') throw new AppError('VALIDATION_ERROR', 'Invalid action.', 400);
  const owner = await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);

  const { error } = await client
    .from('owner_player_tags')
    .upsert(
      {
        owner_account_id: owner.id,
        name: input.name,
        normalized_name: input.normalizedName,
        color: input.color,
        created_by: actorUserId,
      },
      { onConflict: 'owner_account_id,normalized_name' }
    );

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not save CRM tag.', 500);
  }

  return loadOwnerCrmList(client, owner);
}

async function deleteTag(client: QueryClient, actorUserId: string, input: ReturnType<typeof parseOwnerPlayerCrmBody>) {
  if (input.action !== 'deleteTag') throw new AppError('VALIDATION_ERROR', 'Invalid action.', 400);
  const owner = await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);

  const { error } = await client
    .from('owner_player_tags')
    .delete()
    .eq('id', input.tagId)
    .eq('owner_account_id', owner.id);

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not delete CRM tag.', 500);
  }

  return loadOwnerCrmList(client, owner);
}

async function setPlayerTags(client: QueryClient, actorUserId: string, input: ReturnType<typeof parseOwnerPlayerCrmBody>) {
  if (input.action !== 'setPlayerTags') throw new AppError('VALIDATION_ERROR', 'Invalid action.', 400);
  const owner = await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
  await assertOwnerPlayerExists(client, owner.id, input.playerId);

  if (input.tagIds.length) {
    const { data, error } = await client
      .from('owner_player_tags')
      .select('id')
      .eq('owner_account_id', owner.id)
      .in('id', input.tagIds);

    if (error) {
      throw new AppError('INTERNAL_ERROR', error.message || 'Could not verify CRM tags.', 500);
    }

    if ((data || []).length !== input.tagIds.length) {
      throw new AppError('TAG_NOT_FOUND', 'One or more CRM tags were not found.', 404);
    }
  }

  const { error: deleteError } = await client
    .from('owner_player_tag_links')
    .delete()
    .eq('owner_account_id', owner.id)
    .eq('player_id', input.playerId);

  if (deleteError) {
    throw new AppError('INTERNAL_ERROR', deleteError.message || 'Could not update player tags.', 500);
  }

  if (input.tagIds.length) {
    const { error: insertError } = await client.from('owner_player_tag_links').insert(
      input.tagIds.map((tagId) => ({
        owner_account_id: owner.id,
        player_id: input.playerId,
        tag_id: tagId,
        created_by: actorUserId,
      }))
    );

    if (insertError) {
      throw new AppError('INTERNAL_ERROR', insertError.message || 'Could not update player tags.', 500);
    }
  }

  return loadOwnerPlayerCrmDetail(client, owner, input.playerId);
}

async function saveGuardianContact(client: QueryClient, actorUserId: string, input: ReturnType<typeof parseOwnerPlayerCrmBody>) {
  if (input.action !== 'createGuardianContact' && input.action !== 'updateGuardianContact') {
    throw new AppError('VALIDATION_ERROR', 'Invalid action.', 400);
  }
  const owner = await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
  await assertOwnerPlayerExists(client, owner.id, input.playerId);

  const payload = {
    owner_account_id: owner.id,
    player_id: input.playerId,
    guardian_user_id: input.guardianUserId,
    full_name: input.fullName,
    email: input.email,
    phone_number: input.phoneNumber,
    relation: input.relation,
    status: input.status,
    notes: input.notes,
    created_by: actorUserId,
  };

  const result =
    input.action === 'createGuardianContact'
      ? await client.from('owner_player_guardian_contacts').insert(payload)
      : await client
          .from('owner_player_guardian_contacts')
          .update(payload)
          .eq('id', input.contactId)
          .eq('owner_account_id', owner.id)
          .eq('player_id', input.playerId);

  if (result.error) {
    throw new AppError('INTERNAL_ERROR', result.error.message || 'Could not save guardian contact.', 500);
  }

  return loadOwnerPlayerCrmDetail(client, owner, input.playerId);
}

async function deleteGuardianContact(client: QueryClient, actorUserId: string, input: ReturnType<typeof parseOwnerPlayerCrmBody>) {
  if (input.action !== 'deleteGuardianContact') throw new AppError('VALIDATION_ERROR', 'Invalid action.', 400);
  const owner = await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
  await assertOwnerPlayerExists(client, owner.id, input.playerId);

  const { error } = await client
    .from('owner_player_guardian_contacts')
    .update({ status: 'removed' })
    .eq('id', input.contactId)
    .eq('owner_account_id', owner.id)
    .eq('player_id', input.playerId);

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not remove guardian contact.', 500);
  }

  return loadOwnerPlayerCrmDetail(client, owner, input.playerId);
}

export async function ownerPlayerCrmAction(client: QueryClient, actorUserId: string, body: unknown): Promise<unknown> {
  const input = parseOwnerPlayerCrmBody(body);

  if (input.action === 'context') {
    return loadOwnerCrmContext(client, actorUserId);
  }

  if (input.action === 'list') {
    const owner = await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
    return loadOwnerCrmList(client, owner);
  }

  if (input.action === 'detail') {
    const owner = await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
    return loadOwnerPlayerCrmDetail(client, owner, input.playerId);
  }

  if (input.action === 'updateProfile') {
    return upsertCrmProfile(client, actorUserId, input);
  }

  if (input.action === 'createNote') {
    return createNote(client, actorUserId, input);
  }

  if (input.action === 'updateNote') {
    return updateNote(client, actorUserId, input);
  }

  if (input.action === 'deleteNote') {
    return deleteNote(client, actorUserId, input);
  }

  if (input.action === 'upsertTag') {
    return upsertTag(client, actorUserId, input);
  }

  if (input.action === 'deleteTag') {
    return deleteTag(client, actorUserId, input);
  }

  if (input.action === 'setPlayerTags') {
    return setPlayerTags(client, actorUserId, input);
  }

  if (input.action === 'createGuardianContact' || input.action === 'updateGuardianContact') {
    return saveGuardianContact(client, actorUserId, input);
  }

  return deleteGuardianContact(client, actorUserId, input);
}
