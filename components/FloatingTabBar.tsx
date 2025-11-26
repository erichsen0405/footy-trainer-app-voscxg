
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { IconSymbol } from './IconSymbol';
import { colors } from '@/styles/commonStyles';

export interface TabBarItem {
  name: string;
  route: string;
  icon: string;
  label: string;
}

interface FloatingTabBarProps {
  tabs: TabBarItem[];
}

export default function FloatingTabBar({ tabs }: FloatingTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const isActive = (route: string) => {
    return pathname.startsWith(route);
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {tabs.map((tab, index) => {
          const active = isActive(tab.route);
          return (
            <TouchableOpacity
              key={index}
              style={styles.tab}
              onPress={() => router.push(tab.route as any)}
            >
              <IconSymbol
                ios_icon_name={tab.icon as any}
                android_material_icon_name={tab.icon as any}
                size={24}
                color={active ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.label, { color: active ? colors.primary : colors.textSecondary }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: 'transparent',
    pointerEvents: 'box-none',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 25,
    paddingVertical: 8,
    paddingHorizontal: 8,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
});
