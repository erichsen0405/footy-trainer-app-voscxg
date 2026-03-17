import QuartzCore
import UIKit

final class IOSLastTaskCelebrationView: UIView {
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

  private struct RocketConfiguration {
    let accentColor: UIColor
    let start: CGPoint
    let apex: CGPoint
    let curveOffsetX: CGFloat
    let delay: TimeInterval
    let duration: TimeInterval
  }

  private let effectLayer = CALayer()
  private var cleanupWorkItems: [DispatchWorkItem] = []
  private var hasAutoplayedCurrentAttachment = false
  private var lastBurstKey = 0

  private let gold = UIColor(red: 1.00, green: 0.82, blue: 0.36, alpha: 1.00)
  private let warmGold = UIColor(red: 1.00, green: 0.68, blue: 0.27, alpha: 1.00)
  private let hotWhite = UIColor(red: 1.00, green: 0.98, blue: 0.92, alpha: 1.00)
  private let confettiPalette: [UIColor] = [
    UIColor(red: 1.00, green: 0.82, blue: 0.36, alpha: 1.00),
    UIColor(red: 1.00, green: 0.62, blue: 0.31, alpha: 1.00),
    UIColor(red: 0.95, green: 0.46, blue: 0.54, alpha: 1.00),
    UIColor(red: 0.24, green: 0.81, blue: 0.83, alpha: 1.00),
    UIColor(red: 0.21, green: 0.65, blue: 1.00, alpha: 1.00),
    UIColor(red: 0.96, green: 0.98, blue: 1.00, alpha: 1.00),
  ]

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
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()

    if window == nil {
      hasAutoplayedCurrentAttachment = false
      lastBurstKey = 0
      return
    }

    guard !hasAutoplayedCurrentAttachment else { return }
    hasAutoplayedCurrentAttachment = true

