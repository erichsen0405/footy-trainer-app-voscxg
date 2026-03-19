#ifdef RCT_NEW_ARCH_ENABLED

#import "IOSPremiumConfettiComponentView.h"

#import "Expo-Swift.h"
#import "ExpoModulesCore-Swift.h"
#import <React/RCTConversions.h>
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
    self.userInteractionEnabled = NO;
    self.clipsToBounds = NO;
    [self addSubview:_confettiView];

    NSLog(@"[IOSPremiumConfettiComponentView] initWithFrame");
  }

  return self;
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _confettiView.frame = self.bounds;
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &oldConfettiProps = static_cast<const IOSPremiumConfettiViewProps &>(*_props);
  const auto &newConfettiProps = static_cast<const IOSPremiumConfettiViewProps &>(*props);

  if (oldConfettiProps.burstKey != newConfettiProps.burstKey) {
    _confettiView.burstKey = @(newConfettiProps.burstKey);
  }

  if (oldConfettiProps.debugEnabled != newConfettiProps.debugEnabled) {
    _confettiView.debugEnabled = newConfettiProps.debugEnabled;
    self.layer.borderWidth = newConfettiProps.debugEnabled ? 1.5 : 0;
    self.layer.borderColor = newConfettiProps.debugEnabled
        ? [UIColor colorWithRed:1.0 green:0.2 blue:0.45 alpha:0.7].CGColor
        : UIColor.clearColor.CGColor;
  }

  if (oldConfettiProps.debugInfo != newConfettiProps.debugInfo) {
    NSString *debugInfo = newConfettiProps.debugInfo.empty()
        ? @""
        : [NSString stringWithUTF8String:newConfettiProps.debugInfo.c_str()];
    _confettiView.debugInfo = debugInfo;
  }

  if (oldConfettiProps.variant != newConfettiProps.variant) {
    NSString *variant = newConfettiProps.variant.empty()
        ? @"task"
        : [NSString stringWithUTF8String:newConfettiProps.variant.c_str()];
    _confettiView.variant = variant;
  }

  NSLog(
      @"[IOSPremiumConfettiComponentView] updateProps burstKey=%d debug=%d",
      newConfettiProps.burstKey,
      newConfettiProps.debugEnabled);

  [super updateProps:props oldProps:oldProps];
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];

  const CGRect contentFrame = RCTCGRectFromRect(layoutMetrics.getContentFrame());
  _confettiView.frame = contentFrame;

  NSLog(
      @"[IOSPremiumConfettiComponentView] layout frame=%@ bounds=%@ content=%@",
      NSStringFromCGRect(RCTCGRectFromRect(layoutMetrics.frame)),
      NSStringFromCGRect(self.bounds),
      NSStringFromCGRect(contentFrame));
}

- (void)prepareForRecycle
{
  NSLog(@"[IOSPremiumConfettiComponentView] prepareForRecycle");
  [super prepareForRecycle];
  self.layer.borderWidth = 0;
  self.layer.borderColor = UIColor.clearColor.CGColor;
  [_confettiView resetForRecycle];
}

@end

#endif
