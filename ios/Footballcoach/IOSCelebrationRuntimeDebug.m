#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <objc/message.h>

@interface IOSCelebrationRuntimeDebug : NSObject <RCTBridgeModule>
@end

@implementation IOSCelebrationRuntimeDebug

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_REMAP_METHOD(
    collectStatus,
    collectStatusWithResolver:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    Class premiumComponentViewClass = NSClassFromString(@"IOSPremiumConfettiComponentView");
    Class premiumContentViewClass = NSClassFromString(@"IOSPremiumConfettiContentView");
    Class premiumManagerClass = NSClassFromString(@"IOSPremiumConfettiView");

    Class lastTaskComponentViewClass = NSClassFromString(@"IOSLastTaskCelebrationComponentView");
    Class lastTaskContentViewClass = NSClassFromString(@"IOSLastTaskCelebrationContentView");
    Class lastTaskManagerClass = NSClassFromString(@"IOSLastTaskCelebrationView");

    Class thirdPartyProviderClass = NSClassFromString(@"RCTThirdPartyComponentsProvider");
    NSDictionary<NSString *, Class> *thirdPartyComponents = nil;
    SEL providerSelector = NSSelectorFromString(@"thirdPartyFabricComponents");
    BOOL thirdPartyProviderResponds =
        thirdPartyProviderClass != Nil && [thirdPartyProviderClass respondsToSelector:providerSelector];

    if (thirdPartyProviderResponds) {
      thirdPartyComponents =
          ((id(*)(id, SEL))objc_msgSend)(thirdPartyProviderClass, providerSelector);
    }

    Class premiumMappedClass = thirdPartyComponents[@"IOSPremiumConfettiView"];
    Class lastTaskMappedClass = thirdPartyComponents[@"IOSLastTaskCelebrationView"];

    NSDictionary *status = @{
      @"premiumComponentViewClassAvailable": @(premiumComponentViewClass != Nil),
      @"premiumComponentViewClassName": premiumComponentViewClass ? NSStringFromClass(premiumComponentViewClass) : [NSNull null],
      @"premiumContentViewClassAvailable": @(premiumContentViewClass != Nil),
      @"premiumContentViewClassName": premiumContentViewClass ? NSStringFromClass(premiumContentViewClass) : [NSNull null],
      @"premiumManagerClassAvailable": @(premiumManagerClass != Nil),
      @"premiumManagerClassName": premiumManagerClass ? NSStringFromClass(premiumManagerClass) : [NSNull null],
      @"premiumProviderMapped": @(premiumMappedClass != Nil),
      @"premiumProviderMappedClassName": premiumMappedClass ? NSStringFromClass(premiumMappedClass) : [NSNull null],
      @"lastTaskComponentViewClassAvailable": @(lastTaskComponentViewClass != Nil),
      @"lastTaskComponentViewClassName": lastTaskComponentViewClass ? NSStringFromClass(lastTaskComponentViewClass) : [NSNull null],
      @"lastTaskContentViewClassAvailable": @(lastTaskContentViewClass != Nil),
      @"lastTaskContentViewClassName": lastTaskContentViewClass ? NSStringFromClass(lastTaskContentViewClass) : [NSNull null],
      @"lastTaskManagerClassAvailable": @(lastTaskManagerClass != Nil),
      @"lastTaskManagerClassName": lastTaskManagerClass ? NSStringFromClass(lastTaskManagerClass) : [NSNull null],
      @"lastTaskProviderMapped": @(lastTaskMappedClass != Nil),
      @"lastTaskProviderMappedClassName": lastTaskMappedClass ? NSStringFromClass(lastTaskMappedClass) : [NSNull null],
      @"thirdPartyProviderClassAvailable": @(thirdPartyProviderClass != Nil),
      @"thirdPartyProviderClassName": thirdPartyProviderClass ? NSStringFromClass(thirdPartyProviderClass) : [NSNull null],
      @"thirdPartyProviderAvailable": @(thirdPartyComponents != nil),
      @"thirdPartyProviderResponds": @(thirdPartyProviderResponds),
    };

    NSLog(@"[IOSCelebrationRuntimeDebug] %@", status);
    resolve(status);
  } @catch (NSException *exception) {
    reject(@"celebration_runtime_debug_failed", exception.reason, nil);
  }
}

@end
