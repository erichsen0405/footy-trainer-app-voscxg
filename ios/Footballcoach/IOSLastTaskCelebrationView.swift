import QuartzCore
import UIKit

@objc(IOSLastTaskCelebrationContentView)
@objcMembers
final class IOSLastTaskCelebrationContentView: UIView {
  @objc var burstKey: NSNumber = 0 {
    didSet {
      let nextKey = burstKey.intValue
      if hasAutoplayedCurrentAttachment && lastBurstKey == 0 {
        lastBurstKey = nextKey
        return
      }
      guard nextKey != lastBurstKey else { return }
      lastBurstKey = nextKey
      playSequence()
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

  private let effectLayer = CALayer()
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

  private var cleanupWorkItems: [DispatchWorkItem] = []
  private var activeLayers: [CALayer] = []
  private var hasAutoplayedCurrentAttachment = false
  private var lastBurstKey = 0
  private var reduceMotionObserver: NSObjectProtocol?

  private let gold = UIColor(red: 1.00, green: 0.82, blue: 0.36, alpha: 1.00)
  private let warmGold = UIColor(red: 1.00, green: 0.70, blue: 0.27, alpha: 1.00)
  private let silver = UIColor(red: 0.84, green: 0.87, blue: 0.92, alpha: 1.00)
  private let coolSilver = UIColor(red: 0.73, green: 0.79, blue: 0.88, alpha: 1.00)
  private let pearl = UIColor(red: 0.97, green: 0.98, blue: 1.00, alpha: 1.00)

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
    effectLayer.frame = bounds
    debugLabel.frame = CGRect(x: 12, y: 16, width: max(bounds.width - 24, 120), height: 44)
    activeLayers.forEach { layer in
      if let confettiLayer = layer as? IOSReferenceConfettiLayer {
        confettiLayer.frame = bounds
      } else if let gradientLayer = layer as? CAGradientLayer {
        gradientLayer.frame = bounds
        layer.frame = bounds
      }
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()

    if window == nil {
      debugLog("detached from window")
      hasAutoplayedCurrentAttachment = false
      lastBurstKey = 0
      teardownEffects()
      updateDebugBadge(reason: "detached")
      return
    }

    debugLog("attached to window")
    updateDebugBadge(reason: "attached")

    guard !hasAutoplayedCurrentAttachment else { return }
    hasAutoplayedCurrentAttachment = true

    DispatchQueue.main.async { [weak self] in
      self?.playSequence()
    }
  }

  deinit {
    teardownEffects()

    if let reduceMotionObserver {
      NotificationCenter.default.removeObserver(reduceMotionObserver)
    }
  }

  private func commonInit() {
    accessibilityIdentifier = "ios-last-task-celebration-content-view"
    isUserInteractionEnabled = false
    isAccessibilityElement = false
    backgroundColor = .clear
    clipsToBounds = false
    contentScaleFactor = UIScreen.main.scale
    effectLayer.frame = bounds
    effectLayer.masksToBounds = false
    layer.addSublayer(effectLayer)
    addSubview(debugLabel)
    installReduceMotionObserver()
    updateDebugBadge(reason: "init")
  }

  private var shouldReduceMotion: Bool {
    UIAccessibility.isReduceMotionEnabled
  }

  private var fountainPalette: [UIColor] {
    [gold, warmGold, silver, coolSilver, pearl]
  }

  private var shimmerPalette: [UIColor] {
    [gold.withAlphaComponent(0.92), silver, pearl]
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
        self.teardownEffects()
      }
      self.updateDebugBadge(reason: "reduce-motion")
    }
  }

  private func playSequence() {
    if shouldReduceMotion {
      debugLog("sequence skipped because reduce motion is enabled")
      updateDebugBadge(reason: "reduce-motion-blocked")
      return
    }

    guard bounds.width > 0, bounds.height > 0 else {
      DispatchQueue.main.async { [weak self] in
        self?.playSequence()
      }
      return
    }

    debugLog("play sequence key=\(burstKey)")
    teardownEffects()
    addBackdropGlow()
    addCenterBursts()
    addCornerFountains()

    schedule(after: 2.35) { [weak self] in
      self?.teardownEffects()
    }

    updateDebugBadge(reason: "sequence")
  }

