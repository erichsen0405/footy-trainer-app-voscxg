import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';
import type { Int32, WithDefault } from 'react-native/Libraries/Types/CodegenTypes';
import type { ViewProps } from 'react-native';

export interface NativeProps extends ViewProps {
  burstKey: Int32;
  debugEnabled?: WithDefault<boolean, false>;
  debugInfo?: string;
}

export default codegenNativeComponent<NativeProps>('IOSLastTaskCelebrationView', {
  excludedPlatforms: ['android'],
});
