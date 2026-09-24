// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CBCTViewerMac",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "CBCTViewerMac", targets: ["CBCTViewerMac"])
    ],
    targets: [
        .target(
            name: "CBCTCore",
            path: "Sources/CBCTCore",
            publicHeadersPath: "include",
            cxxSettings: [
                .headerSearchPath("src/include")
            ]
        ),
        .executableTarget(
            name: "CBCTViewerMac",
            dependencies: ["CBCTCore"],
            path: "Sources/CBCTViewerMac"
        ),
        .testTarget(
            name: "CBCTCoreTests",
            dependencies: ["CBCTCore"],
            path: "Tests/CBCTCoreTests"
        )
    ],
    swiftLanguageModes: [.v5],
    cxxLanguageStandard: .cxx20
)
