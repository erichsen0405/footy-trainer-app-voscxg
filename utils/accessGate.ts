import { getSubscriptionGateState } from '@/utils/subscriptionGate';

type SubscriptionStatusLike = {
  hasSubscription?: boolean;
  subscriptionTier?: string | null;
  isLifetime?: boolean;
  status?: string | null;
  planName?: string | null;
};

type SubscriptionMetaLike = {
  backendAuthoritative?: boolean | null;
};

type EntitlementSnapshotLike = {
  resolving?: boolean;
  isAuthoritativelyUnsubscribed?: boolean;
};

type ResolveAccessInput = {
  user: any | null;
  subscriptionStatus?: SubscriptionStatusLike | null;
  subscriptionMeta?: SubscriptionMetaLike | null;
  entitlementSnapshot?: EntitlementSnapshotLike | null;
};

export type AccessState = 'granted' | 'grace' | 'denied_authoritative';

const NO_PLAN_NAME_VALUES = new Set([
  'none',
  '(none)',
  'no_plan',
  'no_subscription',
  'unknown',
  'ukendt',
  'unsubscribed',
  'null',
  'undefined',
]);

const hasMeaningfulPlanName = (planName?: string | null): boolean => {
  const normalized = String(planName ?? '').trim().toLowerCase();
  if (!normalized.length) return false;
  return !NO_PLAN_NAME_VALUES.has(normalized);
};

const backendHasActiveSubscription = (
  subscriptionStatus?: SubscriptionStatusLike | null,
): boolean => {
  const normalizedStatus = (subscriptionStatus?.status ?? '').toLowerCase();
  const statusImpliesActive =
    normalizedStatus === 'active' ||
    normalizedStatus === 'trial' ||
    normalizedStatus === 'trialing' ||
    normalizedStatus === 'lifetime';

  return Boolean(
    subscriptionStatus?.hasSubscription ||
      subscriptionStatus?.subscriptionTier ||
      subscriptionStatus?.isLifetime ||
      statusImpliesActive ||
      hasMeaningfulPlanName(subscriptionStatus?.planName),
  );
};

export const resolveSubscriptionAccessState = ({
  user,
  subscriptionStatus,
  subscriptionMeta,
  entitlementSnapshot,
}: ResolveAccessInput): {
  accessState: AccessState;
  hasActiveSubscription: boolean;
  hasAuthoritativeIapNoSubscription: boolean;
  hasAuthoritativeBackendNoSubscription: boolean;
} => {
  const gateState = getSubscriptionGateState({
    user,
    subscriptionStatus,
    entitlementSnapshot,
  });

  const hasAuthoritativeIapNoSubscription = Boolean(
    entitlementSnapshot?.isAuthoritativelyUnsubscribed,
  );
  const hasAuthoritativeBackendNoSubscription = Boolean(
    subscriptionMeta?.backendAuthoritative &&
      subscriptionStatus &&
      !backendHasActiveSubscription(subscriptionStatus),
  );

  if (!user) {
    return {
      accessState: 'granted',
      hasActiveSubscription: gateState.hasActiveSubscription,
      hasAuthoritativeIapNoSubscription,
      hasAuthoritativeBackendNoSubscription,
    };
  }

  if (gateState.isResolving) {
    return {
      accessState: 'grace',
      hasActiveSubscription: gateState.hasActiveSubscription,
      hasAuthoritativeIapNoSubscription,
      hasAuthoritativeBackendNoSubscription,
    };
  }

  if (gateState.hasActiveSubscription) {
    return {
      accessState: 'granted',
      hasActiveSubscription: gateState.hasActiveSubscription,
      hasAuthoritativeIapNoSubscription,
      hasAuthoritativeBackendNoSubscription,
    };
  }

  if (
    hasAuthoritativeIapNoSubscription &&
    hasAuthoritativeBackendNoSubscription
  ) {
    return {
      accessState: 'denied_authoritative',
      hasActiveSubscription: gateState.hasActiveSubscription,
      hasAuthoritativeIapNoSubscription,
      hasAuthoritativeBackendNoSubscription,
    };
  }

  return {
    accessState: 'grace',
    hasActiveSubscription: gateState.hasActiveSubscription,
    hasAuthoritativeIapNoSubscription,
    hasAuthoritativeBackendNoSubscription,
  };
};
