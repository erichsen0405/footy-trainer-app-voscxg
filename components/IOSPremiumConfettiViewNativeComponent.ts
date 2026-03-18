import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';
import type { Int32 } from 'react-native/Libraries/Types/CodegenTypes';
import type { ViewProps } from 'react-native';

export interface NativeProps extends ViewProps {
  burstKey: Int32;
  variant?: string;
}

export default codegenNativeComponent<NativeProps>('IOSPremiumConfettiView', {
  excludedPlatforms: ['android'],
});