  func resetForRecycle() {
    hasAutoplayedCurrentAttachment = false
    lastBurstKey = 0
    burstKey = 0
    debugEnabled = false
    debugInfo = ""
    teardownEffects()
  }

  private func teardownEffects() {
    cleanupWorkItems.forEach { $0.cancel() }
    cleanupWorkItems = []

    activeLayers.forEach { layer in
      layer.removeAllAnimations()
      layer.removeFromSuperlayer()
    }
    activeLayers.removeAll()

    effectLayer.removeAllAnimations()
    effectLayer.sublayers?.forEach { sublayer in
      sublayer.removeAllAnimations()
      sublayer.removeFromSuperlayer()
    }

    updateDebugBadge(reason: "teardown")
  }

  private func addBackdropGlow() {
    let gradient = CAGradientLayer()
    gradient.frame = bounds
    gradient.zPosition = 0
    gradient.colors = [
      UIColor.black.withAlphaComponent(0.04).cgColor,
      UIColor(red: 1.00, green: 0.84, blue: 0.44, alpha: 0.10).cgColor,
      UIColor.black.withAlphaComponent(0.08).cgColor,
    ]
    gradient.locations = [0.0, 0.58, 1.0]
    gradient.startPoint = CGPoint(x: 0.5, y: 0.15)
    gradient.endPoint = CGPoint(x: 0.5, y: 1.0)
    gradient.opacity = 0
    effectLayer.addSublayer(gradient)
    activeLayers.append(gradient)

    let opacity = CABasicAnimation(keyPath: "opacity")
    opacity.fromValue = 0
    opacity.toValue = 1
    opacity.duration = 0.22
    opacity.autoreverses = true
    opacity.beginTime = CACurrentMediaTime() + 0.1
    opacity.isRemovedOnCompletion = false
    opacity.fillMode = .forwards
    gradient.add(opacity, forKey: "opacity")
  }

  private func addCenterBursts() {
    let points = [
      CGPoint(x: bounds.midX, y: -26),
      CGPoint(x: bounds.midX, y: bounds.height * 0.06),
    ]

    points.enumerated().forEach { index, point in
      schedule(after: 0.08 + (Double(index) * 0.12)) { [weak self] in
        guard let self else { return }
        let burst = self.makeBurstLayer(
          origin: point,
          particleCount: index == 0 ? 48 : 36,
          emitterWidth: index == 0 ? self.bounds.width * 0.86 : self.bounds.width * 0.72
        )
        self.effectLayer.addSublayer(burst)
        self.activeLayers.append(burst)
        burst.startEmission()
      }
    }
  }

  private func addCornerFountains() {
    let configs: [(origin: CGPoint, angle: CGFloat, drift: CGFloat)] = [
      (CGPoint(x: bounds.width * 0.06, y: bounds.height * 0.90), -CGFloat.pi / 4.1, 110),
      (CGPoint(x: bounds.width * 0.94, y: bounds.height * 0.90), -(.pi - (.pi / 4.1)), -110),
    ]

    configs.forEach { config in
      let fountainLayers = makeFountainLayers(origin: config.origin, angle: config.angle, drift: config.drift)
      fountainLayers.forEach { emitter in
        effectLayer.addSublayer(emitter)
        activeLayers.append(emitter)
        emitter.startEmission()
      }
    }
  }

