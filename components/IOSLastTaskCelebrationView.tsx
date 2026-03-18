import React from 'react';
import { Platform, UIManager, View, ViewProps } from 'react-native';
import NativeLastTaskCelebrationView from '@/components/IOSLastTaskCelebrationViewNativeComponent';

type IOSLastTaskCelebrationViewProps = ViewProps & {
  burstKey: number;
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

export function hasIOSLastTaskCelebrationView() {
  return Platform.OS === 'ios' && (
    isFabricEnabled() ||
    isBridgelessEnabled() ||
    hasViewManagerConfig('IOSLastTaskCelebrationView')
  );
}

export function IOSLastTaskCelebrationView({
  burstKey,
  style,
}: IOSLastTaskCelebrationViewProps) {
  if (!hasIOSLastTaskCelebrationView()) {
    return <View pointerEvents="none" style={style} />;
  }

  return (
    <NativeLastTaskCelebrationView
      burstKey={burstKey}
      pointerEvents="none"
      style={style}
    />
  );
}
