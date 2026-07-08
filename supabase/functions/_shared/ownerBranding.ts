// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { AppError } from './http.ts';

export type QueryClient = {
  from: (table: string) => any;
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: { message?: string } | null }>;
};

type OwnerRow = {
  id: string;
  owner_type: 'club' | 'private_coach_business';
  name: string;
  status: string;
};

type BrandRow = {
  owner_account_id: string;
  display_name: string;
  slug: string | null;
  bio: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  social_links: Record<string, string>;
  brand_colors: Record<string, string>;
  logo_path: string | null;
  logo_url: string | null;
  cover_path: string | null;
  cover_url: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export type OwnerBrandingProfile = {
  ownerAccountId: string;
  ownerType: 'club' | 'private_coach_business';
  ownerStatus: string;
  ownerName: string;
  displayName: string;
  slug: string;
  bio: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  socialLinks: Record<string, string>;
  brandColors: {
    primary: string;
    accent: string;
  };
  logoPath: string | null;
  logoUrl: string | null;
  coverPath: string | null;
  coverUrl: string | null;
  isPublic: boolean;
  publicUrlPath: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type OwnerBrandingInput = {
  displayName: string;
  slug: string;
  bio: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  socialLinks: Record<string, string>;
  brandColors: {
    primary: string;
    accent: string;
  };
  logoPath: string | null;
  logoUrl: string | null;
  coverPath: string | null;
  coverUrl: string | null;
  isPublic: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const BRAND_EDITOR_ROLES = ['owner', 'admin', 'coach'];
const BRAND_READER_ROLES = ['owner', 'admin', 'coach', 'assistant_coach'];
const DEFAULT_BRAND_COLORS = {
  primary: '#2563eb',
  accent: '#16a34a',
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

function trimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function requireText(value: unknown, fieldName: string, maxLength: number): string {
  const normalized = trimmedString(value);
  if (!normalized) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} is required.`, 400);
  }
  if (normalized.length > maxLength) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} is too long.`, 400);
  }

  return normalized;
}

function optionalText(value: unknown, fieldName: string, maxLength: number): string | null {
  const normalized = trimmedString(value);
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} is too long.`, 400);
  }

  return normalized;
}

function normalizeSlug(value: unknown, fallback: string): string {
  const raw = trimmedString(value) ?? fallback;
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');

  if (!SLUG_PATTERN.test(slug)) {
    throw new AppError('VALIDATION_ERROR', 'slug must be 3-64 lowercase letters, numbers or hyphens.', 400);
  }

  return slug;
}

function defaultSlug(ownerName: string, ownerAccountId: string): string {
  const base = ownerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '') || 'coach';
  return `${base}-${ownerAccountId.slice(0, 8)}`;
}

function optionalEmail(value: unknown): string | null {
  const normalized = optionalText(value, 'contactEmail', 180)?.toLowerCase() ?? null;
  if (!normalized) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AppError('VALIDATION_ERROR', 'contactEmail must be a valid email address.', 400);
  }
  return normalized;
}

function optionalUrl(value: unknown, fieldName: string): string | null {
  const normalized = optionalText(value, fieldName, 240);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Invalid protocol');
    }
  } catch {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a valid http(s) URL.`, 400);
  }

  return normalized;
}

function optionalAssetUrl(value: unknown, fieldName: string): string | null {
  return optionalUrl(value, fieldName);
}

function normalizeColor(value: unknown, fieldName: string, fallback: string): string {
  const normalized = trimmedString(value) ?? fallback;
  if (!HEX_COLOR_PATTERN.test(normalized)) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a hex color like #2563eb.`, 400);
  }

  return normalized.toLowerCase();
}

function normalizeSocialLinks(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([rawKey, rawValue]) => {
        const key = rawKey.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 32);
        const url = optionalUrl(rawValue, `socialLinks.${rawKey}`);
        return key && url ? [key, url] : null;
      })
      .filter((entry): entry is [string, string] => Boolean(entry))
      .slice(0, 8)
  );
}

