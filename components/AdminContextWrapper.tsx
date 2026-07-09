
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';

interface AdminContextWrapperProps {
  isAdmin: boolean;
  contextName?: string;
  contextType?: 'player' | 'team';
  presentation?: 'banner' | 'compact' | 'none';
  children: React.ReactNode;
}

export function AdminContextWrapper({
  isAdmin,
  contextName = '',
  contextType = 'player',
  presentation = 'banner',
  children,
}: AdminContextWrapperProps) {
  const insets = useSafeAreaInsets();
  const contextLabel = contextType === 'player' ? 'Player filter' : 'Team filter';
  const fallbackName = contextType === 'player' ? 'Selected player' : 'Selected team';

  if (!isAdmin) {
    // When not in admin mode, render children without any wrapper styling
    return <>{children}</>;
  }

  if (presentation === 'none') {
    return <>{children}</>;
  }

  if (presentation === 'compact') {
    return (
      <View style={styles.compactAdminBackground}>
        <View
          style={[
            styles.compactContextBar,
            {
              marginTop: Platform.OS === 'ios' ? insets.top + 8 : (Platform.OS === 'android' ? 48 : 56),
            },
          ]}
        >
          <View style={styles.compactIconBadge}>
            <IconSymbol
              ios_icon_name={contextType === 'player' ? 'person.crop.circle' : 'person.3.fill'}
              android_material_icon_name={contextType === 'player' ? 'person' : 'groups'}
              size={15}
              color="#2F7D46"
            />
          </View>
          <Text style={styles.compactContextLabel}>{contextLabel}</Text>
          <Text style={styles.compactContextName} numberOfLines={1}>
            {contextName || fallbackName}
          </Text>
        </View>
        {children}
      </View>
    );
  }

  return (
    <View style={styles.adminBackground}>
      {/* Admin warning banner - always rendered when isAdmin is true */}
      <View style={[
        styles.contextBanner,
        { 
          marginTop: Platform.OS === 'ios' ? insets.top + 16 : (Platform.OS === 'android' ? 60 : 70)
        }
      ]}>
        <IconSymbol
          ios_icon_name="exclamationmark.triangle.fill"
          android_material_icon_name="warning"
          size={28}
          color="#fff"
        />
        <View style={styles.contextBannerText}>
          <Text style={styles.contextBannerTitle}>
            ⚠️ YOU ARE MANAGING {contextType === 'player' ? 'PLAYER' : 'TEAM'}
          </Text>
          <Text style={styles.contextBannerSubtitle}>
            {contextName}
          </Text>
          <Text style={styles.contextBannerInfo}>
            All changes affect this {contextType === 'player' ? 'player' : 'team'} only
          </Text>
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  adminBackground: {
    flex: 1,
    backgroundColor: '#F5E6D3', // Dusty yellow background (themeColors.contextWarning) - HARDCODED
  },
  compactAdminBackground: {
    flex: 1,
    backgroundColor: '#F7EFE2',
  },
  compactContextBar: {
    minHeight: 34,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(47, 125, 70, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.76)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  compactIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.13)',
  },
  compactContextLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#587064',
    letterSpacing: 0,
  },
  compactContextName: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '800',
    color: '#223A2C',
    letterSpacing: 0,
  },
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#B8860B',
    marginHorizontal: 16,
    backgroundColor: '#D4A574',
  },
  contextBannerText: {
    flex: 1,
  },
  contextBannerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  contextBannerSubtitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  contextBannerInfo: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.95,
    fontStyle: 'italic',
  },
});
