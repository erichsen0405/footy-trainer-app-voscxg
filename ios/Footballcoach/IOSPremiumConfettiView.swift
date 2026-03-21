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
    let topOrigin = CGPoint(x: width * 0.5, y: -24)

    var primary = IOSReferenceConfettiConfiguration()
    primary.particleCount = 20
    primary.spread = .pi / 1.4
    primary.gravity = 825
    primary.startVelocity = 1180
    primary.velocityDecay = 0.48
    primary.scale = 0.66
    primary.scaleRange = 0.28
    primary.lifetime = 10.2
    primary.gravityAnimationDuration = 2.6
    primary.birthRateAnimationDuration = 0.34
    primary.spin = .pi * 2.8
    primary.spinRange = .pi * 2.8
    primary.origin = topOrigin
    primary.angle = .pi / 2
    primary.emitterSize = CGSize(width: width * 0.92, height: 1)

    var secondary = IOSReferenceConfettiConfiguration()
    secondary.particleCount = 16
    secondary.spread = .pi / 1.5
    secondary.gravity = 690
    secondary.startVelocity = 980
    secondary.velocityDecay = 0.34
    secondary.drift = 90
    secondary.scale = 0.54
    secondary.scaleRange = 0.22
    secondary.lifetime = 11.1
    secondary.gravityAnimationDuration = 3.1
    secondary.birthRateAnimationDuration = 0.42
    secondary.spin = .pi * 2.2
    secondary.spinRange = .pi * 2.6
    secondary.origin = topOrigin
    secondary.angle = .pi / 2
    secondary.emitterSize = CGSize(width: width * 0.78, height: 1)

    var tertiary = IOSReferenceConfettiConfiguration()
    tertiary.particleCount = 12
    tertiary.spread = .pi / 1.6
    tertiary.gravity = 560
    tertiary.startVelocity = 760
    tertiary.velocityDecay = 0.26
    tertiary.drift = -120
    tertiary.scale = 0.42
    tertiary.scaleRange = 0.18
    tertiary.lifetime = 12.9
    tertiary.gravityAnimationDuration = 3.6
    tertiary.birthRateAnimationDuration = 0.5
    tertiary.spin = .pi * 1.8
    tertiary.spinRange = .pi * 2.3
    tertiary.origin = topOrigin
    tertiary.angle = .pi / 2
    tertiary.emitterSize = CGSize(width: width * 0.66, height: 1)

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
