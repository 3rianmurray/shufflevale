import CoreImage
import ExpoModulesCore
import UIKit
import Vision

/// Cuts the subject out of a picture, as Photos does when a subject is lifted (Vision's foreground masks, iOS 17
/// and later): for cards of odd shapes photographed on a table, and for custom art.
public class SubjectLiftModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SubjectLift")

    /// Whether this iPhone can do it (iOS 17 and later).
    Function("isAvailable") { () -> Bool in
      if #available(iOS 17.0, *) { return true }
      return false
    }

    /// The subject cut out: a PNG, trimmed to it, see-through round it; with how much of its own rectangle it
    /// fills (near 1 for a plain card, less for an odd shape), and where it was in the picture (as shares of the
    /// picture's width and height, from the top left). Nil if there's no subject to be found.
    AsyncFunction("liftSubject") { (uri: String) -> [String: Any]? in
      guard #available(iOS 17.0, *) else { return nil }
      guard let url = URL(string: uri),
            let image = CIImage(contentsOf: url, options: [.applyOrientationProperty: true])
      else { return nil }
      let handler = VNImageRequestHandler(ciImage: image)
      let request = VNGenerateForegroundInstanceMaskRequest()
      do {
        try handler.perform([request])
      } catch {
        return nil
      }
      guard let result = request.results?.first, !result.allInstances.isEmpty else { return nil }
      let instances = result.allInstances
      guard let masked = try? result.generateMaskedImage(ofInstances: instances, from: handler, croppedToInstancesExtent: true)
      else { return nil }

      let context = CIContext()
      let cut = CIImage(cvPixelBuffer: masked)
      guard let cgImage = context.createCGImage(cut, from: cut.extent),
            let png = UIImage(cgImage: cgImage).pngData()
      else { return nil }
      let file = FileManager.default.temporaryDirectory.appendingPathComponent("lift-\(UUID().uuidString).png")
      do {
        try png.write(to: file)
      } catch {
        return nil
      }
      let found = measureSubject(result.instanceMask, instances: instances)
      return [
        "uri": file.absoluteString,
        "width": cgImage.width,
        "height": cgImage.height,
        "coverage": found.coverage,
        "x": Double(found.box.minX),
        "y": Double(found.box.minY),
        "w": Double(found.box.width),
        "h": Double(found.box.height),
      ]
    }
  }
}

/// How much of the subject's own rectangle the subject fills, and where that rectangle is (as shares of the
/// picture), from the (small) mask of what's where: each pixel the number of the subject it's part of, 0 for the
/// background.
private func measureSubject(_ mask: CVPixelBuffer, instances: IndexSet) -> (coverage: Double, box: CGRect) {
  CVPixelBufferLockBaseAddress(mask, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(mask, .readOnly) }
  let whole = CGRect(x: 0, y: 0, width: 1, height: 1)
  guard let base = CVPixelBufferGetBaseAddress(mask) else { return (0, whole) }
  let width = CVPixelBufferGetWidth(mask)
  let height = CVPixelBufferGetHeight(mask)
  let rowBytes = CVPixelBufferGetBytesPerRow(mask)
  let pixels = base.assumingMemoryBound(to: UInt8.self)
  var count = 0
  var left = width, right = -1, top = height, bottom = -1
  for y in 0..<height {
    for x in 0..<width where instances.contains(Int(pixels[y * rowBytes + x])) {
      count += 1
      left = min(left, x)
      right = max(right, x)
      top = min(top, y)
      bottom = max(bottom, y)
    }
  }
  guard right >= left, bottom >= top else { return (0, whole) }
  let boxW = right - left + 1
  let boxH = bottom - top + 1
  let box = CGRect(
    x: Double(left) / Double(width),
    y: Double(top) / Double(height),
    width: Double(boxW) / Double(width),
    height: Double(boxH) / Double(height)
  )
  return (Double(count) / Double(boxW * boxH), box)
}
