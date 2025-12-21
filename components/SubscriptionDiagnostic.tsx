
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/styles/commonStyles';
import SubscriptionDiagnosticDev from './SubscriptionDiagnostic.dev';

// This diagnostic component is only available in development
export default function SubscriptionDiagnostic() {
  if (!__DEV__) {
    return null;
  }

  // Use the dev component directly
  return <SubscriptionDiagnosticDev />;
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: colors.background,
  },
});
