import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { OnboardingGate } from '@/components/OnboardingGate';

const mockReplace = jest.fn();
const mockPathname = jest.fn(() => '/(tabs)');
const mockGetUser = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockUnsubscribe = jest.fn();
const mockRefreshSubscription = jest.fn();
const mockCreateSubscription = jest.fn();
const mockRefreshSubscriptionStatus = jest.fn();
const mockMaybeSingle = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn();
let consoleWarnSpy: jest.SpyInstance;
let authStateHandler: ((event: string, session: { user: any } | null) => void) | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname(),
}));

jest.mock('@/components/AppleSubscriptionManager', () => 'AppleSubscriptionManager');
jest.mock('@/components/SubscriptionManager', () => 'SubscriptionManager');

jest.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => ({
    subscriptionStatus: null,
    refreshSubscription: mockRefreshSubscription,
    createSubscription: mockCreateSubscription,
  }),
}));

jest.mock('@/contexts/AppleIAPContext', () => ({
  PRODUCT_IDS: {
    PLAYER_BASIC: 'player_basic',
    PLAYER_PREMIUM: 'player_premium',
  },
  TRAINER_PRODUCT_IDS: ['trainer_basic'],
  useAppleIAP: () => ({
    entitlementSnapshot: {
      resolving: false,
      isEntitled: false,
      hasActiveSubscription: false,
    },
    refreshSubscriptionStatus: mockRefreshSubscriptionStatus,
  }),
}));

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

describe('OnboardingGate startup hydration', () => {
  beforeEach(() => {
    jest.useFakeTimers();

    mockReplace.mockReset();
    mockPathname.mockReset();
    mockGetUser.mockReset();
    mockOnAuthStateChange.mockReset();
    mockUnsubscribe.mockReset();
    mockRefreshSubscription.mockReset();
    mockCreateSubscription.mockReset();
    mockRefreshSubscriptionStatus.mockReset();
    mockMaybeSingle.mockReset();
    mockEq.mockReset();
    mockSelect.mockReset();
    mockUpsert.mockReset();
    mockFrom.mockReset();

    mockPathname.mockReturnValue('/(tabs)');
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockRefreshSubscription.mockResolvedValue(null);
    mockCreateSubscription.mockResolvedValue({ success: true });
    mockRefreshSubscriptionStatus.mockResolvedValue(null);
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockMaybeSingle.mockResolvedValue({ data: null });
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockUpsert.mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue({
      select: mockSelect,
      upsert: mockUpsert,
    });

    authStateHandler = null;
    mockOnAuthStateChange.mockImplementation((handler: (event: string, session: { user: any } | null) => void) => {
      authStateHandler = handler;
      return {
        data: { subscription: { unsubscribe: mockUnsubscribe } },
      };
    });
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('shows error + retry instead of permanent "Klargører konto" when init hangs', async () => {
    mockGetUser.mockImplementation(() => new Promise(() => {}));

    render(
      <OnboardingGate>
        <Text>App indhold</Text>
      </OnboardingGate>
    );

    expect(screen.getByText('Klargører konto')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(12000);
      await Promise.resolve();
    });

    expect(screen.getByText('Kunne ikke klargøre konto. Prøv igen.')).toBeTruthy();
    expect(screen.getByTestId('onboarding.error.retryButton')).toBeTruthy();
    expect(screen.queryByText('Klargører konto')).toBeNull();
    fireEvent.press(screen.getByTestId('onboarding.error.retryButton'));
    expect(mockGetUser.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('does not overwrite newer hydrated state when bootstrap times out later', async () => {
    mockGetUser.mockImplementation(() => new Promise(() => {}));

    render(
      <OnboardingGate>
        <Text>App indhold</Text>
      </OnboardingGate>
    );

    expect(screen.getByText('Klargører konto')).toBeTruthy();

    await act(async () => {
      await Promise.resolve();
    });
    expect(authStateHandler).toBeTruthy();

    await act(async () => {
      authStateHandler?.('INITIAL_SESSION', { user: null });
      await Promise.resolve();
    });

    expect(screen.queryByText('Klargører konto')).toBeNull();
    expect(screen.queryByText('Kunne ikke klargøre konto. Prøv igen.')).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(12000);
      await Promise.resolve();
    });

    expect(screen.queryByText('Kunne ikke klargøre konto. Prøv igen.')).toBeNull();
    expect(screen.queryByTestId('onboarding.error.retryButton')).toBeNull();
  });
});
