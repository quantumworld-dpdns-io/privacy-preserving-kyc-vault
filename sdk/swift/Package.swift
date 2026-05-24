// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "KYCVault",
    platforms: [
        .iOS(.v15),
        .macOS(.v12),
    ],
    products: [
        .library(
            name: "KYCVault",
            targets: ["KYCVault"]
        ),
    ],
    targets: [
        .target(
            name: "KYCVault",
            path: "Sources/KYCVault"
        ),
        .testTarget(
            name: "KYCVaultTests",
            dependencies: ["KYCVault"],
            path: "Tests/KYCVaultTests"
        ),
    ]
)
