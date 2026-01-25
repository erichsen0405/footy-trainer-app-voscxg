import React from "react";
import { Platform, StyleProp, TextStyle, ViewStyle, OpaqueColorValue } from "react-native";
import { SymbolView, SymbolViewProps, SymbolWeight } from "expo-symbols";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

// Type for Material Icons - using a more permissive type to avoid errors
type MaterialIconName = keyof typeof MaterialIcons.glyphMap;

export type IconSymbolProps = {
  ios_icon_name?: SymbolViewProps["name"] | string;
  android_material_icon_name?: MaterialIconName | string;
  name?: string;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
};

/**
 * An icon component that uses native SFSymbols on iOS, and MaterialIcons on Android and web. 
 * This ensures a consistent look across platforms, and optimal resource usage.
 *
 * Icon `name`s are based on SFSymbols and require manual mapping to MaterialIcons.
 */
export function IconSymbol({
  ios_icon_name,
  android_material_icon_name,
  name,
  size = 24,
  color,
  style,
  weight = "regular",
}: IconSymbolProps) {
  const resolvedIosName = (name ?? ios_icon_name ?? 'questionmark') as SymbolViewProps['name'];
  const resolvedAndroidName = android_material_icon_name ?? name ?? ios_icon_name ?? 'star';

  // Platform-specific rendering
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        weight={weight}
        tintColor={color as string}
        resizeMode="scaleAspectFit"
        name={resolvedIosName}
        style={[
          {
            width: size,
            height: size,
          },
          style,
        ]}
      />
    );
  }

  // Android/Web: Use MaterialIcons
  // Validate and fallback to a safe icon if the requested one doesn't exist
  const candidateName = String(resolvedAndroidName);
  let iconName: MaterialIconName;
  
  if (candidateName in MaterialIcons.glyphMap) {
    iconName = candidateName as MaterialIconName;
  } else {
    // Log warning for debugging
    console.warn(
      `⚠️ Material Icon "${candidateName}" not found in glyphMap. ` +
      `iOS icon: "${resolvedIosName}". Using fallback icon "star".`
    );
    // Use 'star' as fallback instead of 'help_outline' for better visual consistency
    iconName = 'star' as MaterialIconName;
  }

  return (
    <MaterialIcons
      color={color as string}
      size={size}
      name={iconName}
      style={style as StyleProp<TextStyle>}
    />
  );
}
