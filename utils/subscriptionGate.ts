type SubscriptionStatusLike = {
  hasSubscription?: boolean;
  subscriptionTier?: string | null;
  isLifetime?: boolean;
  status?: string | null;
  planName?: string | null;
};

type EntitlementSnapshotLike = {
  resolving?: boolean;
  isEntitled?: boolean;
  hasActiveSubscription?: boolean;
  isAuthoritative?: boolean;
  isAuthoritativelyUnsubscribed?: boolean;
};

type SubscriptionGateInput = {
  user: any | null;
  subscriptionStatus?: SubscriptionStatusLike | null;
  entitlementSnapshot?: EntitlementSnapshotLike | null;
};

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

export const getSubscriptionGateState = ({
  user,
  subscriptionStatus,
  entitlementSnapshot,
}: SubscriptionGateInput) => {
  const normalizedStatus = (subscriptionStatus?.status ?? '').toLowerCase();
  const statusImpliesActive =
    normalizedStatus === 'active' ||
    normalizedStatus === 'trial' ||
    normalizedStatus === 'trialing' ||
    normalizedStatus === 'lifetime';
  const hasBackendSubscription = Boolean(
    subscriptionStatus?.hasSubscription ||
      subscriptionStatus?.subscriptionTier ||
      subscriptionStatus?.isLifetime ||
      statusImpliesActive ||
      hasMeaningfulPlanName(subscriptionStatus?.planName)
  );
  const hasActiveEntitlement = Boolean(
    entitlementSnapshot?.isEntitled || entitlementSnapshot?.hasActiveSubscription
  );
  const hasActiveSubscription = hasBackendSubscription || hasActiveEntitlement;
  const isResolving = Boolean(entitlementSnapshot?.resolving);
  const hasAuthoritativeNoSubscription = Boolean(
    entitlementSnapshot?.isAuthoritativelyUnsubscribed
  );
  const hasAuthoritativeSignals = Boolean(
    entitlementSnapshot &&
      ('isAuthoritative' in entitlementSnapshot ||
        'isAuthoritativelyUnsubscribed' in entitlementSnapshot)
  );
  const shouldShowChooseSubscription = Boolean(
    user &&
      !isResolving &&
      !hasActiveSubscription &&
      (hasAuthoritativeSignals ? hasAuthoritativeNoSubscription : true)
  );

  return {
    hasBackendSubscription,
    hasActiveEntitlement,
    hasActiveSubscription,
    isResolving,
    hasAuthoritativeNoSubscription,
    shouldShowChooseSubscription,
  };
};
