import React, { useCallback, useMemo } from 'react';
import {
  Image,
  ImageBackground,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCurrentOwnerBranding } from '@/hooks/useCurrentOwnerBranding';

const FOOTBALL_COACH_LOGO = require('../assets/images/fc_logo_blue.png');
const FALLBACK_PRIMARY = '#162634';
const FALLBACK_ACCENT = '#4CAF50';

function normalizeHex(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized && /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
}

function hexToRgb(value: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(value, FALLBACK_PRIMARY).replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function readableTextColor(backgroundColor: string): string {
  const { r, g, b } = hexToRgb(backgroundColor);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111827' : '#FFFFFF';
}

function withOpacity(hexColor: string, opacity: number): string {
  const { r, g, b } = hexToRgb(hexColor);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function initialsFromName(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'FC';
}

function HomeBrandHeaderContent({
  title,
  subtitle,
  logoUrl,
  isOwnerBrand,
  primaryColor,
  accentColor,
  textColor,
}: {
  title: string;
  subtitle: string;
  logoUrl: string | null;
  isOwnerBrand: boolean;
  primaryColor: string;
  accentColor: string;
  textColor: string;
}) {
  return (
    <>
      <View style={[styles.logoContainer, { borderColor: withOpacity(accentColor, 0.75), backgroundColor: withOpacity('#ffffff', 0.94) }]}>
        {isOwnerBrand && logoUrl ? (
          <Image
            source={{ uri: logoUrl }}
            style={styles.ownerLogo}
            resizeMode="cover"
            accessibilityLabel={`${title} logo`}
            testID="home-header-logo"
          />
        ) : isOwnerBrand ? (
          <Text style={[styles.logoInitials, { color: primaryColor }]} testID="home-header-logo">
            {initialsFromName(title)}
          </Text>
        ) : (
          <Image
            source={FOOTBALL_COACH_LOGO}
            style={styles.fallbackLogo}
            resizeMode="stretch"
            accessibilityLabel="Football Coach logo"
            testID="home-header-logo"
          />
        )}
      </View>
      <View style={styles.headerTextContainer}>
        <Text style={[styles.headerTitle, { color: textColor }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.subtitleRow}>
          <View style={[styles.accentDot, { backgroundColor: accentColor }]} />
          <Text style={[styles.headerSubtitle, { color: withOpacity(textColor, 0.88) }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>
    </>
  );
}

export function HomeBrandHeader({
  style,
  paddingTop,
  paddingBottom,
}: {
  style?: StyleProp<ViewStyle>;
  paddingTop?: number;
  paddingBottom?: number;
}) {
  const { branding, refresh } = useCurrentOwnerBranding();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const headerBrand = useMemo(() => {
    const primaryColor = normalizeHex(branding?.brandColors.primary, FALLBACK_PRIMARY);
    const accentColor = normalizeHex(branding?.brandColors.accent, FALLBACK_ACCENT);
    const isOwnerBrand = Boolean(branding);
    const title = branding?.displayName ?? 'Football Coach';
    const subtitle = branding?.bio
      ?? (branding?.ownerType === 'club' ? 'Club player development' : null)
      ?? (branding ? 'Private coach programs' : 'Train like a Pro');

    return {
      isOwnerBrand,
      title,
      subtitle,
      logoUrl: branding?.logoUrl ?? null,
      coverUrl: branding?.coverUrl ?? null,
      primaryColor,
      accentColor,
      textColor: readableTextColor(primaryColor),
    };
  }, [branding]);

  const containerStyle = [
    styles.header,
    {
      backgroundColor: headerBrand.primaryColor,
      paddingTop,
      paddingBottom,
    },
    style,
  ];

  if (headerBrand.coverUrl) {
    return (
      <ImageBackground
        source={{ uri: headerBrand.coverUrl }}
        style={containerStyle}
        imageStyle={styles.coverImage}
        resizeMode="cover"
        testID="home-brand-header"
      >
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: withOpacity(headerBrand.primaryColor, 0.82) }]} />
        <HomeBrandHeaderContent {...headerBrand} />
      </ImageBackground>
    );
  }

  return (
    <View style={containerStyle} testID="home-brand-header">
      <HomeBrandHeaderContent {...headerBrand} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  coverImage: {
    opacity: 0.95,
  },
  logoContainer: {
    marginRight: 16,
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fallbackLogo: {
    width: 56,
    height: 38,
  },
  ownerLogo: {
    width: '100%',
    height: '100%',
  },
  logoInitials: {
    fontSize: 21,
    fontWeight: '900',
  },
  headerTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '900',
  },
  subtitleRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerSubtitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
});
