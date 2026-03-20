import QuartzCore
import UIKit

struct IOSReferenceConfettiConfiguration {
  var particleCount: Int = 100
  var spread: CGFloat = .pi / 2
  var gravity: CGFloat = 2600
  var startVelocity: CGFloat = 900
  var velocityDecay: CGFloat = 0.82
  var drift: CGFloat = 0
  var scale: CGFloat = 0.22
  var scaleRange: CGFloat = 0.18
  var lifetime: TimeInterval = 6.5
  var gravityAnimationDuration: TimeInterval = 2.8
  var birthRateAnimationDuration: TimeInterval = 0.6
  var spin: CGFloat = .pi * 3
  var spinRange: CGFloat = .pi * 2.6
  var origin: CGPoint? = nil
  var angle: CGFloat? = nil
  var emitterSize: CGSize? = nil
}

enum IOSReferenceConfettiEmitter {
  enum Shape: Hashable {
    case circle
    case rectangle
    case custom(String, CGPath)

    private static var shapesCache: [Shape: UIImage] = [:]

    fileprivate var image: UIImage {
      if let cached = Self.shapesCache[self] {
        return cached
      }

      let rect = CGRect(origin: .zero, size: CGSize(width: 20, height: 20))
      let image = UIGraphicsImageRenderer(size: rect.size).image { context in
        context.cgContext.setFillColor(UIColor.white.cgColor)
        context.cgContext.addPath(path(in: rect))
        context.cgContext.fillPath()
      }
      Self.shapesCache[self] = image
      return image
    }

    fileprivate func path(in rect: CGRect) -> CGPath {
      switch self {
      case .circle:
        return CGPath(ellipseIn: rect, transform: nil)
      case .rectangle:
        let path = CGMutablePath()
        path.addLines(between: [
          CGPoint(x: rect.minX, y: rect.minY + rect.height * 0.18),
          CGPoint(x: rect.maxX * 0.24, y: rect.minY),
          CGPoint(x: rect.maxX, y: rect.minY + rect.height * 0.12),
          CGPoint(x: rect.maxX * 0.88, y: rect.maxY),
          CGPoint(x: rect.minX, y: rect.maxY * 0.82),
        ])
        path.closeSubpath()
        return path
      case let .custom(_, path):
        return path
      }
    }
  }

  case shape(Shape, color: UIColor?, id: String = UUID().uuidString)
  case image(UIImage, color: UIColor?, id: String = UUID().uuidString)

  var id: String {
    switch self {
    case let .shape(_, _, id), let .image(_, _, id):
      return id
    }
  }

  var color: UIColor? {
    switch self {
    case let .shape(_, color, _), let .image(_, color, _):
      return color
    }
  }

  var image: UIImage {
    switch self {
    case let .shape(shape, _, _):
      return shape.image
    case let .image(image, _, _):
      return image
    }
  }
}

final class IOSReferenceConfettiLayer: CAEmitterLayer {
  enum Direction {
    case left
    case right
    case top
    case bottom

    var longitude: CGFloat {
      switch self {
      case .left:
        return .pi * 0.25
      case .right:
        return .pi * 1.75
      case .top:
        return .pi / 2
      case .bottom:
        return -.pi / 2
      }
    }

    func position(rect: CGRect) -> CGPoint {
      switch self {
      case .left:
        return CGPoint(x: -36, y: rect.midY)
      case .right:
        return CGPoint(x: rect.maxX + 36, y: rect.midY)
      case .top:
        return CGPoint(x: rect.midX, y: -28)
      case .bottom:
        return CGPoint(x: rect.midX, y: rect.maxY + 28)
      }
    }
  }

  private let direction: Direction
  private let configuration: IOSReferenceConfettiConfiguration

  init(
    _ emitters: [IOSReferenceConfettiEmitter],
    _ direction: Direction,
    configuration: IOSReferenceConfettiConfiguration
  ) {
    self.direction = direction
    self.configuration = configuration
    super.init()
    configure(emitters, direction)
  }

