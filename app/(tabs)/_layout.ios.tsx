
import React from 'react';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { colors } from '@/styles/commonStyles';
import { useColorScheme, ActivityIndicator, View } from 'react-native';
import { useUserRole } from '@/hooks/useUserRole';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { userRole, loading } = useUserRole();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#000' : '#fff' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Player only sees: Home, Performance, Profile
  const isPlayer = userRole === 'player';
  
  return (
    <NativeTabs 
      tintColor={colors.primary}
      barTintColor={isDark ? '#000000' : '#FFFFFF'}
      unselectedItemTintColor={isDark ? '#8E8E93' : '#666666'}
      translucent={false}
      blurEffect={undefined}
      style={{
        backgroundColor: isDark ? '#000000' : '#FFFFFF',
        borderTopWidth: 0.5,
        borderTopColor: isDark ? '#38383A' : '#E5E5E5',
        opacity: 1,
      }}
      screenOptions={{
        tabBarStyle: {
          backgroundColor: isDark ? '#000000' : '#FFFFFF',
          borderTopWidth: 0.5,
          borderTopColor: isDark ? '#38383A' : '#E5E5E5',
          opacity: 1,
        },
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
      
      {!isPlayer && (
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
      )}
      
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
        
        {!isPlayer && (
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
        )}
        
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
