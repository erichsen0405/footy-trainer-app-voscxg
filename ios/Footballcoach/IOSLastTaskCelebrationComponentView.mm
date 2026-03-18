#ifdef RCT_NEW_ARCH_ENABLED

#import "IOSLastTaskCelebrationComponentView.h"

#import "Expo-Swift.h"
#import "ExpoModulesCore-Swift.h"
#import <React/RCTViewManager.h>
#import <React_RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>

#import "Footballcoach-Swift.h"

#import "../build/generated/ios/react/renderer/components/NativelySpecs/ComponentDescriptors.h"
#import "../build/generated/ios/react/renderer/components/NativelySpecs/Props.h"
#import "../build/generated/ios/react/renderer/components/NativelySpecs/RCTComponentViewHelpers.h"

using namespace facebook::react;

@interface IOSLastTaskCelebrationComponentView () <RCTIOSLastTaskCelebrationViewViewProtocol>
@end

@implementation IOSLastTaskCelebrationComponentView {
  IOSLastTaskCelebrationContentView *_celebrationView;
}

+ (void)load
{
  [super load];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<IOSLastTaskCelebrationViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const IOSLastTaskCelebrationViewProps>();
    _props = defaultProps;

    _celebrationView = [[IOSLastTaskCelebrationContentView alloc] initWithFrame:self.bounds];
    _celebrationView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    _celebrationView.backgroundColor = [UIColor clearColor];
    self.contentView = _celebrationView;
  }

  return self;
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &oldCelebrationProps = static_cast<const IOSLastTaskCelebrationViewProps &>(*_props);
  const auto &newCelebrationProps = static_cast<const IOSLastTaskCelebrationViewProps &>(*props);

  if (oldCelebrationProps.burstKey != newCelebrationProps.burstKey) {
    _celebrationView.burstKey = @(newCelebrationProps.burstKey);
  }

  [super updateProps:props oldProps:oldProps];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  [_celebrationView resetForRecycle];
}

@end

#endif