  override init(layer: Any) {
    direction = .top
    configuration = IOSReferenceConfettiConfiguration()
    super.init(layer: layer)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSublayers() {
    super.layoutSublayers()
    emitterMode = .outline
    emitterShape = .line
    emitterSize = configuration.emitterSize ?? CGSize(width: 1, height: 1)
    emitterPosition = configuration.origin ?? direction.position(rect: frame)
  }

  private func configure(_ emitters: [IOSReferenceConfettiEmitter], _ direction: Direction) {
    emitterCells = emitters.map { content in
      let cell = CAEmitterCell()
      cell.name = content.id
      cell.contents = content.image.cgImage
      if let color = content.color {
        cell.color = color.cgColor
      }
      cell.beginTime = CACurrentMediaTime()
      cell.birthRate = Float(configuration.particleCount)
      cell.lifetime = Float(configuration.lifetime)
      cell.velocity = configuration.startVelocity
      cell.velocityRange = configuration.startVelocity * (1 - configuration.velocityDecay)
      cell.xAcceleration = configuration.drift
      cell.yAcceleration = configuration.gravity
      cell.emissionRange = configuration.spread
      cell.emissionLongitude = configuration.angle ?? direction.longitude
      cell.scale = configuration.scale
      cell.scaleRange = configuration.scaleRange
      cell.scaleSpeed = 0
      cell.spin = configuration.spin
      cell.spinRange = configuration.spinRange
      cell.contentsScale = UIScreen.main.scale
      cell.magnificationFilter = "linear"
      cell.minificationFilter = "linear"
      cell.setValue("plane", forKey: "particleType")
      cell.setValue(Double.pi, forKey: "orientationRange")
      cell.setValue(Double.pi / 2, forKey: "orientationLongitude")
      cell.setValue(Double.pi / 2, forKey: "orientationLatitude")
      return cell
    }
  }

  func startEmission() {
    birthRate = 1

    let gravityAnimation = CABasicAnimation(keyPath: "emitterCells.@all.yAcceleration")
    gravityAnimation.duration = configuration.gravityAnimationDuration
    gravityAnimation.fromValue = 0
    gravityAnimation.toValue = configuration.gravity
    gravityAnimation.timingFunction = CAMediaTimingFunction(name: .easeIn)
    add(gravityAnimation, forKey: "gravity")

    let birthRateAnimation = CABasicAnimation(keyPath: "birthRate")
    birthRateAnimation.duration = configuration.birthRateAnimationDuration
    birthRateAnimation.fromValue = 1
    birthRateAnimation.toValue = 0
    add(birthRateAnimation, forKey: "birthRate")
    birthRate = 0
  }
}

enum IOSReferenceConfettiFactory {
  static func defaultEmitters(colors: [UIColor]) -> [IOSReferenceConfettiEmitter] {
    colors.enumerated().flatMap { index, color in
      [
        .shape(.rectangle, color: color, id: "rect-\(index)"),
        .shape(.circle, color: color, id: "circle-\(index)"),
      ]
    }
  }

  static func premiumEmitters(colors: [UIColor]) -> [IOSReferenceConfettiEmitter] {
    let cutPath = CGMutablePath()
    cutPath.addLines(between: [
      CGPoint(x: 1, y: 5),
      CGPoint(x: 6, y: 1),
      CGPoint(x: 19, y: 2),
      CGPoint(x: 17, y: 11),
      CGPoint(x: 2, y: 10),
    ])
    cutPath.closeSubpath()

    return colors.enumerated().flatMap { index, color in
      [
        .shape(.rectangle, color: color, id: "premium-rect-\(index)"),
        .shape(.circle, color: color, id: "premium-circle-\(index)"),
        .shape(.custom("cut-\(index)", cutPath), color: color, id: "premium-cut-\(index)"),
      ]
    }
  }
}
