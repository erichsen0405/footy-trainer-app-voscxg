// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { AppError, type ErrorCode } from './http.ts';

type RpcError = {
  message?: string;
};

export type RpcClient = {
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: RpcError | null }>;
};

export type InviteRole = 'admin' | 'coach' | 'player';
export type MemberRole = 'owner' | 'admin' | 'coach' | 'player';

export type ClubSeatStatus = {
  clubId: string;
  seatsTotal: number;
  seatsUsed: number;
  seatsAvailable: number;
  licenseStatus: string;
  planName: string | null;
  validUntil: string | null;
  pendingInvitesCount: number;
  activeMembersCount: number;
};

export type ClubInvite = {
  id: string;
  clubId: string;
  email: string;
  role: InviteRole;
  token: string;
  status: string;
  expiresAt: string;
  invitedBy: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  cancelledAt: string | null;
};

export type ClubMember = {
  id: string;
  clubId: string;
  userId: string;
  fullName: string | null;
  email: string;
  role: MemberRole;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type Club = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
};

export type ClubLicense = {
  id: string;
  clubId: string;
  seatsTotal: number;
  status: string;
  validUntil: string | null;
  planName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClubInviteLookup = {
  id: string;
  clubId: string;
  clubName: string;
  email: string;
  role: InviteRole;
  status: string;
  expiresAt: string;
  acceptedAt: string | null;
  cancelledAt: string | null;
};

export type ClubListRole = MemberRole | 'platform_admin' | null;

export type ClubListItem = {
  clubId: string;
  clubName: string;
  role: ClubListRole;
  status: string;
  planName: string | null;
  seatsTotal: number;
  seatsUsed: number;
  seatsAvailable: number;
  pendingInvitesCount: number;
  createdAt: string;
  licenseStatus: string;
  validUntil: string | null;
  activeMembersCount: number;
  memberId: string | null;
  memberStatus: string | null;
};

export type CurrentUserClubContext = {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  clubs: ClubListItem[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVITE_ROLES: InviteRole[] = ['admin', 'coach', 'player'];
const MEMBER_ROLES: MemberRole[] = ['owner', 'admin', 'coach', 'player'];

const RPC_ERROR_MAP: Record<string, { code: ErrorCode; message: string; status: number }> = {
  UNAUTHORIZED: { code: 'UNAUTHORIZED', message: 'Unauthorized.', status: 401 },
  FORBIDDEN: { code: 'FORBIDDEN', message: 'You do not have access to this club.', status: 403 },
  CLUB_NOT_FOUND: { code: 'CLUB_NOT_FOUND', message: 'Club not found.', status: 404 },
  LICENSE_INACTIVE: { code: 'LICENSE_INACTIVE', message: 'The club license is not active.', status: 409 },
  SEAT_LIMIT_REACHED: { code: 'SEAT_LIMIT_REACHED', message: 'The club has no available seats.', status: 409 },
  MEMBER_ALREADY_EXISTS: { code: 'MEMBER_ALREADY_EXISTS', message: 'A matching active member already exists.', status: 409 },
  INVITE_ALREADY_PENDING: { code: 'INVITE_ALREADY_PENDING', message: 'A pending invite already exists for this email.', status: 409 },
  INVITE_NOT_FOUND: { code: 'INVITE_NOT_FOUND', message: 'Invite not found.', status: 404 },
  MEMBER_NOT_FOUND: { code: 'MEMBER_NOT_FOUND', message: 'Member not found.', status: 404 },
  LAST_OWNER_GUARD: { code: 'LAST_OWNER_GUARD', message: 'Owner changes are blocked or would remove the last active owner.', status: 409 },
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', message: 'Request payload is invalid.', status: 400 },
};

type CreateClubInviteInput = {
  clubId: string;
  email: string;
  role: InviteRole;
};

type InviteIdInput = {
  inviteId: string;
};

type MemberRoleInput = {
  memberId: string;
  role: Exclude<MemberRole, 'owner'>;
};

type MemberIdInput = {
  memberId: string;
};

type ClubIdInput = {
  clubId: string;
};

type TokenInput = {
  token: string;
};

type CreateClubInput = {
  clubName: string;
  adminEmail: string;
  seatsTotal: number;
  planName: string | null;
  validUntil: string | null;
};

type UpdateClubInput = {
  clubId: string;
  clubName: string;
  status: 'active' | 'inactive';
  seatsTotal: number;
  planName: string | null;
  validUntil: string | null;
  licenseStatus: 'active' | 'inactive' | 'expired';
};

type AcceptClubInviteInput = {
  token: string;
  fullName: string | null;
};

type CreateClubInviteResult = {
  invite: ClubInvite;
  seatStatus: ClubSeatStatus;
};

type DeactivateClubMemberResult = {
  member: ClubMember;
  seatStatus: ClubSeatStatus;
};

type RemoveClubMemberResult = {
  memberId: string;
  removed: boolean;
  seatStatus: ClubSeatStatus;
};

type CreateClubResult = {
  club: Club;
  license: ClubLicense;
  invite: ClubInvite;
  seatStatus: ClubSeatStatus;
};

type UpdateClubResult = {
  club: Club;
  license: ClubLicense;
  seatStatus: ClubSeatStatus;
};

type DeleteClubResult = {
  clubId: string;
  deleted: boolean;
};

type AcceptClubInviteResult = {
  member: ClubMember;
  seatStatus: ClubSeatStatus;
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

function requireEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'email must be a valid email address.', 400);
  }

  const email = value.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new AppError('VALIDATION_ERROR', 'email must be a valid email address.', 400);
  }

  return email;
}

