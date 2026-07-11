import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function TrainerRedirect() {
  const router = useRouter();

  useEffect(() => {
    // F11: Trainer route is deprecated; the trainer start page is now Overview.
    router.replace('/(tabs)/coach-dashboard');
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
