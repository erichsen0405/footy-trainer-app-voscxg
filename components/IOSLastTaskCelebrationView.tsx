import React from 'react';
import {
  Platform,
  UIManager,
  View,
  ViewProps,
  requireNativeComponent,
} from 'react-native';

type IOSLastTaskCelebrationViewProps = ViewProps & {
  burstKey: number;
};

let NativeLastTaskCelebrationView: React.ComponentType<IOSLastTaskCelebrationViewProps> | null = null;

if (Platform.OS === 'ios') {
  const nativeViewName = ['IOSLastTaskCelebrationView', 'IOSLastTaskCelebrationViewManager'].find(
    (viewName) => UIManager.getViewManagerConfig(viewName)
  );

  if (nativeViewName) {
    try {
      NativeLastTaskCelebrationView =
        requireNativeComponent<IOSLastTaskCelebrationViewProps>(nativeViewName);
    } catch {
      NativeLastTaskCelebrationView = null;
    }
  }
}

export function hasIOSLastTaskCelebrationView() {
  return Platform.OS === 'ios' && NativeLastTaskCelebrationView !== null;
}

export function IOSLastTaskCelebrationView({
  burstKey,
  style,
}: IOSLastTaskCelebrationViewProps) {
  if (Platform.OS !== 'ios' || !NativeLastTaskCelebrationView) {
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
