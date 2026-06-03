// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { AppError, type ErrorCode } from './http.ts';

type RpcError = {
  message?: string;
};

export type RpcClient = {
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: RpcError | null }>;
};

export type ClubActivityCategory = {
  id: string;
  clubId: string;
  name: string;
  displayName: string;
  color: string;
  emoji: string;
  memberCopyCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ClubActivityCategoryList = {
  clubId: string;
  categories: ClubActivityCategory[];
};

export type DeleteClubActivityCategoryResult = {
  clubId: string;
  categoryId: string;
  deleted: boolean;
};

type ClubIdInput = {
  clubId: string;
};

type CreateClubActivityCategoryInput = ClubIdInput & {
  name: string;
  color: string;
  emoji: string;
};

type UpdateClubActivityCategoryInput = CreateClubActivityCategoryInput & {
  categoryId: string;
};

type DeleteClubActivityCategoryInput = {
  categoryId: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_COLOR = '#4ECDC4';
const DEFAULT_EMOJI = '⚽';

const RPC_ERROR_MAP: Record<string, { code: ErrorCode; message: string; status: number }> = {
  UNAUTHORIZED: { code: 'UNAUTHORIZED', message: 'Unauthorized.', status: 401 },
  FORBIDDEN: { code: 'FORBIDDEN', message: 'You do not have access to this club.', status: 403 },
  CLUB_NOT_FOUND: { code: 'CLUB_NOT_FOUND', message: 'Club not found.', status: 404 },
  CLUB_CATEGORY_NOT_FOUND: { code: 'CLUB_CATEGORY_NOT_FOUND', message: 'Club category not found.', status: 404 },
  CLUB_CATEGORY_ALREADY_EXISTS: {
    code: 'CLUB_CATEGORY_ALREADY_EXISTS',
    message: 'A club category with this name already exists.',
    status: 409,
  },
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

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} is required.`, 400);
  }

  return value.trim();
}

function optionalString(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
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

function mapRpcError(error: RpcError | null): AppError | null {
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

export function parseClubActivityCategoryListBody(body: unknown): ClubIdInput {
  const record = asRecord(body);
  return {
    clubId: requireUuid(record.clubId, 'clubId'),
  };
}

export function parseCreateClubActivityCategoryBody(body: unknown): CreateClubActivityCategoryInput {
  const record = asRecord(body);
  return {
    clubId: requireUuid(record.clubId, 'clubId'),
    name: requireString(record.name, 'name'),
    color: optionalString(record.color, DEFAULT_COLOR),
    emoji: optionalString(record.emoji, DEFAULT_EMOJI),
  };
}

export function parseUpdateClubActivityCategoryBody(body: unknown): UpdateClubActivityCategoryInput {
  const record = asRecord(body);
  return {
    categoryId: requireUuid(record.categoryId, 'categoryId'),
    clubId: requireUuid(record.clubId, 'clubId'),
    name: requireString(record.name, 'name'),
    color: optionalString(record.color, DEFAULT_COLOR),
    emoji: optionalString(record.emoji, DEFAULT_EMOJI),
  };
}

export function parseDeleteClubActivityCategoryBody(body: unknown): DeleteClubActivityCategoryInput {
  const record = asRecord(body);
  return {
    categoryId: requireUuid(record.categoryId, 'categoryId'),
  };
}

export function normalizeClubActivityCategoryPayload(payload: unknown): ClubActivityCategory {
  const record = asRecord(payload);
  return {
    id: requireUuid(record.id, 'id'),
    clubId: requireUuid(record.clubId, 'clubId'),
    name: requireString(record.name, 'name'),
    displayName: requireString(record.displayName, 'displayName'),
    color: requireString(record.color, 'color'),
    emoji: requireString(record.emoji, 'emoji'),
    memberCopyCount: requireNumber(record.memberCopyCount, 'memberCopyCount'),
    createdAt: requireString(record.createdAt, 'createdAt'),
    updatedAt: requireString(record.updatedAt, 'updatedAt'),
  };
}

export function normalizeClubActivityCategoryListPayload(payload: unknown): ClubActivityCategoryList {
  const record = asRecord(payload);
  const categoriesValue = record.categories;
  if (!Array.isArray(categoriesValue)) {
    throw new AppError('INTERNAL_ERROR', 'categories is missing from backend response.', 500);
  }

  return {
    clubId: requireUuid(record.clubId, 'clubId'),
    categories: categoriesValue.map(normalizeClubActivityCategoryPayload),
  };
}

export function normalizeDeleteClubActivityCategoryPayload(payload: unknown): DeleteClubActivityCategoryResult {
  const record = asRecord(payload);
  return {
    clubId: requireUuid(record.clubId, 'clubId'),
    categoryId: requireUuid(record.categoryId, 'categoryId'),
    deleted: requireBoolean(record.deleted, 'deleted'),
  };
}

export async function listClubActivityCategoriesAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<ClubActivityCategoryList> {
  const input = parseClubActivityCategoryListBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'list_club_activity_categories', {
    p_actor_user_id: actorUserId,
    p_club_id: input.clubId,
  });

  return normalizeClubActivityCategoryListPayload(payload);
}

export async function createClubActivityCategoryAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<ClubActivityCategory> {
  const input = parseCreateClubActivityCategoryBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'create_club_activity_category', {
    p_actor_user_id: actorUserId,
    p_club_id: input.clubId,
    p_name: input.name,
    p_color: input.color,
    p_emoji: input.emoji,
  });

  return normalizeClubActivityCategoryPayload(payload);
}

export async function updateClubActivityCategoryAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<ClubActivityCategory> {
  const input = parseUpdateClubActivityCategoryBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'update_club_activity_category', {
    p_actor_user_id: actorUserId,
    p_category_id: input.categoryId,
    p_name: input.name,
    p_color: input.color,
    p_emoji: input.emoji,
  });

  return normalizeClubActivityCategoryPayload(payload);
}

export async function deleteClubActivityCategoryAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<DeleteClubActivityCategoryResult> {
  const input = parseDeleteClubActivityCategoryBody(body);
  const payload = await callRpc<Record<string, unknown>>(client, 'delete_club_activity_category', {
    p_actor_user_id: actorUserId,
    p_category_id: input.categoryId,
  });

  return normalizeDeleteClubActivityCategoryPayload(payload);
}
