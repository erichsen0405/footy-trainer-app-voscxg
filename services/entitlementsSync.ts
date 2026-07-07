import { supabase } from '@/integrations/supabase/client';
import { forceUserRoleRefresh } from '@/hooks/useUserRole';
import { bumpEntitlementsVersion } from '@/services/entitlementsEvents';

export type SubscriptionTier =
  | 'player_basic'
  | 'player_premium'
  | 'trainer_basic'
  | 'trainer_standard'
  | 'trainer_premium';

export type SyncEntitlementsSnapshotInput = {
  userId: string;
  productId: string | null;
  subscriptionTier: SubscriptionTier;
  receipt?: string | null;
  source?: string;
};

export type SyncEntitlementsSnapshotResult = {
  success: boolean;
  resolvedRole: 'player' | 'trainer';
  roleChanged: boolean;
  profileUpserted: boolean;
  ownerProvisioned: boolean;
  ownerAccountId?: string | null;
  ownerSeatStatus?: Record<string, unknown> | null;
  profileError?: string | null;
  roleError?: string | null;
  ownerSyncError?: string | null;
};

const roleFromTier = (tier: SubscriptionTier): 'player' | 'trainer' =>
  tier.startsWith('trainer') ? 'trainer' : 'player';

const formatSupabaseError = (error?: { code?: string; message?: string } | null) => {
  if (!error) return null;
  return `${error.code ?? 'UNKNOWN'}:${error.message ?? 'Unknown error'}`;
};

export async function syncEntitlementsSnapshot(
  input: SyncEntitlementsSnapshotInput,
): Promise<SyncEntitlementsSnapshotResult> {
  const { userId, productId, subscriptionTier, receipt = null, source = 'manual' } = input;
  const resolvedRole = roleFromTier(subscriptionTier);

  let profileError: string | null = null;
  let roleError: string | null = null;
  let ownerSyncError: string | null = null;
  let profileUpserted = false;
  let roleChanged = false;
  let ownerProvisioned = false;
  let ownerAccountId: string | null = null;
  let ownerSeatStatus: Record<string, unknown> | null = null;

  try {
    const payload = {
      user_id: userId,
      subscription_tier: subscriptionTier,
      subscription_product_id: productId,
      subscription_receipt: receipt,
      subscription_updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
    if (error) {
      profileError = formatSupabaseError(error);
    } else {
      profileUpserted = true;
    }
  } catch (error: any) {
    profileError = error?.message ?? 'profile-upsert-failed';
  }

  try {
    const {
      data: existingRoleRow,
      error: existingRoleError,
    } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle();

    if (existingRoleError && existingRoleError.code !== 'PGRST116') {
      roleError = formatSupabaseError(existingRoleError);
    } else {
      const currentRole = (existingRoleRow?.role as 'player' | 'trainer' | 'admin' | null) ?? null;

      const canDowngradeRole = currentRole !== 'admin' && !(currentRole === 'trainer' && resolvedRole === 'player');
      if (canDowngradeRole && currentRole !== resolvedRole) {
        const { error } = await supabase
          .from('user_roles')
          .upsert({ user_id: userId, role: resolvedRole }, { onConflict: 'user_id' });

        if (error) {
          roleError = formatSupabaseError(error);
        } else {
          roleChanged = true;
        }
      }
    }
  } catch (error: any) {
    roleError = error?.message ?? 'role-upsert-failed';
  }

  if (resolvedRole === 'trainer') {
    try {
      const { data, error } = await supabase.rpc(
        'sync_private_coach_owner_subscription' as never,
        {
          p_user_id: userId,
          p_product_id: productId,
          p_plan_code: subscriptionTier,
          p_status: 'active',
          p_expires_at: null,
          p_receipt: receipt,
          p_payload: {
            source,
            syncedFrom: 'client_entitlements_snapshot',
          },
        } as never
      );

      if (error) {
        ownerSyncError = formatSupabaseError(error);
      } else if (data && typeof data === 'object') {
        ownerSeatStatus = data as Record<string, unknown>;
        ownerAccountId = String(ownerSeatStatus.ownerAccountId ?? '') || null;
        ownerProvisioned = ownerSeatStatus.skipped !== true && Boolean(ownerAccountId);
      }
    } catch (error: any) {
      ownerSyncError = error?.message ?? 'owner-subscription-sync-failed';
    }
  }

  if (roleChanged) {
    forceUserRoleRefresh(`entitlements-sync:${source}`);
  }

  bumpEntitlementsVersion(`entitlements-sync:${source}`);

  if (__DEV__) {
    const isCreator = resolvedRole === 'trainer';
    console.log('[EntitlementsSync] Snapshot result', {
      source,
      productId,
      subscriptionTier,
      resolvedRole,
      isCreator,
      roleChanged,
      profileUpserted,
      ownerProvisioned,
      ownerAccountId,
      profileError,
      roleError,
      ownerSyncError,
    });
  }

  return {
    success: !profileError && !roleError,
    resolvedRole,
    roleChanged,
    profileUpserted,
    ownerProvisioned,
    ownerAccountId,
    ownerSeatStatus,
    profileError,
    roleError,
    ownerSyncError,
  };
}
