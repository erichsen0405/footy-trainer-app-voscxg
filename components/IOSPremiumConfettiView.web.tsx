import React from 'react';
import { View, type ViewProps } from 'react-native';
import { type CelebrationType } from '@/utils/celebration';

type IOSPremiumConfettiViewProps = ViewProps & {
  burstKey: number;
  debugEnabled?: boolean;
  debugInfo?: string;
  variant: CelebrationType;
};

export function getIOSPremiumConfettiDiagnostics() {
  return {
    bridgelessEnabled: false,
    fabricEnabled: false,
    platformIOS: false,
    viewManagerConfigAvailable: false,
  };
}

export function hasIOSPremiumConfettiView() {
  return false;
}

export function IOSPremiumConfettiView({
  style,
}: IOSPremiumConfettiViewProps) {
  return <View pointerEvents="none" style={style} />;
}
