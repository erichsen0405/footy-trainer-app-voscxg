
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';

interface AdminContextWrapperProps {
  isAdmin: boolean;
  contextName?: string;
  contextType?: 'player' | 'team';
  children: React.ReactNode;
}

export function AdminContextWrapper({
  isAdmin,
  contextName = '',
  contextType = 'player',
  children,
}: AdminContextWrapperProps) {
  if (!isAdmin) {
    // When not in admin mode, render children without any wrapper styling
    return <>{children}</>;
  }

  return (
    <View style={styles.adminBackground}>
      {/* Admin warning banner - always rendered when isAdmin is true */}
      <View style={styles.contextBanner}>
        <IconSymbol
          ios_icon_name="exclamationmark.triangle.fill"
          android_material_icon_name="warning"
          size={28}
          color="#fff"
        />
        <View style={styles.contextBannerText}>
          <Text style={styles.contextBannerTitle}>
            ⚠️ DU ADMINISTRERER {contextType === 'player' ? 'SPILLER' : 'TEAM'}
          </Text>
          <Text style={styles.contextBannerSubtitle}>
            {contextName}
          </Text>
          <Text style={styles.contextBannerInfo}>
            Alle ændringer påvirker denne {contextType === 'player' ? 'spillers' : 'teams'} data
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
    marginTop: Platform.OS === 'android' ? 60 : 70,
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
