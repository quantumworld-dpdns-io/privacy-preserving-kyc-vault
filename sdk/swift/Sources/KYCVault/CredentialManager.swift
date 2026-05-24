import Foundation

public class CredentialManager {
    private let client: KYCVaultClient

    public init(client: KYCVaultClient) {
        self.client = client
    }

    private func validateSubject(_ did: String) throws {
        guard did.hasPrefix("did:") else {
            throw CredentialManagerError.validation("Invalid subject DID: '\(did)'")
        }
    }

    private func validateCredential(_ credential: VerifiableCredential) throws {
        guard !credential.id.isEmpty else {
            throw CredentialManagerError.validation("Credential must have an id")
        }
        guard !credential.issuer.isEmpty else {
            throw CredentialManagerError.validation("Credential must have an issuer")
        }
        guard !credential.credentialSubject.id.isEmpty else {
            throw CredentialManagerError.validation("Credential subject must have an id")
        }
    }

    public func issue(
        issuerDid: String,
        subjectDid: String,
        claims: [String: Any],
        expirationDate: String? = nil,
        credentialType: [String]? = nil,
        proofPurpose: String? = nil
    ) async throws -> VerifiableCredential {
        try validateSubject(subjectDid)
        return try await client.issueCredential(
            issuerDid: issuerDid,
            subjectDid: subjectDid,
            claims: claims,
            expirationDate: expirationDate,
            credentialType: credentialType,
            proofPurpose: proofPurpose
        )
    }

    public func verify(
        _ credential: VerifiableCredential,
        challenge: String? = nil,
        domain: String? = nil
    ) async throws -> Bool {
        try validateCredential(credential)

        if let expStr = credential.expirationDate {
            let now = Date()
            let formatter = ISO8601DateFormatter()
            if let exp = formatter.date(from: expStr), now > exp {
                throw CredentialManagerError.expired(credential.id)
            }
        }

        let (verified, _) = try await client.verifyCredential(credential, challenge: challenge, domain: domain)
        return verified
    }

    public func verifyWithDetail(
        _ credential: VerifiableCredential,
        challenge: String? = nil,
        domain: String? = nil
    ) async throws -> (verified: Bool, checks: [[String: Any]]) {
        try validateCredential(credential)
        return try await client.verifyCredential(credential, challenge: challenge, domain: domain)
    }

    public func createPresentation(
        credentials: [VerifiableCredential],
        holderDid: String,
        challenge: String? = nil,
        domain: String? = nil
    ) async throws -> VerifiablePresentation {
        guard !credentials.isEmpty else {
            throw CredentialManagerError.validation("At least one credential is required")
        }
        return try await client.createPresentation(
            credentials: credentials,
            holderDid: holderDid,
            challenge: challenge,
            domain: domain
        )
    }

    public func verifyPresentation(
        _ presentation: VerifiablePresentation,
        challenge: String? = nil,
        domain: String? = nil
    ) async throws -> Bool {
        guard !presentation.verifiableCredential.isEmpty else {
            throw CredentialManagerError.validation("Presentation must contain at least one credential")
        }
        return try await client.verifyPresentation(presentation, challenge: challenge, domain: domain)
    }

    public func revoke(_ id: String, reason: String? = nil) async throws {
        try await client.revokeCredential(id, reason: reason)
    }

    public func getStatus(_ id: String) async throws -> [String: AnyCodable] {
        try await client.checkCredentialStatus(id)
    }

    public func get(_ id: String) async throws -> VerifiableCredential {
        try await client.getCredential(id)
    }

    public func list(
        page: Int? = nil,
        pageSize: Int? = nil,
        subjectDid: String? = nil,
        issuerDid: String? = nil,
        status: String? = nil
    ) async throws -> [VerifiableCredential] {
        let response = try await client.listCredentials(
            page: page,
            pageSize: pageSize,
            subjectDid: subjectDid,
            issuerDid: issuerDid,
            status: status
        )
        return response.data
    }

    public func isExpired(_ credential: VerifiableCredential) async throws -> Bool {
        guard credential.expirationDate != nil else { return false }
        do {
            let status = try await getStatus(credential.id)
            let statusStr = status["status"]?.value as? String ?? ""
            return statusStr == "expired"
        } catch {
            let formatter = ISO8601DateFormatter()
            if let expStr = credential.expirationDate,
               let exp = formatter.date(from: expStr) {
                return Date() > exp
            }
            return false
        }
    }

    public func isRevoked(_ credential: VerifiableCredential) async throws -> Bool {
        do {
            let status = try await getStatus(credential.id)
            let statusStr = status["status"]?.value as? String ?? ""
            return statusStr == "revoked"
        } catch {
            return false
        }
    }

    public func selectByType(_ credentials: [VerifiableCredential], type: String) -> [VerifiableCredential] {
        credentials.filter { $0.type.contains(type) }
    }

    public func selectNonExpired(_ credentials: [VerifiableCredential]) -> [VerifiableCredential] {
        let now = Date()
        let formatter = ISO8601DateFormatter()
        return credentials.filter { cred in
            guard let expStr = cred.expirationDate,
                  let exp = formatter.date(from: expStr) else {
                return true
            }
            return now <= exp
        }
    }
}

public enum CredentialManagerError: Error, LocalizedError {
    case validation(String)
    case expired(String)
    case revoked(String)

    public var errorDescription: String? {
        switch self {
        case .validation(let msg): return msg
        case .expired(let id): return "Credential '\(id)' is expired"
        case .revoked(let id): return "Credential '\(id)' has been revoked"
        }
    }
}

public func createCredential(
    issuer: String,
    subjectId: String,
    claims: [String: Any],
    id: String? = nil,
    types: [String]? = nil,
    expirationDate: String? = nil
) -> VerifiableCredential {
    let now = ISO8601DateFormatter().string(from: Date())
    return VerifiableCredential(
        context: [
            "https://www.w3.org/2018/credentials/v1",
            "https://www.w3.org/2018/credentials/examples/v1",
        ],
        id: id ?? UUID().uuidString,
        type: types ?? ["VerifiableCredential"],
        issuer: issuer,
        issuanceDate: now,
        expirationDate: expirationDate,
        credentialSubject: CredentialSubject(
            id: subjectId,
            additionalProperties: claims.mapValues { AnyCodable($0) }
        ),
        credentialStatus: nil,
        proof: nil
    )
}

public func addProof(to credential: VerifiableCredential, proof: Proof) -> VerifiableCredential {
    VerifiableCredential(
        context: credential.context,
        id: credential.id,
        type: credential.type,
        issuer: credential.issuer,
        issuanceDate: credential.issuanceDate,
        expirationDate: credential.expirationDate,
        credentialSubject: credential.credentialSubject,
        credentialStatus: credential.credentialStatus,
        proof: proof
    )
}
