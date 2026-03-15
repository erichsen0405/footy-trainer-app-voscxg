import QuartzCore
import UIKit

@objc(IOSPremiumConfettiView)
final class IOSPremiumConfettiView: UIView {
  @objc var burstKey: NSNumber = 0 {
    didSet {
      let nextKey = burstKey.intValue
      guard nextKey != lastBurstKey else { return }
      lastBurstKey = nextKey
      playBurst()
    }
  }

  @objc var variant: NSString = "task" {
    didSet {
      configureEmitter()
    }
  }

  private let emitterLayer = CAEmitterLayer()
  private var lastBurstKey = 0
  private var stopEmitterWorkItem: DispatchWorkItem?

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    backgroundColor = .clear
    layer.addSublayer(emitterLayer)
    configureEmitter()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    isUserInteractionEnabled = false
    backgroundColor = .clear
    layer.addSublayer(emitterLayer)
    configureEmitter()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    emitterLayer.frame = bounds
    emitterLayer.emitterPosition = CGPoint(x: bounds.midX, y: -10)
    emitterLayer.emitterSize = CGSize(width: max(bounds.width * emitterWidthMultiplier, 140), height: 2)
  }

  deinit {
    stopEmitterWorkItem?.cancel()
    emitterLayer.birthRate = 0
    emitterLayer.removeAllAnimations()
    emitterLayer.emitterCells = nil
  }

  private var isDayComplete: Bool {
    variant == "dayComplete"
  }

  private var emitterWidthMultiplier: CGFloat {
    isDayComplete ? 0.42 : 0.28
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
    guard bounds.width > 0, bounds.height > 0 else {
      DispatchQueue.main.async { [weak self] in
        self?.playBurst()
      }
      return
    }

    configureEmitter()
    emitterLayer.beginTime = CACurrentMediaTime()
    emitterLayer.birthRate = 1

    stopEmitterWorkItem?.cancel()
    let workItem = DispatchWorkItem { [weak self] in
      self?.emitterLayer.birthRate = 0
    }
    stopEmitterWorkItem = workItem

    DispatchQueue.main.asyncAfter(
      deadline: .now() + (isDayComplete ? 0.2 : 0.16),
      execute: workItem
    )
  }

  private func makeEmitterCells() -> [CAEmitterCell] {
    let colors: [UIColor] = [
      UIColor(red: 0.20, green: 0.69, blue: 1.00, alpha: 1.00),
      UIColor(red: 0.30, green: 0.85, blue: 0.48, alpha: 1.00),
      UIColor(red: 0.96, green: 0.77, blue: 0.27, alpha: 1.00),
      UIColor(red: 1.00, green: 0.50, blue: 0.31, alpha: 1.00),
      UIColor(red: 0.61, green: 0.43, blue: 1.00, alpha: 1.00),
      UIColor(red: 0.13, green: 0.70, blue: 0.67, alpha: 1.00),
    ]

    let baseBirthRate: Float = isDayComplete ? 7.5 : 5.5
    let baseVelocity: CGFloat = isDayComplete ? 250 : 210
    let baseLifetime: Float = isDayComplete ? 1.12 : 0.92
    let acceleration: CGFloat = isDayComplete ? 680 : 620
    let emissionRange: CGFloat = isDayComplete ? 0.3 : 0.24

    return colors.enumerated().flatMap { index, color in
      [
        emitterCell(
          name: "strip-\(index)",
          color: color,
          image: makeRectImage(color: color, size: CGSize(width: 12, height: 5), cornerRadius: 1.2),
          birthRate: baseBirthRate,
          velocity: baseVelocity,
          lifetime: baseLifetime,
          acceleration: acceleration,
          emissionRange: emissionRange,
          spin: 2.8
        ),
        emitterCell(
          name: "sliver-\(index)",
          color: color.withAlphaComponent(0.94),
          image: makeRectImage(color: color.withAlphaComponent(0.94), size: CGSize(width: 16, height: 3), cornerRadius: 0.8),
          birthRate: baseBirthRate * 0.55,
          velocity: baseVelocity * 0.9,
          lifetime: baseLifetime * 0.94,
          acceleration: acceleration,
          emissionRange: emissionRange * 0.9,
          spin: 3.2
        ),
      ]
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
    cell.magnificationFilter = .linear
    cell.minificationFilter = .linear
    cell.color = color.cgColor
    return cell
  }

  private func makeRectImage(color: UIColor, size: CGSize, cornerRadius: CGFloat) -> CGImage? {
    let format = UIGraphicsImageRendererFormat()
    format.opaque = false
    format.scale = UIScreen.main.scale

    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    let image = renderer.image { context in
      let rect = CGRect(origin: .zero, size: size)
      let path = UIBezierPath(roundedRect: rect, cornerRadius: cornerRadius)
      color.setFill()
      path.fill()
    }

    return image.cgImage
  }
}
