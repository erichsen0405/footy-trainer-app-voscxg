import React from 'react';
import { Platform, UIManager, View, ViewProps } from 'react-native';
import { CelebrationType } from '@/utils/celebration';
import NativePremiumConfettiView from '@/components/IOSPremiumConfettiViewNativeComponent';

type IOSPremiumConfettiViewProps = ViewProps & {
  burstKey: number;
  variant: CelebrationType;
};

function hasViewManagerConfig(viewName: string) {
  if (Platform.OS !== 'ios') {
    return false;
  }

  if (typeof UIManager.hasViewManagerConfig === 'function') {
    return UIManager.hasViewManagerConfig(viewName);
  }

  return UIManager.getViewManagerConfig?.(viewName) != null;
}

export function hasIOSPremiumConfettiView() {
  return hasViewManagerConfig('IOSPremiumConfettiView');
}

export function IOSPremiumConfettiView({
  burstKey,
  variant,
  style,
}: IOSPremiumConfettiViewProps) {
  if (!hasIOSPremiumConfettiView()) {
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
