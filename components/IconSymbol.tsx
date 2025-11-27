
// This file is a fallback for using MaterialIcons on Android and web.

import React from "react";
import { SymbolWeight } from "expo-symbols";
import {
  OpaqueColorValue,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

// Type for Material Icons - using a more permissive type to avoid errors
type MaterialIconName = keyof typeof MaterialIcons.glyphMap;

// List of valid Material Icon names that we commonly use
const VALID_MATERIAL_ICONS: Record<string, boolean> = {
  // Navigation
  'home': true,
  'chevron_left': true,
  'chevron_right': true,
  'expand_less': true,
  'expand_more': true,
  'close': true,
  'cancel': true,
  'add': true,
  'add_circle_outline': true,
  'add_circle': true,
  'remove': true,
  'check': true,
  'check_circle_outline': true,
  'check_circle': true,
  'arrow_back': true,
  'arrow_forward': true,
  'arrow_upward': true,
  'arrow_downward': true,
  
  // Actions
  'edit': true,
  'delete': true,
  'content_copy': true,
  'download': true,
  'upload': true,
  'share': true,
  'sync': true,
  'undo': true,
  'exit_to_app': true,
  
  // Content
  'format_align_left': true,
  'format_align_center': true,
  'format_align_right': true,
  'description': true,
  'apps': true,
  'list': true,
  'checklist': true,
  'subject': true,
  
  // Calendar & Time
  'calendar_today': true,
  'event': true,
  'event_busy': true,
  'access_time': true,
  'schedule': true,
  
  // Location
  'place': true,
  'location_on': true,
  
  // Communication
  'notifications_none': true,
  'notifications': true,
  'phone': true,
  'email': true,
  
  // Media
  'photo': true,
  'camera_alt': true,
  
  // User
  'person': true,
  'account_circle': true,
  
  // Settings
  'settings': true,
  'tune': true,
  'filter_list': true,
  
  // Status
  'info': true,
  'warning': true,
  'error': true,
  'verified_user': true,
  
  // Search
  'search': true,
  
  // Sports
  'emoji_events': true,
  
  // Selection
  'check_box_outline_blank': true,
  'check_box': true,
  
  // Tags
  'label_outline': true,
  'label': true,
  
  // Charts
  'bar_chart': true,
  
  // Fallback
  'help_outline': true,
};

/**
 * An icon component that uses native SFSymbols on iOS, and MaterialIcons on Android and web. This ensures a consistent look across platforms, and optimal resource usage.
 *
 * Icon `name`s are based on SFSymbols and require manual mapping to MaterialIcons.
 */
export function IconSymbol({
  ios_icon_name = undefined,
  android_material_icon_name,
  size = 24,
  color,
  style,
}: {
  ios_icon_name?: string | undefined;
  android_material_icon_name: MaterialIconName | string;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  // Validate and fallback to help_outline if icon doesn't exist
  let iconName: MaterialIconName;
  
  if (android_material_icon_name in MaterialIcons.glyphMap) {
    iconName = android_material_icon_name as MaterialIconName;
  } else {
    // Log warning for debugging
    console.warn(
      `⚠️ Material Icon "${android_material_icon_name}" not found in glyphMap. ` +
      `iOS icon: "${ios_icon_name}". Using fallback icon "help_outline".`
    );
    iconName = 'help_outline' as MaterialIconName;
  }

  return (
    <MaterialIcons
      color={color}
      size={size}
      name={iconName}
      style={style as StyleProp<TextStyle>}
    />
  );
}
