// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { AppError } from './http.ts';

type DbError = { message?: string } | null;

type QueryClient = {
  rpc?: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: DbError }>;
  from: (table: string) => any;
};

export type TrainingTemplateAction =
  | 'context'
  | 'list'
  | 'upsertFolder'
  | 'upsertTemplate'
  | 'duplicateTemplate'
  | 'archiveTemplate'
  | 'restoreTemplate';

export type TrainingTemplateType = 'task' | 'session' | 'week';
export type TrainingTemplateStatus = 'active' | 'archived';
export type TrainingTemplateItemType = 'task_template' | 'activity' | 'session_template' | 'note' | 'focus';

type OwnerAccountRow = {
  id: string;
  owner_type: 'club' | 'private_coach_business';
  name: string;
  status: string;
  coach_account_id: string | null;
  club_id: string | null;
};

type FolderRow = {
  id: string;
  owner_account_id: string;
  name: string;
  normalized_name: string;
  color: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type TemplateRow = {
  id: string;
  owner_account_id: string;
  template_type: TrainingTemplateType;
  title: string;
  description: string | null;
  status: TrainingTemplateStatus;
  folder_id: string | null;
  focus_areas: string[];
  duration_minutes: number | null;
  source_task_template_id: string | null;
  active_version_id: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type TemplateItemRow = {
  id: string;
  owner_account_id: string;
  template_id: string;
  parent_item_id: string | null;
  item_type: TrainingTemplateItemType;
  source_task_template_id: string | null;
  source_activity_series_id: string | null;
  linked_template_id: string | null;
  title: string;
  description: string | null;
  day_offset: number;
  start_time: string | null;
  duration_minutes: number | null;
  sort_order: number;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type VersionRow = {
  id: string;
  owner_account_id: string;
  template_id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  change_note: string | null;
  created_by: string | null;
  created_at: string;
};

type TemplateItemInput = {
  id: string | null;
  parentItemId: string | null;
  itemType: TrainingTemplateItemType;
  sourceTaskTemplateId: string | null;
  sourceActivitySeriesId: string | null;
  linkedTemplateId: string | null;
  title: string;
  description: string | null;
  dayOffset: number;
  startTime: string | null;
  durationMinutes: number | null;
  sortOrder: number;
  config: Record<string, unknown>;
};

type ParsedTrainingTemplateBody =
  | { action: 'context' }
  | { action: 'list'; ownerAccountId: string }
  | { action: 'upsertFolder'; ownerAccountId: string; folderId: string | null; name: string; color: string | null }
  | {
      action: 'upsertTemplate';
      ownerAccountId: string;
      templateId: string | null;
      templateType: TrainingTemplateType;
      title: string;
      description: string | null;
      folderId: string | null;
      focusAreas: string[];
      durationMinutes: number | null;
      status: TrainingTemplateStatus;
      sourceTaskTemplateId: string | null;
      items: TemplateItemInput[];
      changeNote: string | null;
    }
  | { action: 'duplicateTemplate'; ownerAccountId: string; templateId: string }
  | { action: 'archiveTemplate' | 'restoreTemplate'; ownerAccountId: string; templateId: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEMPLATE_TYPES = new Set(['task', 'session', 'week']);
const TEMPLATE_STATUSES = new Set(['active', 'archived']);
const ITEM_TYPES = new Set(['task_template', 'activity', 'session_template', 'note', 'focus']);
const COACH_ACCESS_ROLES = new Set(['owner', 'admin', 'coach', 'assistant_coach']);
const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function asRecord(value: unknown, fieldName = 'payload'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('INTERNAL_ERROR', `${fieldName} must be an object.`, 500);
  }

  return value as Record<string, unknown>;
}

function requireInputRecord(value: unknown): Record<string, unknown> {
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
  if (value === null || value === undefined || value === '') return null;
  return requireUuid(value, fieldName);
}

function optionalTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
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

function normalizeSignature(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeColor(value: unknown): string | null {
  const normalized = optionalTrimmedString(value);
  if (!normalized) return null;
  if (!COLOR_PATTERN.test(normalized)) {
    throw new AppError('VALIDATION_ERROR', 'color must be a hex color.', 400);
  }
  return normalized;
}

function normalizeTemplateType(value: unknown): TrainingTemplateType {
  const normalized = optionalTrimmedString(value);
  if (!normalized || !TEMPLATE_TYPES.has(normalized)) {
    throw new AppError('VALIDATION_ERROR', 'templateType must be task, session or week.', 400);
  }
  return normalized as TrainingTemplateType;
}

function normalizeTemplateStatus(value: unknown): TrainingTemplateStatus {
  const normalized = optionalTrimmedString(value) ?? 'active';
  if (!TEMPLATE_STATUSES.has(normalized)) {
    throw new AppError('VALIDATION_ERROR', 'status must be active or archived.', 400);
  }
  return normalized as TrainingTemplateStatus;
}

function normalizeItemType(value: unknown): TrainingTemplateItemType {
  const normalized = optionalTrimmedString(value) ?? 'task_template';
  if (!ITEM_TYPES.has(normalized)) {
    throw new AppError('VALIDATION_ERROR', 'itemType is invalid.', 400);
  }
  return normalized as TrainingTemplateItemType;
}

function normalizeInt(value: unknown, fieldName: string, options: { min: number; max: number; nullable?: boolean }): number | null {
  if (value === null || value === undefined || value === '') {
    return options.nullable ? null : options.min;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a number.`, 400);
  }

  const rounded = Math.round(parsed);
  if (rounded < options.min || rounded > options.max) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} is out of range.`, 400);
  }

  return rounded;
}

function normalizeStringArray(value: unknown, fieldName: string): string[] {
  if (value === null || value === undefined || value === '') return [];
  if (!Array.isArray(value)) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be an array.`, 400);
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    )
  ).slice(0, 12);
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeTime(value: unknown): string | null {
  const normalized = optionalTrimmedString(value);
  if (!normalized) return null;
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
    throw new AppError('VALIDATION_ERROR', 'startTime must be HH:mm or HH:mm:ss.', 400);
  }
  return normalized.length === 5 ? `${normalized}:00` : normalized;
}

function normalizeTemplateItems(value: unknown): TemplateItemInput[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new AppError('VALIDATION_ERROR', 'items must be an array.', 400);
  }

  return value.map((item, index) => {
    const record = asRecord(item, 'item');
    return {
      id: optionalUuid(record.id, 'item.id'),
      parentItemId: optionalUuid(record.parentItemId, 'item.parentItemId'),
      itemType: normalizeItemType(record.itemType),
      sourceTaskTemplateId: optionalUuid(record.sourceTaskTemplateId, 'item.sourceTaskTemplateId'),
      sourceActivitySeriesId: optionalUuid(record.sourceActivitySeriesId, 'item.sourceActivitySeriesId'),
      linkedTemplateId: optionalUuid(record.linkedTemplateId, 'item.linkedTemplateId'),
      title: requiredTrimmedString(record.title, 'item.title'),
      description: optionalTrimmedString(record.description),
      dayOffset: normalizeInt(record.dayOffset, 'item.dayOffset', { min: 0, max: 365 }) ?? 0,
      startTime: normalizeTime(record.startTime),
      durationMinutes: normalizeInt(record.durationMinutes, 'item.durationMinutes', { min: 1, max: 1440, nullable: true }),
      sortOrder: normalizeInt(record.sortOrder ?? index, 'item.sortOrder', { min: 0, max: 999 }) ?? index,
      config: normalizeJsonObject(record.config),
    };
  });
}

export function parseTrainingTemplateBody(body: unknown): ParsedTrainingTemplateBody {
  const record = requireInputRecord(body);
  const action = optionalTrimmedString(record.action) as TrainingTemplateAction | null;

  if (action === 'context') {
    return { action };
  }

  if (!action) {
    throw new AppError('VALIDATION_ERROR', 'action is required.', 400);
  }

  const ownerAccountId = requireUuid(record.ownerAccountId, 'ownerAccountId');

  if (action === 'list') {
    return { action, ownerAccountId };
  }

  if (action === 'upsertFolder') {
    const name = requiredTrimmedString(record.name, 'name');
    return {
      action,
      ownerAccountId,
      folderId: optionalUuid(record.folderId, 'folderId'),
      name,
      color: normalizeColor(record.color),
    };
  }

  if (action === 'upsertTemplate') {
    return {
      action,
      ownerAccountId,
      templateId: optionalUuid(record.id ?? record.templateId, 'templateId'),
      templateType: normalizeTemplateType(record.templateType),
      title: requiredTrimmedString(record.title, 'title'),
      description: optionalTrimmedString(record.description),
      folderId: optionalUuid(record.folderId, 'folderId'),
      focusAreas: normalizeStringArray(record.focusAreas, 'focusAreas'),
      durationMinutes: normalizeInt(record.durationMinutes, 'durationMinutes', { min: 1, max: 1440, nullable: true }),
      status: normalizeTemplateStatus(record.status),
      sourceTaskTemplateId: optionalUuid(record.sourceTaskTemplateId, 'sourceTaskTemplateId'),
      items: normalizeTemplateItems(record.items),
      changeNote: optionalTrimmedString(record.changeNote),
    };
  }

  if (action === 'duplicateTemplate') {
    return {
      action,
      ownerAccountId,
      templateId: requireUuid(record.templateId, 'templateId'),
    };
  }

  if (action === 'archiveTemplate' || action === 'restoreTemplate') {
    return {
      action,
      ownerAccountId,
      templateId: requireUuid(record.templateId, 'templateId'),
    };
  }

  throw new AppError('VALIDATION_ERROR', 'Unsupported template action.', 400);
}

function mapRpcError(error: DbError): AppError | null {
  const message = error?.message?.trim();
  if (!message) return null;

  const map: Record<string, { code: any; message: string; status: number }> = {
    UNAUTHORIZED: { code: 'UNAUTHORIZED', message: 'Unauthorized.', status: 401 },
    FORBIDDEN: { code: 'FORBIDDEN', message: 'You do not have access to this owner account.', status: 403 },
    OWNER_ACCOUNT_NOT_FOUND: { code: 'OWNER_ACCOUNT_NOT_FOUND', message: 'Owner account not found.', status: 404 },
    VALIDATION_ERROR: { code: 'VALIDATION_ERROR', message: 'Request payload is invalid.', status: 400 },
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
): Promise<{ owner: OwnerAccountRow; roles: string[]; platformAdmin: boolean }> {
  const owner = await loadOwnerAccount(client, ownerAccountId);
  const [hasCoachAccess, platformAdmin, roles] = await Promise.all([
    callRpc<boolean>(client, 'has_owner_account_coach_access', {
      p_owner_account_id: ownerAccountId,
      p_user_id: actorUserId,
    }),
    isPlatformAdmin(client, actorUserId),
    callRpc<string[]>(client, 'get_owner_account_roles', {
      p_owner_account_id: ownerAccountId,
      p_user_id: actorUserId,
    }).catch(() => []),
  ]);

  if (!hasCoachAccess && !platformAdmin) {
    throw new AppError('FORBIDDEN', 'You do not have access to this owner account.', 403);
  }

  return {
    owner,
    roles: platformAdmin && roles.length === 0 ? ['platform_admin'] : roles,
    platformAdmin,
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

function normalizeFolderPayload(folder: FolderRow) {
  return {
    id: folder.id,
    ownerAccountId: folder.owner_account_id,
    name: folder.name,
    color: folder.color,
    sortOrder: folder.sort_order,
    createdAt: folder.created_at,
    updatedAt: folder.updated_at,
  };
}

function normalizeItemPayload(item: TemplateItemRow) {
  return {
    id: item.id,
    templateId: item.template_id,
    parentItemId: item.parent_item_id,
    itemType: item.item_type,
    sourceTaskTemplateId: item.source_task_template_id,
    sourceActivitySeriesId: item.source_activity_series_id,
    linkedTemplateId: item.linked_template_id,
    title: item.title,
    description: item.description,
    dayOffset: item.day_offset,
    startTime: item.start_time,
    durationMinutes: item.duration_minutes,
    sortOrder: item.sort_order,
    config: item.config || {},
  };
}

function normalizeTemplatePayload(
  template: TemplateRow,
  items: TemplateItemRow[],
  folder: FolderRow | null,
  latestVersion: VersionRow | null
) {
  return {
    id: template.id,
    ownerAccountId: template.owner_account_id,
    templateType: template.template_type,
    title: template.title,
    description: template.description,
    status: template.status,
    folderId: template.folder_id,
    folderName: folder?.name ?? null,
    focusAreas: template.focus_areas || [],
    durationMinutes: template.duration_minutes,
    sourceTaskTemplateId: template.source_task_template_id,
    activeVersionId: template.active_version_id,
    versionNumber: latestVersion?.version_number ?? 0,
    itemCount: items.length,
    createdBy: template.created_by,
    updatedBy: template.updated_by,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
    archivedAt: template.archived_at,
    items: items
      .slice()
      .sort((left, right) => left.sort_order - right.sort_order)
      .map(normalizeItemPayload),
  };
}

export function normalizeOwnerTrainingTemplatesPayload(payload: unknown) {
  const record = asRecord(payload);
  const owner = asRecord(record.ownerAccount, 'ownerAccount');
  const actor = asRecord(record.actor, 'actor');
  const summary = asRecord(record.summary, 'summary');

  return {
    ownerAccount: {
      ownerAccountId: requiredTrimmedString(owner.ownerAccountId, 'ownerAccount.ownerAccountId'),
      ownerType: owner.ownerType === 'club' ? 'club' : 'private_coach_business',
      name: requiredTrimmedString(owner.name, 'ownerAccount.name'),
      status: requiredTrimmedString(owner.status, 'ownerAccount.status'),
      coachAccountId: optionalTrimmedString(owner.coachAccountId),
      clubId: optionalTrimmedString(owner.clubId),
    },
    actor: {
      userId: requiredTrimmedString(actor.userId, 'actor.userId'),
      roles: Array.isArray(actor.roles) ? actor.roles.filter((role): role is string => typeof role === 'string') : [],
      canManageTemplates: actor.canManageTemplates === true,
    },
    folders: Array.isArray(record.folders) ? record.folders : [],
    templates: Array.isArray(record.templates) ? record.templates : [],
    summary: {
      total: Number(summary.total ?? 0),
      active: Number(summary.active ?? 0),
      archived: Number(summary.archived ?? 0),
      task: Number(summary.task ?? 0),
      session: Number(summary.session ?? 0),
      week: Number(summary.week ?? 0),
    },
  };
}

async function loadOwnerTrainingTemplatesPayload(client: QueryClient, actorUserId: string, ownerAccountId: string) {
  const { owner, roles } = await assertOwnerCoachAccess(client, actorUserId, ownerAccountId);

  const [foldersResult, templatesResult] = await Promise.all([
    client
      .from('training_template_folders')
      .select('*')
      .eq('owner_account_id', ownerAccountId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    client
      .from('training_templates')
      .select('*')
      .eq('owner_account_id', ownerAccountId)
      .order('updated_at', { ascending: false }),
  ]);

  if (foldersResult.error) {
    throw new AppError('INTERNAL_ERROR', foldersResult.error.message || 'Could not load template folders.', 500);
  }
  if (templatesResult.error) {
    throw new AppError('INTERNAL_ERROR', templatesResult.error.message || 'Could not load templates.', 500);
  }

  const folders = (foldersResult.data || []) as FolderRow[];
  const templates = (templatesResult.data || []) as TemplateRow[];
  const templateIds = templates.map((template) => template.id);

  const [itemsResult, versionsResult] = await Promise.all([
    templateIds.length
      ? client
          .from('training_template_items')
          .select('*')
          .eq('owner_account_id', ownerAccountId)
          .in('template_id', templateIds)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    templateIds.length
      ? client
          .from('template_versions')
          .select('*')
          .eq('owner_account_id', ownerAccountId)
          .in('template_id', templateIds)
          .order('version_number', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (itemsResult.error) {
    throw new AppError('INTERNAL_ERROR', itemsResult.error.message || 'Could not load template items.', 500);
  }
  if (versionsResult.error) {
    throw new AppError('INTERNAL_ERROR', versionsResult.error.message || 'Could not load template versions.', 500);
  }

  const itemsByTemplateId = new Map<string, TemplateItemRow[]>();
  for (const item of (itemsResult.data || []) as TemplateItemRow[]) {
    const existing = itemsByTemplateId.get(item.template_id) || [];
    existing.push(item);
    itemsByTemplateId.set(item.template_id, existing);
  }

  const latestVersionByTemplateId = new Map<string, VersionRow>();
  for (const version of (versionsResult.data || []) as VersionRow[]) {
    if (!latestVersionByTemplateId.has(version.template_id)) {
      latestVersionByTemplateId.set(version.template_id, version);
    }
  }

  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const normalizedTemplates = templates.map((template) =>
    normalizeTemplatePayload(
      template,
      itemsByTemplateId.get(template.id) || [],
      template.folder_id ? folderById.get(template.folder_id) ?? null : null,
      latestVersionByTemplateId.get(template.id) ?? null
    )
  );

  return {
    ownerAccount: normalizeOwnerPayload(owner),
    actor: {
      userId: actorUserId,
      roles,
      canManageTemplates: roles.some((role) => COACH_ACCESS_ROLES.has(role)) || roles.includes('platform_admin'),
    },
    folders: folders.map(normalizeFolderPayload),
    templates: normalizedTemplates,
    summary: {
      total: normalizedTemplates.length,
      active: normalizedTemplates.filter((template) => template.status === 'active').length,
      archived: normalizedTemplates.filter((template) => template.status === 'archived').length,
      task: normalizedTemplates.filter((template) => template.templateType === 'task').length,
      session: normalizedTemplates.filter((template) => template.templateType === 'session').length,
      week: normalizedTemplates.filter((template) => template.templateType === 'week').length,
    },
  };
}

async function loadOwnerTrainingTemplatesContext(client: QueryClient, actorUserId: string) {
  const platformAdmin = await isPlatformAdmin(client, actorUserId);
  const { data: membershipRows, error: membershipError } = await client
    .from('owner_memberships')
    .select('owner_account_id')
    .eq('user_id', actorUserId)
    .eq('status', 'active');

  if (membershipError) {
    throw new AppError('INTERNAL_ERROR', membershipError.message || 'Could not load owner memberships.', 500);
  }

  const ownerIds = Array.from(
    new Set(((membershipRows || []) as Array<{ owner_account_id: string }>).map((row) => row.owner_account_id))
  );

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
      const canAccessTemplates = platformAdmin || roles.some((role) => COACH_ACCESS_ROLES.has(role));
      return {
        ...normalizeOwnerPayload(owner),
        roles,
        canAccessCrm: canAccessTemplates,
      };
    })
    .filter((workspace) => workspace.canAccessCrm)
    .sort((left, right) => left.name.localeCompare(right.name, 'da'));

  return {
    isPlatformAdmin: platformAdmin,
    workspaces,
    defaultOwnerAccountId: workspaces[0]?.ownerAccountId ?? null,
  };
}

async function assertFolderBelongsToOwner(client: QueryClient, ownerAccountId: string, folderId: string | null): Promise<void> {
  if (!folderId) return;
  const { data, error } = await client
    .from('training_template_folders')
    .select('id')
    .eq('owner_account_id', ownerAccountId)
    .eq('id', folderId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not verify template folder.', 500);
  }
  if (!data) {
    throw new AppError('TRAINING_TEMPLATE_FOLDER_NOT_FOUND', 'Template folder not found.', 404);
  }
}

async function loadTemplateForOwner(client: QueryClient, ownerAccountId: string, templateId: string): Promise<TemplateRow> {
  const { data, error } = await client
    .from('training_templates')
    .select('*')
    .eq('owner_account_id', ownerAccountId)
    .eq('id', templateId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load template.', 500);
  }

  if (!data) {
    throw new AppError('TRAINING_TEMPLATE_NOT_FOUND', 'Training template not found.', 404);
  }

  return data as TemplateRow;
}

async function loadTemplateItems(client: QueryClient, ownerAccountId: string, templateId: string): Promise<TemplateItemRow[]> {
  const { data, error } = await client
    .from('training_template_items')
    .select('*')
    .eq('owner_account_id', ownerAccountId)
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true });

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load template items.', 500);
  }

  return (data || []) as TemplateItemRow[];
}

async function createVersionSnapshot(
  client: QueryClient,
  actorUserId: string,
  template: TemplateRow,
  items: TemplateItemRow[],
  changeNote: string | null
): Promise<VersionRow> {
  const { data: latestVersion, error: latestError } = await client
    .from('template_versions')
    .select('version_number')
    .eq('owner_account_id', template.owner_account_id)
    .eq('template_id', template.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new AppError('INTERNAL_ERROR', latestError.message || 'Could not load latest template version.', 500);
  }

  const versionNumber = Number((latestVersion as { version_number?: number } | null)?.version_number ?? 0) + 1;
  const snapshot = {
    template: normalizeTemplatePayload(template, items, null, null),
    items: items.map(normalizeItemPayload),
  };

  const { data, error } = await client
    .from('template_versions')
    .insert({
      owner_account_id: template.owner_account_id,
      template_id: template.id,
      version_number: versionNumber,
      snapshot,
      change_note: changeNote,
      created_by: actorUserId,
    })
    .select('*')
    .single();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not create template version.', 500);
  }

  const version = data as VersionRow;
  const { error: updateError } = await client
    .from('training_templates')
    .update({ active_version_id: version.id })
    .eq('owner_account_id', template.owner_account_id)
    .eq('id', template.id);

  if (updateError) {
    throw new AppError('INTERNAL_ERROR', updateError.message || 'Could not update active template version.', 500);
  }

  return version;
}

async function replaceTemplateItems(
  client: QueryClient,
  ownerAccountId: string,
  templateId: string,
  items: TemplateItemInput[]
): Promise<TemplateItemRow[]> {
  const { error: deleteError } = await client
    .from('training_template_items')
    .delete()
    .eq('owner_account_id', ownerAccountId)
    .eq('template_id', templateId);

  if (deleteError) {
    throw new AppError('INTERNAL_ERROR', deleteError.message || 'Could not replace template items.', 500);
  }

  if (!items.length) return [];

  const rows = items.map((item, index) => ({
    owner_account_id: ownerAccountId,
    template_id: templateId,
    item_type: item.itemType,
    source_task_template_id: item.sourceTaskTemplateId,
    source_activity_series_id: item.sourceActivitySeriesId,
    linked_template_id: item.linkedTemplateId,
    title: item.title,
    description: item.description,
    day_offset: item.dayOffset,
    start_time: item.startTime,
    duration_minutes: item.durationMinutes,
    sort_order: index,
    config: item.config,
  }));

  const { data, error } = await client
    .from('training_template_items')
    .insert(rows)
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not save template items.', 500);
  }

  return (data || []) as TemplateItemRow[];
}

async function upsertFolder(
  client: QueryClient,
  actorUserId: string,
  input: Extract<ParsedTrainingTemplateBody, { action: 'upsertFolder' }>
) {
  await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
  const payload = {
    owner_account_id: input.ownerAccountId,
    name: input.name,
    normalized_name: normalizeSignature(input.name),
    color: input.color ?? '#2563eb',
    created_by: actorUserId,
  };

  if (input.folderId) {
    const { error } = await client
      .from('training_template_folders')
      .update({
        name: payload.name,
        normalized_name: payload.normalized_name,
        color: payload.color,
      })
      .eq('owner_account_id', input.ownerAccountId)
      .eq('id', input.folderId);

    if (error) {
      throw new AppError('INTERNAL_ERROR', error.message || 'Could not update template folder.', 500);
    }
  } else {
    const { error } = await client.from('training_template_folders').insert(payload);
    if (error) {
      throw new AppError('INTERNAL_ERROR', error.message || 'Could not create template folder.', 500);
    }
  }

  return loadOwnerTrainingTemplatesPayload(client, actorUserId, input.ownerAccountId);
}

async function upsertTemplate(
  client: QueryClient,
  actorUserId: string,
  input: Extract<ParsedTrainingTemplateBody, { action: 'upsertTemplate' }>
) {
  await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
  await assertFolderBelongsToOwner(client, input.ownerAccountId, input.folderId);

  const archivedAt = input.status === 'archived' ? new Date().toISOString() : null;
  const templatePayload = {
    owner_account_id: input.ownerAccountId,
    template_type: input.templateType,
    title: input.title,
    description: input.description,
    status: input.status,
    folder_id: input.folderId,
    focus_areas: input.focusAreas,
    duration_minutes: input.durationMinutes,
    source_task_template_id: input.sourceTaskTemplateId,
    updated_by: actorUserId,
    archived_at: archivedAt,
  };

  let template: TemplateRow;
  if (input.templateId) {
    await loadTemplateForOwner(client, input.ownerAccountId, input.templateId);
    const { data, error } = await client
      .from('training_templates')
      .update(templatePayload)
      .eq('owner_account_id', input.ownerAccountId)
      .eq('id', input.templateId)
      .select('*')
      .single();

    if (error) {
      throw new AppError('INTERNAL_ERROR', error.message || 'Could not update template.', 500);
    }
    template = data as TemplateRow;
  } else {
    const { data, error } = await client
      .from('training_templates')
      .insert({
        ...templatePayload,
        created_by: actorUserId,
      })
      .select('*')
      .single();

    if (error) {
      throw new AppError('INTERNAL_ERROR', error.message || 'Could not create template.', 500);
    }
    template = data as TemplateRow;
  }

  const items = await replaceTemplateItems(client, input.ownerAccountId, template.id, input.items);
  await createVersionSnapshot(client, actorUserId, template, items, input.changeNote);
  return loadOwnerTrainingTemplatesPayload(client, actorUserId, input.ownerAccountId);
}

async function duplicateTemplate(
  client: QueryClient,
  actorUserId: string,
  input: Extract<ParsedTrainingTemplateBody, { action: 'duplicateTemplate' }>
) {
  await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
  const source = await loadTemplateForOwner(client, input.ownerAccountId, input.templateId);
  const sourceItems = await loadTemplateItems(client, input.ownerAccountId, input.templateId);

  const { data, error } = await client
    .from('training_templates')
    .insert({
      owner_account_id: input.ownerAccountId,
      template_type: source.template_type,
      title: `${source.title} copy`,
      description: source.description,
      status: 'active',
      folder_id: source.folder_id,
      focus_areas: source.focus_areas || [],
      duration_minutes: source.duration_minutes,
      source_task_template_id: source.source_task_template_id,
      metadata: source.metadata || {},
      created_by: actorUserId,
      updated_by: actorUserId,
    })
    .select('*')
    .single();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not duplicate template.', 500);
  }

  const duplicate = data as TemplateRow;
  const duplicatedItems = await replaceTemplateItems(
    client,
    input.ownerAccountId,
    duplicate.id,
    sourceItems.map((item) => ({
      id: null,
      parentItemId: null,
      itemType: item.item_type,
      sourceTaskTemplateId: item.source_task_template_id,
      sourceActivitySeriesId: item.source_activity_series_id,
      linkedTemplateId: item.linked_template_id,
      title: item.title,
      description: item.description,
      dayOffset: item.day_offset,
      startTime: item.start_time,
      durationMinutes: item.duration_minutes,
      sortOrder: item.sort_order,
      config: item.config || {},
    }))
  );
  await createVersionSnapshot(client, actorUserId, duplicate, duplicatedItems, 'Duplicated from template');
  return loadOwnerTrainingTemplatesPayload(client, actorUserId, input.ownerAccountId);
}

async function setTemplateArchiveState(
  client: QueryClient,
  actorUserId: string,
  input: Extract<ParsedTrainingTemplateBody, { action: 'archiveTemplate' | 'restoreTemplate' }>
) {
  await assertOwnerCoachAccess(client, actorUserId, input.ownerAccountId);
  await loadTemplateForOwner(client, input.ownerAccountId, input.templateId);
  const archived = input.action === 'archiveTemplate';
  const { data, error } = await client
    .from('training_templates')
    .update({
      status: archived ? 'archived' : 'active',
      archived_at: archived ? new Date().toISOString() : null,
      updated_by: actorUserId,
    })
    .eq('owner_account_id', input.ownerAccountId)
    .eq('id', input.templateId)
    .select('*')
    .single();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not update template archive state.', 500);
  }

  const items = await loadTemplateItems(client, input.ownerAccountId, input.templateId);
  await createVersionSnapshot(client, actorUserId, data as TemplateRow, items, archived ? 'Archived' : 'Restored');
  return loadOwnerTrainingTemplatesPayload(client, actorUserId, input.ownerAccountId);
}

export async function manageTrainingTemplatesAction(client: QueryClient, actorUserId: string, body: unknown) {
  const input = parseTrainingTemplateBody(body);

  if (input.action === 'context') {
    return loadOwnerTrainingTemplatesContext(client, actorUserId);
  }

  if (input.action === 'list') {
    return loadOwnerTrainingTemplatesPayload(client, actorUserId, input.ownerAccountId);
  }

  if (input.action === 'upsertFolder') {
    return upsertFolder(client, actorUserId, input);
  }

  if (input.action === 'upsertTemplate') {
    return upsertTemplate(client, actorUserId, input);
  }

  if (input.action === 'duplicateTemplate') {
    return duplicateTemplate(client, actorUserId, input);
  }

  return setTemplateArchiveState(client, actorUserId, input);
}
