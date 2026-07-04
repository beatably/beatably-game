import SwiftUI

extension Color {
    // ── Brand palette ────────────────────────────────────────────────
    static let beatBg             = Color(hex: "0C0A1A")  // hsl(245,60%,8%)
    static let beatSurface        = Color(hex: "141128")  // hsl(245,45%,12%)
    static let beatSurface2       = Color(hex: "1E1B34")  // hsl(245,35%,18%)
    static let beatBorder         = Color(hex: "2D2A45")  // hsl(245,30%,25%)
    static let beatTeal           = Color(hex: "08AF9A")  // gradient start / focus ring
    static let beatGradientPurple = Color(hex: "7D3BED")  // gradient end
    static let beatGreen          = Color(hex: "22C55E")  // correct/win indicators
    static let beatPurple         = Color(hex: "9945FF")  // neon purple accent
    static let beatCyan           = Color(hex: "00CED1")  // neon cyan
    static let beatMagenta        = Color(hex: "FF1493")  // neon magenta
    static let beatText           = Color(hex: "F8F8FC")
    static let beatMuted          = Color(hex: "8888AA")
    static let beatDim            = Color(hex: "55567A")

    init(hex: String) {
        var s = hex.trimmingCharacters(in: .alphanumerics.inverted)
        var n: UInt64 = 0
        Scanner(string: s).scanHexInt64(&n)
        let a, r, g, b: UInt64
        switch s.count {
        case 6:  (a, r, g, b) = (255, n >> 16, n >> 8 & 0xFF, n & 0xFF)
        case 8:  (a, r, g, b) = (n >> 24, n >> 16 & 0xFF, n >> 8 & 0xFF, n & 0xFF)
        default: (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(.sRGB,
                  red:     Double(r) / 255,
                  green:   Double(g) / 255,
                  blue:    Double(b) / 255,
                  opacity: Double(a) / 255)
    }
}
