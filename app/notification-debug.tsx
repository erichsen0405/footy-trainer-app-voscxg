
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/styles/commonStyles';
import NotificationDebugDev from './notification-debug.dev';

// This debug screen is only available in development
export default function NotificationDebugScreen() {
  if (!__DEV__) {
    return null;
  }

  // Use the dev component directly
  return <NotificationDebugDev />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 16,
    color: colors.text,
  },
});
