
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Animated, useColorScheme } from 'react-native';
import { colors, getColors } from '@/styles/commonStyles';

interface InlineFeedbackProps {
  message: string;
  visible: boolean;
  onHide: () => void;
  duration?: number;
}

export default function InlineFeedback({ 
  message, 
  visible, 
  onHide, 
  duration = 3000 
}: InlineFeedbackProps) {
  const colorScheme = useColorScheme();
  const themeColors = getColors(colorScheme);
  const isDark = colorScheme === 'dark';
  
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (visible) {
      // Fade in and slide down
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-hide after duration
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -20,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          onHide();
        });
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, duration, opacity, translateY, onHide]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? '#2a2a2a' : '#fff',
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={[styles.iconContainer, { backgroundColor: colors.accent }]}>
        <Text style={styles.iconText}>🔒</Text>
      </View>
      <Text style={[styles.message, { color: isDark ? '#e3e3e3' : colors.text }]}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    zIndex: 9999,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
    elevation: 8,
    gap: 12,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 16,
  },
  message: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
});
