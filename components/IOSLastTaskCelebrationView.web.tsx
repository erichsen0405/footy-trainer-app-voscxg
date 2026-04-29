import React from 'react';
import { View, type ViewProps } from 'react-native';

type IOSLastTaskCelebrationViewProps = ViewProps & {
  burstKey: number;
  debugEnabled?: boolean;
  debugInfo?: string;
};

export function getIOSLastTaskCelebrationDiagnostics() {
  return {
    bridgelessEnabled: false,
    fabricEnabled: false,
    platformIOS: false,
    viewManagerConfigAvailable: false,
  };
}

export function hasIOSLastTaskCelebrationView() {
  return false;
}

export function IOSLastTaskCelebrationView({
  style,
}: IOSLastTaskCelebrationViewProps) {
  return <View pointerEvents="none" style={style} />;
}
