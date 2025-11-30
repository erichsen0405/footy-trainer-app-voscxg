
import { StyleSheet, useColorScheme } from 'react-native';

// Light mode colors (default)
const lightColors = {
  primary: '#4CAF50',
  secondary: '#2196F3',
  accent: '#FF9800',
  background: '#FFFFFF',
  backgroundAlt: '#F5F5F5',
  text: '#333333',
  textSecondary: '#666666',
  card: '#F5F5F5',
  highlight: '#E0E0E0',
  success: '#4CAF50',
  warning: '#FFC107',
  error: '#F44336',
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
};

// Dark mode colors
const darkColors = {
  primary: '#4CAF50',
  secondary: '#2196F3',
  accent: '#FF9800',
  background: '#000000',
  backgroundAlt: '#1C1C1E',
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  card: '#1C1C1E',
  highlight: '#2C2C2E',
  success: '#4CAF50',
  warning: '#FFC107',
  error: '#F44336',
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
};

// Export a function to get colors based on color scheme
export const getColors = (colorScheme: 'light' | 'dark' | null | undefined) => {
  return colorScheme === 'dark' ? darkColors : lightColors;
};

// Default export - always use light colors
export const colors = lightColors;

export const buttonStyles = StyleSheet.create({
  instructionsButton: {
    backgroundColor: lightColors.primary,
    alignSelf: 'center',
    width: '100%',
  },
  backButton: {
    backgroundColor: lightColors.backgroundAlt,
    alignSelf: 'center',
    width: '100%',
  },
});

export const commonStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: lightColors.background,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 800,
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    color: lightColors.text,
    marginBottom: 10
  },
  text: {
    fontSize: 16,
    fontWeight: '500',
    color: lightColors.text,
    marginBottom: 8,
    lineHeight: 24,
    textAlign: 'center',
  },
  section: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: lightColors.backgroundAlt,
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
    width: '100%',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  icon: {
    width: 60,
    height: 60,
  },
});
