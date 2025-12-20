import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, useColorScheme } from 'react-native';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { colors } from '@/styles/commonStyles';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/app/integrations/supabase/client';

/* =========================
   Wrapper: auth + role
   ========================= */

export default function TabLayout() {
  const { userRole, loading: roleLoading } = useUserRole();
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (mounted) {
        setUser(data.user);
        setAuthLoading(false);
      }
    });

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_e, session) => {
        if (mounted) setUser(session?.user ?? null);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (roleLoading || authLoading) {
    return (
      <View style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <TabsPure
      isLoggedIn={!!user}
      userRole={userRole}
    />
  );
}

/* =========================
   Pure NativeTabs (NO async)
   ========================= */

function TabsPure({
  isLoggedIn,
  userRole,
}: {
  isLoggedIn: boolean;
  userRole: string | null;
}) {
  const isDark = useColorScheme() === 'dark';

  const bg = isDark ? '#000000' : '#FFFFFF';
  const border = isDark ? '#38383A' : '#E5E5E5';
  const active = colors.primary;
  const inactive = '#8E8E93';

  const isPlayer = userRole === 'player';
  const isTrainer = userRole === 'admin' || userRole === 'trainer';

  return (
    <NativeTabs
      tintColor={active}
      barTintColor={bg}
      unselectedItemTintColor={inactive}
      translucent={false}
      style={{
        backgroundColor: bg,
        borderTopWidth: 0.5,
        borderTopColor: border,
      }}
      screenOptions={{
        tabBarStyle: {
          backgroundColor: bg,
          borderTopWidth: 0.5,
          borderTopColor: border,
        },
        tabBarActiveTintColor: active,
        tabBarInactiveTintColor: inactive,
      }}
    >
      <NativeTabs.Trigger name="(home)" hidden={!isLoggedIn}>
        <Icon sf={{ default: 'house', selected: 'house.fill' }} color={active} />
        <Label style={label(active)}>Hjem</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="tasks" hidden={!isLoggedIn}>
        <Icon sf={{ default: 'checklist', selected: 'checklist' }} color={active} />
        <Label style={label(active)}>Opgaver</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="performance"
        hidden={!isLoggedIn || !isPlayer}
      >
        <Icon sf={{ default: 'trophy', selected: 'trophy.fill' }} color={active} />
        <Label style={label(active)}>Performance</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="library"
        hidden={!isLoggedIn || !isTrainer}
      >
        <Icon sf={{ default: 'book', selected: 'book.fill' }} color={active} />
        <Label style={label(active)}>Bibliotek</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="trainer"
        hidden={!isLoggedIn || !isTrainer}
      >
        <Icon sf={{ default: 'person.3', selected: 'person.3.fill' }} color={active} />
        <Label style={label(active)}>Træner</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: 'person', selected: 'person.fill' }} color={active} />
        <Label style={label(active)}>Profil</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

/* ========================= */

const label = (color: string) => ({
  fontSize: 10,
  fontWeight: '500',
  color,
});
