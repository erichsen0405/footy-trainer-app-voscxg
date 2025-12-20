
import React, { useMemo, useState, useEffect } from 'react';
import { Stack } from 'expo-router';
import { Platform, ActivityIndicator, View } from 'react-native';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { colors } from '@/styles/commonStyles';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/app/integrations/supabase/client';

export default function TabLayout() {
  const { userRole, loading: roleLoading } = useUserRole();
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) {
        setUser(user);
        setAuthLoading(false);
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (mounted) {
        setUser(session?.user || null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (roleLoading || authLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Platform-specific rendering
  if (Platform.OS === 'ios') {
    return (
      <IOSTabLayout
        isLoggedIn={!!user}
        userRole={userRole}
      />
    );
  }

  // Android/Web: Use FloatingTabBar
  return (
    <AndroidWebTabLayout
      isLoggedIn={!!user}
      userRole={userRole}
    />
  );
}

/* =========================
   iOS: NativeTabs
   ========================= */

function IOSTabLayout({
  isLoggedIn,
  userRole,
}: {
  isLoggedIn: boolean;
  userRole: string | null;
}) {
  const isPlayer = userRole === 'player';
  const isTrainer = userRole === 'admin' || userRole === 'trainer';

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
      <NativeTabs.Trigger name="(home)" hidden={!isLoggedIn}>
        <Icon sf={{ default: 'house', selected: 'house.fill' }} color={colors.primary} />
        <Label style={{ fontSize: 10, fontWeight: '500', color: colors.primary }}>Hjem</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="tasks" hidden={!isLoggedIn}>
        <Icon sf={{ default: 'checklist', selected: 'checklist' }} color={colors.primary} />
        <Label style={{ fontSize: 10, fontWeight: '500', color: colors.primary }}>Opgaver</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="performance"
        hidden={!isLoggedIn || !isPlayer}
      >
        <Icon sf={{ default: 'trophy', selected: 'trophy.fill' }} color={colors.primary} />
        <Label style={{ fontSize: 10, fontWeight: '500', color: colors.primary }}>Performance</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="library"
        hidden={!isLoggedIn || !isTrainer}
      >
        <Icon sf={{ default: 'book', selected: 'book.fill' }} color={colors.primary} />
        <Label style={{ fontSize: 10, fontWeight: '500', color: colors.primary }}>Bibliotek</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="trainer"
        hidden={!isLoggedIn || !isTrainer}
      >
        <Icon sf={{ default: 'person.3', selected: 'person.3.fill' }} color={colors.primary} />
        <Label style={{ fontSize: 10, fontWeight: '500', color: colors.primary }}>Træner</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: 'person', selected: 'person.fill' }} color={colors.primary} />
        <Label style={{ fontSize: 10, fontWeight: '500', color: colors.primary }}>Profil</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

/* =========================
   Android/Web: FloatingTabBar
   ========================= */

function AndroidWebTabLayout({
  isLoggedIn,
  userRole,
}: {
  isLoggedIn: boolean;
  userRole: string | null;
}) {
  const tabs: TabBarItem[] = useMemo(() => {
    // If user is not logged in, only show profile tab
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

    // Check if user is a player (not admin/trainer)
    const isPlayer = userRole === 'player';
    // Check if user is trainer/admin
    const isTrainer = userRole === 'admin' || userRole === 'trainer';

    const allTabs: TabBarItem[] = [
      {
        name: '(home)',
        route: '/(tabs)/(home)/',
        icon: 'house.fill',
        materialIcon: 'home',
        label: 'Hjem',
      },
      {
        name: 'tasks',
        route: '/(tabs)/tasks',
        icon: 'checklist',
        materialIcon: 'checklist',
        label: 'Opgaver',
      },
      {
        name: 'performance',
        route: '/(tabs)/performance',
        icon: 'trophy.fill',
        materialIcon: 'stars',
        label: 'Performance',
      },
      {
        name: 'library',
        route: '/(tabs)/library',
        icon: 'book.fill',
        materialIcon: 'menu_book',
        label: 'Bibliotek',
      },
      {
        name: 'trainer',
        route: '/(tabs)/trainer',
        icon: 'person.3.fill',
        materialIcon: 'groups',
        label: 'Træner',
      },
      {
        name: 'profile',
        route: '/(tabs)/profile',
        icon: 'person.fill',
        materialIcon: 'person',
        label: 'Profil',
      },
    ];

    // Filter tabs based on user role
    if (isPlayer) {
      // Players can see: Home, Tasks, Performance, Profile
      return allTabs.filter(tab => 
        tab.name === '(home)' || 
        tab.name === 'tasks' ||
        tab.name === 'performance' || 
        tab.name === 'profile'
      );
    }

    if (isTrainer) {
      // Trainers can see: Home, Tasks, Library, Trainer, Profile (Performance removed)
      return allTabs.filter(tab => 
        tab.name === '(home)' || 
        tab.name === 'tasks' ||
        tab.name === 'library' ||
        tab.name === 'trainer' ||
        tab.name === 'profile'
      );
    }

    // Default: show all tabs
    return allTabs;
  }, [userRole, isLoggedIn]);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
        }}
      >
        <Stack.Screen key="home" name="(home)" />
        <Stack.Screen key="tasks" name="tasks" />
        <Stack.Screen key="performance" name="performance" />
        <Stack.Screen key="library" name="library" />
        <Stack.Screen key="trainer" name="trainer" />
        <Stack.Screen key="profile" name="profile" />
      </Stack>
      <FloatingTabBar tabs={tabs} />
    </>
  );
}