function normalizeBrandColors(value: unknown): OwnerBrandingInput['brandColors'] {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return {
    primary: normalizeColor(record.primary, 'brandColors.primary', DEFAULT_BRAND_COLORS.primary),
    accent: normalizeColor(record.accent, 'brandColors.accent', DEFAULT_BRAND_COLORS.accent),
  };
}

function normalizeBrandInput(value: unknown, owner: OwnerRow): OwnerBrandingInput {
  const record = asRecord(value);
  const fallbackSlug = defaultSlug(owner.name, owner.id);

  return {
    displayName: requireText(record.displayName, 'displayName', 90),
    slug: normalizeSlug(record.slug, fallbackSlug),
    bio: optionalText(record.bio, 'bio', 800),
    contactEmail: optionalEmail(record.contactEmail),
    contactPhone: optionalText(record.contactPhone, 'contactPhone', 50),
    websiteUrl: optionalUrl(record.websiteUrl, 'websiteUrl'),
    socialLinks: normalizeSocialLinks(record.socialLinks),
    brandColors: normalizeBrandColors(record.brandColors),
    logoPath: optionalText(record.logoPath, 'logoPath', 260),
    logoUrl: optionalAssetUrl(record.logoUrl, 'logoUrl'),
    coverPath: optionalText(record.coverPath, 'coverPath', 260),
    coverUrl: optionalAssetUrl(record.coverUrl, 'coverUrl'),
    isPublic: record.isPublic === true,
  };
}

export function parseOwnerBrandingBody(body: unknown):
  | { action: 'get'; ownerAccountId: string }
  | { action: 'upsert'; ownerAccountId: string; profile: unknown } {
  const record = asRecord(body);
  const action = trimmedString(record.action);
  if (action !== 'get' && action !== 'upsert') {
    throw new AppError('VALIDATION_ERROR', 'action must be get or upsert.', 400);
  }

  return {
    action,
    ownerAccountId: requireUuid(record.ownerAccountId, 'ownerAccountId'),
    ...(action === 'upsert' ? { profile: record.profile } : {}),
  } as any;
}

async function callRpc<T>(client: QueryClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc<T>(fn, args);
  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || `Could not call ${fn}.`, 500);
  }
  return data as T;
}

async function hasOwnerRole(client: QueryClient, ownerAccountId: string, userId: string, roles: string[]): Promise<boolean> {
  const result = await callRpc<boolean>(client, 'has_owner_account_role', {
    p_owner_account_id: ownerAccountId,
    p_user_id: userId,
    p_roles: roles,
  });
  return result === true;
}

async function isPlatformAdmin(client: QueryClient, userId: string): Promise<boolean> {
  const result = await callRpc<boolean>(client, 'is_platform_admin', {
    p_user_id: userId,
  });
  return result === true;
}

async function loadOwner(client: QueryClient, ownerAccountId: string): Promise<OwnerRow> {
  const { data, error } = await client
    .from('owner_accounts')
    .select('id, owner_type, name, status')
    .eq('id', ownerAccountId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load owner account.', 500);
  }
  if (!data) {
    throw new AppError('OWNER_ACCOUNT_NOT_FOUND', 'Owner account not found.', 404);
  }

  return data as OwnerRow;
}

async function assertBrandReadAccess(client: QueryClient, ownerAccountId: string, userId: string): Promise<void> {
  const [platformAdmin, hasAccess] = await Promise.all([
    isPlatformAdmin(client, userId),
    hasOwnerRole(client, ownerAccountId, userId, BRAND_READER_ROLES),
  ]);
  if (!platformAdmin && !hasAccess) {
    throw new AppError('FORBIDDEN', 'You do not have access to this owner brand profile.', 403);
  }
}

