import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import ProfileScreen from '@/app/(tabs)/profile';

const mockCheckNotificationPermissions = jest.fn();
const mockRequestNotificationPermissions = jest.fn();
const mockOpenNotificationSettings = jest.fn();

const mockLoadOverdueReminderSettings = jest.fn();
const mockPersistOverdueReminderSettings = jest.fn();
const mockCancelOverdueReminderNotifications = jest.fn();
const mockRescheduleOverdueReminderNotifications = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: jest.fn(),
    push: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: any) => callback(),
}));

jest.mock('@/components/IconSymbol', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    IconSymbol: () => <Text>icon</Text>,
  };
});

jest.mock('@/components/PremiumFeatureGate', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    PremiumFeatureGate: () => <View />,
  };
});

jest.mock('@/components/ExternalCalendarManager', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => <View />,
  };
});

jest.mock('@/components/SubscriptionManager', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => <View />,
  };
});

jest.mock('@/components/AppleSubscriptionManager', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => <View />,
  };
});

jest.mock('@/components/CreatePlayerModal', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => <View />,
  };
});

jest.mock('@/components/PlayersList', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => <View />,
  };
});

jest.mock('@/components/TeamManagement', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => <View />,
  };
});

jest.mock('@/components/ui/DropdownSelect', () => {
  const React = jest.requireActual('react');
  const { TouchableOpacity, Text } = jest.requireActual('react-native');
  return {
    DropdownSelect: ({ label, testIDPrefix }: { label?: string; testIDPrefix?: string }) => (
      <TouchableOpacity testID={`${testIDPrefix}.button`}>
        <Text>{label ?? 'dropdown'}</Text>
      </TouchableOpacity>
    ),
  };
});

jest.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => ({
    subscriptionStatus: null,
    refreshSubscription: jest.fn(),
    createSubscription: jest.fn(),
    loading: false,
  }),
}));

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => ({
    refreshAll: jest.fn(),
    activities: [],
  }),
}));

jest.mock('@/hooks/useSubscriptionFeatures', () => ({
  useSubscriptionFeatures: () => ({
    featureAccess: { calendarSync: true, trainerLinking: true },
    isLoading: false,
  }),
}));

jest.mock('@/hooks/useUserRole', () => ({
  forceUserRoleRefresh: jest.fn(),
}));

jest.mock('@/contexts/AppleIAPContext', () => ({
  PRODUCT_IDS: { PLAYER_PREMIUM: 'player-premium' },
  useAppleIAP: () => ({
    entitlementSnapshot: null,
    refreshSubscriptionStatus: jest.fn(),
    loading: false,
    iapReady: true,
    iapUnavailableReason: null,
    isRestoring: false,
    products: [],
  }),
}));

jest.mock('@/utils/subscriptionGate', () => ({
  getSubscriptionGateState: () => ({
    shouldShowChooseSubscription: false,
    hasActiveSubscription: false,
  }),
}));

jest.mock('@/utils/deleteExternalActivities', () => ({
  deleteAllExternalActivities: jest.fn(),
}));

jest.mock('@/utils/pushTokenService', () => ({
  syncPushTokenForCurrentUser: jest.fn(),
}));

jest.mock('@/utils/notificationService', () => ({
  checkNotificationPermissions: (...args: any[]) => mockCheckNotificationPermissions(...args),
  requestNotificationPermissions: (...args: any[]) => mockRequestNotificationPermissions(...args),
  openNotificationSettings: (...args: any[]) => mockOpenNotificationSettings(...args),
}));

jest.mock('@/utils/overdueReminderScheduler', () => {
  const actual = jest.requireActual('@/utils/overdueReminderScheduler');
  return {
    ...actual,
    loadOverdueReminderSettings: (...args: any[]) => mockLoadOverdueReminderSettings(...args),
    persistOverdueReminderSettings: (...args: any[]) => mockPersistOverdueReminderSettings(...args),
    cancelOverdueReminderNotifications: (...args: any[]) => mockCancelOverdueReminderNotifications(...args),
    rescheduleOverdueReminderNotifications: (...args: any[]) => mockRescheduleOverdueReminderNotifications(...args),
  };
});

jest.mock('@/integrations/supabase/client', () => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    update: () => builder,
    insert: () => builder,
    upsert: () => builder,
    delete: () => builder,
    order: () => builder,
    limit: () => builder,
  };

  return {
    supabase: {
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'user-1', email: 'test@example.com' } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
        signUp: jest.fn(),
        signInWithPassword: jest.fn(),
        signOut: jest.fn(),
      },
      from: () => builder,
      channel: () => ({
        on: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      }),
      removeChannel: () => Promise.resolve(),
    },
  };
});

describe('profile overdue reminder settings', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockLoadOverdueReminderSettings.mockResolvedValue({
      enabled: false,
      startTimeMinutes: 8 * 60,
      intervalMinutes: 120,
      scheduledNotificationIds: [],
    });
    mockPersistOverdueReminderSettings.mockResolvedValue(undefined);
    mockCancelOverdueReminderNotifications.mockResolvedValue(undefined);
    mockRescheduleOverdueReminderNotifications.mockResolvedValue(['first-id', 'repeat-id']);

    mockCheckNotificationPermissions.mockResolvedValue(true);
    mockRequestNotificationPermissions.mockResolvedValue(true);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('shows section and reveals time + interval rows when toggle is enabled', async () => {
    const screen = render(<ProfileScreen />);

    fireEvent.press(await screen.findByTestId('profile.settingsSection.toggle'));

    expect(await screen.findByTestId('profile.overdueReminders.section')).toBeTruthy();

    fireEvent(screen.getByTestId('profile.overdueReminders.toggle'), 'valueChange', true);

    await waitFor(() => {
      expect(screen.getByTestId('profile.overdueReminders.timeRow')).toBeTruthy();
      expect(screen.getByTestId('profile.overdueReminders.intervalRow')).toBeTruthy();
    });
  });

  it('shows denied fallback banner and settings CTA when permission remains denied', async () => {
    mockCheckNotificationPermissions.mockResolvedValue(false);
    mockRequestNotificationPermissions.mockResolvedValue(false);

    const screen = render(<ProfileScreen />);

    fireEvent.press(await screen.findByTestId('profile.settingsSection.toggle'));
    fireEvent(screen.getByTestId('profile.overdueReminders.toggle'), 'valueChange', true);

    await waitFor(() => {
      expect(screen.getByTestId('profile.overdueReminders.deniedBanner')).toBeTruthy();
      expect(screen.getByTestId('profile.overdueReminders.openSettingsCta')).toBeTruthy();
    });
  });
});
