#ifdef RCT_NEW_ARCH_ENABLED

#import "IOSPremiumConfettiComponentView.h"

#import "Expo-Swift.h"
#import "ExpoModulesCore-Swift.h"
#import <React/RCTViewManager.h>
#import <React_RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>

#import "Footballcoach-Swift.h"

#import "../build/generated/ios/react/renderer/components/NativelySpecs/ComponentDescriptors.h"
#import "../build/generated/ios/react/renderer/components/NativelySpecs/Props.h"
#import "../build/generated/ios/react/renderer/components/NativelySpecs/RCTComponentViewHelpers.h"

using namespace facebook::react;

@interface IOSPremiumConfettiComponentView () <RCTIOSPremiumConfettiViewViewProtocol>
@end

@implementation IOSPremiumConfettiComponentView {
  IOSPremiumConfettiContentView *_confettiView;
}

+ (void)load
{
  [super load];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<IOSPremiumConfettiViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const IOSPremiumConfettiViewProps>();
    _props = defaultProps;

    _confettiView = [[IOSPremiumConfettiContentView alloc] initWithFrame:self.bounds];
    _confettiView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    _confettiView.backgroundColor = [UIColor clearColor];
    self.contentView = _confettiView;
  }

  return self;
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &oldConfettiProps = static_cast<const IOSPremiumConfettiViewProps &>(*_props);
  const auto &newConfettiProps = static_cast<const IOSPremiumConfettiViewProps &>(*props);

  if (oldConfettiProps.burstKey != newConfettiProps.burstKey) {
    _confettiView.burstKey = @(newConfettiProps.burstKey);
  }

  if (oldConfettiProps.variant != newConfettiProps.variant) {
    NSString *variant = newConfettiProps.variant.empty()
        ? @"task"
        : [NSString stringWithUTF8String:newConfettiProps.variant.c_str()];
    _confettiView.variant = variant;
  }

  [super updateProps:props oldProps:oldProps];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  [_confettiView resetForRecycle];
}

@end

#endif
