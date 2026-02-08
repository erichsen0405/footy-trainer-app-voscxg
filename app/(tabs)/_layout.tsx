import React, { useMemo, useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments, router as globalRouter } from 'expo-router';
import { Platform } from 'react-native';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { colors } from '@/styles/commonStyles';
import { useUserRole } from '@/hooks/useUserRole';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { OnboardingGate } from '@/components/OnboardingGate';
import { useSubscriptionFeatures } from '@/hooks/useSubscriptionFeatures';

/* ======================================================
   ROOT TAB LAYOUT
   ====================================================== */

export default function TabLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { userRole, loading } = useUserRole();
  const { entitlementVersion, subscriptionStatus: serverSubscriptionStatus } = useSubscription();
  const {
    hasActiveSubscription,
    subscriptionTier,
    isLoading: subscriptionFeaturesLoading,
  } = useSubscriptionFeatures();

  const hasSubscription =
    Platform.OS === 'ios'
      ? hasActiveSubscription
      : Boolean(serverSubscriptionStatus?.hasSubscription);

  const lastStableRoleRef = useRef<string | null>(null);
  const lastStableHasSubscriptionRef = useRef<boolean | null>(null);
  if (!loading && !userRole) {
    lastStableRoleRef.current = null;
  } else if (userRole) {
    lastStableRoleRef.current = userRole;
  }
  if (!subscriptionFeaturesLoading) {
    lastStableHasSubscriptionRef.current = hasSubscription;
  }

  const effectiveRole = userRole ?? lastStableRoleRef.current;
  const effectiveHasSubscription =
    subscriptionFeaturesLoading && lastStableHasSubscriptionRef.current != null
      ? lastStableHasSubscriptionRef.current
      : hasSubscription;

  const locked =
    !effectiveRole ||
    (!effectiveHasSubscription && !(Platform.OS === 'ios' && subscriptionFeaturesLoading));

  const navigationKey = useMemo(() => {
    const rolePart = effectiveRole ?? 'anon';
    return `${rolePart}`;
  }, [effectiveRole]);

  const entitlementKey = `${navigationKey}-${entitlementVersion}`;

  useEffect(() => {
    if (Platform.OS === 'ios' && subscriptionFeaturesLoading) {
      return;
    }
    const current = Array.isArray(segments) ? segments[1] : undefined;
    if (!current) {
      return;
    }
    if (locked && current !== 'profile') {
      globalRouter.replace('/(tabs)/profile');
    }
  }, [locked, router, segments, subscriptionFeaturesLoading]);

  if (Platform.OS === 'ios') {
    return (
      <OnboardingGate>
        <IOSTabLayout
          isLoggedIn={!!effectiveRole}
          userRole={effectiveRole}
          loading={loading || subscriptionFeaturesLoading}
          entitlementKey={entitlementKey}
          locked={locked}
          navigationKey={navigationKey}
        />
      </OnboardingGate>
    );
  }

  return (
    <OnboardingGate>
      <AndroidWebTabLayout
        isLoggedIn={!!effectiveRole}
        userRole={effectiveRole}
        entitlementKey={entitlementKey}
        locked={locked}
        navigationKey={navigationKey}
      />
    </OnboardingGate>
  );
}

/* ======================================================
   iOS – Native Tabs
   ====================================================== */

function IOSTabLayout({
  isLoggedIn,
  userRole,
  loading,
  entitlementKey,
  locked,
  navigationKey,
}: {
  isLoggedIn: boolean;
  userRole: string | null;
  loading: boolean;
  entitlementKey: string;
  locked: boolean;
  navigationKey: string;
}) {
  const isPlayer = userRole === 'player';
  const isTrainer = userRole === 'admin' || userRole === 'trainer';

  const hideForAuth = locked;
  const hideForPlayerOrTrainer = locked || (!loading && (!isLoggedIn || !(isPlayer || isTrainer)));

  return (
    <NativeTabs
      key={`native-tabs-${navigationKey}`}
      tintColor={colors.primary}
      backgroundColor="#FFFFFF"
      iconColor={{ default: colors.textSecondary, selected: colors.primary }}
      labelStyle={{
        default: { color: colors.textSecondary },
        selected: { color: colors.primary },
      }}
    >
      <NativeTabs.Trigger name="(home)" hidden={hideForAuth}>
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Hjem</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="tasks" hidden={hideForAuth}>
        <Icon sf={{ default: 'checklist', selected: 'checklist' }} />
        <Label>Opgaver</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="performance" hidden={hideForPlayerOrTrainer}>
        <Icon sf={{ default: 'trophy', selected: 'trophy.fill' }} />
        <Label>Performance</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="library" hidden={hideForAuth}>
        <Icon sf={{ default: 'book', selected: 'book.fill' }} />
        <Label>Bibliotek</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: 'person', selected: 'person.fill' }} />
        <Label>Profil</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

/* ======================================================
   Android / Web – FloatingTabBar
   ====================================================== */

function AndroidWebTabLayout({
  isLoggedIn,
  userRole,
  entitlementKey,
  locked,
  navigationKey,
}: {
  isLoggedIn: boolean;
  userRole: string | null;
  entitlementKey: string;
  locked: boolean;
  navigationKey: string;
}) {
  const tabs: TabBarItem[] = useMemo(() => {
    if (locked) {
      return [
        {
          name: 'profile',
          route: '/(tabs)/profile',
          icon: 'person.fill',
          materialIcon: 'person',
          label: 'Profil',
        },
      ];
    }

    const isPlayer = userRole === 'player';
    const isTrainer = userRole === 'admin' || userRole === 'trainer';

    const homeTab: TabBarItem = {
      name: '(home)',
      route: '/(tabs)/(home)/',
      icon: 'house.fill',
      materialIcon: 'home',
      label: 'Hjem',
    };

    const taskTab: TabBarItem = {
      name: 'tasks',
      route: '/(tabs)/tasks',
      icon: 'checklist',
      materialIcon: 'checklist',
      label: 'Opgaver',
    };

    const performanceTab: TabBarItem = {
      name: 'performance',
      route: '/(tabs)/performance',
      icon: 'trophy.fill',
      materialIcon: 'stars',
      label: 'Performance',
    };

    const libraryTab: TabBarItem = {
      name: 'library',
      route: '/(tabs)/library',
      icon: 'book.fill',
      materialIcon: 'menu_book',
      label: 'Bibliotek',
    };

    const profileTab: TabBarItem = {
      name: 'profile',
      route: '/(tabs)/profile',
      icon: 'person.fill',
      materialIcon: 'person',
      label: 'Profil',
    };

    const tabsForRole: TabBarItem[] = [homeTab, taskTab];

    if (isPlayer || isTrainer) {
      tabsForRole.push(performanceTab);
    }

    tabsForRole.push(libraryTab, profileTab);

    return tabsForRole;
  }, [locked, userRole]);

  return (
    <>
      <Stack
        key={`stack-${navigationKey}`}
        screenOptions={{
          headerShown: false,
          animation: 'none',
        }}
      >
        <Stack.Screen name="(home)" />
        <Stack.Screen name="tasks" />
        <Stack.Screen name="performance" />
        <Stack.Screen name="library" />
        <Stack.Screen name="profile" />
      </Stack>

      <FloatingTabBar key={`floating-tabs-${navigationKey}`} tabs={tabs} />
    </>
  );
}
