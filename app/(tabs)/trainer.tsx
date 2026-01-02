import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function TrainerRedirect() {
  const router = useRouter();

  useEffect(() => {
    // F11: Trainer-route er udfaset -> send brugeren tilbage til tabs-root (Home).
    // (Vi holder dette simpelt og sikkert for at undgaa "unknown route" hvis profil-path varierer.)
    router.replace('/(tabs)/profile');
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
