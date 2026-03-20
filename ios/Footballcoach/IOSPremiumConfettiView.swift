import QuartzCore
import UIKit

@objc(IOSPremiumConfettiContentView)
@objcMembers
final class IOSPremiumConfettiContentView: UIView {
  @objc var burstKey: NSNumber = 0 {
    didSet {
      let nextKey = burstKey.intValue
      if hasAutoplayedCurrentAttachment && lastBurstKey == 0 {
        lastBurstKey = nextKey
        updateDebugBadge(reason: "prop-sync")
        return
      }
      guard nextKey != lastBurstKey else { return }
      lastBurstKey = nextKey
      playBurst()
    }
  }

  @objc var debugEnabled: Bool = false {
    didSet {
      updateDebugBadge(reason: "debug-toggle")
    }
  }

  @objc var debugInfo: NSString = "" {
    didSet {
      updateDebugBadge(reason: "debug-info")
    }
  }

  @objc var variant: NSString = "task" {
    didSet {
      updateDebugBadge(reason: "variant")
    }
  }

  private lazy var debugLabel: UILabel = {
    let label = UILabel()
    label.backgroundColor = UIColor.black.withAlphaComponent(0.6)
    label.textColor = .white
    label.font = UIFont.monospacedSystemFont(ofSize: 10, weight: .semibold)
    label.numberOfLines = 0
    label.layer.cornerRadius = 8
    label.layer.masksToBounds = true
    label.isHidden = true
    return label
  }()

  private var confettiLayers: [IOSReferenceConfettiLayer] = []
  private var cleanupWorkItems: [DispatchWorkItem] = []
  private var lastBurstKey = 0
  private var hasAutoplayedCurrentAttachment = false
  private var reduceMotionObserver: NSObjectProtocol?

  override init(frame: CGRect) {
    super.init(frame: frame)
    commonInit()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    commonInit()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    debugLabel.frame = CGRect(x: 12, y: 16, width: max(bounds.width - 24, 120), height: 44)
    confettiLayers.forEach { $0.frame = bounds }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()

    if window == nil {
      debugLog("detached from window")
      hasAutoplayedCurrentAttachment = false
      lastBurstKey = 0
      stopBurst()
      updateDebugBadge(reason: "detached")
      return
    }

    debugLog("attached to window")
    updateDebugBadge(reason: "attached")

    guard !hasAutoplayedCurrentAttachment else { return }
    hasAutoplayedCurrentAttachment = true

    DispatchQueue.main.async { [weak self] in
      self?.playBurst()
    }
  }

  deinit {
    stopBurst()

    if let reduceMotionObserver {
      NotificationCenter.default.removeObserver(reduceMotionObserver)
    }
  }

  private var shouldReduceMotion: Bool {
    UIAccessibility.isReduceMotionEnabled
  }

  private var palette: [UIColor] {
    [
      .systemRed,
      .systemPink,
      .systemYellow,
      .systemTeal,
      .systemBlue,
      .systemGreen,
    ]
  }

  private func commonInit() {
    accessibilityIdentifier = "ios-premium-confetti-content-view"
    backgroundColor = .clear
    clipsToBounds = false
    contentScaleFactor = UIScreen.main.scale
    isAccessibilityElement = false
    isUserInteractionEnabled = false
    addSubview(debugLabel)
    installReduceMotionObserver()
    updateDebugBadge(reason: "init")
  }

  private func installReduceMotionObserver() {
    reduceMotionObserver = NotificationCenter.default.addObserver(
      forName: UIAccessibility.reduceMotionStatusDidChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      guard let self else { return }
      self.debugLog("reduce motion changed \(self.shouldReduceMotion ? "on" : "off")")
      if self.shouldReduceMotion {
        self.stopBurst()
      }
      self.updateDebugBadge(reason: "reduce-motion")
    }
  }

  private func playBurst() {
    if shouldReduceMotion {
      debugLog("burst skipped because reduce motion is enabled")
      updateDebugBadge(reason: "reduce-motion-blocked")
      return
    }

    guard bounds.width > 0, bounds.height > 0 else {
      DispatchQueue.main.async { [weak self] in
        self?.playBurst()
      }
      return
    }

    debugLog("play burst key=\(burstKey) variant=\(variant)")
    stopBurst()

    let emitters = IOSReferenceConfettiFactory.premiumEmitters(colors: palette)
    makeConfigurations().forEach { configuration in
      let confettiLayer = IOSReferenceConfettiLayer(emitters, .top, configuration: configuration)
      confettiLayer.frame = bounds
      confettiLayer.masksToBounds = false
      confettiLayer.renderMode = .unordered
      confettiLayer.zPosition = 4
      layer.insertSublayer(confettiLayer, at: 0)
      confettiLayers.append(confettiLayer)
      confettiLayer.startEmission()
    }

    schedule(after: 3.6) { [weak self] in
      self?.confettiLayers.forEach { $0.removeFromSuperlayer() }
      self?.confettiLayers.removeAll()
      self?.updateDebugBadge(reason: "burst-ended")
    }

    updateDebugBadge(reason: "burst")
  }

