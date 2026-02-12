import { getSubscriptionGateState } from '@/utils/subscriptionGate';

describe('subscription gate state', () => {
  it('keeps gate closed when no user exists', () => {
    const state = getSubscriptionGateState({ user: null });
    expect(state.shouldShowChooseSubscription).toBe(false);
    expect(state.hasActiveSubscription).toBe(false);
  });

  it('keeps gate closed while entitlements are resolving', () => {
    const state = getSubscriptionGateState({
      user: { id: 'u1' },
      entitlementSnapshot: { resolving: true },
    });
    expect(state.isResolving).toBe(true);
    expect(state.shouldShowChooseSubscription).toBe(false);
  });

  it('opens gate for logged in user without active plan', () => {
    const state = getSubscriptionGateState({ user: { id: 'u1' } });
    expect(state.hasActiveSubscription).toBe(false);
    expect(state.shouldShowChooseSubscription).toBe(true);
  });

  it('treats backend hasSubscription as active', () => {
    const state = getSubscriptionGateState({
      user: { id: 'u1' },
      subscriptionStatus: { hasSubscription: true },
    });
    expect(state.hasBackendSubscription).toBe(true);
    expect(state.hasActiveSubscription).toBe(true);
    expect(state.shouldShowChooseSubscription).toBe(false);
  });

  it('treats backend subscriptionTier as active', () => {
    const state = getSubscriptionGateState({
      user: { id: 'u1' },
      subscriptionStatus: { subscriptionTier: 'trainer_basic' },
    });
    expect(state.hasBackendSubscription).toBe(true);
    expect(state.hasActiveSubscription).toBe(true);
  });

  it('treats lifetime status as active regardless of flags', () => {
    const state = getSubscriptionGateState({
      user: { id: 'u1' },
      subscriptionStatus: { status: 'lifetime' },
    });
    expect(state.hasBackendSubscription).toBe(true);
    expect(state.shouldShowChooseSubscription).toBe(false);
  });

  it('normalizes uppercase status when evaluating active state', () => {
    const state = getSubscriptionGateState({
      user: { id: 'u1' },
      subscriptionStatus: { status: 'ACTIVE' },
    });
    expect(state.hasBackendSubscription).toBe(true);
  });

  it('accepts entitlement snapshot isEntitled as active', () => {
    const state = getSubscriptionGateState({
      user: { id: 'u1' },
      entitlementSnapshot: { isEntitled: true },
    });
    expect(state.hasActiveEntitlement).toBe(true);
    expect(state.hasActiveSubscription).toBe(true);
  });

  it('accepts entitlement snapshot hasActiveSubscription as active', () => {
    const state = getSubscriptionGateState({
      user: { id: 'u1' },
      entitlementSnapshot: { hasActiveSubscription: true },
    });
    expect(state.hasActiveEntitlement).toBe(true);
    expect(state.shouldShowChooseSubscription).toBe(false);
  });

  it('keeps inactive canceled status locked when no entitlements exist', () => {
    const state = getSubscriptionGateState({
      user: { id: 'u1' },
      subscriptionStatus: { status: 'canceled' },
      entitlementSnapshot: { isEntitled: false, hasActiveSubscription: false },
    });
    expect(state.hasBackendSubscription).toBe(false);
    expect(state.hasActiveSubscription).toBe(false);
    expect(state.shouldShowChooseSubscription).toBe(true);
  });
});

