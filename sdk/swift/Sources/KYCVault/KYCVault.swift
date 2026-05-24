import Foundation

public struct ClientConfig {
    public let baseUrl: String
    public let apiKey: String?
    public var jwtToken: String?
    public let timeout: TimeInterval
    public let retryCount: Int
    public let retryDelay: TimeInterval
    public let headers: [String: String]?

    public init(
        baseUrl: String,
        apiKey: String? = nil,
        jwtToken: String? = nil,
        timeout: TimeInterval = 30,
        retryCount: Int = 3,
        retryDelay: TimeInterval = 1,
        headers: [String: String]? = nil
    ) {
        self.baseUrl = baseUrl
        self.apiKey = apiKey
        self.jwtToken = jwtToken
        self.timeout = timeout
        self.retryCount = retryCount
        self.retryDelay = retryDelay
        self.headers = headers
    }
}

public struct PaginatedResponse<T: Codable>: Codable {
    public let data: [T]
    public let total: Int
    public let page: Int
    public let pageSize: Int
    public let hasMore: Bool
}

public struct HealthStatus: Codable {
    public let status: String
    public let version: String
}

public struct VerifiableCredential: Codable {
    public let context: [String]
    public let id: String
    public let type: [String]
    public let issuer: String
    public let issuanceDate: String
    public let expirationDate: String?
    public let credentialSubject: CredentialSubject
    public let credentialStatus: CredentialStatus?
    public let proof: Proof?

    enum CodingKeys: String, CodingKey {
        case context = "@context"
        case id, type, issuer, issuanceDate, expirationDate, credentialSubject, credentialStatus, proof
    }
}

public struct CredentialSubject: Codable {
    public let id: String
    public let additionalProperties: [String: AnyCodable]

    enum CodingKeys: String, CodingKey {
        case id
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        let dynamicContainer = try decoder.container(keyedBy: DynamicCodingKeys.self)
        var props: [String: AnyCodable] = [:]
        for key in dynamicContainer.allKeys where key.stringValue != "id" {
            if let value = try? dynamicContainer.decode(AnyCodable.self, forKey: key) {
                props[key.stringValue] = value
            }
        }
        additionalProperties = props
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        for (key, value) in additionalProperties {
            var dynamicContainer = encoder.container(keyedBy: DynamicCodingKeys.self)
            try dynamicContainer.encode(value, forKey: DynamicCodingKeys(stringValue: key)!)
        }
    }
}

public struct CredentialStatus: Codable {
    public let id: String
    public let type: String
    public let revocationListIndex: Int?
    public let revocationListCredential: String?
}

public struct Proof: Codable {
    public let type: String
    public let created: String
    public let verificationMethod: String
    public let proofPurpose: String
    public let proofValue: String?
    public let jws: String?
    public let nonce: String?
    public let domain: String?
}

public struct VerifiablePresentation: Codable {
    public let context: [String]
    public let id: String?
    public let type: [String]
    public let holder: String?
    public let verifiableCredential: [VerifiableCredential]
    public let proof: Proof?

    enum CodingKeys: String, CodingKey {
        case context = "@context"
        case id, type, holder, verifiableCredential, proof
    }
}

public struct DIDDocument: Codable {
    public let context: [String]
    public let id: String
    public let controller: [String]?
    public let alsoKnownAs: [String]?
    public let verificationMethod: [DIDVerificationMethod]
    public let authentication: [String]
    public let assertionMethod: [String]?
    public let keyAgreement: [String]?
    public let capabilityInvocation: [String]?
    public let capabilityDelegation: [String]?
    public let service: [ServiceEndpoint]?
    public let created: String?
    public let updated: String?

    enum CodingKeys: String, CodingKey {
        case context = "@context"
        case id, controller, alsoKnownAs, verificationMethod, authentication
        case assertionMethod, keyAgreement, capabilityInvocation, capabilityDelegation
        case service, created, updated
    }
}

public struct DIDVerificationMethod: Codable {
    public let id: String
    public let type: String
    public let controller: String
    public let publicKeyMultibase: String?
    public let publicKeyJwk: [String: AnyCodable]?
    public let blockchainAccountId: String?
}

public struct ServiceEndpoint: Codable {
    public let id: String
    public let type: String
    public let serviceEndpoint: AnyCodable
    public let description: String?
}

public struct WorkflowResponse: Codable {
    public let id: String
    public let workflowType: String
    public let subjectId: String
    public let status: String
    public let createdAt: String
    public let updatedAt: String
    public let config: [String: AnyCodable]
    public let result: [String: AnyCodable]?
}