  func resetForRecycle() {
    hasAutoplayedCurrentAttachment = false
    lastBurstKey = 0
    burstKey = 0
    debugEnabled = false
    debugInfo = ""
    variant = "task"
    stopBurst()
  }

  private func stopBurst() {
    cleanupWorkItems.forEach { $0.cancel() }
    cleanupWorkItems.removeAll()
    confettiLayers.forEach {
      $0.removeAllAnimations()
      $0.removeFromSuperlayer()
    }
    confettiLayers.removeAll()
  }

  private func makeConfigurations() -> [IOSReferenceConfettiConfiguration] {
    let width = bounds.width
    let primaryOrigin = CGPoint(x: width * 0.5, y: -44)
    let secondaryOrigin = CGPoint(x: width * 0.5, y: -28)

    var primary = IOSReferenceConfettiConfiguration()
    primary.particleCount = 2
    primary.spread = .pi / 1.8
    primary.gravity = 2250
    primary.startVelocity = 920
    primary.velocityDecay = 0.58
    primary.scale = 0.22
    primary.scaleRange = 0.16
    primary.lifetime = 8.4
    primary.gravityAnimationDuration = 3.2
    primary.birthRateAnimationDuration = 0.9
    primary.spin = .pi * 2.1
    primary.spinRange = .pi * 2.4
    primary.origin = primaryOrigin
    primary.angle = .pi / 2
    primary.emitterSize = CGSize(width: width * 0.96, height: 1)

    var secondary = IOSReferenceConfettiConfiguration()
    secondary.particleCount = 1
    secondary.spread = .pi / 1.9
    secondary.gravity = 1780
    secondary.startVelocity = 760
    secondary.velocityDecay = 0.46
    secondary.drift = 28
    secondary.scale = 0.18
    secondary.scaleRange = 0.12
    secondary.lifetime = 9.4
    secondary.gravityAnimationDuration = 3.6
    secondary.birthRateAnimationDuration = 1.0
    secondary.spin = .pi * 1.6
    secondary.spinRange = .pi * 2.0
    secondary.origin = secondaryOrigin
    secondary.angle = .pi / 2
    secondary.emitterSize = CGSize(width: width * 0.78, height: 1)

    var tertiary = IOSReferenceConfettiConfiguration()
    tertiary.particleCount = 1
    tertiary.spread = .pi / 1.6
    tertiary.gravity = 1520
    tertiary.startVelocity = 620
    tertiary.velocityDecay = 0.38
    tertiary.drift = -34
    tertiary.scale = 0.14
    tertiary.scaleRange = 0.1
    tertiary.lifetime = 10.4
    tertiary.gravityAnimationDuration = 4.0
    tertiary.birthRateAnimationDuration = 1.08
    tertiary.spin = .pi * 1.2
    tertiary.spinRange = .pi * 1.8
    tertiary.origin = secondaryOrigin
    tertiary.angle = .pi / 2
    tertiary.emitterSize = CGSize(width: width * 0.88, height: 1)

    return [primary, secondary, tertiary]
  }

  private func schedule(after delay: TimeInterval, block: @escaping () -> Void) {
    let workItem = DispatchWorkItem(block: block)
    cleanupWorkItems.append(workItem)
    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
  }

  private func debugLog(_ message: String) {
    NSLog("[IOSPremiumConfettiContentView] %@", message)
  }

  private func updateDebugBadge(reason: String) {
    guard debugEnabled else {
      debugLabel.isHidden = true
      layer.borderWidth = 0
      layer.borderColor = UIColor.clear.cgColor
      return
    }

    debugLabel.isHidden = false
    debugLabel.text = "native-confetti \(reason)\n\(debugInfo) reduce=\(shouldReduceMotion ? 1 : 0)"
    layer.borderWidth = 2
    layer.borderColor = UIColor.systemYellow.withAlphaComponent(0.85).cgColor
    bringSubviewToFront(debugLabel)
  }
}
