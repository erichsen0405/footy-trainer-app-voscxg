import React
import UIKit

@objc(IOSLastTaskCelebrationView)
final class IOSLastTaskCelebrationViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func view() -> UIView! {
    IOSLastTaskCelebrationContentView()
  }
}
