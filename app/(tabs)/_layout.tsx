
import React, { useMemo } from 'react';
import { Stack } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';
import { colors } from '@/styles/commonStyles';
import { useUserRole } from '@/hooks/useUserRole';
import { ActivityIndicator, View } from 'react-native';

export default function TabLayout() {
  const { userRole, loading } = useUserRole();

  const tabs: TabBarItem[] = useMemo(() => {
    const isPlayer = userRole === 'player';

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
        materialIcon: 'emoji_events',
        label: 'Performance',
      },
      {
        name: 'admin',
        route: '/(tabs)/admin',
        icon: 'gearshape.fill',
        materialIcon: 'settings',
        label: 'Admin',
      },
      {
        name: 'profile',
        route: '/(tabs)/profile',
        icon: 'person.fill',
        materialIcon: 'person',
        label: 'Profil',
      },
    ];

    // Filter tabs for players - only show Home, Performance, Profile
    if (isPlayer) {
      return allTabs.filter(tab => 
        tab.name === '(home)' || 
        tab.name === 'performance' || 
        tab.name === 'profile'
      );
    }

    return allTabs;
  }, [userRole]);

  if (loading) {
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
        <Stack.Screen key="admin" name="admin" />
        <Stack.Screen key="profile" name="profile" />
      </Stack>
      <FloatingTabBar tabs={tabs} />
    </>
  );
}
