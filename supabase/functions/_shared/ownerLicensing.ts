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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER_TYPES = new Set(['club', 'private_coach_business']);
const OWNER_SEAT_ROLES = new Set(['owner', 'admin', 'coach', 'assistant_coach', 'player', 'parent']);

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

function maybeString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
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

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new AppError('INTERNAL_ERROR', `${fieldName} is missing from backend response.`, 500);
  }

  return value;
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