public struct ComplianceResult: Codable {
    public let compliant: Bool
    public let tier: String
    public let checks: [ComplianceCheck]
    public let validUntil: String?
}

public struct ComplianceCheck: Codable {
    public let name: String
    public let passed: Bool
    public let details: String?
}

public struct ComplianceReport: Codable {
    public let subjectId: String
    public let overallStatus: String
    public let tiers: [String: ComplianceResult]
    public let generatedAt: String
}

public struct AnyCodable: Codable {
    public let value: Any

    public init(_ value: Any) { self.value = value }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let intVal = try? container.decode(Int.self) { value = intVal }
        else if let doubleVal = try? container.decode(Double.self) { value = doubleVal }
        else if let boolVal = try? container.decode(Bool.self) { value = boolVal }
        else if let stringVal = try? container.decode(String.self) { value = stringVal }
        else if let arrayVal = try? container.decode([AnyCodable].self) { value = arrayVal.map { $0.value } }
        else if let dictVal = try? container.decode([String: AnyCodable].self) { value = dictVal.mapValues { $0.value } }
        else { value = "" }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let intVal = value as? Int { try container.encode(intVal) }
        else if let doubleVal = value as? Double { try container.encode(doubleVal) }
        else if let boolVal = value as? Bool { try container.encode(boolVal) }
        else if let stringVal = value as? String { try container.encode(stringVal) }
        else if let arrayVal = value as? [Any] { try container.encode(arrayVal.map { AnyCodable($0) }) }
        else if let dictVal = value as? [String: Any] { try container.encode(dictVal.mapValues { AnyCodable($0) }) }
    }
}

struct DynamicCodingKeys: CodingKey {
    var stringValue: String
    var intValue: Int?

    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { self.intValue = intValue; stringValue = "\(intValue)" }
}

public class KYCVaultClient: NSObject {
    private let baseUrl: String
    private var apiKey: String?
    private var jwtToken: String?
    private let timeout: TimeInterval
    private let retryCount: Int
    private let retryDelay: TimeInterval
    private let session: URLSession
    private let defaultHeaders: [String: String]

    public init(config: ClientConfig) {
        baseUrl = config.baseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        apiKey = config.apiKey
        jwtToken = config.jwtToken
        timeout = config.timeout
        retryCount = config.retryCount
        retryDelay = config.retryDelay

        var headers: [String: String] = [
            "Content-Type": "application/json",
            "Accept": "application/json",
        ]
        if let extra = config.headers {
            for (k, v) in extra { headers[k] = v }
        }
        defaultHeaders = headers

        let configObj = URLSessionConfiguration.default
        configObj.timeoutIntervalForRequest = timeout
        session = URLSession(configuration: configObj)
    }

    public func setJWT(_ token: String) { jwtToken = token }
    public func clearAuth() { apiKey = nil; jwtToken = nil }

    private var authHeaders: [String: String] {
        var headers = defaultHeaders
        if let token = jwtToken {
            headers["Authorization"] = "Bearer \(token)"
        } else if let key = apiKey {
            headers["X-API-Key"] = key
        }
        return headers
    }

    private func buildURL(path: String, params: [String: String]? = nil) -> URL {
        guard var components = URLComponents(string: "\(baseUrl)\(path)") else {
            fatalError("Invalid URL: \(baseUrl)\(path)")
        }
        if let params = params {
            components.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        return components.url!
    }

    private func request<T: Decodable>(
        method: String,
        path: String,
        body: Data? = nil,
        params: [String: String]? = nil
    ) async throws -> T {
        let url = buildURL(path: path, params: params)
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = method
        urlRequest.allHTTPHeaderFields = authHeaders
        urlRequest.httpBody = body

        var lastError: Error?

        for attempt in 0...retryCount {
            do {
                let (data, response) = try await session.data(for: urlRequest)
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw KYCError.network("Invalid response")
                }

                if httpResponse.statusCode == 204 {
                    guard let empty = try? JSONDecoder().decode(T.self, from: Data("{}".utf8)) else {
                        throw KYCError.network("Empty response")
                    }
                    return empty
                }

                if httpResponse.statusCode >= 400 {
                    let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                    throw KYCError.http(
                        statusCode: httpResponse.statusCode,
                        message: body?["message"] as? String ?? "HTTP \(httpResponse.statusCode)",
                        code: body?["error"] as? String ?? "UNKNOWN"
                    )
                }

                return try JSONDecoder().decode(T.self, from: data)
            } catch {
                lastError = error
                if let kycError = error as? KYCError, kycError.statusCode < 500 {
                    throw error
                }
                if attempt < retryCount {
                    let delay = retryDelay * pow(2.0, Double(attempt))
                    try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                }
            }
        }
        throw lastError ?? KYCError.network("Request failed")
    }

