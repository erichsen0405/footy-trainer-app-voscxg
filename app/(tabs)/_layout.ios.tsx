
import React, { useState, useEffect } from 'react';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { colors } from '@/styles/commonStyles';
import { useColorScheme, ActivityIndicator, View } from 'react-native';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/app/integrations/supabase/client';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
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

  if (loading || authLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#000' : '#fff' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // If user is not logged in, only show profile tab
  if (!user) {
    const tabBarBackgroundColor = isDark ? '#000000' : '#FFFFFF';
    const selectedColor = colors.primary;
    const unselectedColor = isDark ? '#8E8E93' : '#8E8E93';
    
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
          shadowOpacity: 0,
          elevation: 0,
        }}
        screenOptions={{
          tabBarStyle: {
            backgroundColor: tabBarBackgroundColor,
            borderTopWidth: 0.5,
            borderTopColor: isDark ? '#38383A' : '#E5E5E5',
            opacity: 1,
            shadowOpacity: 0,
            elevation: 0,
          },
          tabBarActiveTintColor: selectedColor,
          tabBarInactiveTintColor: unselectedColor,
          tabBarBackground: () => (
            <View style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: tabBarBackgroundColor,
              opacity: 1,
            }} />
          ),
        }}
      >
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

  // Player only sees: Home, Tasks, Performance, Profile
  const isPlayer = userRole === 'player';
  // Trainer sees: Home, Tasks, Library, Trainer, Profile (Performance removed)
  const isTrainer = userRole === 'admin' || userRole === 'trainer';
  
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
        shadowOpacity: 0,
        elevation: 0,
      }}
      screenOptions={{
        tabBarStyle: {
          backgroundColor: tabBarBackgroundColor,
          borderTopWidth: 0.5,
          borderTopColor: isDark ? '#38383A' : '#E5E5E5',
          opacity: 1,
          shadowOpacity: 0,
          elevation: 0,
        },
        tabBarActiveTintColor: selectedColor,
        tabBarInactiveTintColor: unselectedColor,
        tabBarBackground: () => (
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: tabBarBackgroundColor,
            opacity: 1,
          }} />
        ),
      }}
    >
      <NativeTabs.Trigger key="home" name="(home)">
        <Icon 
          sf={{ default: 'house', selected: 'house.fill' }}
          color={selectedColor}
        />
        <Label 
          style={{ 
            fontSize: 10,
            fontWeight: '500',
            color: selectedColor,
          }}
        >
          Hjem
        </Label>
      </NativeTabs.Trigger>
      
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
      
      {isPlayer && (
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
      )}
      
      {isTrainer && (
        <NativeTabs.Trigger key="library" name="library">
          <Icon 
            sf={{ default: 'book', selected: 'book.fill' }}
            color={selectedColor}
          />
          <Label 
            style={{ 
              fontSize: 10,
              fontWeight: '500',
              color: selectedColor,
            }}
          >
            Bibliotek
          </Label>
        </NativeTabs.Trigger>
      )}
      
      {isTrainer && (
        <NativeTabs.Trigger key="trainer" name="trainer">
          <Icon 
            sf={{ default: 'person.3', selected: 'person.3.fill' }}
            color={selectedColor}
          />
          <Label 
            style={{ 
              fontSize: 10,
              fontWeight: '500',
              color: selectedColor,
            }}
          >
            Træner
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
