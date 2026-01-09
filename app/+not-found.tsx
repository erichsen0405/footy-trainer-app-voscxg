import { Redirect, usePathname, useSegments, useRouter } from 'expo-router';
import { View, Text, TouchableOpacity } from 'react-native';

export default function NotFound() {
  const pathname = usePathname();
  const segments = useSegments();
  const router = useRouter();

  if (!__DEV__) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Unmatched route (DEV)</Text>
      <Text style={{ fontSize: 14, marginBottom: 4 }}>Pathname: {pathname}</Text>
      <Text style={{ fontSize: 12, marginBottom: 16 }}>Segments: {JSON.stringify(segments)}</Text>
      <TouchableOpacity
        onPress={() => router.replace('/(tabs)')}
        style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#4CAF50', borderRadius: 10 }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Gå til forsiden</Text>
      </TouchableOpacity>
    </View>
  );
}
