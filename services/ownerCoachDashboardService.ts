import { FunctionsHttpError } from '@supabase/functions-js';
import { supabase } from '@/integrations/supabase/client';
import type {
  OwnerCoachDashboardActivity,
  OwnerCoachDashboardAlert,
  OwnerCoachDashboardPayload,
  OwnerCoachDashboardPlayer,
  OwnerCoachDashboardTag,
  OwnerCoachDashboardTeam,
} from '@/supabase/functions/_shared/ownerCoachDashboard';

export type {
  OwnerCoachDashboardActivity,
  OwnerCoachDashboardAlert,
  OwnerCoachDashboardPayload,
  OwnerCoachDashboardPlayer,
  OwnerCoachDashboardTag,
  OwnerCoachDashboardTeam,
};

type OwnerCoachDashboardEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string | { code?: string; message?: string };
};

function normalizeErrorBody(body: unknown): string | null {
  const payload = body as OwnerCoachDashboardEnvelope<unknown> | null;
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.error === 'string') return payload.error;
  if (payload.error?.message) return payload.error.message;
  if (payload.error?.code) return payload.error.code;
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

export async function fetchOwnerCoachDashboard(args: {
  ownerAccountId: string;
  now?: string;
}): Promise<OwnerCoachDashboardPayload> {
  const body: { ownerAccountId: string; now?: string } = {
    ownerAccountId: args.ownerAccountId,
  };

  if (args.now) {
    body.now = args.now;
  }

  const { data, error } = await supabase.functions.invoke('getOwnerCoachDashboard', { body });

  if (error) {
    throw new Error(await extractFunctionError(error, 'Could not load the coach dashboard.'));
  }

  const envelope = data as OwnerCoachDashboardEnvelope<OwnerCoachDashboardPayload> | OwnerCoachDashboardPayload | null;
  if (envelope && typeof envelope === 'object' && 'success' in envelope) {
    const typedEnvelope = envelope as OwnerCoachDashboardEnvelope<OwnerCoachDashboardPayload>;
    if (typedEnvelope.success === false) {
      throw new Error(normalizeErrorBody(typedEnvelope) || 'Could not load the coach dashboard.');
    }
    if (typedEnvelope.data !== undefined) {
      return typedEnvelope.data;
    }
  }

  return envelope as OwnerCoachDashboardPayload;
}
