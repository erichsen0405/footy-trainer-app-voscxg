import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  LayoutAnimation,
  Platform,
  UIManager,
  Animated,
} from 'react-native';
import * as CommonStyles from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  title: string;
  summary?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function AccordionSection({ title, summary, children, defaultExpanded = false }: Props) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const colorScheme = useColorScheme();
  const palette = useMemo(() => CommonStyles.getColors(colorScheme), [colorScheme]);
  const spinValue = useMemo(() => new Animated.Value(isExpanded ? 1 : 0), [isExpanded]);

  const toggleExpand = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(prev => !prev);
    Animated.timing(spinValue, {
      toValue: isExpanded ? 0 : 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [isExpanded, spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });

  return (
    <View style={[styles.card, { backgroundColor: palette.card, shadowColor: palette.shadow }]}>
      <TouchableOpacity style={styles.header} onPress={toggleExpand} activeOpacity={0.8}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
          {!isExpanded && summary && <Text style={[styles.summary, { color: palette.textSecondary }]}>{summary}</Text>}
        </View>
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron_right" size={24} color={palette.textSecondary} />
        </Animated.View>
      </TouchableOpacity>
      {isExpanded && <View style={styles.content}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  headerText: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  summary: {
    fontSize: 14,
    marginTop: 4,
  },
  content: {
    padding: 20,
    paddingTop: 0,
  },
});
