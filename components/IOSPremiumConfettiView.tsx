import React from 'react';
import { Platform, UIManager, View, ViewProps } from 'react-native';
import { CelebrationType } from '@/utils/celebration';
import NativePremiumConfettiView from '@/components/IOSPremiumConfettiViewNativeComponent';

type IOSPremiumConfettiViewProps = ViewProps & {
  burstKey: number;
  debugEnabled?: boolean;
  debugInfo?: string;
  variant: CelebrationType;
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

export function getIOSPremiumConfettiDiagnostics() {
  return {
    bridgelessEnabled: isBridgelessEnabled(),
    fabricEnabled: isFabricEnabled(),
    platformIOS: Platform.OS === 'ios',
    viewManagerConfigAvailable: hasViewManagerConfig('IOSPremiumConfettiView'),
  };
}

export function hasIOSPremiumConfettiView() {
  const diagnostics = getIOSPremiumConfettiDiagnostics();
  return diagnostics.platformIOS && (
    diagnostics.fabricEnabled ||
    diagnostics.bridgelessEnabled ||
    diagnostics.viewManagerConfigAvailable
  );
}

export function IOSPremiumConfettiView({
  burstKey,
  debugEnabled,
  debugInfo,
  variant,
  style,
}: IOSPremiumConfettiViewProps) {
  if (Platform.OS !== 'ios') {
    return <View pointerEvents="none" style={style} />;
  }

  return (
    <NativePremiumConfettiView
      burstKey={burstKey}
      collapsable={false}
      debugEnabled={debugEnabled}
      debugInfo={debugInfo}
      onLayout={
        debugEnabled
          ? (event) => {
              const { width, height, x, y } = event.nativeEvent.layout;
              console.log('[IOSPremiumConfettiView] onLayout', { width, height, x, y, burstKey, variant });
            }
          : undefined
      }
      pointerEvents="none"
      style={style}
      variant={variant}
    />
  );
}
