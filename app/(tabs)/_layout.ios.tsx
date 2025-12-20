
import React, { useState, useEffect, useMemo } from 'react';
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
    let mounted = true;

    const checkUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (mounted) {
          setUser(user);
          setAuthLoading(false);
        }
      } catch (error) {
        console.error('Error checking user:', error);
        if (mounted) {
          setAuthLoading(false);
        }
      }
    };
    
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (mounted) {
        setUser(session?.user || null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array - only run once on mount

  // Memoize colors to prevent render loop
  const tabBarBackgroundColor = useMemo(() => isDark ? '#000000' : '#FFFFFF', [isDark]);
  const selectedColor = useMemo(() => colors.primary, []);
  const unselectedColor = useMemo(() => isDark ? '#8E8E93' : '#8E8E93', [isDark]);

  // Memoize border color
  const borderTopColor = useMemo(() => isDark ? '#38383A' : '#E5E5E5', [isDark]);

  if (loading || authLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#000' : '#fff' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // If user is not logged in, only show profile tab
  if (!user) {
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
          borderTopColor: borderTopColor,
          opacity: 1,
          shadowOpacity: 0,
          elevation: 0,
        }}
        screenOptions={{
          tabBarStyle: {
            backgroundColor: tabBarBackgroundColor,
            borderTopWidth: 0.5,
            borderTopColor: borderTopColor,
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
        borderTopColor: borderTopColor,
        opacity: 1,
        shadowOpacity: 0,
        elevation: 0,
      }}
      screenOptions={{
        tabBarStyle: {
          backgroundColor: tabBarBackgroundColor,
          borderTopWidth: 0.5,
          borderTopColor: borderTopColor,
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
