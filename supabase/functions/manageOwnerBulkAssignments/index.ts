import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { requireAuthContext, requireEnv } from '../_shared/auth.ts';
import {
  AppError,
  optionsResponse,
  readJsonBody,
  responseFromError,
  successResponse,
} from '../_shared/http.ts';
import {
  buildProgramEnrollmentPlayerPlans,
  readProgramTemplates,
  type ProgramTemplateMaterialization,
} from '../_shared/programEnrollmentMaterialization.ts';
import {
  ownerBulkFilterMatches,
  resolveOwnerBulkRecipients,
} from '../_shared/ownerBulkRecipientResolution.ts';

const API_VERSION = 1;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STAFF_ROLES = new Set(['owner', 'admin', 'coach', 'assistant_coach']);
const CONTENT_TYPES = new Set([
  'activity',
  'exercise',
  'training_template',
  'program',
]);
const OPERATIONS = new Set(['assign', 'update', 'remove']);
const FILTER_FIELDS = new Set([
  'team',
  'tag',
  'crm_status',
  'age',
  'playing_level',
  'position',
  'program_enrollment',
]);
const PREVIEW_TTL_MS = 15 * 60 * 1000;
const IN_FILTER_CHUNK_SIZE = 100;

type AnyRecord = Record<string, any>;
type QueryClient = any;

type OwnerRow = {
  id: string;
  owner_type: 'club' | 'private_coach_business';
  name: string;
  status: string;
  club_id: string | null;
  coach_account_id: string | null;
};

type TeamRow = AnyRecord & {
  id: string;
  name: string;
};

type FilterGroup = {
  field: string;
  values: Array<string | number>;
  operator: 'in' | 'between';
  programId: string | null;
};

type CanonicalCommand = {
  apiVersion: 1;
  ownerAccountId: string;
  operation: 'assign' | 'update' | 'remove';
  content: {
    type: 'activity' | 'exercise' | 'training_template' | 'program';
    id: string;
  };
  filters: FilterGroup[];
  playerIds: string[];
  includeAllPlayers: boolean;
  exclusions: { playerIds: string[]; teamIds: string[] };
  assignment: AnyRecord;
  targetBatchId: string | null;
};

type RosterPlayer = {
  playerId: string;
  name: string;
  status: string;
  crmStatus: string | null;
  dateOfBirth: string | null;
  age: number | null;
  playingLevel: string | null;
  positions: string[];
  tags: Array<{ id: string; name: string; color: string }>;
  teams: Array<{ id: string; name: string }>;
  programEnrollments: Array<{
    enrollmentId: string;
    programId: string;
    status: string;
    startDate: string;
    updatedAt: string;
  }>;
  version: AnyRecord;
};

type OwnerDataset = {
  owner: OwnerRow;
  roles: string[];
  teams: TeamRow[];
  roster: RosterPlayer[];
  content: {
    activities: AnyRecord[];
    exercises: AnyRecord[];
    trainingTemplates: AnyRecord[];
    programs: AnyRecord[];
  };
  raw: {
    profiles: AnyRecord[];
    crm: AnyRecord[];
    tagLinks: AnyRecord[];
    tags: AnyRecord[];
    teamMembers: AnyRecord[];
    enrollments: AnyRecord[];
  };
};

function bulkError(code: string, message: string, status: number): AppError {
  return new AppError(code as any, message, status);
}

function asRecord(value: unknown, name = 'request body'): AnyRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw bulkError('VALIDATION_ERROR', `${name} must be an object.`, 400);
  }
  return value as AnyRecord;
}

function requireUuid(value: unknown, name: string): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!UUID.test(result))
    throw bulkError('VALIDATION_ERROR', `${name} must be a UUID.`, 400);
  return result;
}

function optionalUuid(value: unknown, name: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  return requireUuid(value, name);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function uuidList(value: unknown, name: string): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value))
    throw bulkError('VALIDATION_ERROR', `${name} must be an array.`, 400);
  return [
    ...new Set(value.map((item) => requireUuid(item, `${name}[]`))),
  ].sort();
}

function normalizeJson(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as AnyRecord) }
    : {};
}

function stableValue(value: any): any {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function chunks<T>(values: T[], size = IN_FILTER_CHUNK_SIZE): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size)
    output.push(values.slice(index, index + size));
  return output;
}

async function loadRowsInChunks(
  values: string[],
  buildQuery: (
    chunk: string[],
  ) => PromiseLike<{ data: AnyRecord[] | null; error: AnyRecord | null }>,
): Promise<AnyRecord[]> {
  if (!values.length) return [];
  const results = await Promise.all(
    chunks([...new Set(values)]).map((chunk) => buildQuery(chunk)),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error)
    throw bulkError(
      'INTERNAL_ERROR',
      failed.error.message ?? 'Chunked query failed.',
      500,
    );
  return results.flatMap((result) => result.data ?? []);
}

