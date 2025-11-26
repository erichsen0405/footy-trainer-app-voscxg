
import React from 'react';
import { Stack } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';
import { colors } from '@/styles/commonStyles';

export default function TabLayout() {
  const tabs: TabBarItem[] = [
    {
      name: '(home)',
      route: '/(tabs)/(home)/',
      icon: 'home',
      label: 'Hjem',
    },
    {
      name: 'tasks',
      route: '/(tabs)/tasks',
      icon: 'checklist',
      label: 'Opgaver',
    },
    {
      name: 'performance',
      route: '/(tabs)/performance',
      icon: 'emoji_events',
      label: 'Performance',
    },
    {
      name: 'admin',
      route: '/(tabs)/admin',
      icon: 'settings',
      label: 'Admin',
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
      </Stack>
      <FloatingTabBar tabs={tabs} />
    </>
  );
}
