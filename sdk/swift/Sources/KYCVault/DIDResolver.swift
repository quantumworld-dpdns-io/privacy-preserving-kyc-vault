import Foundation

public class DIDResolver {
    private let client: KYCVaultClient

    public init(client: KYCVaultClient) {
        self.client = client
    }

    private func validateDID(_ did: String) throws {
        guard !did.isEmpty else {
            throw DIDResolverError.validation("DID string is required")
        }
        let parts = did.split(separator: ":")
        guard parts.count >= 3, parts[0] == "did" else {
            throw DIDResolverError.validation("Invalid DID format: '\(did)'")
        }
        guard !parts[1].isEmpty else {
            throw DIDResolverError.validation("DID method is required")
        }
    }

    public func resolve(_ did: String) async throws -> DIDDocument {
        try validateDID(did)
        return try await client.resolveDID(did)
    }

    public func create(
        method: String,
        keyType: String? = nil,
        network: String? = nil,
        services: [ServiceEndpoint]? = nil
    ) async throws -> DIDDocument {
        guard !method.isEmpty else {
            throw DIDResolverError.validation("DID method is required")
        }
        let supported = ["key", "web", "ethr", "ion", "indy"]
        guard supported.contains(method) else {
            throw DIDResolverError.unsupportedMethod(method)
        }
        return try await client.createDID(method: method, keyType: keyType, network: network, services: services)
    }

    public func deactivate(_ did: String) async throws {
        try validateDID(did)
        try await client.deactivateDID(did)
    }

    public func rotateKey(did: String, keyId: String, keyType: String? = nil) async throws -> DIDDocument {
        try validateDID(did)
        guard !keyId.isEmpty else {
            throw DIDResolverError.validation("Key ID is required for rotation")
        }
        return try await client.rotateKey(did: did, keyId: keyId, keyType: keyType)
    }

    public func resolveWithMetadata(_ did: String) async throws -> (document: DIDDocument, duration: TimeInterval, resolvedAt: Int) {
        let start = Date()
        let doc = try await resolve(did)
        let duration = Date().timeIntervalSince(start)
        return (doc, duration, Int(Date().timeIntervalSince1970))
    }

    public func getVerificationMethods(_ did: String) async throws -> [DIDVerificationMethod] {
        let doc = try await resolve(did)
        return doc.verificationMethod
    }

    public func getServices(_ did: String) async throws -> [ServiceEndpoint] {
        let doc = try await resolve(did)
        return doc.service ?? []
    }

    public func findServiceByType(_ did: String, serviceType: String) async throws -> ServiceEndpoint? {
        let services = try await getServices(did)
        return services.first { $0.type == serviceType }
    }

    public func getController(_ did: String) async throws -> [String] {
        let doc = try await resolve(did)
        return doc.controller ?? [doc.id]
    }

    public func isDeactivated(_ did: String) async throws -> Bool {
        do {
            let _ = try await resolve(did)
            return false
        } catch let error as DIDResolverError where error.localizedDescription.contains("deactivated") {
            return true
        }
    }

    public func batchResolve(_ dids: [String]) async throws -> [String: DIDDocument] {
        var results: [String: DIDDocument] = [:]
        try await withThrowingTaskGroup(of: (String, DIDDocument).self) { group in
            for did in dids {
                group.addTask {
                    let doc = try await self.resolve(did)
                    return (did, doc)
                }
            }
            for try await (did, doc) in group {
                results[did] = doc
            }
        }
        return results
    }

    public static func parseDID(_ did: String) throws -> (method: String, methodSpecificId: String) {
        let parts = did.split(separator: ":")
        guard parts.count >= 3, parts[0] == "did" else {
            throw DIDResolverError.invalidDID(did)
        }
        return (String(parts[1]), parts.dropFirst(2).joined(separator: ":"))
    }

    public static func isValidDID(_ did: String) -> Bool {
        (try? parseDID(did)) != nil
    }

    public static func generateDocURI(did: String, fragment: String) -> String {
        "\(did)#\(fragment)"
    }

    public static func createKeyDocURI(did: String, keyTag: String) -> String {
        "\(did)#\(keyTag)"
    }

    public func createDIDDocument(
        id: String,
        controller: [String]? = nil,
        verificationMethods: [DIDVerificationMethod] = [],
        services: [ServiceEndpoint]? = nil,
        alsoKnownAs: [String]? = nil
    ) -> DIDDocument {
        DIDDocument(
            context: [
                "https://www.w3.org/ns/did/v1",
                "https://w3id.org/security/suites/ed25519-2020/v1",
            ],
            id: id,
            controller: controller,
            alsoKnownAs: alsoKnownAs,
            verificationMethod: verificationMethods,
            authentication: verificationMethods.map { $0.id },
            assertionMethod: nil,
            keyAgreement: nil,
            capabilityInvocation: nil,
            capabilityDelegation: nil,
            service: services,
            created: ISO8601DateFormatter().string(from: Date()),
            updated: ISO8601DateFormatter().string(from: Date())
        )
    }

    public func createVerificationMethod(
        id: String,
        type: String,
        controller: String,
        publicKey: (multibase: String?, jwk: [String: AnyCodable]?)
    ) -> DIDVerificationMethod {
        DIDVerificationMethod(
            id: id,
            type: type,
            controller: controller,
            publicKeyMultibase: publicKey.multibase,
            publicKeyJwk: publicKey.jwk,
            blockchainAccountId: nil
        )
    }
}

public enum DIDResolverError: Error, LocalizedError {
    case validation(String)
    case unsupportedMethod(String)
    case invalidDID(String)

    public var errorDescription: String? {
        switch self {
        case .validation(let msg): return msg
        case .unsupportedMethod(let method): return "Unsupported DID method: '\(method)'"
        case .invalidDID(let did): return "Invalid DID: \(did)"
        }
    }
}
