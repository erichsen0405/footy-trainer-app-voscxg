// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { AppError, type ErrorCode } from './http.ts';

type RpcError = {
  message?: string;
};

export type RpcClient = {
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: RpcError | null }>;
};

export type OwnerSeatRole = 'owner' | 'admin' | 'coach' | 'assistant_coach' | 'player' | 'parent';

export type OwnerSeatLine = {
  role: OwnerSeatRole;
  planSeats: number;
  overrideSeats: number | null;
  addOnSeats: number;
  effectiveSeats: number;
  seatsUsed: number;
  seatsAvailable: number;
  source: string;
  planCode: string | null;
};

export type OwnerSeatStatus = {
  ownerAccountId: string;
  ownerType: 'club' | 'private_coach_business';
  ownerStatus: string;
  planCode: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  validUntil: string | null;
  featureFlags: Record<string, boolean>;
  seats: OwnerSeatLine[];
  playerSeats: OwnerSeatLine | null;
  canAddPlayers: boolean;
};

export type PlatformAdminOwnerAccountListItem = {
  ownerAccountId: string;
  ownerType: 'club' | 'private_coach_business';
  ownerName: string;
  ownerStatus: string;
  source: string;
  ownerUserId: string | null;
  ownerEmail: string | null;
  coachAccountId: string | null;
  clubId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  seatStatus: OwnerSeatStatus;
};

export type PlatformAdminOwnerAccountsPayload = {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  ownerAccounts: PlatformAdminOwnerAccountListItem[];
};

export type CreateOwnerAccountInput = {
  ownerType: 'club' | 'private_coach_business';
  ownerName: string;
  ownerUserId: string | null;
  planCode: string | null;
  seatOverrides: Partial<Record<OwnerSeatRole, number>>;
};

export type UpsertOwnerSeatAdjustmentInput = {
  ownerAccountId: string;
  role: OwnerSeatRole;
  adjustmentType: 'override' | 'add_on';
  seats: number;
  reason: string | null;
  validUntil: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_TYPES = new Set(['club', 'private_coach_business']);
const OWNER_SEAT_ROLES = new Set(['owner', 'admin', 'coach', 'assistant_coach', 'player', 'parent']);
const OWNER_SEAT_ADJUSTMENT_TYPES = new Set(['override', 'add_on']);

const RPC_ERROR_MAP: Record<string, { code: ErrorCode; message: string; status: number }> = {
  UNAUTHORIZED: { code: 'UNAUTHORIZED', message: 'Unauthorized.', status: 401 },
  FORBIDDEN: { code: 'FORBIDDEN', message: 'You do not have access to this owner account.', status: 403 },
  OWNER_ACCOUNT_NOT_FOUND: { code: 'OWNER_ACCOUNT_NOT_FOUND', message: 'Owner account not found.', status: 404 },
  LICENSE_INACTIVE: { code: 'LICENSE_INACTIVE', message: 'The owner account license is not active.', status: 409 },
  SEAT_LIMIT_REACHED: { code: 'SEAT_LIMIT_REACHED', message: 'The owner account has no available seats for this role.', status: 409 },
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', message: 'Request payload is invalid.', status: 400 },
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

function maybeUuid(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return requireUuid(value, fieldName);
}

function nullableUuid(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return requireUuid(value, fieldName);
}

function maybeString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
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

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError('INTERNAL_ERROR', `${fieldName} is missing from backend response.`, 500);
  }

  return value.trim();
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new AppError('INTERNAL_ERROR', `${fieldName} is missing from backend response.`, 500);
  }

  return value;
}

