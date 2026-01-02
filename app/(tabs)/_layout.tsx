import React, { useMemo } from 'react';
import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { colors } from '@/styles/commonStyles';
import { useUserRole } from '@/hooks/useUserRole';

/* ======================================================
   ROOT TAB LAYOUT
   ====================================================== */

export default function TabLayout() {
  const { userRole, loading } = useUserRole();

  const isLoggedIn = !!userRole;

  if (Platform.OS === 'ios') {
    return (
      <IOSTabLayout
        isLoggedIn={isLoggedIn}
        userRole={userRole}
        loading={loading}
      />
    );
  }

  return (
    <AndroidWebTabLayout
      isLoggedIn={isLoggedIn}
      userRole={userRole}
    />
  );
}

/* ======================================================
   iOS – Native Tabs
   ====================================================== */

function IOSTabLayout({
  isLoggedIn,
  userRole,
  loading,
}: {
  isLoggedIn: boolean;
  userRole: string | null;
  loading: boolean;
}) {
  const isPlayer = userRole === 'player';
  const isTrainer = userRole === 'admin' || userRole === 'trainer';

  // Tabs må ALDRIG skjules under loading
  const hideForAuth = !loading && !isLoggedIn;

  // Performance tab should be visible for both players and trainers (coaches/admins).
  // Hide only when not logged in or when role is neither player nor trainer/admin.
  const hideForPlayerOrTrainer = !loading && (!isLoggedIn || !(isPlayer || isTrainer));

  return (
    <NativeTabs
      tintColor={colors.primary}
      barTintColor="#FFFFFF"
      unselectedItemTintColor="#8E8E93"
      translucent={false}
      style={{
        backgroundColor: '#FFFFFF',
        borderTopWidth: 0.5,
        borderTopColor: '#E5E5E5',
      }}
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0.5,
          borderTopColor: '#E5E5E5',
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#8E8E93',
      }}
    >
      {/* HOME */}
      <NativeTabs.Trigger name="(home)" hidden={hideForAuth}>
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Hjem</Label>
      </NativeTabs.Trigger>

      {/* TASKS */}
      <NativeTabs.Trigger name="tasks" hidden={hideForAuth}>
        <Icon sf={{ default: 'checklist', selected: 'checklist' }} />
        <Label>Opgaver</Label>
      </NativeTabs.Trigger>

      {/* PERFORMANCE – PLAYER & TRAINER */}
      <NativeTabs.Trigger name="performance" hidden={hideForPlayerOrTrainer}>
        <Icon sf={{ default: 'trophy', selected: 'trophy.fill' }} />
        <Label>Performance</Label>
      </NativeTabs.Trigger>

      {/* LIBRARY */}
      <NativeTabs.Trigger name="library" hidden={hideForAuth}>
        <Icon sf={{ default: 'book', selected: 'book.fill' }} />
        <Label>Bibliotek</Label>
      </NativeTabs.Trigger>

      {/* PROFILE – ALTID */}
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
}: {
  isLoggedIn: boolean;
  userRole: string | null;
}) {
  const tabs: TabBarItem[] = useMemo(() => {
    if (!isLoggedIn) {
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
  }, [isLoggedIn, userRole]);

  return (
    <>
      <Stack
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

      <FloatingTabBar tabs={tabs} />
    </>
  );
}
