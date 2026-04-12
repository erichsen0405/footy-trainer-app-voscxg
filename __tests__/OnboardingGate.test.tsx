import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { OnboardingGate } from '@/components/OnboardingGate';
import { TimeoutError } from '@/utils/withTimeout';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockReplace = jest.fn();
const mockPathname = jest.fn(() => '/(tabs)');
const mockRefreshAuthSession = jest.fn();
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
let mockAuthSessionValue: any;
let consoleWarnSpy: jest.SpyInstance;

const setMockAuthSession = ({
  authReady = true,
  user = null,
  refreshSession,
}: {
  authReady?: boolean;
  user?: { id: string } | null;
  refreshSession?: jest.Mock<any, any>;
} = {}) => {
  const session = user ? { user } : null;
  mockAuthSessionValue = {
    authReady,
    isAuthenticated: Boolean(user),
    session,
    user,
    refreshSession: refreshSession ?? mockRefreshAuthSession,
  };
};

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

jest.mock('@/contexts/AuthSessionContext', () => ({
  useAuthSession: () => mockAuthSessionValue,
}));

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

describe('OnboardingGate startup hydration', () => {
  beforeEach(() => {
    jest.useFakeTimers();

    mockReplace.mockReset();
    mockPathname.mockReset();
    mockRefreshAuthSession.mockReset();
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
    mockRefreshAuthSession.mockResolvedValue(null);
    setMockAuthSession({ authReady: true, user: null });
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
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('falls back to non-blocking state when startup session lookup times out', async () => {
    setMockAuthSession({ authReady: true, user: { id: 'user-1' } });
    mockMaybeSingle.mockImplementation(() => new Promise(() => {}));

    render(
      <OnboardingGate>
        <Text>App indhold</Text>
      </OnboardingGate>
    );

    expect(screen.getByText('App indhold')).toBeTruthy();
    expect(screen.queryByText('Klargører konto')).toBeNull();

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
    setMockAuthSession({ authReady: true, user: { id: 'user-1' } });
    mockMaybeSingle.mockImplementation(() => new Promise(() => {}));
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({
        userId: 'user-1',
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
  });

  it('does not overwrite newer hydrated state when bootstrap times out later', async () => {
    setMockAuthSession({ authReady: true, user: { id: 'user-1' } });
    mockMaybeSingle.mockImplementation(() => new Promise(() => {}));

    const { rerender } = render(
      <OnboardingGate>
        <Text>App indhold</Text>
      </OnboardingGate>
    );

    expect(screen.getByText('App indhold')).toBeTruthy();
    expect(screen.queryByText('Klargører konto')).toBeNull();

    await act(async () => {
      setMockAuthSession({ authReady: true, user: null });
      rerender(
        <OnboardingGate>
          <Text>App indhold</Text>
        </OnboardingGate>
      );
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
    setMockAuthSession({ authReady: true, user: { id: 'user-1' } });
    mockMaybeSingle.mockRejectedValue(new Error('initial startup failed'));
    mockRefreshAuthSession.mockImplementation(() => new Promise(() => {}));

    const { rerender } = render(
      <OnboardingGate>
        <Text>App indhold</Text>
      </OnboardingGate>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('onboarding.error.retryButton')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('onboarding.error.retryButton'));
      await Promise.resolve();
    });

    await act(async () => {
      setMockAuthSession({ authReady: true, user: null });
      rerender(
        <OnboardingGate>
          <Text>App indhold</Text>
        </OnboardingGate>
      );
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
    setMockAuthSession({ authReady: true, user: { id: 'user-1' } });
    mockMaybeSingle.mockRejectedValue(new TimeoutError('Onboarding role query timed out'));

    render(
      <OnboardingGate>
        <Text>App indhold</Text>
      </OnboardingGate>
    );

    expect(screen.getByText('App indhold')).toBeTruthy();
    expect(screen.queryByText('Klargører konto')).toBeNull();

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
