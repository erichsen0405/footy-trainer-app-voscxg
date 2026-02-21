import { featureAccessForTier, MAX_PLAYERS_BY_TIER } from '@/hooks/useSubscriptionFeatures';

jest.mock('@/contexts/AppleIAPContext', () => ({
  useAppleIAP: () => ({
    entitlementSnapshot: {
      subscriptionTier: null,
      hasActiveSubscription: false,
      resolving: false,
    },
  }),
}));

describe('subscription tier feature mapping', () => {
  it('locks all premium features for null tier', () => {
    expect(featureAccessForTier(null)).toEqual({
      library: false,
      calendarSync: false,
      trainerLinking: false,
    });
  });

  it('locks all premium features for player_basic', () => {
    expect(featureAccessForTier('player_basic')).toEqual({
      library: false,
      calendarSync: false,
      trainerLinking: false,
    });
  });

  it('unlocks premium features for player_premium', () => {
    expect(featureAccessForTier('player_premium')).toEqual({
      library: true,
      calendarSync: true,
      trainerLinking: true,
    });
  });

  it('unlocks premium features for trainer_basic', () => {
    expect(featureAccessForTier('trainer_basic')).toEqual({
      library: true,
      calendarSync: true,
      trainerLinking: true,
    });
  });

  it('unlocks premium features for trainer_premium', () => {
    expect(featureAccessForTier('trainer_premium')).toEqual({
      library: true,
      calendarSync: true,
      trainerLinking: true,
    });
  });

  it('maps player tiers to single-player limit', () => {
    expect(MAX_PLAYERS_BY_TIER.player_basic).toBe(1);
    expect(MAX_PLAYERS_BY_TIER.player_premium).toBe(1);
  });

  it('maps trainer tiers to expected player limits', () => {
    expect(MAX_PLAYERS_BY_TIER.trainer_basic).toBe(5);
    expect(MAX_PLAYERS_BY_TIER.trainer_standard).toBe(15);
    expect(MAX_PLAYERS_BY_TIER.trainer_premium).toBe(50);
  });
});