function requireInputString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} is required.`, 400);
  }

  return value.trim();
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

function normalizeFeatureFlags(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, flag]) => [key, Boolean(flag)])
  );
}

export function mapOwnerLicensingRpcError(error: RpcError | null): AppError | null {
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
  const mappedError = mapOwnerLicensingRpcError(error);
  if (mappedError) {
    throw mappedError;
  }

  if (data === null) {
    throw new AppError('INTERNAL_ERROR', 'Backend returned no data.', 500);
  }

  return data;
}

export function parseOwnerSeatStatusBody(body: unknown): { ownerAccountId: string } {
  const record = asRecord(body);
  return {
    ownerAccountId: requireUuid(record.ownerAccountId, 'ownerAccountId'),
  };
}

export function parseAssertOwnerSeatBody(body: unknown): { ownerAccountId: string; role: OwnerSeatRole } {
  const record = asRecord(body);
  const role = record.role === 'assistant' ? 'assistant_coach' : record.role;
  if (typeof role !== 'string' || !OWNER_SEAT_ROLES.has(role)) {
    throw new AppError('VALIDATION_ERROR', 'role must be a valid owner seat role.', 400);
  }

  return {
    ownerAccountId: requireUuid(record.ownerAccountId, 'ownerAccountId'),
    role: role as OwnerSeatRole,
  };
}

export function parseCreateOwnerAccountBody(body: unknown): CreateOwnerAccountInput {
  const record = asRecord(body);
  const ownerType = record.ownerType;
  if (typeof ownerType !== 'string' || !OWNER_TYPES.has(ownerType)) {
    throw new AppError('VALIDATION_ERROR', 'ownerType must be club or private_coach_business.', 400);
  }

  const rawSeatOverrides = record.seatOverrides;
  const seatOverrideRecord =
    rawSeatOverrides && typeof rawSeatOverrides === 'object' && !Array.isArray(rawSeatOverrides)
      ? (rawSeatOverrides as Record<string, unknown>)
      : {};
  const seatOverrides: Partial<Record<OwnerSeatRole, number>> = {};

  for (const [rawRole, rawSeats] of Object.entries(seatOverrideRecord)) {
    const role = rawRole === 'assistant' ? 'assistant_coach' : rawRole;
    if (!OWNER_SEAT_ROLES.has(role)) {
      throw new AppError('VALIDATION_ERROR', 'seatOverrides contains an invalid owner seat role.', 400);
    }
    seatOverrides[role as OwnerSeatRole] = requireNonNegativeInteger(rawSeats, `seatOverrides.${rawRole}`);
  }

  return {
    ownerType: ownerType as CreateOwnerAccountInput['ownerType'],
    ownerName: requireInputString(record.ownerName, 'ownerName'),
    ownerUserId: maybeUuid(record.ownerUserId, 'ownerUserId'),
    planCode: optionalTrimmedString(record.planCode),
    seatOverrides,
  };
}

export function parseUpsertOwnerSeatAdjustmentBody(body: unknown): UpsertOwnerSeatAdjustmentInput {
  const record = asRecord(body);
  const role = record.role === 'assistant' ? 'assistant_coach' : record.role;
  const adjustmentType = record.adjustmentType;

  if (typeof role !== 'string' || !OWNER_SEAT_ROLES.has(role)) {
    throw new AppError('VALIDATION_ERROR', 'role must be a valid owner seat role.', 400);
  }
  if (typeof adjustmentType !== 'string' || !OWNER_SEAT_ADJUSTMENT_TYPES.has(adjustmentType)) {
    throw new AppError('VALIDATION_ERROR', 'adjustmentType must be override or add_on.', 400);
  }

  return {
    ownerAccountId: requireUuid(record.ownerAccountId, 'ownerAccountId'),
    role: role as OwnerSeatRole,
    adjustmentType: adjustmentType as UpsertOwnerSeatAdjustmentInput['adjustmentType'],
    seats: requireNonNegativeInteger(record.seats, 'seats'),
    reason: optionalTrimmedString(record.reason),
    validUntil: optionalIsoDateTimeString(record.validUntil, 'validUntil'),
  };
}

export function normalizeOwnerSeatLine(payload: unknown): OwnerSeatLine {
  const record = asRecord(payload);
  const role = record.role;
  if (typeof role !== 'string' || !OWNER_SEAT_ROLES.has(role)) {
    throw new AppError('INTERNAL_ERROR', 'role is missing from backend response.', 500);
  }

  const overrideSeats = record.overrideSeats;
  return {
    role: role as OwnerSeatRole,
    planSeats: requireNumber(record.planSeats, 'planSeats'),
    overrideSeats: overrideSeats === null || overrideSeats === undefined
      ? null
      : requireNumber(overrideSeats, 'overrideSeats'),
    addOnSeats: requireNumber(record.addOnSeats, 'addOnSeats'),
    effectiveSeats: requireNumber(record.effectiveSeats, 'effectiveSeats'),
    seatsUsed: requireNumber(record.seatsUsed, 'seatsUsed'),
    seatsAvailable: requireNumber(record.seatsAvailable, 'seatsAvailable'),
    source: requireString(record.source, 'source'),
    planCode: maybeString(record.planCode),
  };
}

export async function createOwnerAccountAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<OwnerSeatStatus> {
  const input = parseCreateOwnerAccountBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'create_owner_account_as_platform_admin', {
    p_actor_user_id: actorUserId,
    p_owner_type: input.ownerType,
    p_owner_name: input.ownerName,
    p_owner_user_id: input.ownerUserId,
    p_plan_code: input.planCode,
    p_seat_overrides: input.seatOverrides,
  });

  return normalizeOwnerSeatStatusPayload(payload);
}

export function normalizePlatformAdminOwnerAccountListItem(payload: unknown): PlatformAdminOwnerAccountListItem {
  const record = asRecord(payload);
  const ownerType = record.ownerType;
  if (typeof ownerType !== 'string' || !OWNER_TYPES.has(ownerType)) {
    throw new AppError('INTERNAL_ERROR', 'ownerType is missing from backend response.', 500);
  }

  return {
    ownerAccountId: requireUuid(record.ownerAccountId, 'ownerAccountId'),
    ownerType: ownerType as PlatformAdminOwnerAccountListItem['ownerType'],
    ownerName: requireString(record.ownerName, 'ownerName'),
    ownerStatus: requireString(record.ownerStatus, 'ownerStatus'),
    source: requireString(record.source, 'source'),
    ownerUserId: nullableUuid(record.ownerUserId, 'ownerUserId'),
    ownerEmail: maybeString(record.ownerEmail),
    coachAccountId: nullableUuid(record.coachAccountId, 'coachAccountId'),
    clubId: nullableUuid(record.clubId, 'clubId'),
    createdAt: maybeString(record.createdAt),
    updatedAt: maybeString(record.updatedAt),
    seatStatus: normalizeOwnerSeatStatusPayload(record.seatStatus),
  };
}

export function normalizePlatformAdminOwnerAccountsPayload(payload: unknown): PlatformAdminOwnerAccountsPayload {
  const record = asRecord(payload);
  const ownerAccounts = record.ownerAccounts;
  if (!Array.isArray(ownerAccounts)) {
    throw new AppError('INTERNAL_ERROR', 'ownerAccounts is missing from backend response.', 500);
  }

  return {
    userId: requireUuid(record.userId, 'userId'),
    email: requireString(record.email, 'email'),
    isPlatformAdmin: requireBoolean(record.isPlatformAdmin, 'isPlatformAdmin'),
    ownerAccounts: ownerAccounts.map(normalizePlatformAdminOwnerAccountListItem),
  };
}

export async function listPlatformAdminOwnerAccountsAction(
  client: RpcClient,
  actorUserId: string
): Promise<PlatformAdminOwnerAccountsPayload> {
  const payload = await callRpc<Record<string, unknown>>(client, 'list_platform_admin_owner_accounts', {
    p_actor_user_id: actorUserId,
  });

  return normalizePlatformAdminOwnerAccountsPayload(payload);
}

export async function upsertOwnerSeatAdjustmentAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<OwnerSeatStatus & { adjustmentId: string | null }> {
  const input = parseUpsertOwnerSeatAdjustmentBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'upsert_owner_seat_adjustment_as_platform_admin', {
    p_actor_user_id: actorUserId,
    p_owner_account_id: input.ownerAccountId,
    p_role: input.role,
    p_adjustment_type: input.adjustmentType,
    p_seats: input.seats,
    p_reason: input.reason,
    p_valid_until: input.validUntil,
  });

  return {
    ...normalizeOwnerSeatStatusPayload(payload),
    adjustmentId: maybeUuid(payload.adjustmentId, 'adjustmentId'),
  };
}

export function normalizeOwnerSeatStatusPayload(payload: unknown): OwnerSeatStatus {
  const record = asRecord(payload);
  const ownerType = record.ownerType;
  if (typeof ownerType !== 'string' || !OWNER_TYPES.has(ownerType)) {
    throw new AppError('INTERNAL_ERROR', 'ownerType is missing from backend response.', 500);
  }

  const seats = record.seats;
  if (!Array.isArray(seats)) {
    throw new AppError('INTERNAL_ERROR', 'seats is missing from backend response.', 500);
  }

  return {
    ownerAccountId: requireUuid(record.ownerAccountId, 'ownerAccountId'),
    ownerType: ownerType as OwnerSeatStatus['ownerType'],
    ownerStatus: requireString(record.ownerStatus, 'ownerStatus'),
    planCode: maybeString(record.planCode),
    planName: maybeString(record.planName),
    subscriptionStatus: maybeString(record.subscriptionStatus),
    validUntil: maybeString(record.validUntil),
    featureFlags: normalizeFeatureFlags(record.featureFlags),
    seats: seats.map(normalizeOwnerSeatLine),
    playerSeats: record.playerSeats ? normalizeOwnerSeatLine(record.playerSeats) : null,
    canAddPlayers: requireBoolean(record.canAddPlayers, 'canAddPlayers'),
  };
}

export async function getOwnerSeatStatusAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<OwnerSeatStatus> {
  const input = parseOwnerSeatStatusBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'get_owner_seat_status', {
    p_actor_user_id: actorUserId,
    p_owner_account_id: input.ownerAccountId,
  });

  return normalizeOwnerSeatStatusPayload(payload);
}

export async function assertOwnerSeatAvailableAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<{ ok: boolean; seat: OwnerSeatLine; seatStatus: OwnerSeatStatus }> {
  const input = parseAssertOwnerSeatBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'assert_owner_seat_available', {
    p_actor_user_id: actorUserId,
    p_owner_account_id: input.ownerAccountId,
    p_role: input.role,
  });

  const record = asRecord(payload);
  return {
    ok: requireBoolean(record.ok, 'ok'),
    seat: normalizeOwnerSeatLine(record.seat),
    seatStatus: normalizeOwnerSeatStatusPayload(record.seatStatus),
  };
}