  private func makeFountainLayers(origin: CGPoint, angle: CGFloat, drift: CGFloat) -> [IOSReferenceConfettiLayer] {
    var primary = IOSReferenceConfettiConfiguration()
    primary.particleCount = 40
    primary.spread = 0.16
    primary.gravity = 1100
    primary.startVelocity = 1360
    primary.velocityDecay = 0.46
    primary.drift = drift
    primary.scale = 0.72
    primary.scaleRange = 0.3
    primary.lifetime = 8.1
    primary.gravityAnimationDuration = 1.7
    primary.birthRateAnimationDuration = 0.64
    primary.spin = .pi * 2.4
    primary.spinRange = .pi * 2.7
    primary.origin = origin
    primary.angle = angle
    primary.emitterSize = CGSize(width: 16, height: 16)

    var shimmer = IOSReferenceConfettiConfiguration()
    shimmer.particleCount = 24
    shimmer.spread = 0.14
    shimmer.gravity = 890
    shimmer.startVelocity = 1120
    shimmer.velocityDecay = 0.32
    shimmer.drift = drift * 0.8
    shimmer.scale = 0.46
    shimmer.scaleRange = 0.2
    shimmer.lifetime = 8.9
    shimmer.gravityAnimationDuration = 2.0
    shimmer.birthRateAnimationDuration = 0.72
    shimmer.spin = .pi * 2.0
    shimmer.spinRange = .pi * 2.2
    shimmer.origin = origin
    shimmer.angle = angle
    shimmer.emitterSize = CGSize(width: 14, height: 14)

    let mainEmitter = makeReferenceConfettiLayer(
      primary,
      emitters: IOSReferenceConfettiFactory.premiumEmitters(colors: fountainPalette),
      zPosition: 16,
      renderMode: .unordered
    )
    let shimmerEmitter = makeReferenceConfettiLayer(
      shimmer,
      emitters: IOSReferenceConfettiFactory.defaultEmitters(colors: shimmerPalette),
      zPosition: 18,
      renderMode: .additive
    )

    return [mainEmitter, shimmerEmitter]
  }

  private func makeBurstLayer(origin: CGPoint, particleCount: Int, emitterWidth: CGFloat) -> IOSReferenceConfettiLayer {
    var configuration = IOSReferenceConfettiConfiguration()
    configuration.particleCount = particleCount
    configuration.spread = .pi / 1.45
    configuration.gravity = 580
    configuration.startVelocity = 860
    configuration.velocityDecay = 0.44
    configuration.scale = 0.48
    configuration.scaleRange = 0.18
    configuration.lifetime = 7.2
    configuration.gravityAnimationDuration = 0.7
    configuration.birthRateAnimationDuration = 0.2
    configuration.spin = .pi * 2.4
    configuration.spinRange = .pi * 2.6
    configuration.origin = origin
    configuration.angle = .pi / 2
    configuration.emitterSize = CGSize(width: emitterWidth, height: 1)

    return makeReferenceConfettiLayer(
      configuration,
      emitters: IOSReferenceConfettiFactory.premiumEmitters(colors: fountainPalette),
      zPosition: 12,
      renderMode: .unordered
    )
  }

  private func makeReferenceConfettiLayer(
    _ configuration: IOSReferenceConfettiConfiguration,
    emitters: [IOSReferenceConfettiEmitter],
    zPosition: CGFloat,
    renderMode: CAEmitterLayerRenderMode
  ) -> IOSReferenceConfettiLayer {
    let emitter = IOSReferenceConfettiLayer(emitters, .top, configuration: configuration)
    emitter.frame = bounds
    emitter.masksToBounds = false
    emitter.renderMode = renderMode
    emitter.zPosition = zPosition
    return emitter
  }

  private func debugLog(_ message: String) {
    NSLog("[IOSLastTaskCelebrationContentView] %@", message)
  }

  private func updateDebugBadge(reason: String) {
    guard debugEnabled else {
      debugLabel.isHidden = true
      return
    }

    debugLabel.isHidden = false
    debugLabel.text = "native-day \(reason)\n\(debugInfo) reduce=\(shouldReduceMotion ? 1 : 0)"
    bringSubviewToFront(debugLabel)
  }

  private func schedule(after delay: TimeInterval, block: @escaping () -> Void) {
    let workItem = DispatchWorkItem(block: block)
    cleanupWorkItems.append(workItem)
    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
  }
}
