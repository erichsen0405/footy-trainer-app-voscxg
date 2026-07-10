import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useUserRole } from '@/hooks/useUserRole';

export default function TabsIndexRedirect() {
  const { userRole, loading } = useUserRole();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator />
      </View>
    );
  }

  const isTrainer = userRole === 'admin' || userRole === 'trainer';
  return <Redirect href={isTrainer ? '/(tabs)/coach-dashboard' : '/(tabs)/(home)'} />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
