import { supabase } from '@/integrations/supabase/client';

export type CurrentOwnerBrandingSource = 'staff' | 'player' | 'guardian';

export interface CurrentOwnerBrandingProfile {
  ownerType: 'club' | 'private_coach_business';
  ownerName: string;
  displayName: string;
  slug: string | null;
  bio: string | null;
  brandColors: {
    primary: string;
    accent: string;
  };
  logoUrl: string | null;
  coverUrl: string | null;
  isPublic: boolean;
  source: CurrentOwnerBrandingSource;
  updatedAt: string | null;
}

const DEFAULT_BRAND_COLORS = {
  primary: '#162634',
  accent: '#4CAF50',
};

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeBrandColors(value: unknown): CurrentOwnerBrandingProfile['brandColors'] {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return {
    primary: normalizeString(record.primary) ?? DEFAULT_BRAND_COLORS.primary,
    accent: normalizeString(record.accent) ?? DEFAULT_BRAND_COLORS.accent,
  };
}

function normalizeCurrentOwnerBranding(value: unknown): CurrentOwnerBrandingProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const displayName = normalizeString(record.displayName) ?? normalizeString(record.ownerName);
  const ownerName = normalizeString(record.ownerName) ?? displayName;
  const source = normalizeString(record.source) as CurrentOwnerBrandingSource | null;

  if (!displayName || !ownerName || (source !== 'staff' && source !== 'player' && source !== 'guardian')) {
    return null;
  }

  return {
    ownerType: record.ownerType === 'club' ? 'club' : 'private_coach_business',
    ownerName,
    displayName,
    slug: normalizeString(record.slug),
    bio: normalizeString(record.bio),
    brandColors: normalizeBrandColors(record.brandColors),
    logoUrl: normalizeString(record.logoUrl),
    coverUrl: normalizeString(record.coverUrl),
    isPublic: record.isPublic === true,
    source,
    updatedAt: normalizeString(record.updatedAt),
  };
}

export async function fetchCurrentOwnerBranding(): Promise<CurrentOwnerBrandingProfile | null> {
  const { data, error } = await supabase.rpc('get_current_owner_brand_profile' as never);

  if (error) {
    throw new Error(error.message || 'Could not load owner branding.');
  }

  return normalizeCurrentOwnerBranding(data);
}