async function assertBrandWriteAccess(client: QueryClient, ownerAccountId: string, userId: string): Promise<void> {
  const [platformAdmin, hasAccess] = await Promise.all([
    isPlatformAdmin(client, userId),
    hasOwnerRole(client, ownerAccountId, userId, BRAND_EDITOR_ROLES),
  ]);
  if (!platformAdmin && !hasAccess) {
    throw new AppError('FORBIDDEN', 'You cannot edit this owner brand profile.', 403);
  }
}

function normalizeRow(owner: OwnerRow, row: BrandRow | null): OwnerBrandingProfile {
  const slug = row?.slug ?? defaultSlug(owner.name, owner.id);
  const brandColors = normalizeBrandColors(row?.brand_colors ?? DEFAULT_BRAND_COLORS);

  return {
    ownerAccountId: owner.id,
    ownerType: owner.owner_type,
    ownerStatus: owner.status,
    ownerName: owner.name,
    displayName: row?.display_name ?? owner.name,
    slug,
    bio: row?.bio ?? null,
    contactEmail: row?.contact_email ?? null,
    contactPhone: row?.contact_phone ?? null,
    websiteUrl: row?.website_url ?? null,
    socialLinks: normalizeSocialLinks(row?.social_links ?? {}),
    brandColors,
    logoPath: row?.logo_path ?? null,
    logoUrl: row?.logo_url ?? null,
    coverPath: row?.cover_path ?? null,
    coverUrl: row?.cover_url ?? null,
    isPublic: row?.is_public === true,
    publicUrlPath: slug ? `/coach/${slug}` : null,
    createdAt: row?.created_at ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

async function loadBrandProfile(client: QueryClient, owner: OwnerRow): Promise<BrandRow | null> {
  const { data, error } = await client
    .from('owner_brand_profiles')
    .select('*')
    .eq('owner_account_id', owner.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load owner brand profile.', 500);
  }

  return (data as BrandRow | null) ?? null;
}

export async function getOwnerBrandingAction(
  client: QueryClient,
  actorUserId: string,
  ownerAccountId: string
): Promise<OwnerBrandingProfile> {
  const owner = await loadOwner(client, ownerAccountId);
  await assertBrandReadAccess(client, owner.id, actorUserId);
  const row = await loadBrandProfile(client, owner);
  return normalizeRow(owner, row);
}

export async function upsertOwnerBrandingAction(
  client: QueryClient,
  actorUserId: string,
  ownerAccountId: string,
  profile: unknown
): Promise<OwnerBrandingProfile> {
  const owner = await loadOwner(client, ownerAccountId);
  await assertBrandWriteAccess(client, owner.id, actorUserId);
  const input = normalizeBrandInput(profile, owner);

  const { data, error } = await client
    .from('owner_brand_profiles')
    .upsert(
      {
        owner_account_id: owner.id,
        display_name: input.displayName,
        slug: input.slug,
        bio: input.bio,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        website_url: input.websiteUrl,
        social_links: input.socialLinks,
        brand_colors: input.brandColors,
        logo_path: input.logoPath,
        logo_url: input.logoUrl,
        cover_path: input.coverPath,
        cover_url: input.coverUrl,
        is_public: input.isPublic,
        created_by: actorUserId,
        updated_by: actorUserId,
      },
      { onConflict: 'owner_account_id' }
    )
    .select('*')
    .single();

  if (error) {
    const message = error.message || 'Could not save owner brand profile.';
    if (/duplicate key|owner_brand_profiles_slug_uidx/i.test(message)) {
      throw new AppError('VALIDATION_ERROR', 'This public slug is already in use.', 409);
    }
    throw new AppError('INTERNAL_ERROR', message, 500);
  }

  return normalizeRow(owner, data as BrandRow);
}

export async function ownerBrandingAction(client: QueryClient, actorUserId: string, body: unknown): Promise<OwnerBrandingProfile> {
  const input = parseOwnerBrandingBody(body);
  if (input.action === 'get') {
    return getOwnerBrandingAction(client, actorUserId, input.ownerAccountId);
  }

  return upsertOwnerBrandingAction(client, actorUserId, input.ownerAccountId, input.profile);
}
