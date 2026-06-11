import Foundation

enum Config {
    #if DEBUG
    static let backendURL = "http://127.0.0.1:3001"
    #else
    static let backendURL = "https://beatably-backend.onrender.com"
    #endif
}
