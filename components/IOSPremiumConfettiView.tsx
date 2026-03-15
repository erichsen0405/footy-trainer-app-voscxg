import React from 'react';
import {
  Platform,
  UIManager,
  View,
  ViewProps,
  requireNativeComponent,
} from 'react-native';
import { CelebrationType } from '@/utils/celebration';

type IOSPremiumConfettiViewProps = ViewProps & {
  burstKey: number;
  variant: CelebrationType;
};

let NativePremiumConfettiView: React.ComponentType<IOSPremiumConfettiViewProps> | null = null;

if (Platform.OS === 'ios') {
  const nativeViewName = ['IOSPremiumConfettiView', 'IOSPremiumConfettiViewManager'].find(
    (viewName) => UIManager.getViewManagerConfig(viewName)
  );

  if (nativeViewName) {
    try {
      NativePremiumConfettiView =
        requireNativeComponent<IOSPremiumConfettiViewProps>(nativeViewName);
    } catch {
      NativePremiumConfettiView = null;
    }
  }
}

export function hasIOSPremiumConfettiView() {
  return Platform.OS === 'ios' && NativePremiumConfettiView !== null;
}

export function IOSPremiumConfettiView({
  burstKey,
  variant,
  style,
}: IOSPremiumConfettiViewProps) {
  if (Platform.OS !== 'ios' || !NativePremiumConfettiView) {
    return <View pointerEvents="none" style={style} />;
  }

  return (
    <NativePremiumConfettiView
      burstKey={burstKey}
      pointerEvents="none"
      style={style}
      variant={variant}
    />
  );
}
