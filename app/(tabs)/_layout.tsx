
import React from 'react';
import { Stack } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';
import { colors } from '@/styles/commonStyles';

export default function TabLayout() {
  const tabs: TabBarItem[] = [
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