    DispatchQueue.main.async { [weak self] in
      self?.playSequence()
    }
  }

  deinit {
    teardownEffects()
  }

  private func commonInit() {
    isUserInteractionEnabled = false
    backgroundColor = .clear
    clipsToBounds = false
    effectLayer.frame = bounds
    effectLayer.masksToBounds = false
    layer.addSublayer(effectLayer)
  }

  private func playSequence() {
    guard bounds.width > 0, bounds.height > 0 else {
      DispatchQueue.main.async { [weak self] in
        self?.playSequence()
      }
      return
    }

    teardownEffects()
    addBackdropGlow()
    addFountains()

    makeRocketConfigurations().forEach { configuration in
      schedule(after: configuration.delay) { [weak self] in
        self?.launchRocket(configuration)
      }
    }

    schedule(after: 0.30) { [weak self] in
      self?.addAmbientConfetti()
    }

    schedule(after: 1.95) { [weak self] in
      self?.teardownEffects()
    }
  }

  private func teardownEffects() {
    cleanupWorkItems.forEach { $0.cancel() }
    cleanupWorkItems = []

    effectLayer.removeAllAnimations()
    effectLayer.sublayers?.forEach { sublayer in
      sublayer.removeAllAnimations()
      sublayer.removeFromSuperlayer()
    }
  }

  private func schedule(after delay: TimeInterval, block: @escaping () -> Void) {
    let workItem = DispatchWorkItem(block: block)
    cleanupWorkItems.append(workItem)
    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
  }

  private func makeRocketConfigurations() -> [RocketConfiguration] {
    let width = bounds.width
    let height = bounds.height
    let launchY = height * 0.84

    return [
      RocketConfiguration(
        accentColor: UIColor(red: 0.21, green: 0.58, blue: 0.95, alpha: 1.00),
        start: CGPoint(x: width * 0.44, y: launchY),
        apex: CGPoint(x: width * 0.31, y: height * 0.31),
        curveOffsetX: -38,
        delay: 0.10,
        duration: 0.64
      ),
      RocketConfiguration(
        accentColor: UIColor(red: 0.97, green: 0.47, blue: 0.23, alpha: 1.00),
        start: CGPoint(x: width * 0.50, y: launchY + 12),
        apex: CGPoint(x: width * 0.51, y: height * 0.24),
        curveOffsetX: 0,
        delay: 0.18,
        duration: 0.68
      ),
      RocketConfiguration(
        accentColor: UIColor(red: 0.31, green: 0.81, blue: 0.64, alpha: 1.00),
        start: CGPoint(x: width * 0.56, y: launchY),
        apex: CGPoint(x: width * 0.69, y: height * 0.31),
        curveOffsetX: 38,
        delay: 0.26,
        duration: 0.64
      ),
    ]
  }

  private func addBackdropGlow() {
    let gradient = CAGradientLayer()
    gradient.frame = bounds
    gradient.colors = [
      UIColor.clear.cgColor,
      UIColor(red: 1.00, green: 0.73, blue: 0.28, alpha: 0.08).cgColor,
      UIColor.clear.cgColor,
    ]
    gradient.locations = [0.0, 0.58, 1.0]
    gradient.startPoint = CGPoint(x: 0.5, y: 0.15)
    gradient.endPoint = CGPoint(x: 0.5, y: 1.0)
    gradient.opacity = 0
    effectLayer.addSublayer(gradient)

    let opacity = CABasicAnimation(keyPath: "opacity")
    opacity.fromValue = 0
    opacity.toValue = 1
    opacity.duration = 0.18
    opacity.autoreverses = true
    opacity.beginTime = CACurrentMediaTime() + 0.1
    opacity.isRemovedOnCompletion = false
    opacity.fillMode = .forwards
    gradient.add(opacity, forKey: "opacity")
  }

  private func addFountains() {
    let leftOrigin = CGPoint(x: bounds.width * 0.14, y: bounds.height * 0.83)
    let rightOrigin = CGPoint(x: bounds.width * 0.86, y: bounds.height * 0.83)

    [
      (origin: leftOrigin, angle: CGFloat(-.pi / 4.2)),
      (origin: rightOrigin, angle: CGFloat(-(.pi - (.pi / 4.2)))),
    ].forEach { config in
      let sparkEmitter = makeFountainSparkEmitter(origin: config.origin, angle: config.angle)
      let confettiEmitter = makeFountainConfettiEmitter(origin: config.origin, angle: config.angle)

      effectLayer.addSublayer(sparkEmitter)
      effectLayer.addSublayer(confettiEmitter)

      schedule(after: 0.68) {
        sparkEmitter.birthRate = 0
        confettiEmitter.birthRate = 0
      }

      schedule(after: 1.55) {
        sparkEmitter.removeFromSuperlayer()
        confettiEmitter.removeFromSuperlayer()
      }
    }
  }

  private func addAmbientConfetti() {
    let emitter = CAEmitterLayer()
    emitter.frame = bounds
    emitter.emitterPosition = CGPoint(x: bounds.midX, y: bounds.height * 0.16)
    emitter.emitterSize = CGSize(width: bounds.width * 0.54, height: 2)
    emitter.emitterShape = .line
    emitter.emitterMode = .surface
    emitter.renderMode = .unordered
    emitter.birthRate = 1
    emitter.emitterCells = makeAmbientConfettiCells()
    effectLayer.addSublayer(emitter)

    schedule(after: 0.18) {
      emitter.birthRate = 0
    }

    schedule(after: 1.45) {
      emitter.removeFromSuperlayer()
    }
  }

  private func launchRocket(_ configuration: RocketConfiguration) {
    let path = UIBezierPath()
    path.move(to: configuration.start)

    let controlPoint = CGPoint(
      x: ((configuration.start.x + configuration.apex.x) * 0.5) + configuration.curveOffsetX,
      y: min(configuration.start.y, configuration.apex.y) + (bounds.height * 0.2)
    )
    path.addQuadCurve(to: configuration.apex, controlPoint: controlPoint)

    addTrail(path: path, duration: configuration.duration)
    addRocketLayer(
      path: path,
      startPoint: configuration.start,
      duration: configuration.duration,
      accentColor: configuration.accentColor
    )

    schedule(after: configuration.duration * 0.78) { [weak self] in
      self?.addBurst(at: configuration.apex)
    }
  }

  private func addTrail(path: UIBezierPath, duration: TimeInterval) {
    let glow = CAShapeLayer()
    glow.path = path.cgPath
    glow.strokeColor = warmGold.withAlphaComponent(0.88).cgColor
    glow.fillColor = nil
    glow.lineCap = .round
    glow.lineWidth = 12
    glow.strokeEnd = 0
    glow.opacity = 0
    glow.shadowColor = gold.cgColor
    glow.shadowOpacity = 1
    glow.shadowRadius = 12
    glow.shadowOffset = .zero
    effectLayer.addSublayer(glow)

    let core = CAShapeLayer()
    core.path = path.cgPath
    core.strokeColor = hotWhite.withAlphaComponent(0.96).cgColor
    core.fillColor = nil
    core.lineCap = .round
    core.lineWidth = 4.5
    core.strokeEnd = 0
    core.opacity = 0
    core.shadowColor = gold.cgColor
    core.shadowOpacity = 0.95
    core.shadowRadius = 6
    core.shadowOffset = .zero
    effectLayer.addSublayer(core)

    [glow, core].forEach { layer in
      let strokeAnimation = CABasicAnimation(keyPath: "strokeEnd")
      strokeAnimation.fromValue = 0
      strokeAnimation.toValue = 1
      strokeAnimation.duration = duration
      strokeAnimation.timingFunction = CAMediaTimingFunction(name: .easeOut)

      let opacityAnimation = CAKeyframeAnimation(keyPath: "opacity")
      opacityAnimation.values = [0, 1, 0.92, 0]
      opacityAnimation.keyTimes = [0, 0.12, 0.7, 1]
      opacityAnimation.duration = duration + 0.34
      opacityAnimation.timingFunctions = [
        CAMediaTimingFunction(name: .easeOut),
        CAMediaTimingFunction(name: .linear),
        CAMediaTimingFunction(name: .easeIn),
      ]

      let group = CAAnimationGroup()
      group.animations = [strokeAnimation, opacityAnimation]
      group.duration = duration + 0.34
      group.isRemovedOnCompletion = false
      group.fillMode = .forwards
      layer.add(group, forKey: "trail")
    }
  }

  private func addRocketLayer(
    path: UIBezierPath,
    startPoint: CGPoint,
    duration: TimeInterval,
    accentColor: UIColor
  ) {
    let rocketLayer = CALayer()
    rocketLayer.bounds = CGRect(x: 0, y: 0, width: 34, height: 74)
    rocketLayer.position = startPoint
    rocketLayer.opacity = 0
    rocketLayer.contents = makeRocketImage(accentColor: accentColor)
    rocketLayer.contentsGravity = .resizeAspect
    rocketLayer.contentsScale = UIScreen.main.scale
    rocketLayer.shadowColor = hotWhite.cgColor
    rocketLayer.shadowOpacity = 0.45
    rocketLayer.shadowRadius = 10
    rocketLayer.shadowOffset = .zero
    effectLayer.addSublayer(rocketLayer)

    let position = CAKeyframeAnimation(keyPath: "position")
    position.path = path.cgPath
    position.duration = duration
    position.timingFunction = CAMediaTimingFunction(name: .easeOut)
    position.rotationMode = .rotateAuto

    let opacity = CAKeyframeAnimation(keyPath: "opacity")
    opacity.values = [0, 1, 1, 0]
    opacity.keyTimes = [0, 0.08, 0.82, 1]
    opacity.duration = duration + 0.08

    let scale = CAKeyframeAnimation(keyPath: "transform.scale")
    scale.values = [0.92, 1.0, 0.96]
    scale.keyTimes = [0, 0.24, 1]
    scale.duration = duration

    let group = CAAnimationGroup()
    group.animations = [position, opacity, scale]
    group.duration = duration + 0.08
    group.isRemovedOnCompletion = false
    group.fillMode = .forwards
    rocketLayer.add(group, forKey: "rocket")
  }

  private func addBurst(at point: CGPoint) {
    let sparkEmitter = makeBurstSparkEmitter(at: point)
    let confettiEmitter = makeBurstConfettiEmitter(at: point)
    effectLayer.addSublayer(sparkEmitter)
    effectLayer.addSublayer(confettiEmitter)

    addBurstGlow(at: point)

    schedule(after: 0.1) {
      sparkEmitter.birthRate = 0
      confettiEmitter.birthRate = 0
    }

    schedule(after: 1.05) {
      sparkEmitter.removeFromSuperlayer()
      confettiEmitter.removeFromSuperlayer()
    }
  }

  private func addBurstGlow(at point: CGPoint) {
    let outerGlow = CALayer()
    outerGlow.position = point
    outerGlow.bounds = CGRect(x: 0, y: 0, width: 24, height: 24)
    outerGlow.backgroundColor = hotWhite.cgColor
    outerGlow.cornerRadius = 12
    outerGlow.shadowColor = gold.cgColor
    outerGlow.shadowOpacity = 1
    outerGlow.shadowRadius = 20
    outerGlow.shadowOffset = .zero
    outerGlow.opacity = 0
    effectLayer.addSublayer(outerGlow)

    let innerGlow = CALayer()
    innerGlow.position = point
    innerGlow.bounds = CGRect(x: 0, y: 0, width: 12, height: 12)
    innerGlow.backgroundColor = UIColor.white.cgColor
    innerGlow.cornerRadius = 6
    innerGlow.shadowColor = hotWhite.cgColor
    innerGlow.shadowOpacity = 1
    innerGlow.shadowRadius = 12
    innerGlow.shadowOffset = .zero
    innerGlow.opacity = 0
    effectLayer.addSublayer(innerGlow)

    [outerGlow, innerGlow].enumerated().forEach { index, layer in
      let opacity = CAKeyframeAnimation(keyPath: "opacity")
      opacity.values = [0, 1, 0]
      opacity.keyTimes = [0, 0.14, 1]
      opacity.duration = 0.5

      let scale = CABasicAnimation(keyPath: "transform.scale")
      scale.fromValue = index == 0 ? 0.2 : 0.4
      scale.toValue = index == 0 ? 2.9 : 1.8
      scale.duration = 0.5
      scale.timingFunction = CAMediaTimingFunction(name: .easeOut)

      let group = CAAnimationGroup()
      group.animations = [opacity, scale]
      group.duration = 0.5
      group.isRemovedOnCompletion = false
      group.fillMode = .forwards
      layer.add(group, forKey: "glow")
    }
  }

  private func makeFountainSparkEmitter(origin: CGPoint, angle: CGFloat) -> CAEmitterLayer {
    let inwardAcceleration: CGFloat = angle < (-CGFloat.pi / 2) ? 22 : -22

    let emitter = CAEmitterLayer()
    emitter.frame = bounds
    emitter.emitterPosition = origin
    emitter.emitterShape = .point
    emitter.emitterMode = .points
    emitter.renderMode = .additive
    emitter.birthRate = 1
    emitter.emitterCells = [
      sparkCell(
        name: "fountain-gold",
        color: gold,
        image: makeSparkImage(color: gold, size: CGSize(width: 4, height: 26)),
        birthRate: 120,
        lifetime: 0.58,
        velocity: 260,
        velocityRange: 42,
        emissionLongitude: angle,
        emissionRange: 0.28,
        spin: 1.2,
        yAcceleration: 300,
        xAcceleration: inwardAcceleration,
        scale: 0.92,
        scaleRange: 0.3,
        alphaSpeed: -1.5
      ),
      sparkCell(
        name: "fountain-white",
        color: hotWhite,
        image: makeSparkImage(color: hotWhite, size: CGSize(width: 3, height: 18)),
        birthRate: 80,
        lifetime: 0.48,
        velocity: 230,
        velocityRange: 36,
        emissionLongitude: angle,
        emissionRange: 0.2,
        spin: 1.4,
        yAcceleration: 280,
        xAcceleration: inwardAcceleration * 0.9,
        scale: 0.78,
        scaleRange: 0.22,
        alphaSpeed: -1.7
      ),
    ]
    return emitter
  }

  private func makeFountainConfettiEmitter(origin: CGPoint, angle: CGFloat) -> CAEmitterLayer {
    let inwardAcceleration: CGFloat = angle < (-CGFloat.pi / 2) ? 16 : -16

    let emitter = CAEmitterLayer()
    emitter.frame = bounds
    emitter.emitterPosition = origin
    emitter.emitterShape = .point
    emitter.emitterMode = .points
    emitter.renderMode = .unordered
    emitter.birthRate = 1
    emitter.emitterCells = confettiPalette.enumerated().map { index, color in
      confettiCell(
        name: "fountain-confetti-\(index)",
        color: color,
        image: makeConfettiImage(
          color: color,
          size: CGSize(width: index % 2 == 0 ? 14 : 11, height: index % 2 == 0 ? 7 : 5),
          cornerRadius: 1.4
        ),
        birthRate: index < 2 ? 28 : 14,
        lifetime: 0.92,
        velocity: 190,
        velocityRange: 30,
        emissionLongitude: angle,
        emissionRange: 0.32,
        spin: 2.4,
        yAcceleration: 280,
        xAcceleration: inwardAcceleration,
        scale: 1,
        scaleRange: 0.26,
        alphaSpeed: -0.9
      )
    }
    return emitter
  }

  private func makeBurstSparkEmitter(at point: CGPoint) -> CAEmitterLayer {
    let emitter = CAEmitterLayer()
    emitter.frame = bounds
    emitter.emitterPosition = point
    emitter.emitterShape = .point
    emitter.emitterMode = .points
    emitter.renderMode = .additive
    emitter.birthRate = 1
    emitter.emitterCells = [
      sparkCell(
        name: "burst-gold",
        color: gold,
        image: makeSparkImage(color: gold, size: CGSize(width: 4, height: 26)),
        birthRate: 220,
        lifetime: 0.48,
        velocity: 158,
        velocityRange: 46,
        emissionLongitude: 0,
        emissionRange: .pi * 2,
        spin: 2.1,
        yAcceleration: 180,
        xAcceleration: 0,
        scale: 1.08,
        scaleRange: 0.4,
        alphaSpeed: -2.1
      ),
      sparkCell(
        name: "burst-white",
        color: hotWhite,
        image: makeSparkImage(color: hotWhite, size: CGSize(width: 3, height: 18)),
        birthRate: 160,
        lifetime: 0.4,
        velocity: 132,
        velocityRange: 38,
        emissionLongitude: 0,
        emissionRange: .pi * 2,
        spin: 2.4,
        yAcceleration: 160,
        xAcceleration: 0,
        scale: 0.92,
        scaleRange: 0.28,
        alphaSpeed: -2.2
      ),
    ]
    return emitter
  }

  private func makeBurstConfettiEmitter(at point: CGPoint) -> CAEmitterLayer {
    let emitter = CAEmitterLayer()
    emitter.frame = bounds
    emitter.emitterPosition = point
    emitter.emitterShape = .point
    emitter.emitterMode = .points
    emitter.renderMode = .unordered
    emitter.birthRate = 1
    emitter.emitterCells = confettiPalette.enumerated().flatMap { index, color in
      [
        confettiCell(
          name: "burst-strip-\(index)",
          color: color,
          image: makeConfettiImage(color: color, size: CGSize(width: 14, height: 6), cornerRadius: 1.2),
          birthRate: 14,
          lifetime: 1.06,
          velocity: 120,
          velocityRange: 36,
          emissionLongitude: 0,
          emissionRange: .pi * 2,
          spin: 2.8,
          yAcceleration: 210,
          xAcceleration: 0,
          scale: 1,
          scaleRange: 0.24,
          alphaSpeed: -0.86
        ),
        confettiCell(
          name: "burst-sliver-\(index)",
          color: color.withAlphaComponent(0.96),
          image: makeConfettiImage(color: color.withAlphaComponent(0.96), size: CGSize(width: 10, height: 4), cornerRadius: 1.0),
          birthRate: 10,
          lifetime: 0.96,
          velocity: 104,
          velocityRange: 28,
          emissionLongitude: 0,
          emissionRange: .pi * 2,
          spin: 3.2,
          yAcceleration: 220,
          xAcceleration: 0,
          scale: 1,
          scaleRange: 0.18,
          alphaSpeed: -0.96
        ),
      ]
    }
    return emitter
  }

  private func makeAmbientConfettiCells() -> [CAEmitterCell] {
    confettiPalette.enumerated().flatMap { index, color in
      [
        confettiCell(
          name: "ambient-strip-\(index)",
          color: color,
          image: makeConfettiImage(color: color, size: CGSize(width: 13, height: 6), cornerRadius: 1.2),
          birthRate: index < 2 ? 10 : 7,
          lifetime: 1.12,
          velocity: 132,
          velocityRange: 20,
          emissionLongitude: .pi / 2,
          emissionRange: 0.6,
          spin: 2.6,
          yAcceleration: 220,
          xAcceleration: 0,
          scale: 1,
          scaleRange: 0.2,
          alphaSpeed: -0.76
        ),
        confettiCell(
          name: "ambient-sliver-\(index)",
          color: color.withAlphaComponent(0.94),
          image: makeConfettiImage(color: color.withAlphaComponent(0.94), size: CGSize(width: 10, height: 4), cornerRadius: 1.0),
          birthRate: 5,
          lifetime: 1.02,
          velocity: 118,
          velocityRange: 16,
          emissionLongitude: .pi / 2,
          emissionRange: 0.56,
          spin: 3,
          yAcceleration: 214,
          xAcceleration: 0,
          scale: 1,
          scaleRange: 0.16,
          alphaSpeed: -0.84
        ),
      ]
    }
  }

  private func sparkCell(
    name: String,
    color: UIColor,
    image: CGImage?,
    birthRate: Float,
    lifetime: Float,
    velocity: CGFloat,
    velocityRange: CGFloat,
    emissionLongitude: CGFloat,
    emissionRange: CGFloat,
    spin: CGFloat,
    yAcceleration: CGFloat,
    xAcceleration: CGFloat,
    scale: CGFloat,
    scaleRange: CGFloat,
    alphaSpeed: Float
  ) -> CAEmitterCell {
    let cell = CAEmitterCell()
    cell.name = name
    cell.contents = image
    cell.birthRate = birthRate
    cell.lifetime = lifetime
    cell.lifetimeRange = lifetime * 0.18
    cell.velocity = velocity
    cell.velocityRange = velocityRange
    cell.emissionLongitude = emissionLongitude
    cell.emissionRange = emissionRange
    cell.spin = spin
    cell.spinRange = spin * 0.45
    cell.yAcceleration = yAcceleration
    cell.xAcceleration = xAcceleration
    cell.scale = scale
    cell.scaleRange = scaleRange
    cell.alphaSpeed = alphaSpeed
    cell.alphaRange = 0.08
    cell.color = color.cgColor
    cell.contentsScale = UIScreen.main.scale
    cell.magnificationFilter = "linear"
    cell.minificationFilter = "linear"
    return cell
  }

  private func confettiCell(
    name: String,
    color: UIColor,
    image: CGImage?,
    birthRate: Float,
    lifetime: Float,
    velocity: CGFloat,
    velocityRange: CGFloat,
    emissionLongitude: CGFloat,
    emissionRange: CGFloat,
    spin: CGFloat,
    yAcceleration: CGFloat,
    xAcceleration: CGFloat,
    scale: CGFloat,
    scaleRange: CGFloat,
    alphaSpeed: Float
  ) -> CAEmitterCell {
    let cell = CAEmitterCell()
    cell.name = name
    cell.contents = image
    cell.birthRate = birthRate
    cell.lifetime = lifetime
    cell.lifetimeRange = lifetime * 0.2
    cell.velocity = velocity
    cell.velocityRange = velocityRange
    cell.emissionLongitude = emissionLongitude
    cell.emissionRange = emissionRange
    cell.spin = spin
    cell.spinRange = spin * 0.5
    cell.yAcceleration = yAcceleration
    cell.xAcceleration = xAcceleration
    cell.scale = scale
    cell.scaleRange = scaleRange
    cell.alphaSpeed = alphaSpeed
    cell.alphaRange = 0.06
    cell.color = color.cgColor
    cell.contentsScale = UIScreen.main.scale
    cell.magnificationFilter = "linear"
    cell.minificationFilter = "linear"
    return cell
  }

  private func makeRocketImage(accentColor: UIColor) -> CGImage? {
    let size = CGSize(width: 34, height: 74)
    let format = UIGraphicsImageRendererFormat()
    format.opaque = false
    format.scale = UIScreen.main.scale

    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    let image = renderer.image { context in
      let cgContext = context.cgContext
      cgContext.saveGState()
      cgContext.setShadow(offset: .zero, blur: 9, color: UIColor.white.withAlphaComponent(0.5).cgColor)

      let bodyRect = CGRect(x: 10, y: 16, width: 14, height: 34)
      UIColor.white.setFill()
      UIBezierPath(roundedRect: bodyRect, cornerRadius: 6).fill()

      let nosePath = UIBezierPath()
      nosePath.move(to: CGPoint(x: size.width * 0.5, y: 2))
      nosePath.addLine(to: CGPoint(x: 24, y: 18))
      nosePath.addLine(to: CGPoint(x: 10, y: 18))
      nosePath.close()
      UIColor.white.setFill()
      nosePath.fill()
      cgContext.restoreGState()

      UIColor(red: 0.84, green: 0.87, blue: 0.93, alpha: 1.0).setFill()
      UIBezierPath(roundedRect: CGRect(x: 11, y: 18, width: 12, height: 4), cornerRadius: 2).fill()

      accentColor.setFill()
      UIBezierPath(roundedRect: CGRect(x: 8, y: 28, width: 18, height: 8), cornerRadius: 2.5).fill()

      gold.setFill()
      UIBezierPath(roundedRect: CGRect(x: 8, y: 40, width: 18, height: 4), cornerRadius: 2).fill()

      let leftFin = UIBezierPath()
      leftFin.move(to: CGPoint(x: 10, y: 44))
      leftFin.addLine(to: CGPoint(x: 5, y: 56))
      leftFin.addLine(to: CGPoint(x: 11, y: 54))
      leftFin.close()
      gold.setFill()
      leftFin.fill()

      let rightFin = UIBezierPath()
      rightFin.move(to: CGPoint(x: 24, y: 44))
      rightFin.addLine(to: CGPoint(x: 29, y: 56))
      rightFin.addLine(to: CGPoint(x: 23, y: 54))
      rightFin.close()
      gold.setFill()
      rightFin.fill()

      let flameOuter = UIBezierPath(ovalIn: CGRect(x: 11, y: 50, width: 12, height: 20))
      warmGold.withAlphaComponent(0.9).setFill()
      flameOuter.fill()

      let flameInner = UIBezierPath(ovalIn: CGRect(x: 13.5, y: 52, width: 7, height: 15))
      hotWhite.withAlphaComponent(0.95).setFill()
      flameInner.fill()
    }

    return image.cgImage
  }

  private func makeConfettiImage(color: UIColor, size: CGSize, cornerRadius: CGFloat) -> CGImage? {
    let format = UIGraphicsImageRendererFormat()
    format.opaque = false
    format.scale = UIScreen.main.scale

    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    let image = renderer.image { _ in
      color.setFill()
      UIBezierPath(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: cornerRadius).fill()
    }

    return image.cgImage
  }

  private func makeSparkImage(color: UIColor, size: CGSize) -> CGImage? {
    let format = UIGraphicsImageRendererFormat()
    format.opaque = false
    format.scale = UIScreen.main.scale

    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    let image = renderer.image { context in
      let cgContext = context.cgContext
      let rect = CGRect(origin: .zero, size: size)

      cgContext.saveGState()
      cgContext.setShadow(offset: .zero, blur: size.width * 1.8, color: color.withAlphaComponent(0.95).cgColor)
      color.withAlphaComponent(0.85).setFill()
      UIBezierPath(roundedRect: rect.insetBy(dx: 0.8, dy: 0.8), cornerRadius: size.width * 0.5).fill()
      cgContext.restoreGState()

      hotWhite.withAlphaComponent(0.92).setFill()
      UIBezierPath(
        roundedRect: rect.insetBy(dx: size.width * 0.28, dy: size.height * 0.08),
        cornerRadius: size.width * 0.35
      ).fill()
    }

    return image.cgImage
  }
}
