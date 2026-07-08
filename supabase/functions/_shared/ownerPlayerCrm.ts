// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { AppError, type ErrorCode } from './http.ts';
// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { deliverGuardianInviteEmail, type GuardianInviteEmailDeliveryResult, type GuardianInviteForEmail } from './guardianInviteDelivery.ts';

type DbError = { message?: string } | null;

type QueryClient = {
  rpc?: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: DbError }>;
  from: (table: string) => any;
  auth?: {
    admin?: {
      generateLink?: (params: {
        type: 'invite' | 'magiclink';
        email: string;
        options?: {
          redirectTo?: string;
        };
      }) => Promise<{ data: unknown; error: DbError }>;
    };
  };
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
  | 'deleteGuardianContact'
  | 'inviteGuardianContact'
  | 'resendGuardianInvite'
  | 'cancelGuardianInvite'
  | 'revokeGuardianAccess';

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

type GuardianInviteRow = {
  id: string;
  owner_account_id: string;
  player_id: string;
  guardian_contact_id: string | null;
  guardian_user_id: string | null;
  email: string;
  full_name: string;
  relation: 'parent' | 'guardian' | 'other';
  token_hash: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired' | 'revoked';
  expires_at: string;
  invited_by: string;
  accepted_by: string | null;
  accepted_at: string | null;
  cancelled_at: string | null;
  revoked_at: string | null;
  last_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type GuardianAccessRow = {
  id: string;
  owner_account_id: string;
  player_id: string;
  guardian_user_id: string;
  relation: 'parent' | 'guardian';
  permissions: Record<string, unknown>;
  status: 'active' | 'pending' | 'inactive' | 'removed';
  invited_by: string | null;
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
const GUARDIAN_INVITE_TTL_DAYS = 14;

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

function requiredLowerEmail(value: unknown, fieldName = 'email'): string {
  const normalized = optionalLowerEmail(value);
  if (!normalized || !normalized.includes('@')) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a valid email address.`, 400);
  }

  return normalized;
}

function optionalLowerEmail(value: unknown): string | null {
  const normalized = optionalTrimmedString(value);
  return normalized ? normalized.toLowerCase() : null;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return toHex(hash);
}

function createSecureToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
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
    'inviteGuardianContact',
    'resendGuardianInvite',
    'cancelGuardianInvite',
    'revokeGuardianAccess',
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

  if (action === 'inviteGuardianContact') {
    return {
      action,
      ownerAccountId,
      playerId: requireUuid(record.playerId, 'playerId'),
      contactId: requireUuid(record.contactId, 'contactId'),
    };
  }

  if (action === 'resendGuardianInvite' || action === 'cancelGuardianInvite') {
    return {
      action,
      ownerAccountId,
      playerId: requireUuid(record.playerId, 'playerId'),
      inviteId: requireUuid(record.inviteId, 'inviteId'),
    };
  }

  if (action === 'revokeGuardianAccess') {
    return {
      action,
      ownerAccountId,
      playerId: requireUuid(record.playerId, 'playerId'),
      contactId: requireUuid(record.contactId, 'contactId'),
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

  const [notesResult, guardiansResult, guardianInvitesResult, guardianAccessResult, activitiesResult, reflectionsResult] = await Promise.all([
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
      .from('owner_player_guardian_invites')
      .select('*')
      .eq('owner_account_id', owner.id)
      .eq('player_id', playerId)
      .order('created_at', { ascending: false }),
    client
      .from('owner_player_guardians')
      .select('id, owner_account_id, player_id, guardian_user_id, relation, permissions, status, invited_by, created_at, updated_at')
      .eq('owner_account_id', owner.id)
      .eq('player_id', playerId)
      .neq('status', 'removed'),
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

  for (const result of [notesResult, guardiansResult, guardianInvitesResult, guardianAccessResult, activitiesResult, reflectionsResult]) {
    if (result.error) {
      throw new AppError('INTERNAL_ERROR', result.error.message || 'Could not load player CRM detail.', 500);
    }
  }

  const guardianInvites = (guardianInvitesResult.data || []) as GuardianInviteRow[];
  const latestInviteByContactId = new Map<string, GuardianInviteRow>();
  const latestInviteByEmail = new Map<string, GuardianInviteRow>();
  for (const invite of guardianInvites) {
    if (invite.guardian_contact_id && !latestInviteByContactId.has(invite.guardian_contact_id)) {
      latestInviteByContactId.set(invite.guardian_contact_id, invite);
    }
    if (invite.email && !latestInviteByEmail.has(invite.email)) {
      latestInviteByEmail.set(invite.email, invite);
    }
  }

  const guardianAccessByUserId = new Map<string, GuardianAccessRow>();
  for (const access of (guardianAccessResult.data || []) as GuardianAccessRow[]) {
    if (!guardianAccessByUserId.has(access.guardian_user_id) || access.status === 'active') {
      guardianAccessByUserId.set(access.guardian_user_id, access);
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
    guardianContacts: ((guardiansResult.data || []) as GuardianContactRow[]).map((contact) => {
      const latestInvite =
        latestInviteByContactId.get(contact.id) || (contact.email ? latestInviteByEmail.get(contact.email) : null);
      const access = contact.guardian_user_id ? guardianAccessByUserId.get(contact.guardian_user_id) || null : null;
      return {
        id: contact.id,
        guardianUserId: contact.guardian_user_id,
        fullName: contact.full_name,
        email: contact.email,
        phoneNumber: contact.phone_number,
        relation: contact.relation,
        status: contact.status,
        notes: contact.notes,
        permissions: contact.permissions,
        inviteId: latestInvite?.id ?? null,
        inviteStatus: latestInvite?.status ?? null,
        inviteExpiresAt: latestInvite?.expires_at ?? null,
        inviteLastSentAt: latestInvite?.last_sent_at ?? null,
        accessId: access?.id ?? null,
        accessStatus: access?.status ?? null,
        createdAt: contact.created_at,
        updatedAt: contact.updated_at,
      };
    }),
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

async function loadGuardianContact(
  client: QueryClient,
  ownerAccountId: string,
  playerId: string,
  contactId: string
): Promise<GuardianContactRow> {
  const { data, error } = await client
    .from('owner_player_guardian_contacts')
    .select('*')
    .eq('id', contactId)
    .eq('owner_account_id', ownerAccountId)
    .eq('player_id', playerId)
    .neq('status', 'removed')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load guardian contact.', 500);
  }

  if (!data) {
    throw new AppError('GUARDIAN_CONTACT_NOT_FOUND', 'Guardian contact not found.', 404);
  }

  return data as GuardianContactRow;
}

async function loadPlayerDisplayName(client: QueryClient, playerId: string): Promise<string> {
  const { data, error } = await client
    .from('profiles')
    .select('full_name')
    .eq('user_id', playerId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load player name.', 500);
  }

  const fullName = typeof data?.full_name === 'string' ? data.full_name.trim() : '';
  return fullName || 'Player';
}

async function resolveAuthUserIdByEmail(client: QueryClient, email: string): Promise<string | null> {
  if (!client.rpc) {
    return null;
  }

  const { data, error } = await client.rpc('get_auth_user_invite_state_by_email', {
    p_email: email,
  });

  const mappedError = mapRpcError(error);
  if (mappedError) {
    throw mappedError;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }

  const id = (data as Record<string, unknown>).id;
  return typeof id === 'string' && UUID_PATTERN.test(id) ? id : null;
}

async function expireStaleGuardianInvites(
  client: QueryClient,
  ownerAccountId: string,
  playerId: string,
  email?: string | null
): Promise<void> {
  let query = client
    .from('owner_player_guardian_invites')
    .update({ status: 'expired' })
    .eq('owner_account_id', ownerAccountId)
    .eq('player_id', playerId)
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString());

  if (email) {
    query = query.eq('email', email);
  }

  const { error } = await query;
  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not expire stale guardian invites.', 500);
  }
}

async function loadGuardianInvite(
  client: QueryClient,
  ownerAccountId: string,
  playerId: string,
  inviteId: string
): Promise<GuardianInviteRow> {
  const { data, error } = await client
    .from('owner_player_guardian_invites')
    .select('*')
    .eq('id', inviteId)
    .eq('owner_account_id', ownerAccountId)
    .eq('player_id', playerId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load guardian invite.', 500);
  }

  if (!data) {
    throw new AppError('INVITE_NOT_FOUND', 'Guardian invite not found.', 404);
  }

  return data as GuardianInviteRow;
}

async function loadPendingGuardianInviteByEmail(
  client: QueryClient,
  ownerAccountId: string,
  playerId: string,
  email: string
): Promise<GuardianInviteRow | null> {
  const { data, error } = await client
    .from('owner_player_guardian_invites')
    .select('*')
    .eq('owner_account_id', ownerAccountId)
    .eq('player_id', playerId)
    .eq('email', email)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load pending guardian invite.', 500);
  }

  return (data as GuardianInviteRow | null) ?? null;
}

async function loadGuardianAccessForPlayer(
  client: QueryClient,
  ownerAccountId: string,
  playerId: string,
  guardianUserId: string
): Promise<GuardianAccessRow | null> {
  const { data, error } = await client
    .from('owner_player_guardians')
    .select('id, owner_account_id, player_id, guardian_user_id, relation, permissions, status, invited_by, created_at, updated_at')
    .eq('owner_account_id', ownerAccountId)
    .eq('player_id', playerId)
    .eq('guardian_user_id', guardianUserId)
    .neq('status', 'removed')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load guardian access.', 500);
  }

  return (data as GuardianAccessRow | null) ?? null;
}

function relationForGuardianAccess(relation: GuardianContactRow['relation'] | GuardianInviteRow['relation']): 'parent' | 'guardian' {
  return relation === 'parent' ? 'parent' : 'guardian';
}

function normalizeGuardianInvitePayload(invite: GuardianInviteRow) {
  return {
    id: invite.id,
    ownerAccountId: invite.owner_account_id,
    playerId: invite.player_id,
    guardianContactId: invite.guardian_contact_id,
    guardianUserId: invite.guardian_user_id,
    email: invite.email,
    fullName: invite.full_name,
    relation: invite.relation,
    status: invite.status,
    expiresAt: invite.expires_at,
    invitedBy: invite.invited_by,
    acceptedBy: invite.accepted_by,
    acceptedAt: invite.accepted_at,
    cancelledAt: invite.cancelled_at,
    revokedAt: invite.revoked_at,
    lastSentAt: invite.last_sent_at,
    createdAt: invite.created_at,
    updatedAt: invite.updated_at,
  };
}

function normalizeGuardianAccessPayload(access: GuardianAccessRow) {
  return {
    id: access.id,
    ownerAccountId: access.owner_account_id,
    playerId: access.player_id,
    guardianUserId: access.guardian_user_id,
    relation: access.relation,
    permissions: access.permissions,
    status: access.status,
    invitedBy: access.invited_by,
    createdAt: access.created_at,
    updatedAt: access.updated_at,
  };
}

async function detailWithGuardianInviteDelivery(
  client: QueryClient,
  owner: OwnerAccountRow,
  playerId: string,
  guardianInviteDelivery: GuardianInviteEmailDeliveryResult | null
) {
  const detail = (await loadOwnerPlayerCrmDetail(client, owner, playerId)) as Record<string, unknown>;
  return {
    ...detail,
    guardianInviteDelivery,
  };
}

async function deliverGuardianInviteForContact(
  client: QueryClient,
  owner: OwnerAccountRow,
  invite: GuardianInviteRow,
  token: string
): Promise<GuardianInviteEmailDeliveryResult> {
  const playerName = await loadPlayerDisplayName(client, invite.player_id);
  const inviteForEmail: GuardianInviteForEmail = {
    id: invite.id,
    ownerName: owner.name,
    playerName,
    email: invite.email,
    fullName: invite.full_name,
    relation: invite.relation,
    token,
  };

  return deliverGuardianInviteEmail(client as any, inviteForEmail);
}

async function insertGuardianInviteFromContact(
  client: QueryClient,
  actorUserId: string,
  owner: OwnerAccountRow,
  contact: GuardianContactRow
): Promise<{ invite: GuardianInviteRow; token: string }> {
  const email = requiredLowerEmail(contact.email, 'guardian contact email');
  await expireStaleGuardianInvites(client, owner.id, contact.player_id, email);

  const pendingInvite = await loadPendingGuardianInviteByEmail(client, owner.id, contact.player_id, email);
  if (pendingInvite) {
    throw new AppError('INVITE_ALREADY_PENDING', 'A pending guardian invite already exists for this email.', 409);
  }

  const guardianUserId = contact.guardian_user_id || (await resolveAuthUserIdByEmail(client, email));
  if (guardianUserId) {
    const existingAccess = await loadGuardianAccessForPlayer(client, owner.id, contact.player_id, guardianUserId);
    if (existingAccess?.status === 'active') {
      throw new AppError('MEMBER_ALREADY_EXISTS', 'This guardian already has active access to the player.', 409);
    }
  }

  const token = createSecureToken();
  const now = new Date();
  const payload = {
    owner_account_id: owner.id,
    player_id: contact.player_id,
    guardian_contact_id: contact.id,
    guardian_user_id: guardianUserId,
    email,
    full_name: contact.full_name,
    relation: contact.relation,
    token_hash: await sha256Hex(token),
    status: 'pending',
    expires_at: addDays(now, GUARDIAN_INVITE_TTL_DAYS).toISOString(),
    invited_by: actorUserId,
    last_sent_at: now.toISOString(),
  };

  const { data, error } = await client
    .from('owner_player_guardian_invites')
    .insert(payload)
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    const message = error.message || 'Could not create guardian invite.';
    if (message.includes('owner_player_guardian_invites_pending_email_unique')) {
      throw new AppError('INVITE_ALREADY_PENDING', 'A pending guardian invite already exists for this email.', 409);
    }
    throw new AppError('INTERNAL_ERROR', message, 500);
  }

  if (!data) {
    throw new AppError('INTERNAL_ERROR', 'Could not create guardian invite.', 500);
  }

  const { error: contactError } = await client
    .from('owner_player_guardian_contacts')
    .update({
      guardian_user_id: guardianUserId,
      status: 'pending',
      permissions: { read: false },
    })
    .eq('id', contact.id)
    .eq('owner_account_id', owner.id)
    .eq('player_id', contact.player_id);

  if (contactError) {
    throw new AppError('INTERNAL_ERROR', contactError.message || 'Could not update guardian contact.', 500);
  }

  return { invite: data as GuardianInviteRow, token };
}

async function inviteGuardianContact(client: QueryClient, actorUserId: string, input: ReturnType<typeof parseOwnerPlayerCrmBody>) {
  if (input.action !== 'inviteGuardianContact') throw new AppError('VALIDATION_ERROR', 'Invalid action.', 400);
  const owner = await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
  await assertOwnerPlayerExists(client, owner.id, input.playerId);
  const contact = await loadGuardianContact(client, owner.id, input.playerId, input.contactId);
  const { invite, token } = await insertGuardianInviteFromContact(client, actorUserId, owner, contact);
  const guardianInviteDelivery = await deliverGuardianInviteForContact(client, owner, invite, token);
  return detailWithGuardianInviteDelivery(client, owner, input.playerId, guardianInviteDelivery);
}

async function resendGuardianInvite(client: QueryClient, actorUserId: string, input: ReturnType<typeof parseOwnerPlayerCrmBody>) {
  if (input.action !== 'resendGuardianInvite') throw new AppError('VALIDATION_ERROR', 'Invalid action.', 400);
  const owner = await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
  await assertOwnerPlayerExists(client, owner.id, input.playerId);
  await expireStaleGuardianInvites(client, owner.id, input.playerId);

  const existing = await loadGuardianInvite(client, owner.id, input.playerId, input.inviteId);
  if (existing.status !== 'pending') {
    throw new AppError('INVITE_NOT_FOUND', 'Guardian invite is not pending.', 404);
  }
  if (Date.parse(existing.expires_at) <= Date.now()) {
    await client.from('owner_player_guardian_invites').update({ status: 'expired' }).eq('id', existing.id);
    throw new AppError('INVITE_NOT_FOUND', 'Guardian invite has expired.', 404);
  }

  const token = createSecureToken();
  const now = new Date();
  const { data, error } = await client
    .from('owner_player_guardian_invites')
    .update({
      token_hash: await sha256Hex(token),
      expires_at: addDays(now, GUARDIAN_INVITE_TTL_DAYS).toISOString(),
      last_sent_at: now.toISOString(),
    })
    .eq('id', existing.id)
    .eq('owner_account_id', owner.id)
    .eq('player_id', input.playerId)
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not resend guardian invite.', 500);
  }
  if (!data) {
    throw new AppError('INVITE_NOT_FOUND', 'Guardian invite not found.', 404);
  }

  const guardianInviteDelivery = await deliverGuardianInviteForContact(client, owner, data as GuardianInviteRow, token);
  return detailWithGuardianInviteDelivery(client, owner, input.playerId, guardianInviteDelivery);
}

async function cancelGuardianInvite(client: QueryClient, actorUserId: string, input: ReturnType<typeof parseOwnerPlayerCrmBody>) {
  if (input.action !== 'cancelGuardianInvite') throw new AppError('VALIDATION_ERROR', 'Invalid action.', 400);
  const owner = await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
  await assertOwnerPlayerExists(client, owner.id, input.playerId);
  const invite = await loadGuardianInvite(client, owner.id, input.playerId, input.inviteId);

  if (invite.status !== 'pending') {
    throw new AppError('INVITE_NOT_FOUND', 'Guardian invite is not pending.', 404);
  }

  const { error } = await client
    .from('owner_player_guardian_invites')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', invite.id)
    .eq('owner_account_id', owner.id)
    .eq('player_id', input.playerId);

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not cancel guardian invite.', 500);
  }

  if (invite.guardian_contact_id) {
    const { error: contactError } = await client
      .from('owner_player_guardian_contacts')
      .update({ status: 'inactive', permissions: { read: false } })
      .eq('id', invite.guardian_contact_id)
      .eq('owner_account_id', owner.id)
      .eq('player_id', input.playerId);

    if (contactError) {
      throw new AppError('INTERNAL_ERROR', contactError.message || 'Could not update guardian contact.', 500);
    }
  }

  return loadOwnerPlayerCrmDetail(client, owner, input.playerId);
}

async function revokeGuardianAccess(client: QueryClient, actorUserId: string, input: ReturnType<typeof parseOwnerPlayerCrmBody>) {
  if (input.action !== 'revokeGuardianAccess') throw new AppError('VALIDATION_ERROR', 'Invalid action.', 400);
  const owner = await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
  await assertOwnerPlayerExists(client, owner.id, input.playerId);
  const contact = await loadGuardianContact(client, owner.id, input.playerId, input.contactId);
  if (!contact.guardian_user_id) {
    throw new AppError('GUARDIAN_CONTACT_NOT_FOUND', 'Guardian contact has no active user access.', 404);
  }

  const now = new Date().toISOString();
  const { error: accessError } = await client
    .from('owner_player_guardians')
    .update({ status: 'removed' })
    .eq('owner_account_id', owner.id)
    .eq('player_id', input.playerId)
    .eq('guardian_user_id', contact.guardian_user_id);

  if (accessError) {
    throw new AppError('INTERNAL_ERROR', accessError.message || 'Could not revoke guardian access.', 500);
  }

  const { error: contactError } = await client
    .from('owner_player_guardian_contacts')
    .update({ status: 'inactive', permissions: { read: false } })
    .eq('id', contact.id)
    .eq('owner_account_id', owner.id)
    .eq('player_id', input.playerId);

  if (contactError) {
    throw new AppError('INTERNAL_ERROR', contactError.message || 'Could not update guardian contact.', 500);
  }

  let inviteQuery = client
    .from('owner_player_guardian_invites')
    .update({ status: 'revoked', revoked_at: now })
    .eq('owner_account_id', owner.id)
    .eq('player_id', input.playerId)
    .in('status', ['pending', 'accepted']);

  if (contact.email) {
    inviteQuery = inviteQuery.eq('email', contact.email);
  } else {
    inviteQuery = inviteQuery.eq('guardian_contact_id', contact.id);
  }

  const { error: inviteError } = await inviteQuery;
  if (inviteError) {
    throw new AppError('INTERNAL_ERROR', inviteError.message || 'Could not revoke guardian invite state.', 500);
  }

  return loadOwnerPlayerCrmDetail(client, owner, input.playerId);
}

function parseAcceptGuardianInviteBody(body: unknown) {
  const record = asRecord(body);
  return {
    token: requiredTrimmedString(record.token, 'token'),
    fullName: optionalTrimmedString(record.fullName),
  };
}

async function loadGuardianInviteByToken(client: QueryClient, token: string): Promise<GuardianInviteRow> {
  const tokenHash = await sha256Hex(token);
  const { data, error } = await client
    .from('owner_player_guardian_invites')
    .select('*')
    .eq('token_hash', tokenHash)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load guardian invite.', 500);
  }
  if (!data) {
    throw new AppError('INVITE_NOT_FOUND', 'Guardian invite not found.', 404);
  }

  return data as GuardianInviteRow;
}

async function loadOwnerSeatStatusPayload(client: QueryClient, ownerAccountId: string): Promise<Record<string, unknown>> {
  const payload = await callRpc<Record<string, unknown>>(client, 'get_owner_seat_status_payload', {
    p_owner_account_id: ownerAccountId,
  });

  if (!payload || typeof payload !== 'object') {
    throw new AppError('INTERNAL_ERROR', 'Could not load owner seat status.', 500);
  }

  return payload;
}

async function loadGuardianSeatStatus(
  client: QueryClient,
  ownerAccountId: string
): Promise<Record<string, unknown>> {
  return loadOwnerSeatStatusPayload(client, ownerAccountId);
}

export async function acceptOwnerPlayerGuardianInviteAction(
  client: QueryClient,
  actorUserId: string,
  actorEmail: string | null,
  body: unknown
) {
  const input = parseAcceptGuardianInviteBody(body);
  const invite = await loadGuardianInviteByToken(client, input.token);

  if (invite.status !== 'pending') {
    throw new AppError('INVITE_NOT_FOUND', 'Guardian invite is not pending.', 404);
  }

  if (Date.parse(invite.expires_at) <= Date.now()) {
    await client.from('owner_player_guardian_invites').update({ status: 'expired' }).eq('id', invite.id);
    throw new AppError('INVITE_NOT_FOUND', 'Guardian invite has expired.', 404);
  }

  const normalizedActorEmail = actorEmail?.trim().toLowerCase() ?? null;
  if (!normalizedActorEmail || normalizedActorEmail !== invite.email) {
    throw new AppError('FORBIDDEN', 'This guardian invite belongs to a different email address.', 403);
  }

  const owner = await loadOwnerAccount(client, invite.owner_account_id);
  await assertOwnerPlayerExists(client, owner.id, invite.player_id);
  const seatStatus = await loadGuardianSeatStatus(client, owner.id);
  const relation = relationForGuardianAccess(invite.relation);
  const now = new Date().toISOString();

  const { data: accessData, error: accessError } = await client
    .from('owner_player_guardians')
    .upsert(
      {
        owner_account_id: owner.id,
        player_id: invite.player_id,
        guardian_user_id: actorUserId,
        relation,
        permissions: { read: true },
        status: 'active',
        invited_by: invite.invited_by,
      },
      { onConflict: 'owner_account_id,player_id,guardian_user_id' }
    )
    .select('id, owner_account_id, player_id, guardian_user_id, relation, permissions, status, invited_by, created_at, updated_at')
    .limit(1)
    .maybeSingle();

  if (accessError) {
    throw new AppError('INTERNAL_ERROR', accessError.message || 'Could not accept guardian invite.', 500);
  }
  if (!accessData) {
    throw new AppError('INTERNAL_ERROR', 'Could not accept guardian invite.', 500);
  }

  const { data: inviteData, error: inviteError } = await client
    .from('owner_player_guardian_invites')
    .update({
      guardian_user_id: actorUserId,
      status: 'accepted',
      accepted_by: actorUserId,
      accepted_at: now,
    })
    .eq('id', invite.id)
    .eq('status', 'pending')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (inviteError) {
    throw new AppError('INTERNAL_ERROR', inviteError.message || 'Could not update guardian invite.', 500);
  }
  if (!inviteData) {
    throw new AppError('INVITE_NOT_FOUND', 'Guardian invite is no longer pending.', 404);
  }

  if (invite.guardian_contact_id) {
    const updatePayload: Record<string, unknown> = {
      guardian_user_id: actorUserId,
      status: 'active',
      permissions: { read: true },
    };
    if (input.fullName) {
      updatePayload.full_name = input.fullName;
    }

    const { error: contactError } = await client
      .from('owner_player_guardian_contacts')
      .update(updatePayload)
      .eq('id', invite.guardian_contact_id)
      .eq('owner_account_id', owner.id)
      .eq('player_id', invite.player_id);

    if (contactError) {
      throw new AppError('INTERNAL_ERROR', contactError.message || 'Could not update guardian contact.', 500);
    }
  }

  return {
    invite: normalizeGuardianInvitePayload(inviteData as GuardianInviteRow),
    guardianAccess: normalizeGuardianAccessPayload(accessData as GuardianAccessRow),
    seatStatus,
  };
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

  if (input.action === 'inviteGuardianContact') {
    return inviteGuardianContact(client, actorUserId, input);
  }

  if (input.action === 'resendGuardianInvite') {
    return resendGuardianInvite(client, actorUserId, input);
  }

  if (input.action === 'cancelGuardianInvite') {
    return cancelGuardianInvite(client, actorUserId, input);
  }

  if (input.action === 'revokeGuardianAccess') {
    return revokeGuardianAccess(client, actorUserId, input);
  }

  return deleteGuardianContact(client, actorUserId, input);
}
