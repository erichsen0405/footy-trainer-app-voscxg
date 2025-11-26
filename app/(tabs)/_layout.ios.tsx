
import React from 'react';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { colors } from '@/styles/commonStyles';

export default function TabLayout() {
  return (
    <NativeTabs tintColor={colors.primary}>
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
