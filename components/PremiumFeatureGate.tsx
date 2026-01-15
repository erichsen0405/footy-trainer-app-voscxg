import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';

interface PremiumFeatureGateProps {
  title: string;
  description: string;
  onPress?: () => void;
  ctaLabel?: string;
  icon?: {
    ios: string;
    android: string;
  };
  style?: StyleProp<ViewStyle>;
  align?: 'left' | 'center';
}

export function PremiumFeatureGate({
  title,
  description,
  onPress,
  ctaLabel = 'Opgrader til Premium',
  icon = { ios: 'star.circle.fill', android: 'stars' },
  style,
  align = 'center',
}: PremiumFeatureGateProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const textColor = isDark ? '#f1f5f9' : colors.text;
  const textSecondary = isDark ? '#cbd5f5' : colors.textSecondary;
  const backgroundColor = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.05)';

  return (
    <View style={[styles.container, { backgroundColor }, style]}>
      <View style={[styles.iconWrap, { backgroundColor: isDark ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.08)' }]}>
        <IconSymbol
          ios_icon_name={icon.ios}
          android_material_icon_name={icon.android}
          size={28}
          color={colors.primary}
        />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: textColor, textAlign: align }]}>{title}</Text>
        <Text style={[styles.description, { color: textSecondary, textAlign: align }]}>{description}</Text>
      </View>
      {onPress ? (
        <TouchableOpacity style={[styles.ctaButton, { backgroundColor: colors.primary }]} onPress={onPress} activeOpacity={0.85}>
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    width: '100%',
    gap: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  ctaButton: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  ctaText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
});
