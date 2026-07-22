import SwiftUI
import CoreImage.CIFilterBuiltins

/// A QR code rendered onto a white tile (the light quiet zone the dark theme needs
/// for reliable scanning). Encodes an arbitrary string — used for the web join link.
struct QRCodeView: View {
    let string: String
    var side: CGFloat = 108

    private static let context = CIContext()

    var body: some View {
        Group {
            if let image = makeImage() {
                Image(uiImage: image)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(width: side, height: side)
            } else {
                Color.clear.frame(width: side, height: side)
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.white)
        )
    }

    private func makeImage() -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        guard let cgImage = Self.context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
