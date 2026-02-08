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
};

type SubscriptionGateInput = {
  user: any | null;
  subscriptionStatus?: SubscriptionStatusLike | null;
  entitlementSnapshot?: EntitlementSnapshotLike | null;
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
      statusImpliesActive
  );
  const hasActiveEntitlement = Boolean(
    entitlementSnapshot?.isEntitled || entitlementSnapshot?.hasActiveSubscription
  );
  const hasActiveSubscription = hasBackendSubscription || hasActiveEntitlement;
  const isResolving = Boolean(entitlementSnapshot?.resolving);
  const shouldShowChooseSubscription = Boolean(user && !isResolving && !hasActiveSubscription);

  return {
    hasBackendSubscription,
    hasActiveEntitlement,
    hasActiveSubscription,
    isResolving,
    shouldShowChooseSubscription,
  };
};
