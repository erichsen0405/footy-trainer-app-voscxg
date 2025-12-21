
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/styles/commonStyles';

// This diagnostic component is only available in development
export default function SubscriptionDiagnostic() {
  if (!__DEV__) {
    return null;
  }

  // Lazy load the actual component only in development
  const SubscriptionDiagnosticDev = require('./SubscriptionDiagnostic.dev').default;
  return <SubscriptionDiagnosticDev />;
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: colors.background,
  },
});
