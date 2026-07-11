import React, { useMemo, useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments, router as globalRouter } from 'expo-router';
import { Platform } from 'react-native';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';
import { useUserRole } from '@/hooks/useUserRole';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { OnboardingGate } from '@/components/OnboardingGate';
import { useSubscriptionFeatures } from '@/hooks/useSubscriptionFeatures';
import { useAppleIAP } from '@/contexts/AppleIAPContext';
import { resolveSubscriptionAccessState } from '@/utils/accessGate';

/* ======================================================
   ROOT TAB LAYOUT
   ====================================================== */

export default function TabLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { userRole, loading, isAuthenticated } = useUserRole();
  const {
    subscriptionStatus: serverSubscriptionStatus,
    subscriptionMeta,
  } = useSubscription();
  const { entitlementSnapshot } = useAppleIAP();
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
  const subscriptionAccess = resolveSubscriptionAccessState({
    user: isAuthenticated ? { id: 'authenticated' } : null,
    subscriptionStatus: serverSubscriptionStatus,
    subscriptionMeta,
    entitlementSnapshot,
  });

  const lockedByRole = !isAuthenticated && !loading;
  const lockedBySubscription =
    Platform.OS === 'ios'
      ? false
      : subscriptionAccess.accessState === 'denied_authoritative' ||
        (!effectiveHasSubscription && !subscriptionFeaturesLoading);
  const locked = lockedByRole || lockedBySubscription;

  const navigationKey = useMemo(() => {
    const rolePart = effectiveRole ?? 'anon';
    return `${rolePart}`;
  }, [effectiveRole]);

  useEffect(() => {
    if (Platform.OS === 'ios' && subscriptionFeaturesLoading) {
      return;
    }
    const current = Array.isArray(segments) && segments.length > 0 ? segments[segments.length - 1] : undefined;
    if (!current) {
      return;
    }
    if (locked && current !== 'profile') {
      globalRouter.replace('/(tabs)/profile');
    }
  }, [locked, router, segments, subscriptionFeaturesLoading]);

  return (
    <OnboardingGate>
      <FloatingTabsLayout
        userRole={effectiveRole}
        locked={locked}
        navigationKey={navigationKey}
      />
    </OnboardingGate>
  );
}

/* ======================================================
   Floating tab layout
   ====================================================== */

function FloatingTabsLayout({
  userRole,
  locked,
  navigationKey,
}: {
  userRole: string | null;
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
          label: 'Profile',
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
      label: 'Home',
    };

    const taskTab: TabBarItem = {
      name: 'tasks',
      route: '/(tabs)/tasks',
      icon: isPlayer ? 'calendar.badge.clock' : 'checklist',
      materialIcon: isPlayer ? 'event_note' : 'checklist',
      label: isPlayer ? 'Plan' : 'Tasks',
    };

    const performanceTab: TabBarItem = {
      name: 'performance',
      route: '/(tabs)/performance',
      icon: 'trophy.fill',
      materialIcon: 'stars',
      label: 'Progress',
    };

    const libraryTab: TabBarItem = {
      name: 'library',
      route: '/(tabs)/library',
      icon: 'book.fill',
      materialIcon: 'menu_book',
      label: 'Library',
    };

    const coachDashboardTab: TabBarItem = {
      name: 'coach-dashboard',
      route: '/(tabs)/coach-dashboard',
      icon: 'chart.bar.fill',
      materialIcon: 'dashboard',
      label: 'Overview',
    };

    const playerCrmTab: TabBarItem = {
      name: 'player-crm',
      route: '/(tabs)/player-crm',
      icon: 'person.2.fill',
      materialIcon: 'groups',
      label: 'Players',
    };

    const planTab: TabBarItem = {
      name: 'plan',
      route: '/(tabs)/plan',
      icon: 'calendar.badge.clock',
      materialIcon: 'event_note',
      label: 'Plan',
    };

    const profileTab: TabBarItem = {
      name: 'profile',
      route: '/(tabs)/profile',
      icon: 'person.fill',
      materialIcon: 'person',
      label: 'Profile',
    };

    if (isTrainer) {
      return [coachDashboardTab, playerCrmTab, planTab];
    }

    const tabsForRole: TabBarItem[] = [homeTab, taskTab];

    if (isPlayer) {
      tabsForRole.push(performanceTab);
    }

    if (!isPlayer) {
      tabsForRole.push(libraryTab);
    }
    tabsForRole.push(profileTab);

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
        <Stack.Screen name="coach-dashboard" />
        <Stack.Screen name="tasks" />
        <Stack.Screen name="performance" />
        <Stack.Screen name="player-crm" />
        <Stack.Screen name="plan" />
        <Stack.Screen name="library" />
        <Stack.Screen name="profile" />
      </Stack>

      <FloatingTabBar key={`floating-tabs-${navigationKey}`} tabs={tabs} />
    </>
  );
}
