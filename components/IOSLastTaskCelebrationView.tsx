import React from 'react';
import { Platform, UIManager, View, ViewProps } from 'react-native';
import NativeLastTaskCelebrationView from '@/components/IOSLastTaskCelebrationViewNativeComponent';

type IOSLastTaskCelebrationViewProps = ViewProps & {
  burstKey: number;
  debugEnabled?: boolean;
  debugInfo?: string;
};

function isBridgelessEnabled() {
  return Boolean((globalThis as { RN$Bridgeless?: boolean }).RN$Bridgeless);
}

function isFabricEnabled() {
  return Boolean(
    (globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager
  );
}

function hasViewManagerConfig(viewName: string) {
  if (Platform.OS !== 'ios') {
    return false;
  }

  if (typeof UIManager.hasViewManagerConfig === 'function') {
    return UIManager.hasViewManagerConfig(viewName);
  }

  return UIManager.getViewManagerConfig?.(viewName) != null;
}

export function getIOSLastTaskCelebrationDiagnostics() {
  return {
    bridgelessEnabled: isBridgelessEnabled(),
    fabricEnabled: isFabricEnabled(),
    platformIOS: Platform.OS === 'ios',
    viewManagerConfigAvailable: hasViewManagerConfig('IOSLastTaskCelebrationView'),
  };
}

export function hasIOSLastTaskCelebrationView() {
  const diagnostics = getIOSLastTaskCelebrationDiagnostics();
  return diagnostics.platformIOS && (
    diagnostics.fabricEnabled ||
    diagnostics.bridgelessEnabled ||
    diagnostics.viewManagerConfigAvailable
  );
}

export function IOSLastTaskCelebrationView({
  burstKey,
  debugEnabled,
  debugInfo,
  style,
}: IOSLastTaskCelebrationViewProps) {
  if (Platform.OS !== 'ios') {
    return <View pointerEvents="none" style={style} />;
  }

  return (
    <NativeLastTaskCelebrationView
      burstKey={burstKey}
      debugEnabled={debugEnabled}
      debugInfo={debugInfo}
      pointerEvents="none"
      style={style}
    />
  );
}
