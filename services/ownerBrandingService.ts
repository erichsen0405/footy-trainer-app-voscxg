import { FunctionsHttpError } from '@supabase/functions-js';
import { supabase } from '@/integrations/supabase/client';

export type OwnerBrandingOwnerType = 'club' | 'private_coach_business';

export interface OwnerBrandingProfile {
  ownerAccountId: string;
  ownerType: OwnerBrandingOwnerType;
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
}

export interface OwnerBrandingInput {
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
}

type OwnerBrandingEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string | { code?: string; message?: string };
};

function normalizeErrorBody(body: unknown): string | null {
  const payload = body as OwnerBrandingEnvelope<unknown> | null;
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.error === 'string') return payload.error;
  if (payload.error?.message) return payload.error.message;
  return null;
}

async function extractFunctionError(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError && error.context) {
    try {
      const body = await error.context.clone().json();
      return normalizeErrorBody(body) || fallback;
    } catch {
      return fallback;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

async function invokeOwnerBranding<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manageOwnerBranding', { body });

  if (error) {
    throw new Error(await extractFunctionError(error, 'Could not complete the brand action.'));
  }

  const envelope = data as OwnerBrandingEnvelope<T> | T | null;
  if (envelope && typeof envelope === 'object' && 'success' in envelope) {
    const typedEnvelope = envelope as OwnerBrandingEnvelope<T>;
    if (typedEnvelope.success === false) {
      throw new Error(normalizeErrorBody(typedEnvelope) || 'Could not complete the brand action.');
    }
    if (typedEnvelope.data !== undefined) {
      return typedEnvelope.data;
    }
  }

  return envelope as T;
}

export function fetchOwnerBranding(ownerAccountId: string): Promise<OwnerBrandingProfile> {
  return invokeOwnerBranding<OwnerBrandingProfile>({
    action: 'get',
    ownerAccountId,
  });
}

export function saveOwnerBranding(args: {
  ownerAccountId: string;
  profile: OwnerBrandingInput;
}): Promise<OwnerBrandingProfile> {
  return invokeOwnerBranding<OwnerBrandingProfile>({
    action: 'upsert',
    ownerAccountId: args.ownerAccountId,
    profile: args.profile,
  });
}
