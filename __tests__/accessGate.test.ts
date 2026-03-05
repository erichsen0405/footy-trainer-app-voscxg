import { resolveSubscriptionAccessState } from '@/utils/accessGate';

describe('resolveSubscriptionAccessState', () => {
  it('returns granted when user has backend lifetime access', () => {
    const result = resolveSubscriptionAccessState({
      user: { id: 'u1' },
      subscriptionStatus: { isLifetime: true, hasSubscription: false, status: 'lifetime' },
      subscriptionMeta: { backendAuthoritative: true },
      entitlementSnapshot: { resolving: false, isAuthoritativelyUnsubscribed: true },
    });

    expect(result.accessState).toBe('granted');
    expect(result.hasActiveSubscription).toBe(true);
  });

  it('returns granted when backend only exposes a meaningful plan name', () => {
    const result = resolveSubscriptionAccessState({
      user: { id: 'u1' },
      subscriptionStatus: {
        hasSubscription: false,
        subscriptionTier: null,
        isLifetime: false,
        status: null,
        planName: 'Livstid',
      },
      subscriptionMeta: { backendAuthoritative: true },
      entitlementSnapshot: { resolving: false, isAuthoritativelyUnsubscribed: true },
    });

    expect(result.accessState).toBe('granted');
    expect(result.hasActiveSubscription).toBe(true);
  });

  it('returns grace when iap says no subscription but backend is not authoritative yet', () => {
    const result = resolveSubscriptionAccessState({
      user: { id: 'u1' },
      subscriptionStatus: null,
      subscriptionMeta: { backendAuthoritative: false },
      entitlementSnapshot: { resolving: false, isAuthoritativelyUnsubscribed: true },
    });

    expect(result.accessState).toBe('grace');
  });

  it('returns denied_authoritative only when both iap and backend are authoritative negative', () => {
    const result = resolveSubscriptionAccessState({
      user: { id: 'u1' },
      subscriptionStatus: {
        hasSubscription: false,
        subscriptionTier: null,
        isLifetime: false,
        status: 'canceled',
        planName: null,
      },
      subscriptionMeta: { backendAuthoritative: true },
      entitlementSnapshot: { resolving: false, isAuthoritativelyUnsubscribed: true },
    });

    expect(result.accessState).toBe('denied_authoritative');
  });
});
