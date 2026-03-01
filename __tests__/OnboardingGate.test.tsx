import React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { OnboardingGate } from '@/components/OnboardingGate';
import { TimeoutError } from '@/utils/withTimeout';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockReplace = jest.fn();
const mockPathname = jest.fn(() => '/(tabs)');
const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockUnsubscribe = jest.fn();
const mockRefreshSubscription = jest.fn();
const mockCreateSubscription = jest.fn();
const mockRefreshSubscriptionStatus = jest.fn();
const mockEntitlementSnapshot = {
  resolving: false,
  isEntitled: false,
  hasActiveSubscription: false,
};
const mockMaybeSingle = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn();
let consoleWarnSpy: jest.SpyInstance;
let authStateHandler: ((event: string, session: { user: any } | null) => void) | null = null;

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

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
    entitlementSnapshot: mockEntitlementSnapshot,
    refreshSubscriptionStatus: mockRefreshSubscriptionStatus,
  }),
}));

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
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
    mockGetSession.mockReset();
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
    (AsyncStorage.getItem as jest.Mock).mockReset();
    (AsyncStorage.setItem as jest.Mock).mockReset();
    (AsyncStorage.removeItem as jest.Mock).mockReset();

    mockPathname.mockReturnValue('/(tabs)');
    mockGetSession.mockResolvedValue({ data: { session: null } });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(null);
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

  it('falls back to non-blocking state when startup session lookup times out', async () => {
    mockGetSession.mockImplementation(() => new Promise(() => {}));

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

    expect(screen.getByText('App indhold')).toBeTruthy();
    expect(screen.queryByText('Kunne ikke klargøre konto. Prøv igen.')).toBeNull();
    expect(screen.queryByTestId('onboarding.error.retryButton')).toBeNull();
    expect(screen.queryByText('Klargører konto')).toBeNull();
  });

  it('uses cached approved access when startup session lookup times out', async () => {
    mockGetSession.mockImplementation(() => new Promise(() => {}));
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({
        userId: 'cached-user-1',
        role: 'player',
        hasApprovedAccess: true,
        updatedAt: '2026-03-01T00:00:00.000Z',
      })
    );

    render(
      <OnboardingGate>
        <Text>App indhold</Text>
      </OnboardingGate>
    );

    await act(async () => {
      jest.advanceTimersByTime(12000);
      await Promise.resolve();
    });

    expect(screen.getByText('App indhold')).toBeTruthy();
    expect(screen.queryByText('Kunne ikke klargøre konto. Prøv igen.')).toBeNull();
    expect(AsyncStorage.getItem).toHaveBeenCalled();
  });

  it('does not overwrite newer hydrated state when bootstrap times out later', async () => {
    mockGetSession.mockImplementation(() => new Promise(() => {}));

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

  it('does not overwrite newer hydrated state when retry times out later', async () => {
    mockGetSession.mockImplementation(() => new Promise(() => {}));

    render(
      <OnboardingGate>
        <Text>App indhold</Text>
      </OnboardingGate>
    );

    await act(async () => {
      jest.advanceTimersByTime(12000);
      await Promise.resolve();
    });

    expect(screen.queryByTestId('onboarding.error.retryButton')).toBeNull();
    expect(screen.queryByText('Klargører konto')).toBeNull();

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

  it('falls back to non-blocking state when role lookup times out', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
    mockMaybeSingle.mockRejectedValue(new TimeoutError('Onboarding role query timed out'));

    render(
      <OnboardingGate>
        <Text>App indhold</Text>
      </OnboardingGate>
    );

    expect(screen.getByText('Klargører konto')).toBeTruthy();

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText('App indhold')).toBeTruthy();
    expect(screen.queryByText('Kunne ikke klargøre konto. Prøv igen.')).toBeNull();
    expect(screen.queryByTestId('onboarding.error.retryButton')).toBeNull();
    expect(screen.queryByText('Klargører konto')).toBeNull();
  });
});
