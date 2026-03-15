import React
import UIKit

@objc(IOSPremiumConfettiView)
final class IOSPremiumConfettiViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func view() -> UIView! {
    IOSPremiumConfettiView()
  }
}
