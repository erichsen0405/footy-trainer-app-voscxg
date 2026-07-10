import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function TrainerRedirect() {
  const router = useRouter();

  useEffect(() => {
    // F11: Trainer-route er udfaset; trainerens startside er nu Overblik.
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