    private func requestBody<T: Encodable>(_ value: T) throws -> Data {
        try JSONEncoder().encode(value)
    }

    public func health() async throws -> HealthStatus {
        try await request(method: "GET", path: "/health")
    }

    public func resolveDID(_ did: String) async throws -> DIDDocument {
        guard let encoded = did.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
            throw KYCError.validation("did", "Invalid DID")
        }
        return try await request(method: "GET", path: "/v1/did/\(encoded)")
    }

    public func createDID(
        method: String,
        keyType: String? = nil,
        network: String? = nil,
        services: [ServiceEndpoint]? = nil
    ) async throws -> DIDDocument {
        let body: [String: Any] = [
            "method": method,
            "keyType": keyType as Any,
            "network": network as Any,
            "services": services as Any,
        ]
        let data = try JSONSerialization.data(withJSONObject: body)
        return try await request(method: "POST", path: "/v1/did/create", body: data)
    }

    public func rotateKey(did: String, keyId: String, keyType: String? = nil) async throws -> DIDDocument {
        guard let encoded = did.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
            throw KYCError.validation("did", "Invalid DID")
        }
        let body: [String: Any] = ["keyId": keyId, "keyType": keyType as Any]
        let data = try JSONSerialization.data(withJSONObject: body)
        return try await request(method: "POST", path: "/v1/did/\(encoded)/rotate", body: data)
    }

    public func deactivateDID(_ did: String) async throws {
        guard let encoded = did.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
            throw KYCError.validation("did", "Invalid DID")
        }
        let data = try JSONSerialization.data(withJSONObject: [:])
        let _: [String: String] = try await request(method: "POST", path: "/v1/did/\(encoded)/deactivate", body: data)
    }

    public func issueCredential(
        issuerDid: String,
        subjectDid: String,
        claims: [String: Any],
        expirationDate: String? = nil,
        credentialType: [String]? = nil,
        proofPurpose: String? = nil
    ) async throws -> VerifiableCredential {
        var body: [String: Any] = [
            "issuerDid": issuerDid,
            "subjectDid": subjectDid,
            "claims": claims,
        ]
        body["expirationDate"] = expirationDate
        body["credentialType"] = credentialType
        body["proofPurpose"] = proofPurpose
        let data = try JSONSerialization.data(withJSONObject: body)
        let response: [String: AnyCodable] = try await request(method: "POST", path: "/v1/credentials/issue", body: data)
        guard let credentialData = try? JSONSerialization.data(withJSONObject: response["credential"]?.value as Any) else {
            throw KYCError.network("Invalid credential response")
        }
        return try JSONDecoder().decode(VerifiableCredential.self, from: credentialData)
    }

    public func verifyCredential(
        _ credential: VerifiableCredential,
        challenge: String? = nil,
        domain: String? = nil
    ) async throws -> (verified: Bool, checks: [[String: Any]]) {
        let credentialData = try JSONEncoder().encode(credential)
        let credentialDict = try JSONSerialization.jsonObject(with: credentialData) as! [String: Any]
        var body: [String: Any] = ["credential": credentialDict]
        body["challenge"] = challenge
        body["domain"] = domain
        let data = try JSONSerialization.data(withJSONObject: body)
        let result: [String: AnyCodable] = try await request(method: "POST", path: "/v1/credentials/verify", body: data)
        let verified = (result["verified"]?.value as? Bool) ?? false
        let checks = (result["checks"]?.value as? [[String: Any]]) ?? []
        return (verified, checks)
    }

    public func getCredential(_ id: String) async throws -> VerifiableCredential {
        guard let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
            throw KYCError.validation("id", "Invalid credential ID")
        }
        return try await request(method: "GET", path: "/v1/credentials/\(encoded)")
    }

    public func revokeCredential(_ id: String, reason: String? = nil) async throws {
        guard let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
            throw KYCError.validation("id", "Invalid credential ID")
        }
        let body: [String: Any] = ["reason": reason as Any]
        let data = try JSONSerialization.data(withJSONObject: body)
        let _: [String: String] = try await request(method: "POST", path: "/v1/credentials/\(encoded)/revoke", body: data)
    }

    public func checkCredentialStatus(_ id: String) async throws -> [String: AnyCodable] {
        guard let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
            throw KYCError.validation("id", "Invalid credential ID")
        }
        return try await request(method: "GET", path: "/v1/credentials/\(encoded)/status")
    }

    public func listCredentials(
        page: Int? = nil,
        pageSize: Int? = nil,
        subjectDid: String? = nil,
        issuerDid: String? = nil,
        status: String? = nil
    ) async throws -> PaginatedResponse<VerifiableCredential> {
        var params: [String: String] = [:]
        if let p = page { params["page"] = String(p) }
        if let ps = pageSize { params["pageSize"] = String(ps) }
        if let sd = subjectDid { params["subjectDid"] = sd }
        if let id = issuerDid { params["issuerDid"] = id }
        if let s = status { params["status"] = s }
        return try await request(method: "GET", path: "/v1/credentials", params: params)
    }

    public func createPresentation(
        credentials: [VerifiableCredential],
        holderDid: String,
        challenge: String? = nil,
        domain: String? = nil
    ) async throws -> VerifiablePresentation {
        let credsData = try JSONEncoder().encode(credentials)
        let credsArray = try JSONSerialization.jsonObject(with: credsData) as! [[String: Any]]
        var body: [String: Any] = [
            "credentials": credsArray,
            "holderDid": holderDid,
        ]
        body["challenge"] = challenge
        body["domain"] = domain
        let data = try JSONSerialization.data(withJSONObject: body)
        return try await request(method: "POST", path: "/v1/presentations/create", body: data)
    }

    public func verifyPresentation(
        _ presentation: VerifiablePresentation,
        challenge: String? = nil,
        domain: String? = nil
    ) async throws -> Bool {
        let presData = try JSONEncoder().encode(presentation)
        let presDict = try JSONSerialization.jsonObject(with: presData) as! [String: Any]
        var body: [String: Any] = ["presentation": presDict]
        body["challenge"] = challenge
        body["domain"] = domain
        let data = try JSONSerialization.data(withJSONObject: body)
        let result: [String: AnyCodable] = try await request(method: "POST", path: "/v1/presentations/verify", body: data)
        return (result["verified"]?.value as? Bool) ?? false
    }

    public func createWorkflow(
        workflowType: String,
        subjectId: String,
        config: [String: Any]
    ) async throws -> WorkflowResponse {
        let body: [String: Any] = [
            "workflowType": workflowType,
            "subjectId": subjectId,
            "config": config,
        ]
        let data = try JSONSerialization.data(withJSONObject: body)
        return try await request(method: "POST", path: "/v1/workflows", body: data)
    }

    public func getWorkflow(_ id: String) async throws -> WorkflowResponse {
        guard let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
            throw KYCError.validation("id", "Invalid workflow ID")
        }
        return try await request(method: "GET", path: "/v1/workflows/\(encoded)")
    }

    public func listWorkflows(
        page: Int? = nil,
        pageSize: Int? = nil,
        status: String? = nil,
        subjectId: String? = nil
    ) async throws -> PaginatedResponse<WorkflowResponse> {
        var params: [String: String] = [:]
        if let p = page { params["page"] = String(p) }
        if let ps = pageSize { params["pageSize"] = String(ps) }
        if let s = status { params["status"] = s }
        if let si = subjectId { params["subjectId"] = si }
        return try await request(method: "GET", path: "/v1/workflows", params: params)
    }

    public func checkCompliance(
        subjectId: String,
        tier: String,
        attributes: [String: Any]? = nil
    ) async throws -> ComplianceResult {
        var body: [String: Any] = [
            "subjectId": subjectId,
            "tier": tier,
        ]
        body["attributes"] = attributes
        let data = try JSONSerialization.data(withJSONObject: body)
        return try await request(method: "POST", path: "/v1/compliance/check", body: data)
    }

    public func getComplianceReport(subjectId: String) async throws -> ComplianceReport {
        guard let encoded = subjectId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
            throw KYCError.validation("subjectId", "Invalid subject ID")
        }
        return try await request(method: "GET", path: "/v1/compliance/\(encoded)/report")
    }
}

public enum KYCError: Error {
    case http(statusCode: Int, message: String, code: String)
    case network(String)
    case validation(String, String)

    public var statusCode: Int {
        switch self {
        case .http(let code, _, _): return code
        case .network: return 500
        case .validation: return 400
        }
    }

    public var message: String {
        switch self {
        case .http(_, let msg, _): return msg
        case .network(let msg): return msg
        case .validation(_, let msg): return msg
        }
    }
}
