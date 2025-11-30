
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
      style={{
        backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
        borderTopWidth: 0.5,
        borderTopColor: isDark ? '#38383A' : '#E5E5E5',
      }}
    >
      <NativeTabs.Trigger key="home" name="(home)">
        <Icon 
          sf={{ default: 'house', selected: 'house.fill' }}
        />
        <Label 
          style={{ 
            fontSize: 10,
            fontWeight: '500',
          }}
        >
          Hjem
        </Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger key="tasks" name="tasks">
        <Icon 
          sf={{ default: 'checklist', selected: 'checklist' }}
        />
        <Label 
          style={{ 
            fontSize: 10,
            fontWeight: '500',
          }}
        >
          Opgaver
        </Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger key="performance" name="performance">
        <Icon 
          sf={{ default: 'trophy', selected: 'trophy.fill' }}
        />
        <Label 
          style={{ 
            fontSize: 10,
            fontWeight: '500',
          }}
        >
          Performance
        </Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger key="admin" name="admin">
        <Icon 
          sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
        />
        <Label 
          style={{ 
            fontSize: 10,
            fontWeight: '500',
          }}
        >
          Admin
        </Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger key="profile" name="profile">
        <Icon 
          sf={{ default: 'person', selected: 'person.fill' }}
        />
        <Label 
          style={{ 
            fontSize: 10,
            fontWeight: '500',
          }}
        >
          Profil
        </Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