async function loadPagedRows(
  buildQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: AnyRecord[] | null; error: AnyRecord | null }>,
  pageSize = 1000,
): Promise<AnyRecord[]> {
  const output: AnyRecord[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error)
      throw bulkError(
        'INTERNAL_ERROR',
        error.message ?? 'Paged query failed.',
        500,
      );
    const page = data ?? [];
    output.push(...page);
    if (page.length < pageSize) return output;
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function previewSigningKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(requireEnv('SUPABASE_SERVICE_ROLE_KEY')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signPreviewToken(payload: AnyRecord): Promise<string> {
  const serialized = stableStringify(payload);
  const encoded = base64UrlEncode(new TextEncoder().encode(serialized));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await previewSigningKey(),
    new TextEncoder().encode(encoded),
  );
  return `${encoded}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifyPreviewToken(token: unknown): Promise<AnyRecord> {
  if (typeof token !== 'string' || !token.includes('.')) {
    throw bulkError(
      'BULK_PREVIEW_STALE',
      'Preview token is missing or invalid. Refresh the preview.',
      409,
    );
  }
  const [encoded, signaturePart, extra] = token.split('.');
  if (!encoded || !signaturePart || extra)
    throw bulkError(
      'BULK_PREVIEW_STALE',
      'Preview token is invalid. Refresh the preview.',
      409,
    );
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await previewSigningKey(),
      base64UrlDecode(signaturePart),
      new TextEncoder().encode(encoded),
    );
  } catch {
    valid = false;
  }
  if (!valid)
    throw bulkError(
      'BULK_PREVIEW_STALE',
      'Preview token signature is invalid. Refresh the preview.',
      409,
    );
  try {
    return asRecord(
      JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded))),
      'preview token',
    );
  } catch {
    throw bulkError(
      'BULK_PREVIEW_STALE',
      'Preview token payload is invalid. Refresh the preview.',
      409,
    );
  }
}

function calculateAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth || !ISO_DATE.test(dateOfBirth)) return null;
  const today = new Date();
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const month = today.getUTCMonth() - birth.getUTCMonth();
  if (month < 0 || (month === 0 && today.getUTCDate() < birth.getUTCDate()))
    age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function validIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function validTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
}

function parseFilters(value: unknown): FilterGroup[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value))
    throw bulkError('VALIDATION_ERROR', 'filters must be an array.', 400);
  const groups = value.map((raw, index) => {
    const filter = asRecord(raw, `filters[${index}]`);
    const field = stringValue(filter.field)?.toLowerCase() ?? '';
    if (!FILTER_FIELDS.has(field))
      throw bulkError(
        'VALIDATION_ERROR',
        `filters[${index}].field is invalid.`,
        400,
      );
    if (!Array.isArray(filter.values) || filter.values.length === 0) {
      throw bulkError(
        'VALIDATION_ERROR',
        `filters[${index}].values must be non-empty.`,
        400,
      );
    }
    const values = [
      ...new Set(
        filter.values.map((item: unknown) =>
          field === 'age' ? Number(item) : String(item).trim(),
        ),
      ),
    ].filter((item) =>
      field === 'age'
        ? Number.isInteger(item) && Number(item) >= 0 && Number(item) <= 120
        : Boolean(item),
    );
    if (!values.length)
      throw bulkError(
        'VALIDATION_ERROR',
        `filters[${index}].values are invalid.`,
        400,
      );
    const operator = filter.operator === 'between' ? 'between' : 'in';
    if (operator === 'between' && (field !== 'age' || values.length !== 2)) {
      throw bulkError(
        'VALIDATION_ERROR',
        'between is only supported for age with exactly two values.',
        400,
      );
    }
    const sortedValues = values.sort((left, right) =>
      field === 'age'
        ? Number(left) - Number(right)
        : String(left).localeCompare(String(right)),
    );
    return {
      field,
      values: sortedValues,
      operator,
      programId:
        field === 'program_enrollment'
          ? requireUuid(filter.programId, `filters[${index}].programId`)
          : null,
    } as FilterGroup;
  });
  return groups.sort((left, right) =>
    stableStringify(left).localeCompare(stableStringify(right)),
  );
}

function parseCanonicalCommand(body: AnyRecord): CanonicalCommand {
  const ownerAccountId = requireUuid(body.ownerAccountId, 'ownerAccountId');
  const operation = stringValue(
    body.operation,
  ) as CanonicalCommand['operation'];
  if (!OPERATIONS.has(operation))
    throw bulkError(
      'VALIDATION_ERROR',
      'operation must be assign, update or remove.',
      400,
    );
  const rawContent = asRecord(body.content, 'content');
  const contentType = stringValue(
    rawContent.type,
  ) as CanonicalCommand['content']['type'];
  if (!CONTENT_TYPES.has(contentType))
    throw bulkError('VALIDATION_ERROR', 'content.type is invalid.', 400);
  const filters = parseFilters(body.filters);
  const playerIds = uuidList(body.playerIds, 'playerIds');
  const includeAllPlayers = body.includeAllPlayers === true;
  if (!includeAllPlayers && !playerIds.length && !filters.length) {
    throw bulkError(
      'VALIDATION_ERROR',
      'Select players/filters or explicitly set includeAllPlayers=true.',
      400,
    );
  }
  const exclusions = normalizeJson(body.exclusions);
  const assignment = normalizeJson(body.assignment);
  if (
    (contentType === 'program' || contentType === 'training_template') &&
    operation !== 'remove'
  ) {
    const startDate = stringValue(assignment.startDate);
    if (!startDate || !validIsoDate(startDate))
      throw bulkError(
        'VALIDATION_ERROR',
        'assignment.startDate must be a real YYYY-MM-DD date.',
        400,
      );
    assignment.startDate = startDate;
  }
  if (contentType === 'program' && operation !== 'remove') {
    const hasEnrollmentStatus = Object.prototype.hasOwnProperty.call(
      assignment,
      'enrollmentStatus',
    );
    if (operation === 'assign' || hasEnrollmentStatus) {
      const enrollmentStatus =
        stringValue(assignment.enrollmentStatus)?.toLowerCase() ??
        (operation === 'assign' ? 'active' : null);
      if (!enrollmentStatus || !['active', 'paused'].includes(enrollmentStatus))
        throw bulkError(
          'VALIDATION_ERROR',
          'assignment.enrollmentStatus must be active or paused.',
          400,
        );
      assignment.enrollmentStatus = enrollmentStatus;
    }
  }
  if (
    assignment.activityDate &&
    !validIsoDate(String(assignment.activityDate))
  ) {
    throw bulkError(
      'VALIDATION_ERROR',
      'assignment.activityDate must be a real YYYY-MM-DD date.',
      400,
    );
  }
  if (assignment.activityTime && !validTime(String(assignment.activityTime))) {
    throw bulkError(
      'VALIDATION_ERROR',
      'assignment.activityTime must use HH:MM or HH:MM:SS.',
      400,
    );
  }
  if (
    assignment.activityEndTime &&
    !validTime(String(assignment.activityEndTime))
  ) {
    throw bulkError(
      'VALIDATION_ERROR',
      'assignment.activityEndTime must use HH:MM or HH:MM:SS.',
      400,
    );
  }
  return {
    apiVersion: API_VERSION,
    ownerAccountId,
    operation,
    content: {
      type: contentType,
      id: requireUuid(rawContent.id, 'content.id'),
    },
    filters,
    playerIds,
    includeAllPlayers,
    exclusions: {
      playerIds: uuidList(exclusions.playerIds, 'exclusions.playerIds'),
      teamIds: uuidList(exclusions.teamIds, 'exclusions.teamIds'),
    },
    assignment: stableValue(assignment),
    targetBatchId: optionalUuid(body.targetBatchId, 'targetBatchId'),
  };
}

async function ownerRoles(
  client: QueryClient,
  userId: string,
  ownerAccountId: string,
): Promise<string[]> {
  const { data, error } = await client.rpc('get_owner_account_roles', {
    p_owner_account_id: ownerAccountId,
    p_user_id: userId,
  });
  if (error) throw bulkError('INTERNAL_ERROR', error.message, 500);
  return Array.isArray(data)
    ? data.filter((role) => typeof role === 'string')
    : [];
}

async function assertStaff(
  client: QueryClient,
  userId: string,
  ownerAccountId: string,
): Promise<{ owner: OwnerRow; roles: string[] }> {
  const [{ data: owner, error }, roles] = await Promise.all([
    client
      .from('owner_accounts')
      .select('id,owner_type,name,status,club_id,coach_account_id')
      .eq('id', ownerAccountId)
      .maybeSingle(),
    ownerRoles(client, userId, ownerAccountId),
  ]);
  if (error) throw bulkError('INTERNAL_ERROR', error.message, 500);
  if (!owner || owner.status !== 'active')
    throw bulkError(
      'OWNER_ACCOUNT_NOT_FOUND',
      'Active owner account not found.',
      404,
    );
  if (!roles.some((role) => STAFF_ROLES.has(role)))
    throw bulkError(
      'FORBIDDEN',
      'You do not have coach access to this owner.',
      403,
    );
  return { owner: owner as OwnerRow, roles };
}

async function loadOwnerTeams(
  client: QueryClient,
  owner: OwnerRow,
): Promise<TeamRow[]> {
  let query = client
    .from('teams')
    .select('id,name,club_id,coach_account_id,updated_at')
    .order('name');
  if (owner.owner_type === 'club' && owner.club_id)
    query = query.eq('club_id', owner.club_id);
  else if (owner.coach_account_id)
    query = query.eq('coach_account_id', owner.coach_account_id);
  else return [];
  const { data, error } = await query;
  if (error) throw bulkError('INTERNAL_ERROR', error.message, 500);
  return (data ?? []) as TeamRow[];
}

async function loadOwnerDataset(
  client: QueryClient,
  userId: string,
  ownerAccountId: string,
): Promise<OwnerDataset> {
  const { owner, roles } = await assertStaff(client, userId, ownerAccountId);
  const [ownerPlayers, teams] = await Promise.all([
    loadPagedRows((from, to) =>
      client
        .from('owner_players')
        .select('player_id,status,updated_at')
        .eq('owner_account_id', ownerAccountId)
        .eq('status', 'active')
        .order('player_id')
        .range(from, to),
    ),
    loadOwnerTeams(client, owner),
  ]);

  const playerIds = ownerPlayers.map((row: AnyRecord) => String(row.player_id));
  const teamIds = teams.map((team) => String(team.id));

  const [profiles, crm, tagsResult, tagLinks, teamMembers, enrollments] =
    await Promise.all([
      loadRowsInChunks(playerIds, (ids) =>
        client
          .from('profiles')
          .select('user_id,full_name,updated_at')
          .in('user_id', ids),
      ),
      loadRowsInChunks(playerIds, (ids) =>
        client
          .from('owner_player_crm_profiles')
          .select(
            'player_id,crm_status,positions,playing_level,date_of_birth,updated_at',
          )
          .eq('owner_account_id', ownerAccountId)
          .in('player_id', ids),
      ),
      client
        .from('owner_player_tags')
        .select('id,name,color,updated_at')
        .eq('owner_account_id', ownerAccountId)
        .order('name'),
      loadRowsInChunks(playerIds, (ids) =>
        client
          .from('owner_player_tag_links')
          .select('player_id,tag_id,created_at')
          .eq('owner_account_id', ownerAccountId)
          .in('player_id', ids),
      ),
      teamIds.length
        ? loadRowsInChunks(playerIds, (ids) =>
            client
              .from('team_members')
              .select('team_id,player_id,created_at')
              .in('team_id', teamIds)
              .in('player_id', ids),
          )
        : Promise.resolve([]),
      loadRowsInChunks(playerIds, (ids) =>
        client
          .from('program_enrollments')
          .select('id,player_id,program_id,status,start_date,updated_at')
          .eq('owner_account_id', ownerAccountId)
          .in('player_id', ids),
      ),
    ]);
  if (tagsResult.error)
    throw bulkError('INTERNAL_ERROR', tagsResult.error.message, 500);

  const [
    staffActivitiesResult,
    teamActivitiesResult,
    staffExercisesResult,
    systemExercisesResult,
    templatesResult,
    programsResult,
  ] = await Promise.all([
    client
      .from('activities')
      .select(
        'id,title,activity_date,activity_time,activity_end_time,location,is_external,user_id,team_id,updated_at',
      )
      .eq('user_id', userId)
      .eq('is_external', false)
      .is('source_activity_id', null)
      .is('player_id', null)
      .order('updated_at', { ascending: false })
      .limit(500),
    teamIds.length
      ? loadRowsInChunks(teamIds, (ids) =>
          client
            .from('activities')
            .select(
              'id,title,activity_date,activity_time,activity_end_time,location,is_external,user_id,team_id,updated_at',
            )
            .in('team_id', ids)
            .eq('is_external', false)
            .is('source_activity_id', null)
            .is('player_id', null)
            .order('updated_at', { ascending: false })
            .limit(500),
        ).then((data) => ({ data, error: null }))
      : Promise.resolve({ data: [], error: null }),
    client
      .from('exercise_library')
      .select('id,title,description,video_url,is_system,trainer_id,updated_at')
      .eq('trainer_id', userId)
      .order('updated_at', { ascending: false })
      .limit(500),
    client
      .from('exercise_library')
      .select('id,title,description,video_url,is_system,trainer_id,updated_at')
      .eq('is_system', true)
      .order('updated_at', { ascending: false })
      .limit(500),
    client
      .from('training_templates')
      .select(
        'id,title,description,status,template_type,active_version_id,updated_at',
      )
      .eq('owner_account_id', ownerAccountId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false }),
    client
      .from('training_programs')
      .select(
        'id,title,description,status,level,duration_weeks,published_version,updated_at',
      )
      .eq('owner_account_id', ownerAccountId)
      .eq('status', 'published')
      .order('updated_at', { ascending: false }),
  ]);
  for (const result of [
    staffActivitiesResult,
    teamActivitiesResult,
    staffExercisesResult,
    systemExercisesResult,
    templatesResult,
    programsResult,
  ]) {
    if (result.error)
      throw bulkError('INTERNAL_ERROR', result.error.message, 500);
  }

  const tags = tagsResult.data ?? [];
  const profileByPlayer = new Map(
    profiles.map((row: AnyRecord) => [row.user_id, row]),
  );
  const crmByPlayer = new Map(
    crm.map((row: AnyRecord) => [row.player_id, row]),
  );
  const tagById = new Map<string, AnyRecord>(
    tags.map((row: AnyRecord) => [String(row.id), row]),
  );
  const teamById = new Map<string, TeamRow>(
    teams.map((row) => [String(row.id), row]),
  );

  const roster: RosterPlayer[] = (ownerPlayers ?? []).map(
    (ownerPlayer: AnyRecord) => {
      const playerId = String(ownerPlayer.player_id);
      const profile = profileByPlayer.get(playerId) ?? {};
      const crmProfile = crmByPlayer.get(playerId) ?? {};
      const playerTags = tagLinks
        .filter((link: AnyRecord) => link.player_id === playerId)
        .map((link: AnyRecord) => tagById.get(link.tag_id))
        .filter((tag): tag is AnyRecord => Boolean(tag))
        .map((tag) => ({
          id: tag.id,
          name: tag.name,
          color: tag.color,
        }))
        .sort((left: AnyRecord, right: AnyRecord) =>
          left.name.localeCompare(right.name),
        );
      const playerTeams = teamMembers
        .filter((member: AnyRecord) => member.player_id === playerId)
        .map((member: AnyRecord) => teamById.get(member.team_id))
        .filter((team): team is TeamRow => Boolean(team))
        .map((team) => ({ id: team.id, name: team.name }))
        .sort((left: AnyRecord, right: AnyRecord) =>
          left.name.localeCompare(right.name),
        );
      const playerEnrollments = enrollments
        .filter((enrollment: AnyRecord) => enrollment.player_id === playerId)
        .map((enrollment: AnyRecord) => ({
          enrollmentId: enrollment.id,
          programId: enrollment.program_id,
          status: enrollment.status,
          startDate: enrollment.start_date,
          updatedAt: enrollment.updated_at,
        }))
        .sort((left: AnyRecord, right: AnyRecord) =>
          `${left.programId}:${left.startDate}`.localeCompare(
            `${right.programId}:${right.startDate}`,
          ),
        );
      return {
        playerId,
        name: stringValue(profile.full_name) ?? 'Unnamed player',
        status: ownerPlayer.status,
        crmStatus: stringValue(crmProfile.crm_status) ?? 'active',
        dateOfBirth: stringValue(crmProfile.date_of_birth),
        age: calculateAge(stringValue(crmProfile.date_of_birth)),
        playingLevel: stringValue(crmProfile.playing_level),
        positions: Array.isArray(crmProfile.positions)
          ? crmProfile.positions
              .filter((item: unknown) => typeof item === 'string')
              .sort()
          : [],
        tags: playerTags,
        teams: playerTeams,
        programEnrollments: playerEnrollments,
        version: {
          rosterUpdatedAt: ownerPlayer.updated_at,
          profileUpdatedAt: profile.updated_at ?? null,
          crmUpdatedAt: crmProfile.updated_at ?? null,
          tagLinks: tagLinks
            .filter((link: AnyRecord) => link.player_id === playerId)
            .map((link: AnyRecord) => [link.tag_id, link.created_at])
            .sort(),
          teamLinks: teamMembers
            .filter((member: AnyRecord) => member.player_id === playerId)
            .map((member: AnyRecord) => [member.team_id, member.created_at])
            .sort(),
          enrollments: playerEnrollments,
        },
      };
    },
  );

  const activityById = new Map<string, AnyRecord>();
  for (const activity of [
    ...(staffActivitiesResult.data ?? []),
    ...(teamActivitiesResult.data ?? []),
  ])
    activityById.set(activity.id, activity);
  const exerciseById = new Map<string, AnyRecord>();
  for (const exercise of [
    ...(staffExercisesResult.data ?? []),
    ...(systemExercisesResult.data ?? []),
  ])
    exerciseById.set(exercise.id, exercise);

  return {
    owner,
    roles,
    teams,
    roster,
    content: {
      activities: [...activityById.values()].map((row) => ({
        id: row.id,
        title: row.title,
        status: 'active',
        activityDate: row.activity_date,
        activityTime: row.activity_time,
        activityEndTime: row.activity_end_time,
        location: row.location,
        isExternal: false,
        updatedAt: row.updated_at,
      })),
      exercises: [...exerciseById.values()].map((row) => ({
        id: row.id,
        title: row.title,
        status: 'active',
        description: row.description,
        videoUrl: row.video_url,
        isSystem: row.is_system === true,
        updatedAt: row.updated_at,
      })),
      trainingTemplates: (templatesResult.data ?? []).map((row: AnyRecord) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        templateType: row.template_type,
        description: row.description,
        activeVersionId: row.active_version_id,
        updatedAt: row.updated_at,
      })),
      programs: (programsResult.data ?? []).map((row: AnyRecord) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        description: row.description,
        level: row.level,
        durationWeeks: row.duration_weeks,
        publishedVersion: row.published_version,
        updatedAt: row.updated_at,
      })),
    },
    raw: { profiles, crm, tagLinks, tags, teamMembers, enrollments },
  };
}

async function loadWorkspaces(client: QueryClient, userId: string) {
  const { data: memberships, error } = await client
    .from('owner_memberships')
    .select('owner_account_id')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) throw bulkError('INTERNAL_ERROR', error.message, 500);
  const ownerIds = [
    ...new Set(
      (memberships ?? []).map((row: AnyRecord) => String(row.owner_account_id)),
    ),
  ];
  if (!ownerIds.length) return [];
  const [
    { data: owners, error: ownerError },
    { data: roleRows, error: roleError },
  ] = await Promise.all([
    client
      .from('owner_accounts')
      .select('id,owner_type,name,status')
      .in('id', ownerIds)
      .eq('status', 'active'),
    client
      .from('owner_membership_roles')
      .select('owner_account_id,role')
      .eq('user_id', userId)
      .eq('status', 'active')
      .in('owner_account_id', ownerIds),
  ]);
  if (ownerError) throw bulkError('INTERNAL_ERROR', ownerError.message, 500);
  if (roleError) throw bulkError('INTERNAL_ERROR', roleError.message, 500);
  return (owners ?? [])
    .map((owner: AnyRecord) => {
      const roles = (roleRows ?? [])
        .filter((row: AnyRecord) => row.owner_account_id === owner.id)
        .map((row: AnyRecord) => row.role);
      return {
        ownerAccountId: owner.id,
        ownerType: owner.owner_type,
        name: owner.name,
        roles,
      };
    })
    .filter((workspace: AnyRecord) =>
      workspace.roles.some((role: string) => STAFF_ROLES.has(role)),
    )
    .sort((left: AnyRecord, right: AnyRecord) =>
      left.name.localeCompare(right.name, 'da'),
    );
}

function contextFilters(dataset: OwnerDataset) {
  const unique = (values: Array<string | null>) =>
    [
      ...new Set(values.filter((value): value is string => Boolean(value))),
    ].sort();
  return {
    teams: dataset.teams.map((team) => ({ id: team.id, name: team.name })),
    tags: dataset.raw.tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
    })),
    crmStatuses: unique(dataset.roster.map((player) => player.crmStatus)),
    playingLevels: unique(dataset.roster.map((player) => player.playingLevel)),
    positions: unique(dataset.roster.flatMap((player) => player.positions)),
    enrollmentStatuses: ['active', 'paused', 'completed', 'cancelled'],
  };
}

async function contextPayload(
  client: QueryClient,
  userId: string,
  body: AnyRecord,
) {
  const workspaces = await loadWorkspaces(client, userId);
  const requestedOwnerId = optionalUuid(body.ownerAccountId, 'ownerAccountId');
  const selectedOwnerAccountId =
    requestedOwnerId ?? workspaces[0]?.ownerAccountId ?? null;
  if (!selectedOwnerAccountId) {
    return {
      apiVersion: API_VERSION,
      workspaces,
      selectedOwnerAccountId: null,
      owner: null,
      roster: [],
      filters: {
        teams: [],
        tags: [],
        crmStatuses: [],
        playingLevels: [],
        positions: [],
        enrollmentStatuses: [],
      },
      content: {
        activities: [],
        exercises: [],
        trainingTemplates: [],
        programs: [],
      },
    };
  }
  if (
    !workspaces.some(
      (workspace: AnyRecord) =>
        workspace.ownerAccountId === selectedOwnerAccountId,
    )
  ) {
    throw bulkError(
      'FORBIDDEN',
      'Selected owner workspace is unavailable.',
      403,
    );
  }
  const dataset = await loadOwnerDataset(
    client,
    userId,
    selectedOwnerAccountId,
  );
  return {
    apiVersion: API_VERSION,
    workspaces,
    selectedOwnerAccountId,
    owner: {
      ownerAccountId: dataset.owner.id,
      ownerType: dataset.owner.owner_type,
      name: dataset.owner.name,
      status: dataset.owner.status,
      roles: dataset.roles,
    },
    roster: dataset.roster.map(({ version: _version, ...player }) => player),
    filters: contextFilters(dataset),
    content: dataset.content,
  };
}

const filterMatches = ownerBulkFilterMatches;

function resolveRecipients(command: CanonicalCommand, dataset: OwnerDataset) {
  return resolveOwnerBulkRecipients(
    command,
    dataset,
    (code, message, status) => {
      throw bulkError(code, message, status);
    },
  );
}

async function loadTargetBatchMap(
  client: QueryClient,
  command: CanonicalCommand,
): Promise<Map<string, string>> {
  if (!command.targetBatchId) return new Map();
  const { data: batch, error: batchError } = await client
    .from('assignment_batches')
    .select('id')
    .eq('id', command.targetBatchId)
    .eq('owner_account_id', command.ownerAccountId)
    .eq('content_type', command.content.type)
    .eq('content_id', command.content.id)
    .maybeSingle();
  if (batchError) throw bulkError('INTERNAL_ERROR', batchError.message, 500);
  if (!batch)
    throw bulkError(
      'BATCH_NOT_FOUND',
      'targetBatchId was not found for this owner/content.',
      404,
    );
  const data = await loadPagedRows((from, to) =>
    client
      .from('assignment_batch_items')
      .select('id,player_id,target_id,status,rollback_status,created_at')
      .eq('batch_id', command.targetBatchId)
      .in('status', ['created', 'updated'])
      .neq('rollback_status', 'rolled_back')
      .order('created_at')
      .order('id')
      .range(from, to),
  );
  return new Map(
    data
      .filter((row: AnyRecord) => row.target_id)
      .map((row: AnyRecord) => [row.player_id, row.target_id]),
  );
}

async function activityStartedMap(
  client: QueryClient,
  activityIds: string[],
): Promise<Set<string>> {
  if (!activityIds.length) return new Set();
  const [
    tasks,
    reflections,
    selfFeedback,
    trainerFeedback,
    dependentActivities,
    exclusions,
  ] = await Promise.all([
    loadRowsInChunks(activityIds, (ids) =>
      client
        .from('activity_tasks')
        .select('id,activity_id,completed')
        .in('activity_id', ids),
    ),
    loadRowsInChunks(activityIds, (ids) =>
      client
        .from('training_reflections')
        .select('activity_id,rating,note')
        .in('activity_id', ids),
    ),
    loadRowsInChunks(activityIds, (ids) =>
      client
        .from('task_template_self_feedback')
        .select('activity_id')
        .in('activity_id', ids),
    ),
    loadRowsInChunks(activityIds, (ids) =>
      client
        .from('trainer_activity_feedback')
        .select('activity_context_id')
        .eq('activity_context_type', 'internal')
        .in('activity_context_id', ids),
    ),
    loadRowsInChunks(activityIds, (ids) =>
      client
        .from('activities')
        .select('source_activity_id')
        .in('source_activity_id', ids),
    ),
    loadRowsInChunks(activityIds, (ids) =>
      client
        .from('activity_assignment_team_exclusions')
        .select('source_activity_id')
        .in('source_activity_id', ids),
    ),
  ]);
  const taskIds = tasks.map((row: AnyRecord) => row.id);
  const completedSubtasks = await loadRowsInChunks(taskIds, (ids) =>
    client
      .from('activity_task_subtasks')
      .select('activity_task_id')
      .in('activity_task_id', ids)
      .eq('completed', true),
  );
  const activityByTask = new Map(
    tasks.map((row: AnyRecord) => [row.id, row.activity_id]),
  );
  return new Set([
    ...tasks
      .filter((row: AnyRecord) => row.completed === true)
      .map((row: AnyRecord) => String(row.activity_id)),
    ...completedSubtasks.map((row: AnyRecord) =>
      String(activityByTask.get(row.activity_task_id)),
    ),
    ...reflections
      .filter(
        (row: AnyRecord) =>
          (row.rating !== null && row.rating !== undefined) ||
          Boolean(stringValue(row.note)),
      )
      .map((row: AnyRecord) => String(row.activity_id)),
    ...selfFeedback.map((row: AnyRecord) => String(row.activity_id)),
    ...trainerFeedback.map((row: AnyRecord) => String(row.activity_context_id)),
    ...dependentActivities.map((row: AnyRecord) =>
      String(row.source_activity_id),
    ),
    ...exclusions.map((row: AnyRecord) => String(row.source_activity_id)),
  ]);
}

async function loadExistingState(
  client: QueryClient,
  userId: string,
  command: CanonicalCommand,
  players: RosterPlayer[],
) {
  const playerIds = players.map((player) => player.playerId);
  const targetBatchMap = await loadTargetBatchMap(client, command);
  const byPlayer = new Map<string, AnyRecord>();
  const archivedExercisePlayerIds = new Set<string>();
  let versionRows: AnyRecord[] = [];

  if (command.content.type === 'activity') {
    versionRows = await loadRowsInChunks(playerIds, (ids) =>
      client
        .from('activities')
        .select(
          'id,user_id,player_id,team_id,title,activity_date,activity_time,activity_end_time,location,updated_at,assignment_owner_account_id',
        )
        .eq('source_activity_id', command.content.id)
        .in('user_id', ids)
        .eq('is_external', false),
    );
    const started = await activityStartedMap(
      client,
      versionRows.map((row) => row.id),
    );
    for (const player of players) {
      const targetId = targetBatchMap.get(player.playerId);
      const candidates = versionRows.filter(
        (candidate) => candidate.user_id === player.playerId,
      );
      const scoped = candidates.find(
        (candidate) =>
          candidate.assignment_owner_account_id === command.ownerAccountId,
      );
      const legacy = candidates.find(
        (candidate) => !candidate.assignment_owner_account_id,
      );
      const row = command.targetBatchId
        ? targetId
          ? candidates.find((candidate) => candidate.id === targetId)
          : undefined
        : (scoped ?? legacy);
      if (row)
        byPlayer.set(player.playerId, {
          ...row,
          started: started.has(row.id),
          unscopedLegacy: !row.assignment_owner_account_id && !targetId,
        });
    }
  } else if (command.content.type === 'exercise') {
    const teamIds = [
      ...new Set(
        players.flatMap((player) => player.teams.map((team) => team.id)),
      ),
    ];
    const [directRows, teamRows, archivedTemplates] = await Promise.all([
      loadRowsInChunks(playerIds, (ids) =>
        client
          .from('exercise_assignments')
          .select(
            'id,exercise_id,trainer_id,player_id,team_id,owner_account_id,created_at',
          )
          .eq('exercise_id', command.content.id)
          .in('player_id', ids),
      ),
      loadRowsInChunks(teamIds, (ids) =>
        client
          .from('exercise_assignments')
          .select(
            'id,exercise_id,trainer_id,player_id,team_id,owner_account_id,created_at',
          )
          .eq('exercise_id', command.content.id)
          .in('team_id', ids),
      ),
      loadRowsInChunks(playerIds, (ids) =>
        client
          .from('task_templates')
          .select('id,player_id,archived_at')
          .eq('user_id', userId)
          .eq('library_exercise_id', command.content.id)
          .is('team_id', null)
          .not('archived_at', 'is', null)
          .in('player_id', ids),
      ),
    ]);
    archivedTemplates.forEach((row) =>
      archivedExercisePlayerIds.add(String(row.player_id)),
    );
    versionRows = [
      ...new Map(
        [...directRows, ...teamRows].map((row) => [row.id, row]),
      ).values(),
    ];
    for (const player of players) {
      const targetId = targetBatchMap.get(player.playerId);
      const directCandidates = versionRows.filter(
        (row) => row.player_id === player.playerId,
      );
      const scoped = directCandidates.find(
        (row) => row.owner_account_id === command.ownerAccountId,
      );
      const legacy = directCandidates.find(
        (row) => !row.owner_account_id && !row.team_id,
      );
      const direct = command.targetBatchId
        ? targetId
          ? directCandidates.find((row) => row.id === targetId)
          : undefined
        : (scoped ?? legacy);
      const team = command.targetBatchId
        ? undefined
        : versionRows.find(
            (row) =>
              row.team_id &&
              player.teams.some((membership) => membership.id === row.team_id),
          );
      if (direct)
        byPlayer.set(player.playerId, {
          ...direct,
          sharedTeam: false,
          sharedTemplate: directCandidates.some(
            (candidate) => candidate.id !== direct.id,
          ),
          unscopedLegacy: !direct.owner_account_id && !targetId,
        });
      else if (team)
        byPlayer.set(player.playerId, { ...team, sharedTeam: true });
    }
  } else if (command.content.type === 'training_template') {
    versionRows = await loadRowsInChunks(playerIds, (ids) =>
      client
        .from('training_template_assignments')
        .select('*')
        .eq('owner_account_id', command.ownerAccountId)
        .eq('template_id', command.content.id)
        .in('player_id', ids)
        .eq('status', 'active'),
    );
    const materializedTaskIds = versionRows.flatMap(
      (row) => row.materialized_task_ids ?? [],
    );
    const materializedActivityIds = versionRows.flatMap(
      (row) => row.materialized_activity_ids ?? [],
    );
    const [completedTasks, startedActivities] = await Promise.all([
      loadRowsInChunks(materializedTaskIds, (ids) =>
        client.from('tasks').select('id').in('id', ids).eq('completed', true),
      ),
      activityStartedMap(client, materializedActivityIds),
    ]);
    const completedTaskSet = new Set(
      completedTasks.map((row: AnyRecord) => String(row.id)),
    );
    for (const player of players) {
      const targetId = targetBatchMap.get(player.playerId);
      const allPlayerCandidates = versionRows.filter(
        (row) => row.player_id === player.playerId,
      );
      const candidates = command.targetBatchId
        ? targetId
          ? allPlayerCandidates.filter((row) => row.id === targetId)
          : []
        : allPlayerCandidates;
      const desiredStart =
        stringValue(command.assignment.startDate) ??
        new Date().toISOString().slice(0, 10);
      const row =
        command.operation === 'assign'
          ? candidates.find(
              (candidate) => candidate.start_date === desiredStart,
            )
          : candidates.sort((left, right) =>
              String(right.start_date).localeCompare(String(left.start_date)),
            )[0];
      if (row)
        byPlayer.set(player.playerId, {
          ...row,
          desiredDateCollision:
            command.operation === 'update' &&
            allPlayerCandidates.some(
              (candidate) =>
                candidate.id !== row.id &&
                candidate.start_date === desiredStart,
            ),
          started:
            (row.materialized_task_ids ?? []).some((id: string) =>
              completedTaskSet.has(id),
            ) ||
            (row.materialized_activity_ids ?? []).some((id: string) =>
              startedActivities.has(id),
            ),
        });
    }
  } else {
    versionRows = await loadRowsInChunks(playerIds, (ids) =>
      client
        .from('program_enrollments')
        .select('*')
        .eq('owner_account_id', command.ownerAccountId)
        .eq('program_id', command.content.id)
        .in('player_id', ids),
    );
    const enrollmentIds = versionRows.map((row) => row.id);
    const enrollmentItems = await loadRowsInChunks(enrollmentIds, (ids) =>
      client
        .from('program_enrollment_items')
        .select('enrollment_id,status,task_id,activity_id,updated_at')
        .in('enrollment_id', ids),
    );
    const taskIds = enrollmentItems
      .map((row: AnyRecord) => row.task_id)
      .filter(Boolean);
    const activityIds = enrollmentItems
      .map((row: AnyRecord) => row.activity_id)
      .filter(Boolean);
    const [completedTasks, startedActivities] = await Promise.all([
      loadRowsInChunks(taskIds, (ids) =>
        client.from('tasks').select('id').in('id', ids).eq('completed', true),
      ),
      activityStartedMap(client, activityIds),
    ]);
    const completedTaskSet = new Set(
      completedTasks.map((row: AnyRecord) => String(row.id)),
    );
    for (const player of players) {
      const targetId = targetBatchMap.get(player.playerId);
      const allPlayerCandidates = versionRows.filter(
        (row) => row.player_id === player.playerId,
      );
      const candidates = command.targetBatchId
        ? targetId
          ? allPlayerCandidates.filter((row) => row.id === targetId)
          : []
        : allPlayerCandidates;
      const desiredStart = stringValue(command.assignment.startDate);
      const row =
        command.operation === 'assign'
          ? candidates.find(
              (candidate) => candidate.start_date === desiredStart,
            )
          : command.targetBatchId
            ? candidates[0]
            : candidates
                .filter((candidate) =>
                  ['active', 'paused'].includes(candidate.status),
                )
                .sort((left, right) =>
                  String(right.start_date).localeCompare(
                    String(left.start_date),
                  ),
                )[0];
      if (row) {
        const items = enrollmentItems.filter(
          (item: AnyRecord) => item.enrollment_id === row.id,
        );
        byPlayer.set(player.playerId, {
          ...row,
          items,
          desiredDateCollision:
            command.operation === 'update' &&
            allPlayerCandidates.some(
              (candidate) =>
                candidate.id !== row.id &&
                candidate.start_date === desiredStart,
            ),
          started:
            ['completed', 'cancelled'].includes(row.status) ||
            items.some(
              (item: AnyRecord) =>
                item.status !== 'upcoming' ||
                completedTaskSet.has(item.task_id) ||
                startedActivities.has(item.activity_id),
            ),
        });
      }
    }
  }
  const targetIds = [
    ...new Set(
      [...byPlayer.values()]
        .map((target) => String(target.id))
        .filter((id) => UUID.test(id)),
    ),
  ];
  const { data: targetStateHashes, error: snapshotError } = targetIds.length
    ? await client.rpc('owner_bulk_target_state_hashes', {
        p_content_type: command.content.type,
        p_target_ids: targetIds,
      })
    : { data: {}, error: null };
  if (snapshotError)
    throw bulkError('INTERNAL_ERROR', snapshotError.message, 500);
  const stateHashes = normalizeJson(targetStateHashes);
  for (const target of byPlayer.values())
    target.expectedStateHash = stringValue(stateHashes[target.id]);
  return {
    byPlayer,
    versionRows,
    targetStateHashes: stateHashes,
    archivedExercisePlayerIds,
  };
}

function serializedMaterializations(
  materializations: Map<string, ProgramTemplateMaterialization>,
) {
  return [...materializations.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

async function loadSourceStateHash(
  client: QueryClient,
  command: CanonicalCommand,
  programVersionId: string | null,
  templateVersionId: string | null,
) {
  const { data, error } = await client.rpc('owner_bulk_source_state_hash', {
    p_owner_account_id: command.ownerAccountId,
    p_content_type: command.content.type,
    p_content_id: command.content.id,
    p_program_version_id: programVersionId,
    p_template_version_id: templateVersionId,
  });
  if (error) throw bulkError('INTERNAL_ERROR', error.message, 500);
  const hash = stringValue(data);
  if (!hash)
    throw bulkError(
      'CONTENT_NOT_FOUND',
      'Content source state is unavailable.',
      404,
    );
  return hash;
}

async function loadSourceState(
  client: QueryClient,
  command: CanonicalCommand,
  content: AnyRecord,
): Promise<AnyRecord> {
  if (command.content.type === 'activity') {
    const { data, error } = await client.rpc('owner_bulk_snapshot_activity', {
      p_activity_id: command.content.id,
    });
    if (error) throw bulkError('INTERNAL_ERROR', error.message, 500);
    if (!data)
      throw bulkError(
        'CONTENT_NOT_FOUND',
        'Activity source is unavailable.',
        404,
      );
    return {
      snapshot: data,
      stateHash: await loadSourceStateHash(client, command, null, null),
    };
  }
  if (command.content.type === 'exercise') {
    const { data, error } = await client
      .from('exercise_library')
      .select('*')
      .eq('id', command.content.id)
      .maybeSingle();
    if (error) throw bulkError('INTERNAL_ERROR', error.message, 500);
    if (!data)
      throw bulkError(
        'CONTENT_NOT_FOUND',
        'Exercise source is unavailable.',
        404,
      );
    return {
      snapshot: data,
      stateHash: await loadSourceStateHash(client, command, null, null),
    };
  }
  if (command.content.type === 'training_template') {
    const activeVersionId = stringValue(content.activeVersionId);
    if (!activeVersionId)
      throw bulkError(
        'CONTENT_NOT_FOUND',
        'Training template has no active immutable version.',
        409,
      );
    const { data: version, error } = await client
      .from('template_versions')
      .select('*')
      .eq('owner_account_id', command.ownerAccountId)
      .eq('template_id', command.content.id)
      .eq('id', activeVersionId)
      .maybeSingle();
    if (error) throw bulkError('INTERNAL_ERROR', error.message, 500);
    if (!version)
      throw bulkError(
        'CONTENT_NOT_FOUND',
        'Training template version is unavailable.',
        409,
      );
    const materializations = await loadImmutableTemplateMaterializations(
      client,
      command.ownerAccountId,
      command.content.id,
      version,
    );
    return {
      version,
      materializations: serializedMaterializations(materializations),
      stateHash: await loadSourceStateHash(client, command, null, version.id),
    };
  }

  const version = await loadProgramVersion(
    client,
    command.ownerAccountId,
    command.content.id,
    null,
    Number(content.publishedVersion),
  );
  return {
    id: version.id,
    programId: version.program_id,
    versionNumber: version.version_number,
    snapshot: version.snapshot,
    createdAt: version.created_at,
    materializations: serializedMaterializations(
      version.templates ?? new Map(),
    ),
    stateHash: await loadSourceStateHash(client, command, version.id, null),
  };
}

function findSourceTeam(
  command: CanonicalCommand,
  player: RosterPlayer,
  target?: AnyRecord,
): string | null {
  if (
    Object.prototype.hasOwnProperty.call(command.assignment, 'sourceTeamId')
  ) {
    return optionalUuid(
      command.assignment.sourceTeamId,
      'assignment.sourceTeamId',
    );
  }
  if (command.operation === 'update')
    return target?.source_team_id ?? target?.team_id ?? null;
  const includedTeamFilter = command.filters.find(
    (filter) => filter.field === 'team',
  );
  const filteredTeamId = player.teams.find((team) =>
    includedTeamFilter?.values.map(String).includes(team.id),
  )?.id;
  if (filteredTeamId) return filteredTeamId;
  return null;
}

function jsonScalarText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return JSON.stringify(value);
}

function comparableTime(value: unknown): string | null {
  const text = jsonScalarText(value)?.trim() ?? null;
  if (!text) return null;
  const withSeconds = /^\d{2}:\d{2}$/.test(text) ? `${text}:00` : text;
  return withSeconds.replace(/\.0+$/, '');
}

function activityUpdateHasChanges(
  command: CanonicalCommand,
  target: AnyRecord,
  sourceTeamId: string | null,
): boolean {
  const assignment = command.assignment;
  const has = (field: string) =>
    Object.prototype.hasOwnProperty.call(assignment, field);
  const requestedTitle = jsonScalarText(assignment.title)?.trim() ?? '';
  const requestedDate = jsonScalarText(assignment.activityDate);
  const requestedTime = jsonScalarText(assignment.activityTime);
  const requestedEndTime = has('activityEndTime')
    ? jsonScalarText(assignment.activityEndTime)?.trim() || null
    : target.activity_end_time;
  const requestedLocation = has('location')
    ? jsonScalarText(assignment.location) || null
    : target.location;

  return (
    target.assignment_owner_account_id !== command.ownerAccountId ||
    (target.team_id ?? null) !== sourceTeamId ||
    String(target.title ?? '') !==
      (requestedTitle || String(target.title ?? '')) ||
    String(target.activity_date ?? '') !==
      (requestedDate || String(target.activity_date ?? '')) ||
    comparableTime(target.activity_time) !==
      comparableTime(requestedTime || target.activity_time) ||
    (target.activity_end_time ?? null) !== (requestedEndTime ?? null) ||
    (target.location ?? null) !== (requestedLocation ?? null)
  );
}

async function buildPreview(
  client: QueryClient,
  userId: string,
  command: CanonicalCommand,
) {
  const dataset = await loadOwnerDataset(
    client,
    userId,
    command.ownerAccountId,
  );
  const contentArray =
    command.content.type === 'training_template'
      ? dataset.content.trainingTemplates
      : command.content.type === 'program'
        ? dataset.content.programs
        : command.content.type === 'activity'
          ? dataset.content.activities
          : dataset.content.exercises;
  const content = contentArray.find((item) => item.id === command.content.id);
  if (!content)
    throw bulkError(
      'CONTENT_NOT_FOUND',
      'Selected content is not assignable in this owner.',
      404,
    );
  const resolved = resolveRecipients(command, dataset);
  const requestedSourceTeamId = optionalUuid(
    command.assignment.sourceTeamId,
    'assignment.sourceTeamId',
  );
  if (
    requestedSourceTeamId &&
    !dataset.teams.some((team) => team.id === requestedSourceTeamId)
  ) {
    throw bulkError(
      'VALIDATION_ERROR',
      'assignment.sourceTeamId does not belong to this owner.',
      400,
    );
  }
  const [existing, sourceState] = await Promise.all([
    loadExistingState(client, userId, command, resolved.included),
    loadSourceState(client, command, content),
  ]);
  const recipients = resolved.included.map((player) => {
    const target = existing.byPlayer.get(player.playerId);
    const matchesAllFilters = command.filters.every((filter) =>
      filterMatches(player, filter),
    );
    const reasons = [
      ...(command.includeAllPlayers ? ['all_players'] : []),
      ...(command.playerIds.includes(player.playerId)
        ? ['explicit_player']
        : []),
      ...(matchesAllFilters
        ? command.filters.map((filter) => `filter:${filter.field}`)
        : []),
    ];
    let status: 'create' | 'update' | 'remove' | 'duplicate' | 'conflict';
    let conflictCode: string | null = null;
    const sourceTeamId = findSourceTeam(command, player, target);
    if (
      sourceTeamId &&
      command.operation !== 'remove' &&
      !player.teams.some((team) => team.id === sourceTeamId)
    ) {
      status = 'conflict';
      conflictCode = 'TEAM_SCOPE_INVALID';
    } else if (target?.unscopedLegacy) {
      status = 'conflict';
      conflictCode = 'LEGACY_ASSIGNMENT_UNSCOPED';
    } else if (
      command.content.type === 'exercise' &&
      command.operation === 'assign' &&
      !target &&
      existing.archivedExercisePlayerIds.has(player.playerId)
    ) {
      status = 'conflict';
      conflictCode = 'EXERCISE_TEMPLATE_ARCHIVED';
    } else if (command.operation === 'assign')
      status = target ? 'duplicate' : 'create';
    else if (!target) {
      status = 'conflict';
      conflictCode = 'ASSIGNMENT_NOT_FOUND';
    } else if (target.sharedTeam) {
      status = 'conflict';
      conflictCode = 'SHARED_TEAM_ASSIGNMENT';
    } else if (
      command.content.type === 'exercise' &&
      command.operation === 'update' &&
      target.sharedTemplate
    ) {
      status = 'conflict';
      conflictCode = 'SHARED_EXERCISE_TEMPLATE';
    } else if (command.operation === 'update' && target.desiredDateCollision) {
      status = 'conflict';
      conflictCode = 'ASSIGNMENT_EXISTS_FOR_START_DATE';
    } else if (target.started) {
      status = 'conflict';
      conflictCode = 'PLAYER_PROGRESS_EXISTS';
    } else if (
      command.operation === 'update' &&
      command.content.type === 'exercise'
    )
      status = 'duplicate';
    else if (
      command.operation === 'update' &&
      command.content.type === 'activity' &&
      !activityUpdateHasChanges(command, target, sourceTeamId)
    )
      status = 'duplicate';
    else status = command.operation;
    return {
      playerId: player.playerId,
      name: player.name,
      reasons,
      status,
      conflictCode,
      targetId: target?.id ?? null,
      sourceTeamId,
    };
  });
  const summary = {
    matched: resolved.matched.length,
    included: recipients.length,
    excluded: resolved.excluded.length,
    duplicates: recipients.filter(
      (recipient) => recipient.status === 'duplicate',
    ).length,
    conflicts: recipients.filter((recipient) => recipient.status === 'conflict')
      .length,
    willCreate: recipients.filter((recipient) => recipient.status === 'create')
      .length,
    willUpdate: recipients.filter((recipient) => recipient.status === 'update')
      .length,
    willRemove: recipients.filter((recipient) => recipient.status === 'remove')
      .length,
  };
  const resolutionFingerprint = await sha256(
    stableStringify({
      ownerAccountId: command.ownerAccountId,
      roster: dataset.roster.map((player) => ({
        playerId: player.playerId,
        version: player.version,
      })),
      content,
      sourceState,
      targets: existing.targetStateHashes,
      recipientStates: recipients.map(
        ({ playerId, status, targetId, conflictCode }) => ({
          playerId,
          status,
          targetId,
          conflictCode,
        }),
      ),
    }),
  );
  const requestHash = await sha256(stableStringify(command));
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
  const previewToken = await signPreviewToken({
    apiVersion: API_VERSION,
    actorUserId: userId,
    ownerAccountId: command.ownerAccountId,
    operation: command.operation,
    content: command.content,
    requestHash,
    resolutionFingerprint,
    expiresAt,
  });
  return {
    dataset,
    content,
    sourceState,
    resolved,
    existing,
    recipients,
    summary,
    requestHash,
    resolutionFingerprint,
    expiresAt,
    previewToken,
  };
}

function publicPreview(
  command: CanonicalCommand,
  preview: Awaited<ReturnType<typeof buildPreview>>,
) {
  return {
    apiVersion: API_VERSION,
    ownerAccountId: command.ownerAccountId,
    operation: command.operation,
    content: { ...command.content, title: preview.content.title },
    previewToken: preview.previewToken,
    expiresAt: preview.expiresAt,
    summary: preview.summary,
    recipients: preview.recipients.map(
      ({ sourceTeamId: _sourceTeamId, targetId: _targetId, ...recipient }) =>
        recipient,
    ),
    excluded: preview.resolved.excluded,
    conflicts: preview.recipients.filter(
      (recipient) => recipient.status === 'conflict',
    ),
  };
}

function taskSubtasks(
  rows: AnyRecord[],
  taskTemplateId: string | null | undefined,
) {
  return rows
    .filter((row) => taskTemplateId && row.task_template_id === taskTemplateId)
    .map((row, index) => ({
      title: row.title,
      sortOrder: Number(row.sort_order ?? index),
    }));
}

function snapshotSubtasks(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((raw, index) => ({
      title: stringValue(normalizeJson(raw).title) ?? '',
      sortOrder: Number(
        normalizeJson(raw).sortOrder ?? normalizeJson(raw).sort_order ?? index,
      ),
    }))
    .filter((subtask) => Boolean(subtask.title));
}

function materializationFromTemplateVersion(
  templateId: string,
  snapshot: AnyRecord,
): ProgramTemplateMaterialization | null {
  const template = normalizeJson(snapshot.template);
  const items = Array.isArray(snapshot.items)
    ? snapshot.items
    : Array.isArray(template.items)
      ? template.items
      : [];
  if (
    stringValue(template.id) !== templateId ||
    !stringValue(template.templateType)
  )
    return null;
  const metadata = normalizeJson(template.metadata);
  return {
    id: templateId,
    taskTemplateSubtasksCaptured:
      snapshot.taskTemplateSubtasksCaptured === true,
    templateType: String(template.templateType),
    title: stringValue(template.title) ?? '',
    description: stringValue(template.description),
    defaultActivityCategoryId: stringValue(template.defaultActivityCategoryId),
    defaultActivityCategoryName: stringValue(
      template.defaultActivityCategoryName,
    ),
    sourceTaskTemplateId: stringValue(template.sourceTaskTemplateId),
    metadata,
    subtasks: snapshotSubtasks(normalizeJson(metadata.task).subtasks),
    items: items.map((raw: unknown, index: number) => {
      const item = normalizeJson(raw);
      const config = normalizeJson(item.config);
      return {
        id: stringValue(item.id),
        itemType: stringValue(item.itemType ?? item.item_type) ?? '',
        title: stringValue(item.title) ?? '',
        description: stringValue(item.description),
        sourceTaskTemplateId: stringValue(
          item.sourceTaskTemplateId ?? item.source_task_template_id,
        ),
        linkedTemplateId: stringValue(
          item.linkedTemplateId ?? item.linked_template_id,
        ),
        config,
        sortOrder: Number(item.sortOrder ?? item.sort_order ?? index),
        subtasks: snapshotSubtasks(normalizeJson(config.task).subtasks),
        dayOffset: Number(item.dayOffset ?? item.day_offset ?? 0),
        startTime: stringValue(item.startTime ?? item.start_time),
      } as any;
    }),
  };
}

async function hydrateVersionMaterializationSubtasks(
  client: QueryClient,
  materializations: Map<string, ProgramTemplateMaterialization>,
) {
  const templateIds = [
    ...new Set(
      [...materializations.values()]
        .flatMap((template) => [
          template.sourceTaskTemplateId,
          ...template.items.map((item) => item.sourceTaskTemplateId),
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!templateIds.length) return materializations;
  const data = await loadRowsInChunks(templateIds, (ids) =>
    client
      .from('task_template_subtasks')
      .select('id,task_template_id,title,sort_order,created_at')
      .in('task_template_id', ids)
      .order('sort_order')
      .order('id'),
  );
  for (const template of materializations.values()) {
    if (
      !template.taskTemplateSubtasksCaptured &&
      template.sourceTaskTemplateId &&
      !template.subtasks.length
    ) {
      template.subtasks = taskSubtasks(data, template.sourceTaskTemplateId);
    }
    for (const item of template.items) {
      if (
        !template.taskTemplateSubtasksCaptured &&
        item.sourceTaskTemplateId &&
        !item.subtasks.length
      ) {
        item.subtasks = taskSubtasks(data, item.sourceTaskTemplateId);
      }
    }
  }
  return materializations;
}

async function loadImmutableTemplateMaterializations(
  client: QueryClient,
  ownerAccountId: string,
  rootTemplateId: string,
  rootVersion: AnyRecord,
) {
  const root = materializationFromTemplateVersion(
    rootTemplateId,
    normalizeJson(rootVersion.snapshot),
  );
  if (!root)
    throw bulkError(
      'CONTENT_NOT_FOUND',
      'Template version snapshot cannot be materialized.',
      409,
    );
  const output = new Map<string, ProgramTemplateMaterialization>([
    [rootTemplateId, root],
  ]);
  const linkedIds = [
    ...new Set(
      root.items
        .filter((item) => item.itemType === 'session_template')
        .map((item) => item.linkedTemplateId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!linkedIds.length)
    return hydrateVersionMaterializationSubtasks(client, output);

  const { data: linkedTemplates, error: templateError } = await client
    .from('training_templates')
    .select('id,active_version_id')
    .eq('owner_account_id', ownerAccountId)
    .in('id', linkedIds)
    .eq('status', 'active');
  if (templateError)
    throw bulkError('INTERNAL_ERROR', templateError.message, 500);
  const versionIds = (linkedTemplates ?? [])
    .map((row: AnyRecord) => row.active_version_id)
    .filter(Boolean);
  const { data: versions, error: versionError } = versionIds.length
    ? await client
        .from('template_versions')
        .select('id,template_id,version_number,snapshot,created_at')
        .eq('owner_account_id', ownerAccountId)
        .in('id', versionIds)
    : { data: [], error: null };
  if (versionError)
    throw bulkError('INTERNAL_ERROR', versionError.message, 500);
  for (const templateId of linkedIds) {
    const template = (linkedTemplates ?? []).find(
      (row: AnyRecord) => row.id === templateId,
    );
    const version = (versions ?? []).find(
      (row: AnyRecord) => row.id === template?.active_version_id,
    );
    const materialization = version
      ? materializationFromTemplateVersion(
          templateId,
          normalizeJson(version.snapshot),
        )
      : null;
    if (!materialization)
      throw bulkError(
        'CONTENT_NOT_FOUND',
        'A linked session version is unavailable.',
        409,
      );
    output.set(templateId, materialization);
  }
  return hydrateVersionMaterializationSubtasks(client, output);
}

async function loadTemplateMaterializations(
  client: QueryClient,
  ownerAccountId: string,
  templateIds: string[],
): Promise<Map<string, ProgramTemplateMaterialization>> {
  const ids = [...new Set(templateIds)].filter(Boolean);
  if (!ids.length) return new Map();
  const [templatesResult, itemsResult] = await Promise.all([
    client
      .from('training_templates')
      .select(
        'id,title,description,default_activity_category_id,default_activity_category_name,template_type,source_task_template_id,metadata,active_version_id,updated_at',
      )
      .eq('owner_account_id', ownerAccountId)
      .in('id', ids),
    client
      .from('training_template_items')
      .select(
        'id,template_id,item_type,title,description,source_task_template_id,linked_template_id,config,sort_order,day_offset,start_time',
      )
      .eq('owner_account_id', ownerAccountId)
      .in('template_id', ids)
      .order('sort_order'),
  ]);
  if (templatesResult.error)
    throw bulkError('INTERNAL_ERROR', templatesResult.error.message, 500);
  if (itemsResult.error)
    throw bulkError('INTERNAL_ERROR', itemsResult.error.message, 500);
  const linkedIds = [
    ...new Set(
      (itemsResult.data ?? [])
        .map((item: AnyRecord) => item.linked_template_id)
        .filter(Boolean),
    ),
  ];
  const linkedTemplatesResult = linkedIds.length
    ? await client
        .from('training_templates')
        .select('id,template_type,source_task_template_id,metadata')
        .eq('owner_account_id', ownerAccountId)
        .in('id', linkedIds)
    : { data: [], error: null };
  if (linkedTemplatesResult.error)
    throw bulkError('INTERNAL_ERROR', linkedTemplatesResult.error.message, 500);
  const linkedTemplates = new Map<string, AnyRecord>(
    (linkedTemplatesResult.data ?? []).map((row: AnyRecord) => [
      String(row.id),
      row,
    ]),
  );
  const taskTemplateIds: string[] = [
    ...new Set<string>(
      [
        ...(templatesResult.data ?? []).map(
          (row: AnyRecord) => row.source_task_template_id,
        ),
        ...(itemsResult.data ?? []).map(
          (row: AnyRecord) =>
            row.source_task_template_id ??
            linkedTemplates.get(row.linked_template_id)
              ?.source_task_template_id,
        ),
      ]
        .filter((id): id is string => typeof id === 'string' && Boolean(id))
        .map(String),
    ),
  ];
  const subtasksResult = taskTemplateIds.length
    ? await client
        .from('task_template_subtasks')
        .select('task_template_id,title,sort_order')
        .in('task_template_id', taskTemplateIds)
        .order('sort_order')
    : { data: [], error: null };
  if (subtasksResult.error)
    throw bulkError('INTERNAL_ERROR', subtasksResult.error.message, 500);
  const result = new Map<string, ProgramTemplateMaterialization>();
  for (const id of ids) {
    const template = (templatesResult.data ?? []).find(
      (row: AnyRecord) => row.id === id,
    );
    if (!template) continue;
    result.set(id, {
      id,
      templateType: template.template_type,
      title: template.title,
      description: template.description ?? null,
      defaultActivityCategoryId: template.default_activity_category_id ?? null,
      defaultActivityCategoryName:
        template.default_activity_category_name ?? null,
      sourceTaskTemplateId: template.source_task_template_id ?? null,
      metadata: normalizeJson(template.metadata),
      subtasks: taskSubtasks(
        subtasksResult.data ?? [],
        template.source_task_template_id,
      ),
      items: (itemsResult.data ?? [])
        .filter((item: AnyRecord) => item.template_id === id)
        .map((item: AnyRecord, index: number) => {
          const linked = linkedTemplates.get(item.linked_template_id);
          const config = normalizeJson(item.config);
          if (!config.task && linked?.metadata?.task)
            config.task = linked.metadata.task;
          if (!config.timer && linked?.metadata?.timer)
            config.timer = linked.metadata.timer;
          const sourceTaskTemplateId =
            item.source_task_template_id ??
            linked?.source_task_template_id ??
            null;
          return {
            id: item.id,
            itemType: item.item_type,
            title: item.title,
            description: item.description ?? null,
            sourceTaskTemplateId,
            linkedTemplateId: item.linked_template_id ?? null,
            config,
            sortOrder: Number(item.sort_order ?? index),
            subtasks: taskSubtasks(
              subtasksResult.data ?? [],
              sourceTaskTemplateId,
            ),
            dayOffset: Number(item.day_offset ?? 0),
            startTime: item.start_time ?? null,
          } as any;
        }),
    });
  }
  return result;
}

async function loadProgramVersion(
  client: QueryClient,
  ownerAccountId: string,
  programId: string,
  versionId?: string | null,
  versionNumber?: number | null,
) {
  let query = client
    .from('program_versions')
    .select('id,program_id,version_number,snapshot,created_at')
    .eq('owner_account_id', ownerAccountId)
    .eq('program_id', programId);
  query = versionId
    ? query.eq('id', versionId)
    : versionNumber
      ? query.eq('version_number', versionNumber)
      : query.order('version_number', { ascending: false }).limit(1);
  const { data, error } = await query.maybeSingle();
  if (error) throw bulkError('INTERNAL_ERROR', error.message, 500);
  if (!data || !data.snapshot || typeof data.snapshot !== 'object') {
    throw bulkError(
      'CONTENT_NOT_FOUND',
      'Published program version is unavailable.',
      404,
    );
  }
  let templates = readProgramTemplates(data.snapshot as AnyRecord);
  const requiredIds: string[] = [
    ...new Set<string>(
      (Array.isArray(data.snapshot.items) ? data.snapshot.items : [])
        .map((item: AnyRecord) => item.training_template_id)
        .filter(
          (id: unknown): id is string => typeof id === 'string' && Boolean(id),
        )
        .map(String),
    ),
  ];
  if (!templates || requiredIds.some((id) => !templates?.has(id))) {
    const current = await loadTemplateMaterializations(
      client,
      ownerAccountId,
      requiredIds,
    );
    templates = new Map([
      ...(current ?? new Map()),
      ...(templates ?? new Map()),
    ]);
  }
  return { ...data, templates };
}

async function buildProgramRecipientPlans(
  _client: QueryClient,
  command: CanonicalCommand,
  preview: Awaited<ReturnType<typeof buildPreview>>,
) {
  const desiredVersion = {
    id: preview.sourceState.id,
    snapshot: normalizeJson(preview.sourceState.snapshot),
    templates: new Map<string, ProgramTemplateMaterialization>(
      (Array.isArray(preview.sourceState.materializations)
        ? preview.sourceState.materializations
        : []
      ).filter(
        (entry: unknown) => Array.isArray(entry) && entry.length === 2,
      ) as Array<[string, ProgramTemplateMaterialization]>,
    ),
  };
  if (!UUID.test(String(desiredVersion.id ?? '')))
    throw bulkError(
      'BULK_PREVIEW_STALE',
      'Published program version changed after preview.',
      409,
    );
  const desiredStartDate = stringValue(command.assignment.startDate);
  const actionablePlayerIds = preview.recipients
    .filter(
      (recipient) =>
        recipient.status !== 'conflict' && recipient.status !== 'duplicate',
    )
    .map((recipient) => recipient.playerId);
  const desiredPlans =
    command.operation !== 'remove' &&
    desiredStartDate &&
    actionablePlayerIds.length
      ? buildProgramEnrollmentPlayerPlans({
          program: desiredVersion.snapshot,
          startDate: desiredStartDate,
          playerIds: actionablePlayerIds,
          templates: desiredVersion.templates ?? new Map(),
        })
      : [];
  const desiredByPlayer = new Map(
    desiredPlans.map((plan) => [plan.playerId, plan]),
  );
  return {
    programVersionId: desiredVersion?.id ?? null,
    plans: preview.recipients.map((recipient) => ({
      playerId: recipient.playerId,
      sourceTeamId: recipient.sourceTeamId,
      existingTargetId: recipient.targetId,
      expectedStateHash:
        preview.existing.byPlayer.get(recipient.playerId)?.expectedStateHash ??
        null,
      programPlan: desiredByPlayer.get(recipient.playerId) ?? null,
    })),
  };
}

async function buildTemplateRecipientPlans(
  _client: QueryClient,
  command: CanonicalCommand,
  preview: Awaited<ReturnType<typeof buildPreview>>,
) {
  const templateRow = preview.dataset.content.trainingTemplates.find(
    (template) => template.id === command.content.id,
  );
  const activeVersionId = stringValue(templateRow?.activeVersionId);
  if (!activeVersionId)
    throw bulkError(
      'CONTENT_NOT_FOUND',
      'Training template has no active immutable version.',
      409,
    );
  const version = normalizeJson(preview.sourceState.version);
  if (version.id !== activeVersionId)
    throw bulkError(
      'BULK_PREVIEW_STALE',
      'Active template version changed after preview.',
      409,
    );
  const templates = new Map<string, ProgramTemplateMaterialization>(
    (Array.isArray(preview.sourceState.materializations)
      ? preview.sourceState.materializations
      : []
    ).filter(
      (entry: unknown) => Array.isArray(entry) && entry.length === 2,
    ) as Array<[string, ProgramTemplateMaterialization]>,
  );
  const root = templates.get(command.content.id);
  if (!root)
    throw bulkError(
      'CONTENT_NOT_FOUND',
      'Template materialization is unavailable.',
      409,
    );
  let syntheticItems: AnyRecord[];
  if (root.templateType === 'week') {
    syntheticItems = root.items
      .filter((item: AnyRecord) => item.itemType === 'session_template')
      .map((item: AnyRecord) => ({
        id: item.id,
        item_type: 'session_template',
        training_template_id: item.linkedTemplateId,
        title: item.title,
        description: item.description,
        day_offset: Number(item.dayOffset ?? 0),
        sort_order: item.sortOrder,
        config: item.config ?? {},
      }));
  } else {
    syntheticItems = [
      {
        id: crypto.randomUUID(),
        item_type: `${root.templateType}_template`,
        training_template_id: root.id,
        title: root.title,
        description: root.description,
        day_offset: 0,
        sort_order: 0,
        config: {},
      },
    ];
  }
  const startDate =
    stringValue(command.assignment.startDate) ??
    new Date().toISOString().slice(0, 10);
  const syntheticProgram = {
    id: crypto.randomUUID(),
    phases: [],
    items: syntheticItems,
  };
  const plans = buildProgramEnrollmentPlayerPlans({
    program: syntheticProgram,
    startDate,
    playerIds: preview.recipients
      .filter(
        (recipient) =>
          recipient.status !== 'conflict' && recipient.status !== 'duplicate',
      )
      .map((recipient) => recipient.playerId),
    templates,
  });
  const byPlayer = new Map(
    plans.map((plan) => [
      plan.playerId,
      {
        tasks: plan.items.map((item) => item.task).filter(Boolean),
        activities: plan.items.map((item) => item.activity).filter(Boolean),
      },
    ]),
  );
  return {
    templateVersionId: version.id,
    templateVersionSnapshot: version.snapshot,
    plans: preview.recipients.map((recipient) => ({
      playerId: recipient.playerId,
      sourceTeamId: recipient.sourceTeamId,
      existingTargetId: recipient.targetId,
      expectedStateHash:
        preview.existing.byPlayer.get(recipient.playerId)?.expectedStateHash ??
        null,
      templatePlan: byPlayer.get(recipient.playerId) ?? {
        tasks: [],
        activities: [],
      },
    })),
  };
}

function mapRpcError(error: AnyRecord | null | undefined): AppError | null {
  const message = stringValue(error?.message);
  if (!message) return null;
  const mappings: Array<[string, string, number]> = [
    ['BULK_PREVIEW_STALE:', 'BULK_PREVIEW_STALE', 409],
    ['BULK_IDEMPOTENCY_CONFLICT:', 'IDEMPOTENCY_CONFLICT', 409],
    ['BULK_BATCH_NOT_FOUND:', 'BATCH_NOT_FOUND', 404],
    ['BULK_TARGET_BATCH_NOT_FOUND:', 'BATCH_NOT_FOUND', 404],
    ['BULK_CONTENT_NOT_FOUND:', 'CONTENT_NOT_FOUND', 404],
    ['BULK_OWNER_NOT_FOUND:', 'OWNER_ACCOUNT_NOT_FOUND', 404],
    ['BULK_FORBIDDEN:', 'FORBIDDEN', 403],
    ['BULK_VALIDATION_ERROR:', 'VALIDATION_ERROR', 400],
  ];
  const mapping = mappings.find(([prefix]) => message.includes(prefix));
  if (!mapping) return bulkError('INTERNAL_ERROR', message, 500);
  const [prefix, code, status] = mapping;
  return bulkError(code, message.split(prefix)[1]?.trim() || message, status);
}

async function contentTitle(
  client: QueryClient,
  batch: AnyRecord,
): Promise<string | null> {
  const table =
    batch.content_type === 'activity'
      ? 'activities'
      : batch.content_type === 'exercise'
        ? 'exercise_library'
        : batch.content_type === 'training_template'
          ? 'training_templates'
          : 'training_programs';
  const { data } = await client
    .from(table)
    .select('title')
    .eq('id', batch.content_id)
    .maybeSingle();
  return stringValue(data?.title);
}

function normalizeBatchItem(item: AnyRecord, name: string | null) {
  const effectiveStatus =
    item.rollback_status === 'rolled_back'
      ? 'rolled_back'
      : item.rollback_status === 'conflict'
        ? 'rollback_conflict'
        : item.status;
  return {
    itemId: item.id,
    playerId: item.player_id,
    name,
    status: effectiveStatus,
    targetType: item.target_type,
    targetId: item.target_id,
    reasonCode: item.rollback_reason_code ?? item.reason_code,
    message: item.rollback_message ?? item.message,
    before: item.before_snapshot,
    after: item.after_snapshot,
    materializedTargetIds: item.materialized_target_ids ?? {},
    rollbackStatus: item.rollback_status,
    createdAt: item.created_at,
    rolledBackAt: item.rolled_back_at,
  };
}

async function batchDetailPayload(
  client: QueryClient,
  userId: string,
  ownerAccountId: string,
  batchId: string,
) {
  await assertStaff(client, userId, ownerAccountId);
  const [{ data: batch, error: batchError }, items] = await Promise.all([
    client
      .from('assignment_batches')
      .select('*')
      .eq('owner_account_id', ownerAccountId)
      .eq('id', batchId)
      .maybeSingle(),
    loadPagedRows((from, to) =>
      client
        .from('assignment_batch_items')
        .select(
          'id,player_id,status,target_type,target_id,reason_code,message,rollback_status,rollback_reason_code,rollback_message,created_at,rolled_back_at',
        )
        .eq('owner_account_id', ownerAccountId)
        .eq('batch_id', batchId)
        .order('created_at')
        .order('id')
        .range(from, to),
    ),
  ]);
  if (batchError) throw bulkError('INTERNAL_ERROR', batchError.message, 500);
  if (!batch)
    throw bulkError('BATCH_NOT_FOUND', 'Assignment batch not found.', 404);
  const playerIds = [
    ...new Set(items.map((item: AnyRecord) => String(item.player_id))),
  ];
  const profiles = await loadRowsInChunks(playerIds, (ids) =>
    client.from('profiles').select('user_id,full_name').in('user_id', ids),
  );
  const nameByPlayer = new Map<string, string | null>(
    profiles.map((profile: AnyRecord) => [
      String(profile.user_id),
      stringValue(profile.full_name),
    ]),
  );
  const { data: rollback, error: rollbackError } = await client.rpc(
    'get_owner_bulk_assignment_rollback_preview',
    {
      p_owner_account_id: ownerAccountId,
      p_actor_user_id: userId,
      p_batch_id: batchId,
    },
  );
  const mappedRollbackError = mapRpcError(rollbackError);
  if (mappedRollbackError) throw mappedRollbackError;
  const title = await contentTitle(client, batch);
  return {
    apiVersion: API_VERSION,
    ownerAccountId,
    batch: {
      batchId: batch.id,
      ownerAccountId,
      status: batch.status,
      operation: batch.operation,
      content: { type: batch.content_type, id: batch.content_id, title },
      summary: batch.summary ?? {},
      createdAt: batch.created_at,
      appliedAt: batch.applied_at,
      rolledBackAt: batch.rolled_back_at,
    },
    items: items.map((item: AnyRecord) =>
      normalizeBatchItem(item, nameByPlayer.get(item.player_id) ?? null),
    ),
    rollback: {
      eligible: rollback?.eligible === true,
      eligibleCount: Number(rollback?.eligibleCount ?? 0),
      conflictCount: Number(rollback?.conflictCount ?? 0),
      applicableCount: Number(rollback?.applicableCount ?? 0),
      items: Array.isArray(rollback?.items) ? rollback.items : [],
    },
  };
}

function requireIdempotencyKey(value: unknown): string {
  const key = stringValue(value);
  if (!key || key.length < 8 || key.length > 200) {
    throw bulkError(
      'VALIDATION_ERROR',
      'idempotencyKey must contain 8-200 characters.',
      400,
    );
  }
  return key;
}

async function applyAction(
  client: QueryClient,
  userId: string,
  body: AnyRecord,
) {
  const command = parseCanonicalCommand(body);
  const idempotencyKey = requireIdempotencyKey(body.idempotencyKey);
  const canonicalRequestHash = await sha256(stableStringify(command));
  const { data: existingBatch, error: existingError } = await client
    .from('assignment_batches')
    .select('id,operation,content_type,content_id,canonical_request_hash')
    .eq('owner_account_id', command.ownerAccountId)
    .eq('requested_by', userId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (existingError)
    throw bulkError('INTERNAL_ERROR', existingError.message, 500);
  if (existingBatch) {
    if (
      existingBatch.operation !== command.operation ||
      existingBatch.content_type !== command.content.type ||
      existingBatch.content_id !== command.content.id ||
      existingBatch.canonical_request_hash !== canonicalRequestHash
    ) {
      throw bulkError(
        'IDEMPOTENCY_CONFLICT',
        'idempotencyKey was already used for a different command.',
        409,
      );
    }
    return batchDetailPayload(
      client,
      userId,
      command.ownerAccountId,
      existingBatch.id,
    );
  }
  const token = await verifyPreviewToken(body.previewToken);
  const preview = await buildPreview(client, userId, command);
  if (
    token.apiVersion !== API_VERSION ||
    token.actorUserId !== userId ||
    token.ownerAccountId !== command.ownerAccountId ||
    token.operation !== command.operation ||
    stableStringify(token.content) !== stableStringify(command.content) ||
    token.requestHash !== preview.requestHash ||
    token.resolutionFingerprint !== preview.resolutionFingerprint ||
    Date.parse(String(token.expiresAt ?? '')) <= Date.now()
  ) {
    throw bulkError(
      'BULK_PREVIEW_STALE',
      'Players, filters, assignments or content changed after preview. Refresh before applying.',
      409,
    );
  }

  let recipientPlans = preview.recipients.map((recipient) => ({
    playerId: recipient.playerId,
    sourceTeamId: recipient.sourceTeamId,
    existingTargetId: recipient.targetId,
    expectedStateHash:
      preview.existing.byPlayer.get(recipient.playerId)?.expectedStateHash ??
      null,
  }));
  let programVersionId: string | null = null;
  let templateVersionId: string | null = null;
  const assignment = { ...command.assignment };
  if (command.content.type === 'program') {
    const materialization = await buildProgramRecipientPlans(
      client,
      command,
      preview,
    );
    recipientPlans = materialization.plans;
    programVersionId = materialization.programVersionId;
  } else if (command.content.type === 'training_template') {
    const materialization = await buildTemplateRecipientPlans(
      client,
      command,
      preview,
    );
    recipientPlans = materialization.plans;
    templateVersionId = materialization.templateVersionId;
    assignment.templateVersionSnapshot =
      materialization.templateVersionSnapshot;
    if (!assignment.startDate)
      assignment.startDate = new Date().toISOString().slice(0, 10);
  }

  const { data, error } = await client.rpc('apply_owner_bulk_assignment', {
    p_owner_account_id: command.ownerAccountId,
    p_actor_user_id: userId,
    p_operation: command.operation,
    p_content_type: command.content.type,
    p_content_id: command.content.id,
    p_idempotency_key: idempotencyKey,
    p_canonical_request_hash: preview.requestHash,
    p_recipient_fingerprint: preview.resolutionFingerprint,
    p_request_payload: {
      ...command,
      previewSummary: preview.summary,
      expectedSourceStateHash: preview.sourceState.stateHash,
      sourceVersion: {
        programVersionId,
        templateVersionId,
      },
    },
    p_recipient_plans: recipientPlans,
    p_assignment: assignment,
    p_program_version_id: programVersionId,
    p_template_version_id: templateVersionId,
    p_target_batch_id: command.targetBatchId,
  });
  const mapped = mapRpcError(error);
  if (mapped) throw mapped;
  const batchId = requireUuid(data?.batchId, 'batchId');
  return batchDetailPayload(client, userId, command.ownerAccountId, batchId);
}

async function rollbackAction(
  client: QueryClient,
  userId: string,
  body: AnyRecord,
) {
  const ownerAccountId = requireUuid(body.ownerAccountId, 'ownerAccountId');
  const batchId = requireUuid(body.batchId, 'batchId');
  const idempotencyKey = requireIdempotencyKey(body.idempotencyKey);
  await assertStaff(client, userId, ownerAccountId);
  const { error } = await client.rpc('rollback_owner_bulk_assignment', {
    p_owner_account_id: ownerAccountId,
    p_actor_user_id: userId,
    p_batch_id: batchId,
    p_idempotency_key: idempotencyKey,
  });
  const mapped = mapRpcError(error);
  if (mapped) throw mapped;
  const detail = await batchDetailPayload(
    client,
    userId,
    ownerAccountId,
    batchId,
  );
  return { ...detail, summary: detail.batch.summary };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  try {
    if (req.method !== 'POST')
      throw bulkError('VALIDATION_ERROR', 'Only POST is supported.', 405);
    const { serviceClient: client, userId } = await requireAuthContext(req);
    const body = asRecord(await readJsonBody(req));
    const action = stringValue(body.action);
    if (action === 'context')
      return successResponse(await contextPayload(client, userId, body));
    if (action === 'preview') {
      const command = parseCanonicalCommand(body);
      return successResponse(
        publicPreview(command, await buildPreview(client, userId, command)),
      );
    }
    if (action === 'apply')
      return successResponse(await applyAction(client, userId, body));
    if (action === 'batchDetail') {
      const ownerAccountId = requireUuid(body.ownerAccountId, 'ownerAccountId');
      return successResponse(
        await batchDetailPayload(
          client,
          userId,
          ownerAccountId,
          requireUuid(body.batchId, 'batchId'),
        ),
      );
    }
    if (action === 'rollback')
      return successResponse(await rollbackAction(client, userId, body));
    throw bulkError('VALIDATION_ERROR', 'Unsupported action.', 400);
  } catch (error) {
    return responseFromError(error);
  }
});
