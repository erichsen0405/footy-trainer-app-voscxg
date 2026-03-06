import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type AppStartupLoaderProps = {
  visible: boolean;
  progress?: number;
};

const clampProgress = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

export default function AppStartupLoader({ visible, progress = 0 }: AppStartupLoaderProps) {
  if (!visible) return null;
  const clampedProgress = clampProgress(progress);
  const progressPercent = Math.round(clampedProgress * 100);

  return (
    <View style={styles.overlay} pointerEvents="auto" accessibilityLabel="App loader">
      <ActivityIndicator size="large" color="#2A7A3B" />
      <Text style={styles.label}>App loader</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
      </View>
      <Text style={styles.progressText}>{progressPercent}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6FAF7',
    zIndex: 9999,
  },
  label: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  progressTrack: {
    width: 220,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#D5E4D8',
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#2A7A3B',
  },
  progressText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
});
