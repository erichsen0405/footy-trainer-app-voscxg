
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform, useColorScheme } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from './IconSymbol';
import { getColors } from '@/styles/commonStyles';

export interface TabBarItem {
  name: string;
  route: string;
  icon: string;
  materialIcon: string;
  label: string;
}

interface FloatingTabBarProps {
  tabs: TabBarItem[];
}

export default function FloatingTabBar({ tabs }: FloatingTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const colors = getColors(colorScheme);
  const isIOS = Platform.OS === 'ios';
  const tabBarBackground = colorScheme === 'dark' ? '#1C1C1E' : '#FFFFFF';
  const tabBarBorderColor =
    colorScheme === 'dark'
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(0, 0, 0, 0.14)';
  const iosInactiveColor = colorScheme === 'dark' ? '#FFFFFF' : '#1C1C1E';
  const iosActiveBackground = colorScheme === 'dark' ? '#2C2C2E' : '#EDEDED';

  const normalizeRouteForMatch = (value: string) => {
    const withoutGroups = value.replace(/\/\([^/]+?\)/g, '');
    const normalized = withoutGroups.replace(/\/+$/, '');
    return normalized.length ? normalized : '/';
  };

  const isActive = (route: string) => {
    const normalizedPath = normalizeRouteForMatch(pathname);
    const normalizedRoute = normalizeRouteForMatch(route);
    return normalizedPath === normalizedRoute || normalizedPath.startsWith(`${normalizedRoute}/`);
  };

  return (
    <View
      style={[
        styles.container,
        isIOS
          ? [
              styles.iosContainer,
              {
                paddingBottom: Math.max(insets.bottom - 20, 8),
              },
            ]
          : styles.floatingContainer,
      ]}
      pointerEvents="box-none"
    >
      <View 
        style={[
          styles.tabBar,
          isIOS ? styles.iosTabBar : styles.floatingTabBar,
          {
            backgroundColor: tabBarBackground,
            borderColor: tabBarBorderColor,
          },
        ]}
      >
        {tabs.map((tab, index) => {
          const active = isActive(tab.route);
          const tabColor = isIOS
            ? active
              ? colors.primary
              : iosInactiveColor
            : active
              ? colors.primary
              : colors.textSecondary;
          return (
            <React.Fragment key={`tab-${tab.route}-${index}`}>
              <TouchableOpacity
                style={[
                  styles.tab,
                  isIOS ? styles.iosTab : styles.floatingTab,
                  isIOS &&
                    active && {
                      backgroundColor: iosActiveBackground,
                    },
                  !isIOS &&
                    active && {
                      backgroundColor: colorScheme === 'dark'
                        ? 'rgba(76, 175, 80, 0.15)'
                        : 'rgba(76, 175, 80, 0.1)',
                      borderRadius: 16,
                    }
                ]}
                onPress={() => router.push(tab.route as any)}
              >
                <IconSymbol
                  ios_icon_name={tab.icon as any}
                  android_material_icon_name={tab.materialIcon as any}
                  size={isIOS ? 31 : 24}
                  color={tabColor}
                />
                <Text style={[
                  styles.label, 
                  isIOS ? styles.iosLabel : styles.floatingLabel,
                  isIOS && active ? styles.iosActiveLabel : null,
                  { color: tabColor }
                ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            </React.Fragment>
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
    pointerEvents: 'box-none',
  },
  floatingContainer: {
    paddingBottom: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: 'transparent',
  },
  iosContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  tabBar: {
    flexDirection: 'row',
  },
  floatingTabBar: {
    borderRadius: 28,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.25)',
    elevation: 12,
    overflow: 'hidden',
  },
  iosTabBar: {
    minHeight: 76,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 38,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0px 10px 28px rgba(0, 0, 0, 0.18)',
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  floatingTab: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  iosTab: {
    minHeight: 64,
    borderRadius: 32,
    paddingVertical: 5,
    paddingHorizontal: 1,
  },
  label: {
    textAlign: 'center',
    maxWidth: '100%',
  },
  floatingLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  iosLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  iosActiveLabel: {
    fontWeight: '600',
  },
});
