
import React from 'react';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { colors } from '@/styles/commonStyles';
import { useColorScheme } from 'react-native';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  return (
    <NativeTabs 
      tintColor={colors.primary}
      barTintColor={isDark ? '#1C1C1E' : '#FFFFFF'}
      unselectedItemTintColor={isDark ? '#8E8E93' : '#666666'}
      translucent={false}
    >
      <NativeTabs.Trigger key="home" name="(home)">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Hjem</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger key="tasks" name="tasks">
        <Icon sf={{ default: 'checklist', selected: 'checklist' }} />
        <Label>Opgaver</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger key="performance" name="performance">
        <Icon sf={{ default: 'trophy', selected: 'trophy.fill' }} />
        <Label>Performance</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger key="admin" name="admin">
        <Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <Label>Admin</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger key="profile" name="profile">
        <Icon sf={{ default: 'person', selected: 'person.fill' }} />
        <Label>Profil</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