function requireInviteRole(value: unknown): InviteRole {
  if (typeof value !== 'string' || !INVITE_ROLES.includes(value as InviteRole)) {
    throw new AppError('VALIDATION_ERROR', 'role must be admin, coach or player.', 400);
  }

  return value as InviteRole;
}

function requireClubStatus(value: unknown): 'active' | 'inactive' {
  if (typeof value !== 'string' || (value !== 'active' && value !== 'inactive')) {
    throw new AppError('VALIDATION_ERROR', 'status must be active or inactive.', 400);
  }

  return value;
}

function requireLicenseStatus(value: unknown): 'active' | 'inactive' | 'expired' {
  if (
    typeof value !== 'string' ||
    (value !== 'active' && value !== 'inactive' && value !== 'expired')
  ) {
    throw new AppError('VALIDATION_ERROR', 'licenseStatus must be active, inactive or expired.', 400);
  }

  return value;
}

function requireMemberRole(value: unknown): Exclude<MemberRole, 'owner'> {
  if (value === 'owner') {
    throw new AppError('VALIDATION_ERROR', 'Changing owner role is blocked in v1.', 400);
  }

  if (typeof value !== 'string' || !MEMBER_ROLES.includes(value as MemberRole)) {
    throw new AppError('VALIDATION_ERROR', 'role must be admin, coach or player.', 400);
  }

  return value as Exclude<MemberRole, 'owner'>;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} is required.`, 400);
  }

  return value.trim();
}

function maybeString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function maybeUuid(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return requireUuid(value, fieldName);
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new AppError('INTERNAL_ERROR', `${fieldName} is missing from backend response.`, 500);
  }

  return value;
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new AppError('INTERNAL_ERROR', `${fieldName} is missing from backend response.`, 500);
  }

  return value;
}

function requireNonNegativeInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a non-negative integer.`, 400);
  }

  return value as number;
}

function optionalTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function optionalIsoDateTimeString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a valid ISO datetime string.`, 400);
  }

  return value.trim();
}

export function mapRpcError(error: RpcError | null): AppError | null {
  if (!error?.message) {
    return null;
  }

  const mapped = RPC_ERROR_MAP[error.message];
  if (mapped) {
    return new AppError(mapped.code, mapped.message, mapped.status);
  }

  return new AppError('INTERNAL_ERROR', error.message, 500);
}

async function callRpc<T>(client: RpcClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc<T>(fn, args);
  const mappedError = mapRpcError(error);
  if (mappedError) {
    throw mappedError;
  }

  if (data === null) {
    throw new AppError('INTERNAL_ERROR', 'Backend returned no data.', 500);
  }

  return data;
}

export function parseCreateClubInviteBody(body: unknown): CreateClubInviteInput {
  const record = asRecord(body);
  return {
    clubId: requireUuid(record.clubId, 'clubId'),
    email: requireEmail(record.email),
    role: requireInviteRole(record.role),
  };
}

export function parseInviteIdBody(body: unknown): InviteIdInput {
  const record = asRecord(body);
  return {
    inviteId: requireUuid(record.inviteId, 'inviteId'),
  };
}

export function parseChangeClubMemberRoleBody(body: unknown): MemberRoleInput {
  const record = asRecord(body);
  return {
    memberId: requireUuid(record.memberId, 'memberId'),
    role: requireMemberRole(record.role),
  };
}

export function parseMemberIdBody(body: unknown): MemberIdInput {
  const record = asRecord(body);
  return {
    memberId: requireUuid(record.memberId, 'memberId'),
  };
}

export function parseClubIdBody(body: unknown): ClubIdInput {
  const record = asRecord(body);
  return {
    clubId: requireUuid(record.clubId, 'clubId'),
  };
}

export function parseTokenBody(body: unknown): TokenInput {
  const record = asRecord(body);
  return {
    token: requireString(record.token, 'token'),
  };
}

export function parseCreateClubBody(body: unknown): CreateClubInput {
  const record = asRecord(body);
  return {
    clubName: requireString(record.clubName, 'clubName'),
    adminEmail: requireEmail(record.adminEmail),
    seatsTotal: requireNonNegativeInteger(record.seatsTotal, 'seatsTotal'),
    planName: optionalTrimmedString(record.planName),
    validUntil: optionalIsoDateTimeString(record.validUntil, 'validUntil'),
  };
}

export function parseUpdateClubBody(body: unknown): UpdateClubInput {
  const record = asRecord(body);
  return {
    clubId: requireUuid(record.clubId, 'clubId'),
    clubName: requireString(record.clubName, 'clubName'),
    status: requireClubStatus(record.status),
    seatsTotal: requireNonNegativeInteger(record.seatsTotal, 'seatsTotal'),
    planName: optionalTrimmedString(record.planName),
    validUntil: optionalIsoDateTimeString(record.validUntil, 'validUntil'),
    licenseStatus: requireLicenseStatus(record.licenseStatus),
  };
}

export function parseAcceptClubInviteBody(body: unknown): AcceptClubInviteInput {
  const record = asRecord(body);
  return {
    token: requireString(record.token, 'token'),
    fullName: optionalTrimmedString(record.fullName),
  };
}

export function normalizeClubPayload(payload: unknown): Club {
  const record = asRecord(payload);
  return {
    id: requireUuid(record.id, 'id'),
    name: requireString(record.name, 'name'),
    status: requireString(record.status, 'status'),
    createdAt: requireString(record.createdAt, 'createdAt'),
  };
}

export function normalizeClubLicensePayload(payload: unknown): ClubLicense {
  const record = asRecord(payload);
  return {
    id: requireUuid(record.id, 'id'),
    clubId: requireUuid(record.clubId, 'clubId'),
    seatsTotal: requireNumber(record.seatsTotal, 'seatsTotal'),
    status: requireString(record.status, 'status'),
    validUntil: maybeString(record.validUntil),
    planName: maybeString(record.planName),
    createdAt: requireString(record.createdAt, 'createdAt'),
    updatedAt: requireString(record.updatedAt, 'updatedAt'),
  };
}

export function normalizeSeatStatusPayload(payload: unknown): ClubSeatStatus {
  const record = asRecord(payload);
  return {
    clubId: requireUuid(record.clubId, 'clubId'),
    seatsTotal: requireNumber(record.seatsTotal, 'seatsTotal'),
    seatsUsed: requireNumber(record.seatsUsed, 'seatsUsed'),
    seatsAvailable: requireNumber(record.seatsAvailable, 'seatsAvailable'),
    licenseStatus: requireString(record.licenseStatus, 'licenseStatus'),
    planName: maybeString(record.planName),
    validUntil: maybeString(record.validUntil),
    pendingInvitesCount: requireNumber(record.pendingInvitesCount, 'pendingInvitesCount'),
    activeMembersCount: requireNumber(record.activeMembersCount, 'activeMembersCount'),
  };
}

export function normalizeClubInviteLookupPayload(payload: unknown): ClubInviteLookup {
  const record = asRecord(payload);
  return {
    id: requireUuid(record.id, 'id'),
    clubId: requireUuid(record.clubId, 'clubId'),
    clubName: requireString(record.clubName, 'clubName'),
    email: requireEmail(record.email),
    role: requireInviteRole(record.role),
    status: requireString(record.status, 'status'),
    expiresAt: requireString(record.expiresAt, 'expiresAt'),
    acceptedAt: maybeString(record.acceptedAt),
    cancelledAt: maybeString(record.cancelledAt),
  };
}

export function normalizeClubInvitePayload(payload: unknown): ClubInvite {
  const record = asRecord(payload);
  const role = requireInviteRole(record.role);
  return {
    id: requireUuid(record.id, 'id'),
    clubId: requireUuid(record.clubId, 'clubId'),
    email: requireEmail(record.email),
    role,
    token: requireString(record.token, 'token'),
    status: requireString(record.status, 'status'),
    expiresAt: requireString(record.expiresAt, 'expiresAt'),
    invitedBy: requireUuid(record.invitedBy, 'invitedBy'),
    createdAt: requireString(record.createdAt, 'createdAt'),
    updatedAt: requireString(record.updatedAt, 'updatedAt'),
    acceptedAt: maybeString(record.acceptedAt),
    cancelledAt: maybeString(record.cancelledAt),
  };
}

export function normalizeClubMemberPayload(payload: unknown): ClubMember {
  const record = asRecord(payload);
  const roleValue = record.role;
  if (typeof roleValue !== 'string' || !MEMBER_ROLES.includes(roleValue as MemberRole)) {
    throw new AppError('INTERNAL_ERROR', 'role is missing from backend response.', 500);
  }

  return {
    id: requireUuid(record.id, 'id'),
    clubId: requireUuid(record.clubId, 'clubId'),
    userId: requireUuid(record.userId, 'userId'),
    fullName: maybeString(record.fullName),
    email: requireEmail(record.email),
    role: roleValue as MemberRole,
    status: requireString(record.status, 'status'),
    createdAt: requireString(record.createdAt, 'createdAt'),
    updatedAt: requireString(record.updatedAt, 'updatedAt'),
  };
}

export function normalizeCurrentUserClubContextPayload(payload: unknown): CurrentUserClubContext {
  const record = asRecord(payload);
  const clubsValue = record.clubs;
  if (!Array.isArray(clubsValue)) {
    throw new AppError('INTERNAL_ERROR', 'clubs is missing from backend response.', 500);
  }

  return {
    userId: requireUuid(record.userId, 'userId'),
    email: requireEmail(record.email),
    isPlatformAdmin: requireBoolean(record.isPlatformAdmin, 'isPlatformAdmin'),
    clubs: clubsValue.map(normalizeClubListItemPayload),
  };
}

export function normalizeClubListItemPayload(payload: unknown): ClubListItem {
  const record = asRecord(payload);
  const roleValue = record.role;
  if (
    roleValue !== null &&
    roleValue !== undefined &&
    roleValue !== '' &&
    roleValue !== 'platform_admin' &&
    (typeof roleValue !== 'string' || !MEMBER_ROLES.includes(roleValue as MemberRole))
  ) {
    throw new AppError('INTERNAL_ERROR', 'role is missing from backend response.', 500);
  }

  return {
    clubId: requireUuid(record.clubId, 'clubId'),
    clubName: requireString(record.clubName, 'clubName'),
    role:
      roleValue === null || roleValue === undefined || roleValue === ''
        ? null
        : (roleValue as Exclude<ClubListRole, null>),
    status: requireString(record.status, 'status'),
    planName: maybeString(record.planName),
    seatsTotal: requireNumber(record.seatsTotal, 'seatsTotal'),
    seatsUsed: requireNumber(record.seatsUsed, 'seatsUsed'),
    seatsAvailable: requireNumber(record.seatsAvailable, 'seatsAvailable'),
    pendingInvitesCount: requireNumber(record.pendingInvitesCount, 'pendingInvitesCount'),
    createdAt: requireString(record.createdAt, 'createdAt'),
    licenseStatus: requireString(record.licenseStatus, 'licenseStatus'),
    validUntil: maybeString(record.validUntil),
    activeMembersCount: requireNumber(record.activeMembersCount, 'activeMembersCount'),
    memberId: maybeUuid(record.memberId, 'memberId'),
    memberStatus: maybeString(record.memberStatus),
  };
}

export async function sendClubInviteEmailPlaceholder(_invite: ClubInvite): Promise<void> {
  return;
}

export async function createClubInviteAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<CreateClubInviteResult> {
  const input = parseCreateClubInviteBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'create_club_invite', {
    p_actor_user_id: actorUserId,
    p_club_id: input.clubId,
    p_email: input.email,
    p_role: input.role,
  });

  const record = asRecord(payload);
  const invite = normalizeClubInvitePayload(record.invite);
  return {
    invite,
    seatStatus: normalizeSeatStatusPayload(record.seatStatus),
  };
}

export async function resendClubInviteAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<ClubInvite> {
  const input = parseInviteIdBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'resend_club_invite', {
    p_actor_user_id: actorUserId,
    p_invite_id: input.inviteId,
  });

  return normalizeClubInvitePayload(payload);
}

export async function cancelClubInviteAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<{ inviteId: string; cancelled: boolean }> {
  const input = parseInviteIdBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'cancel_club_invite', {
    p_actor_user_id: actorUserId,
    p_invite_id: input.inviteId,
  });

  const record = asRecord(payload);
  return {
    inviteId: requireUuid(record.inviteId, 'inviteId'),
    cancelled: requireBoolean(record.cancelled, 'cancelled'),
  };
}

export async function changeClubMemberRoleAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<ClubMember> {
  const input = parseChangeClubMemberRoleBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'change_club_member_role', {
    p_actor_user_id: actorUserId,
    p_member_id: input.memberId,
    p_role: input.role,
  });

  return normalizeClubMemberPayload(payload);
}

export async function deactivateClubMemberAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<DeactivateClubMemberResult> {
  const input = parseMemberIdBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'deactivate_club_member', {
    p_actor_user_id: actorUserId,
    p_member_id: input.memberId,
  });

  const record = asRecord(payload);
  return {
    member: normalizeClubMemberPayload(record.member),
    seatStatus: normalizeSeatStatusPayload(record.seatStatus),
  };
}

export async function removeClubMemberAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<RemoveClubMemberResult> {
  const input = parseMemberIdBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'remove_club_member', {
    p_actor_user_id: actorUserId,
    p_member_id: input.memberId,
  });

  const record = asRecord(payload);
  return {
    memberId: requireUuid(record.memberId, 'memberId'),
    removed: requireBoolean(record.removed, 'removed'),
    seatStatus: normalizeSeatStatusPayload(record.seatStatus),
  };
}

export async function getClubSeatStatusAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<ClubSeatStatus> {
  const input = parseClubIdBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'get_club_seat_status', {
    p_actor_user_id: actorUserId,
    p_club_id: input.clubId,
  });

  return normalizeSeatStatusPayload(payload);
}

export async function createClubAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<CreateClubResult> {
  const input = parseCreateClubBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'create_club', {
    p_actor_user_id: actorUserId,
    p_club_name: input.clubName,
    p_admin_email: input.adminEmail,
    p_seats_total: input.seatsTotal,
    p_plan_name: input.planName,
    p_valid_until: input.validUntil,
  });

  const record = asRecord(payload);
  return {
    club: normalizeClubPayload(record.club),
    license: normalizeClubLicensePayload(record.license),
    invite: normalizeClubInvitePayload(record.invite),
    seatStatus: normalizeSeatStatusPayload(record.seatStatus),
  };
}

export async function updateClubAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<UpdateClubResult> {
  const input = parseUpdateClubBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'update_club', {
    p_actor_user_id: actorUserId,
    p_club_id: input.clubId,
    p_club_name: input.clubName,
    p_status: input.status,
    p_seats_total: input.seatsTotal,
    p_plan_name: input.planName,
    p_valid_until: input.validUntil,
    p_license_status: input.licenseStatus,
  });

  const record = asRecord(payload);
  return {
    club: normalizeClubPayload(record.club),
    license: normalizeClubLicensePayload(record.license),
    seatStatus: normalizeSeatStatusPayload(record.seatStatus),
  };
}

export async function deleteClubAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<DeleteClubResult> {
  const input = parseClubIdBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'delete_club', {
    p_actor_user_id: actorUserId,
    p_club_id: input.clubId,
  });

  const record = asRecord(payload);
  return {
    clubId: requireUuid(record.clubId, 'clubId'),
    deleted: requireBoolean(record.deleted, 'deleted'),
  };
}

export async function getClubInviteByTokenAction(
  client: RpcClient,
  body: unknown
): Promise<ClubInviteLookup> {
  const input = parseTokenBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'get_club_invite_by_token', {
    p_token: input.token,
  });

  return normalizeClubInviteLookupPayload(payload);
}

export async function acceptClubInviteAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<AcceptClubInviteResult> {
  const input = parseAcceptClubInviteBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'accept_club_invite', {
    p_actor_user_id: actorUserId,
    p_token: input.token,
    p_full_name: input.fullName,
  });

  const record = asRecord(payload);
  return {
    member: normalizeClubMemberPayload(record.member),
    seatStatus: normalizeSeatStatusPayload(record.seatStatus),
  };
}

export async function getCurrentUserClubContextAction(
  client: RpcClient,
  actorUserId: string
): Promise<CurrentUserClubContext> {
  const payload = await callRpc<Record<string, unknown>>(client, 'get_current_user_club_context', {
    p_actor_user_id: actorUserId,
  });

  return normalizeCurrentUserClubContextPayload(payload);
}

export async function listPlatformAdminClubsAction(
  client: RpcClient,
  actorUserId: string
): Promise<CurrentUserClubContext> {
  const payload = await callRpc<Record<string, unknown>>(client, 'list_platform_admin_clubs', {
    p_actor_user_id: actorUserId,
  });

  return normalizeCurrentUserClubContextPayload(payload);
}
