
import React, { useMemo, useState, useEffect } from 'react';
import { Stack } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';
import { colors } from '@/styles/commonStyles';
import { useUserRole } from '@/hooks/useUserRole';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '@/app/integrations/supabase/client';

export default function TabLayout() {
  const { userRole, loading } = useUserRole();
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setAuthLoading(false);
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const tabs: TabBarItem[] = useMemo(() => {
    // If user is not logged in, only show profile tab
    if (!user) {
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
  }, [userRole, user]);

  if (loading || authLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

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
