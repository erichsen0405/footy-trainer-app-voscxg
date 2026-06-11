
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

interface AppleSubscriptionManagerProps {
  onPlanSelected?: (productId: string) => void;
  isSignupFlow?: boolean;
  selectedRole?: 'player' | 'trainer' | null;
  highlightProductId?: string;
  forceShowPlans?: boolean;
}

export default function AppleSubscriptionManager({ 
  onPlanSelected, 
  isSignupFlow = false,
  selectedRole = null,
  highlightProductId,
  forceShowPlans = false,
}: AppleSubscriptionManagerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  return (
    <View style={styles.notAvailableContainer}>
      <IconSymbol
        ios_icon_name="exclamationmark.triangle.fill"
        android_material_icon_name="warning"
        size={48}
        color={colors.warning}
      />
      <Text style={[styles.notAvailableTitle, { color: textColor }]}>
        Unavailable on web
      </Text>
      <Text style={[styles.notAvailableText, { color: textSecondaryColor }]}>
        Apple In-App Purchases are only available in the iOS app.
        {'\n\n'}
        To purchase a subscription, download the app from the App Store.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notAvailableContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
    minHeight: 300,
  },
  notAvailableTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  notAvailableText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
});
