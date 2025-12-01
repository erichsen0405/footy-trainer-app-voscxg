
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
  
  // CRITICAL FIX: Ensure proper colors for icons and labels
  // Use high contrast colors that work on both light and dark backgrounds
  const tabBarBackgroundColor = isDark ? '#000000' : '#FFFFFF';
  const selectedColor = colors.primary; // Always use primary color for selected
  const unselectedColor = isDark ? '#8E8E93' : '#8E8E93'; // iOS standard gray
  
  return (
    <NativeTabs 
      tintColor={selectedColor}
      barTintColor={tabBarBackgroundColor}
      unselectedItemTintColor={unselectedColor}
      translucent={false}
      blurEffect={undefined}
      style={{
        backgroundColor: tabBarBackgroundColor,
        borderTopWidth: 0.5,
        borderTopColor: isDark ? '#38383A' : '#E5E5E5',
        opacity: 1,
        // CRITICAL: Force opaque rendering
        shadowOpacity: 0,
        elevation: 0,
      }}
      screenOptions={{
        tabBarStyle: {
          backgroundColor: tabBarBackgroundColor,
          borderTopWidth: 0.5,
          borderTopColor: isDark ? '#38383A' : '#E5E5E5',
          opacity: 1,
          // CRITICAL: Ensure no transparency
          shadowOpacity: 0,
          elevation: 0,
        },
        // CRITICAL: Ensure icons get proper tint colors
        tabBarActiveTintColor: selectedColor,
        tabBarInactiveTintColor: unselectedColor,
      }}
    >
      <NativeTabs.Trigger key="home" name="(home)">
        <Icon 
          sf={{ default: 'house', selected: 'house.fill' }}
          // CRITICAL: Explicitly set colors for icons
          color={selectedColor}
        />
        <Label 
          style={{ 
            fontSize: 10,
            fontWeight: '500',
            // CRITICAL: Ensure label color matches icon color
            color: selectedColor,
          }}
        >
          Hjem
        </Label>
      </NativeTabs.Trigger>
      
      {!isPlayer && (
        <NativeTabs.Trigger key="tasks" name="tasks">
          <Icon 
            sf={{ default: 'checklist', selected: 'checklist' }}
            color={selectedColor}
          />
          <Label 
            style={{ 
              fontSize: 10,
              fontWeight: '500',
              color: selectedColor,
            }}
          >
            Opgaver
          </Label>
        </NativeTabs.Trigger>
      )}
      
      <NativeTabs.Trigger key="performance" name="performance">
        <Icon 
          sf={{ default: 'trophy', selected: 'trophy.fill' }}
          color={selectedColor}
        />
        <Label 
          style={{ 
            fontSize: 10,
            fontWeight: '500',
            color: selectedColor,
          }}
        >
          Performance
        </Label>
      </NativeTabs.Trigger>
        
      {!isPlayer && (
        <NativeTabs.Trigger key="admin" name="admin">
          <Icon 
            sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
            color={selectedColor}
          />
          <Label 
            style={{ 
              fontSize: 10,
              fontWeight: '500',
              color: selectedColor,
            }}
          >
            Admin
          </Label>
        </NativeTabs.Trigger>
      )}
        
      <NativeTabs.Trigger key="profile" name="profile">
        <Icon 
          sf={{ default: 'person', selected: 'person.fill' }}
          color={selectedColor}
        />
        <Label 
          style={{ 
            fontSize: 10,
            fontWeight: '500',
            color: selectedColor,
          }}
        >
          Profil
        </Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
