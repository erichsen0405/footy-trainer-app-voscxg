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
      backgroundColor = .clear
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
      configureEmitter()
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
    label.textAlignment = .left
    return label
  }()

  private lazy var debugCenterLabel: UILabel = {
    let label = UILabel()
    label.textColor = .white
    label.font = UIFont.monospacedSystemFont(ofSize: 18, weight: .bold)
    label.textAlignment = .center
    label.backgroundColor = UIColor.black.withAlphaComponent(0.42)
    label.layer.cornerRadius = 12
    label.layer.masksToBounds = true
    label.text = "NATIVE CONFETTI"
    label.isHidden = true
    return label
  }()

  private let emitterLayer = CAEmitterLayer()
  private let heroPiecesLayer = CALayer()
  private var lastBurstKey = 0
  private var hasAutoplayedCurrentAttachment = false
  private var reduceMotionObserver: NSObjectProtocol?
  private var stopEmitterWorkItem: DispatchWorkItem?

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
    emitterLayer.frame = bounds
    emitterLayer.emitterPosition = CGPoint(x: bounds.midX, y: 18)
    emitterLayer.emitterSize = CGSize(width: max(bounds.width * emitterWidthMultiplier, 140), height: 2)
    heroPiecesLayer.frame = bounds
    debugLabel.frame = CGRect(x: 12, y: 16, width: max(bounds.width - 24, 120), height: 44)
    debugCenterLabel.frame = CGRect(
      x: max((bounds.width - 220) / 2, 16),
      y: max((bounds.height - 56) / 2, 96),
      width: min(220, bounds.width - 32),
      height: 56
    )
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()

    if window == nil {
      debugLog("detached from window")
      hasAutoplayedCurrentAttachment = false
      lastBurstKey = 0
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
    emitterLayer.emitterCells = nil

    if let reduceMotionObserver {
      NotificationCenter.default.removeObserver(reduceMotionObserver)
    }
  }

  private var isDayComplete: Bool {
    variant == "dayComplete"
  }

  private var emitterWidthMultiplier: CGFloat {
    isDayComplete ? 0.9 : 0.82
  }

  private var shouldReduceMotion: Bool {
    UIAccessibility.isReduceMotionEnabled
  }

  private var confettiPalette: [UIColor] {
    [
      UIColor(red: 0.20, green: 0.69, blue: 1.00, alpha: 1.00),
      UIColor(red: 0.30, green: 0.85, blue: 0.48, alpha: 1.00),
      UIColor(red: 0.96, green: 0.77, blue: 0.27, alpha: 1.00),
      UIColor(red: 1.00, green: 0.50, blue: 0.31, alpha: 1.00),
      UIColor(red: 0.61, green: 0.43, blue: 1.00, alpha: 1.00),
      UIColor(red: 0.13, green: 0.70, blue: 0.67, alpha: 1.00),
      UIColor(red: 0.96, green: 0.30, blue: 0.50, alpha: 1.00),
      UIColor.white,
    ]
  }

  private func commonInit() {
    accessibilityIdentifier = "ios-premium-confetti-content-view"
    backgroundColor = .clear
    clipsToBounds = false
    contentScaleFactor = UIScreen.main.scale
    isAccessibilityElement = false
    isUserInteractionEnabled = false
    emitterLayer.frame = bounds
    emitterLayer.masksToBounds = false
    emitterLayer.zPosition = 5
    heroPiecesLayer.frame = bounds
    heroPiecesLayer.masksToBounds = false
    heroPiecesLayer.zPosition = 6
    layer.addSublayer(emitterLayer)
    layer.addSublayer(heroPiecesLayer)
    addSubview(debugLabel)
    addSubview(debugCenterLabel)
    configureEmitter()
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

  private func configureEmitter() {
    emitterLayer.emitterShape = .line
    emitterLayer.emitterMode = .surface
    emitterLayer.renderMode = .unordered
    emitterLayer.birthRate = 0
    emitterLayer.preservesDepth = false
    emitterLayer.beginTime = CACurrentMediaTime()
    emitterLayer.emitterCells = makeEmitterCells()
    setNeedsLayout()
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
    configureEmitter()
    emitterLayer.beginTime = CACurrentMediaTime()
    emitterLayer.birthRate = 1
    launchHeroPieces()
    updateDebugBadge(reason: "burst")

    stopEmitterWorkItem?.cancel()
    let workItem = DispatchWorkItem { [weak self] in
      self?.emitterLayer.birthRate = 0
      self?.updateDebugBadge(reason: "burst-ended")
    }
    stopEmitterWorkItem = workItem

    DispatchQueue.main.asyncAfter(
      deadline: .now() + (isDayComplete ? 0.2 : 0.16),
      execute: workItem
    )
  }

  func resetForRecycle() {
    hasAutoplayedCurrentAttachment = false
    lastBurstKey = 0
    burstKey = 0
    debugEnabled = false
    debugInfo = ""
    variant = "task"
    stopBurst()
    configureEmitter()
  }

  private func stopBurst() {
    stopEmitterWorkItem?.cancel()
    stopEmitterWorkItem = nil
    emitterLayer.birthRate = 0
    emitterLayer.removeAllAnimations()
    heroPiecesLayer.removeAllAnimations()
    heroPiecesLayer.sublayers?.forEach { layer in
      layer.removeAllAnimations()
      layer.removeFromSuperlayer()
    }
  }

  private func debugLog(_ message: String) {
    NSLog("[IOSPremiumConfettiContentView] %@", message)
  }

  private func updateDebugBadge(reason: String) {
    guard debugEnabled else {
      debugLabel.isHidden = true
      debugCenterLabel.isHidden = true
      layer.borderWidth = 0
      layer.borderColor = UIColor.clear.cgColor
      return
    }

    debugLabel.isHidden = false
    debugCenterLabel.isHidden = false
    debugLabel.text = "native-confetti \(reason)\n\(debugInfo) reduce=\(shouldReduceMotion ? 1 : 0)"
    layer.borderWidth = 2
    layer.borderColor = UIColor.systemYellow.withAlphaComponent(0.85).cgColor
    bringSubviewToFront(debugLabel)
    bringSubviewToFront(debugCenterLabel)
  }

  private func makeEmitterCells() -> [CAEmitterCell] {
    let baseBirthRate: Float = isDayComplete ? 10.5 : 8.2
    let baseVelocity: CGFloat = isDayComplete ? 330 : 270
    let baseLifetime: Float = isDayComplete ? 1.36 : 1.16
    let acceleration: CGFloat = isDayComplete ? 760 : 700
    let emissionRange: CGFloat = isDayComplete ? 0.44 : 0.38

    return confettiPalette.enumerated().flatMap { index, color in
      [
        emitterCell(
          name: "strip-\(index)",
          color: color,
          image: makeRectImage(color: color, size: CGSize(width: 15, height: 7), cornerRadius: 1.5),
          birthRate: baseBirthRate,
          velocity: baseVelocity,
          lifetime: baseLifetime,
          acceleration: acceleration,
          emissionRange: emissionRange,
          spin: 2.8
        ),
        emitterCell(
          name: "cut-\(index)",
          color: color.withAlphaComponent(0.94),
          image: makeCutRectImage(color: color.withAlphaComponent(0.94), size: CGSize(width: 18, height: 9)),
          birthRate: baseBirthRate * 0.78,
          velocity: baseVelocity * 0.92,
          lifetime: baseLifetime,
          acceleration: acceleration,
          emissionRange: emissionRange * 0.95,
          spin: 3.2
        ),
        emitterCell(
          name: "circle-\(index)",
          color: color.withAlphaComponent(index == 7 ? 0.96 : 1),
          image: makeCircleImage(color: color.withAlphaComponent(index == 7 ? 0.96 : 1), diameter: index % 2 == 0 ? 11 : 8),
          birthRate: baseBirthRate * 0.7,
          velocity: baseVelocity * 0.84,
          lifetime: baseLifetime * 1.05,
          acceleration: acceleration * 0.96,
          emissionRange: emissionRange,
          spin: 1.8
        ),
      ]
    }
  }

  private func launchHeroPieces() {
    heroPiecesLayer.sublayers?.forEach { layer in
      layer.removeAllAnimations()
      layer.removeFromSuperlayer()
    }

    let pieceCount = isDayComplete ? 104 : 76

    for index in 0..<pieceCount {
      let color = confettiPalette[index % confettiPalette.count]
      let xSeed = CGFloat((index * 73) % 997) / 997
      let driftSeed = CGFloat((index * 43) % 211) / 211
      let dropSeed = CGFloat((index * 59) % 307) / 307
      let shapeKind = index % 5
      let startPoint = CGPoint(
        x: bounds.width * (0.05 + xSeed * 0.9),
        y: -28 + CGFloat(index % 10) * 9
      )
      let drift = (driftSeed - 0.5) * bounds.width * (isDayComplete ? 0.34 : 0.28)
      let endPoint = CGPoint(
        x: max(18, min(bounds.width - 18, startPoint.x + drift)),
        y: bounds.height * (isDayComplete ? 1.08 : 1.02) - dropSeed * bounds.height * 0.18
      )

      let pieceLayer = CALayer()
      let pieceImage: CGImage?
      let pieceSize: CGSize
      switch shapeKind {
      case 0:
        pieceSize = CGSize(width: 16, height: 16)
        pieceImage = makeCircleImage(color: color, diameter: pieceSize.width)
      case 1:
        pieceSize = CGSize(width: 22, height: 10)
        pieceImage = makeCutRectImage(color: color, size: pieceSize)
      case 2:
        pieceSize = CGSize(width: 18, height: 8)
        pieceImage = makeRectImage(color: color, size: pieceSize, cornerRadius: 1.6)
      case 3:
        pieceSize = CGSize(width: 14, height: 14)
        pieceImage = makeCircleImage(color: color.withAlphaComponent(0.96), diameter: pieceSize.width)
      default:
        pieceSize = CGSize(width: 20, height: 9)
        pieceImage = makeCutRectImage(color: color.withAlphaComponent(0.92), size: pieceSize)
      }

      pieceLayer.contents = pieceImage
      pieceLayer.contentsGravity = .resizeAspect
      pieceLayer.contentsScale = UIScreen.main.scale
      pieceLayer.frame = CGRect(origin: .zero, size: pieceSize)
      pieceLayer.position = startPoint
      pieceLayer.opacity = 1
      pieceLayer.zPosition = 20
      pieceLayer.shadowColor = UIColor.black.withAlphaComponent(0.18).cgColor
      pieceLayer.shadowOpacity = 0.22
      pieceLayer.shadowRadius = 3
      pieceLayer.shadowOffset = CGSize(width: 0, height: 1.5)
      heroPiecesLayer.addSublayer(pieceLayer)

      let positionAnimation = CAKeyframeAnimation(keyPath: "position")
      positionAnimation.values = [
        NSValue(cgPoint: startPoint),
        NSValue(cgPoint: CGPoint(x: startPoint.x + drift * 0.26, y: bounds.height * 0.28)),
        NSValue(cgPoint: endPoint),
      ]
      positionAnimation.keyTimes = [0, 0.32, 1]
      positionAnimation.timingFunctions = [
        CAMediaTimingFunction(name: .easeOut),
        CAMediaTimingFunction(name: .easeIn),
      ]
      positionAnimation.duration = isDayComplete ? 1.52 : 1.32

      let rotationAnimation = CABasicAnimation(keyPath: "transform.rotation.z")
      rotationAnimation.fromValue = 0
      rotationAnimation.toValue = (Double((index % 2 == 0 ? 1 : -1)) * .pi * (shapeKind == 0 || shapeKind == 3 ? 1.4 : 3.2))
      rotationAnimation.duration = positionAnimation.duration

      let opacityAnimation = CAKeyframeAnimation(keyPath: "opacity")
      opacityAnimation.values = [0, 1, 1, 0]
      opacityAnimation.keyTimes = [0, 0.05, 0.82, 1]
      opacityAnimation.duration = positionAnimation.duration

      let scaleAnimation = CAKeyframeAnimation(keyPath: "transform.scale")
      scaleAnimation.values = [0.72, 1.08, 1]
      scaleAnimation.keyTimes = [0, 0.16, 1]
      scaleAnimation.duration = positionAnimation.duration

      let group = CAAnimationGroup()
      group.animations = [positionAnimation, rotationAnimation, opacityAnimation, scaleAnimation]
      group.duration = positionAnimation.duration
      group.fillMode = .forwards
      group.isRemovedOnCompletion = false
      group.timingFunction = CAMediaTimingFunction(name: .easeOut)

      pieceLayer.add(group, forKey: "heroPiece-\(index)")
    }

    if debugEnabled {
      launchDebugTestPieces(colors: confettiPalette)
    }
  }

  private func launchDebugTestPieces(colors: [UIColor]) {
    let testCount = 4
    let startY = bounds.height * 0.18

    for index in 0..<testCount {
      let width: CGFloat = 42
      let height: CGFloat = 16
      let pieceLayer = CALayer()
      pieceLayer.backgroundColor = colors[index % colors.count].cgColor
      pieceLayer.cornerRadius = 4
      pieceLayer.frame = CGRect(x: 0, y: 0, width: width, height: height)
      pieceLayer.position = CGPoint(
        x: bounds.midX + CGFloat(index - 1) * 54,
        y: startY + CGFloat(index % 2) * 20
      )
      pieceLayer.opacity = 1
      pieceLayer.zPosition = 40
      heroPiecesLayer.addSublayer(pieceLayer)

      let drop = CABasicAnimation(keyPath: "position.y")
      drop.fromValue = pieceLayer.position.y
      drop.toValue = bounds.height * 0.52 + CGFloat(index) * 18
      drop.duration = 1.15
      drop.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)

      let rotate = CABasicAnimation(keyPath: "transform.rotation.z")
      rotate.fromValue = 0
      rotate.toValue = Double(index % 2 == 0 ? 1 : -1) * .pi * 1.8
      rotate.duration = 1.15

      let fade = CAKeyframeAnimation(keyPath: "opacity")
      fade.values = [0.2, 1, 1, 0]
      fade.keyTimes = [0, 0.12, 0.7, 1]
      fade.duration = 1.15

      let group = CAAnimationGroup()
      group.animations = [drop, rotate, fade]
      group.duration = 1.15
      group.fillMode = .forwards
      group.isRemovedOnCompletion = false

      pieceLayer.add(group, forKey: "debugPiece-\(index)")
    }
  }

  private func emitterCell(
    name: String,
    color: UIColor,
    image: CGImage?,
    birthRate: Float,
    velocity: CGFloat,
    lifetime: Float,
    acceleration: CGFloat,
    emissionRange: CGFloat,
    spin: CGFloat
  ) -> CAEmitterCell {
    let cell = CAEmitterCell()
    cell.name = name
    cell.contents = image
    cell.birthRate = birthRate
    cell.lifetime = lifetime
    cell.lifetimeRange = lifetime * 0.22
    cell.velocity = velocity
    cell.velocityRange = velocity * 0.18
    cell.yAcceleration = acceleration
    cell.xAcceleration = 0
    cell.emissionLongitude = .pi / 2
    cell.emissionRange = emissionRange
    cell.spin = spin
    cell.spinRange = spin * 0.65
    cell.scale = 1
    cell.scaleRange = 0.25
    cell.alphaRange = 0.08
    cell.alphaSpeed = -0.95
    cell.contentsScale = UIScreen.main.scale
    cell.magnificationFilter = "linear"
    cell.minificationFilter = "linear"
    cell.color = color.cgColor
    return cell
  }

  private func makeRectImage(color: UIColor, size: CGSize, cornerRadius: CGFloat) -> CGImage? {
    let format = UIGraphicsImageRendererFormat()
    format.opaque = false
    format.scale = UIScreen.main.scale

    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    let image = renderer.image { _ in
      let rect = CGRect(origin: .zero, size: size)
      let path = UIBezierPath(roundedRect: rect, cornerRadius: cornerRadius)
      color.setFill()
      path.fill()
    }

    return image.cgImage
  }

  private func makeCircleImage(color: UIColor, diameter: CGFloat) -> CGImage? {
    let size = CGSize(width: diameter, height: diameter)
    let format = UIGraphicsImageRendererFormat()
    format.opaque = false
    format.scale = UIScreen.main.scale

    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    let image = renderer.image { _ in
      let rect = CGRect(origin: .zero, size: size)
      UIColor.white.withAlphaComponent(0.16).setStroke()
      color.setFill()
      let path = UIBezierPath(ovalIn: rect.insetBy(dx: 0.5, dy: 0.5))
      path.lineWidth = 1
      path.fill()
      path.stroke()
    }

    return image.cgImage
  }

  private func makeCutRectImage(color: UIColor, size: CGSize) -> CGImage? {
    let format = UIGraphicsImageRendererFormat()
    format.opaque = false
    format.scale = UIScreen.main.scale

    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    let image = renderer.image { _ in
      let path = UIBezierPath()
      path.move(to: CGPoint(x: 2, y: size.height * 0.2))
      path.addLine(to: CGPoint(x: size.width * 0.2, y: 1))
      path.addLine(to: CGPoint(x: size.width - 2, y: size.height * 0.14))
      path.addLine(to: CGPoint(x: size.width * 0.88, y: size.height - 1))
      path.addLine(to: CGPoint(x: 1.5, y: size.height * 0.84))
      path.close()
      color.setFill()
      path.fill()
      UIColor.white.withAlphaComponent(0.18).setStroke()
      path.lineWidth = 1
      path.stroke()
    }

    return image.cgImage
  }
}
