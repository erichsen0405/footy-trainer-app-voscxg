import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { OnboardingGate } from '@/components/OnboardingGate';
import { colors } from '@/styles/commonStyles';

const ChoosePlanScreen = () => (
  <View style={styles.container}>
    <OnboardingGate renderInlinePaywall>
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loaderText}>Åbner FootballCoach...</Text>
      </View>
    </OnboardingGate>
  </View>
);

export default ChoosePlanScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loaderText: {
    marginTop: 12,
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
  },
});
