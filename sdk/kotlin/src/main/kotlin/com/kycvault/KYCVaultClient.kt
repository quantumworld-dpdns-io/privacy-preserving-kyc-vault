package com.kycvault

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

data class ClientConfig(
    val baseUrl: String,
    val apiKey: String? = null,
    var jwtToken: String? = null,
    val timeout: Long = 30,
    val retryCount: Int = 3,
    val retryDelay: Long = 1000,
    val headers: Map<String, String>? = null,
)

data class PaginatedResponse<T>(
    val data: List<T>,
    val total: Int,
    val page: Int,
    val pageSize: Int,
    val hasMore: Boolean,
)

data class HealthStatus(
    val status: String,
    val version: String,
)

data class CredentialSubject(
    val id: String,
    val additionalProperties: Map<String, Any> = emptyMap(),
)

data class VerifiableCredential(
    @SerialName("@context")
    val context: List<String>,
    val id: String,
    val type: List<String>,
    val issuer: String,
    val issuanceDate: String,
    val expirationDate: String? = null,
    val credentialSubject: CredentialSubject,
    val credentialStatus: CredentialStatus? = null,
    val proof: Proof? = null,
)

data class CredentialStatus(
    val id: String,
    val type: String,
    val revocationListIndex: Int? = null,
    val revocationListCredential: String? = null,
)

data class Proof(
    val type: String,
    val created: String,
    val verificationMethod: String,
    val proofPurpose: String,
    val proofValue: String? = null,
    val jws: String? = null,
    val nonce: String? = null,
    val domain: String? = null,
)

data class VerifiablePresentation(
    @SerialName("@context")
    val context: List<String>,
    val id: String? = null,
    val type: List<String>,
    val holder: String? = null,
    val verifiableCredential: List<VerifiableCredential>,
    val proof: Proof? = null,
)

data class DIDDocument(
    @SerialName("@context")
    val context: List<String>,
    val id: String,
    val controller: List<String>? = null,
    val alsoKnownAs: List<String>? = null,
    val verificationMethod: List<DIDVerificationMethod>,
    val authentication: List<String>,
    val assertionMethod: List<String>? = null,
    val keyAgreement: List<String>? = null,
    val capabilityInvocation: List<String>? = null,
    val capabilityDelegation: List<String>? = null,
    val service: List<ServiceEndpoint>? = null,
    val created: String? = null,
    val updated: String? = null,
)

data class DIDVerificationMethod(
    val id: String,
    val type: String,
    val controller: String,
    val publicKeyMultibase: String? = null,
    val publicKeyJwk: Map<String, Any>? = null,
    val blockchainAccountId: String? = null,
)

data class ServiceEndpoint(
    val id: String,
    val type: String,
    val serviceEndpoint: Any,
    val description: String? = null,
)

data class WorkflowResponse(
    val id: String,
    val workflowType: String,
    val subjectId: String,
    val status: String,
    val createdAt: String,
    val updatedAt: String,
    val config: Map<String, Any>,
    val result: Map<String, Any>? = null,
)

data class ComplianceResult(
    val compliant: Boolean,
    val tier: String,
    val checks: List<ComplianceCheck>,
    val validUntil: String? = null,
)

data class ComplianceCheck(
    val name: String,
    val passed: Boolean,
    val details: String? = null,
)

data class ComplianceReport(
    val subjectId: String,
    val overallStatus: String,
    val tiers: Map<String, ComplianceResult>,
    val generatedAt: String,
)

class KYCException(
    message: String,
    val code: String,
    val statusCode: Int,
    val details: Map<String, Any>? = null,
) : Exception(message)

class KYCVaultClient(private val config: ClientConfig) {
    private val baseUrl = config.baseUrl.trimEnd('/')
    private val json = Json { ignoreUnknownKeys = true }
    private val client = OkHttpClient.Builder()
        .connectTimeout(config.timeout, TimeUnit.SECONDS)
        .readTimeout(config.timeout, TimeUnit.SECONDS)
        .writeTimeout(config.timeout, TimeUnit.SECONDS)
        .build()

    private val defaultHeaders: Map<String, String> = buildMap {
        put("Content-Type", "application/json")
        put("Accept", "application/json")
        config.headers?.let { putAll(it) }
    }

    private val authHeaders: Map<String, String>
        get() = buildMap {
            putAll(defaultHeaders)
            if (config.jwtToken != null) {
                put("Authorization", "Bearer ${config.jwtToken}")
            } else if (config.apiKey != null) {
                put("X-API-Key", config.apiKey!!)
            }
        }

    fun setJWT(token: String) {
        config.jwtToken = token
    }

    fun clearAuth() {
        config.jwtToken = null
        // apiKey kept per existing pattern
    }

    suspend fun <reified T> request(
        method: String,
        path: String,
        body: Any? = null,
        params: Map<String, String>? = null,
    ): T {
        val url = buildUrl(path, params)
        val jsonBody = body?.let { json.encodeToString(JsonObject::class, bodyToJsonObject(it)) }

        var lastError: Exception? = null

        for (attempt in 0..config.retryCount) {
            try {
                val requestBuilder = Request.Builder()
                    .url(url)
                    .apply {
                        authHeaders.forEach { (k, v) -> addHeader(k, v) }
                    }

                when (method) {
                    "GET" -> requestBuilder.get()
                    "POST" -> requestBuilder.post(
                        jsonBody?.toRequestBody("application/json".toMediaType())
                            ?: "{}".toRequestBody("application/json".toMediaType())
                    )
                    "PUT" -> requestBuilder.put(
                        jsonBody?.toRequestBody("application/json".toMediaType())
                            ?: "{}".toRequestBody("application/json".toMediaType())
                    )
                    "DELETE" -> requestBuilder.delete()
                }

                val response = client.newCall(requestBuilder.build()).execute()
                val responseBody = response.body?.string() ?: "{}"

                if (response.code == 204) {
                    @Suppress("UNCHECKED_CAST")
                    return when (T::class) {
                        Unit::class -> Unit as T
                        Map::class -> emptyMap<Any, Any>() as T
                        else -> json.decodeFromString<T>("{}")
                    }
                }

                if (response.code >= 400) {
                    val errorBody = try {
                        json.decodeFromString<Map<String, Any>>(responseBody)
                    } catch (_: Exception) {
                        emptyMap()
                    }
                    throw KYCException(
                        message = errorBody["message"] as? String ?: "HTTP ${response.code}",
                        code = errorBody["error"] as? String ?: "UNKNOWN",
                        statusCode = response.code,
                        details = errorBody,
                    )
                }

                return json.decodeFromString<T>(responseBody)
            } catch (e: Exception) {
                lastError = e
                if (e is KYCException && e.statusCode < 500) throw e
                if (attempt < config.retryCount) {
                    Thread.sleep(config.retryDelay * (1L shl attempt))
                }
            }
        }
        throw lastError ?: KYCException("Request failed", "UNKNOWN", 500)
    }

    suspend fun <reified T> get(path: String, params: Map<String, String>? = null): T =
        request("GET", path, params = params)

    suspend fun <reified T> post(path: String, body: Any? = null): T =
        request("POST", path, body = body)

    suspend fun health(): HealthStatus = get("/health")

    suspend fun resolveDID(did: String): DIDDocument =
        get("/v1/did/${java.net.URLEncoder.encode(did, "UTF-8")}")

    suspend fun createDID(
        method: String,
        keyType: String? = null,
        network: String? = null,
        services: List<ServiceEndpoint>? = null,
    ): DIDDocument = post(
        "/v1/did/create",
        buildJsonObject {
            put("method", method)
            keyType?.let { put("keyType", it) }
            network?.let { put("network", it) }
        },
    )

    suspend fun rotateKey(did: String, keyId: String, keyType: String? = null): DIDDocument =
        post(
            "/v1/did/${java.net.URLEncoder.encode(did, "UTF-8")}/rotate",
            buildJsonObject {
                put("keyId", keyId)
                keyType?.let { put("keyType", it) }
            },
        )

    suspend fun deactivateDID(did: String): Unit =
        post("/v1/did/${java.net.URLEncoder.encode(did, "UTF-8")}/deactivate", emptyMap<Any, Any>())

    suspend fun issueCredential(
        issuerDid: String,
        subjectDid: String,
        claims: Map<String, Any>,
        expirationDate: String? = null,
        credentialType: List<String>? = null,
        proofPurpose: String? = null,
    ): VerifiableCredential = post(
        "/v1/credentials/issue",
        buildJsonObject {
            put("issuerDid", issuerDid)
            put("subjectDid", subjectDid)
            put("claims", json.encodeToString(claims))
            expirationDate?.let { put("expirationDate", it) }
            credentialType?.let { put("credentialType", json.encodeToString(it)) }
            proofPurpose?.let { put("proofPurpose", it) }
        },
    )

    suspend fun verifyCredential(
        credential: VerifiableCredential,
        challenge: String? = null,
        domain: String? = null,
    ): VerificationResult = post(
        "/v1/credentials/verify",
        buildJsonObject {
            put("credential", json.encodeToString(credential))
            challenge?.let { put("challenge", it) }
            domain?.let { put("domain", it) }
        },
    )

    suspend fun getCredential(id: String): VerifiableCredential =
        get("/v1/credentials/${java.net.URLEncoder.encode(id, "UTF-8")}")

    suspend fun revokeCredential(id: String, reason: String? = null): Unit =
        post(
            "/v1/credentials/${java.net.URLEncoder.encode(id, "UTF-8")}/revoke",
            buildJsonObject {
                reason?.let { put("reason", it) }
            },
        )

    suspend fun checkCredentialStatus(id: String): CredentialStatusInfo =
        get("/v1/credentials/${java.net.URLEncoder.encode(id, "UTF-8")}/status")

    suspend fun listCredentials(
        page: Int? = null,
        pageSize: Int? = null,
        subjectDid: String? = null,
        issuerDid: String? = null,
        status: String? = null,
    ): PaginatedResponse<VerifiableCredential> {
        val params = mutableMapOf<String, String>()
        page?.let { params["page"] = it.toString() }
        pageSize?.let { params["pageSize"] = it.toString() }
        subjectDid?.let { params["subjectDid"] = it }
        issuerDid?.let { params["issuerDid"] = it }
        status?.let { params["status"] = it }
        return get("/v1/credentials", params)
    }

    suspend fun createPresentation(
        credentials: List<VerifiableCredential>,
        holderDid: String,
        challenge: String? = null,
        domain: String? = null,
    ): VerifiablePresentation = post(
        "/v1/presentations/create",
        buildJsonObject {
            put("credentials", json.encodeToString(credentials))
            put("holderDid", holderDid)
            challenge?.let { put("challenge", it) }
            domain?.let { put("domain", it) }
        },
    )

    suspend fun verifyPresentation(
        presentation: VerifiablePresentation,
        challenge: String? = null,
        domain: String? = null,
    ): VerificationResult = post(
        "/v1/presentations/verify",
        buildJsonObject {
            put("presentation", json.encodeToString(presentation))
            challenge?.let { put("challenge", it) }
            domain?.let { put("domain", it) }
        },
    )

    suspend fun createWorkflow(
        workflowType: String,
        subjectId: String,
        config: Map<String, Any>,
    ): WorkflowResponse = post(
        "/v1/workflows",
        buildJsonObject {
            put("workflowType", workflowType)
            put("subjectId", subjectId)
            put("config", json.encodeToString(config))
        },
    )

    suspend fun getWorkflow(id: String): WorkflowResponse =
        get("/v1/workflows/${java.net.URLEncoder.encode(id, "UTF-8")}")

    suspend fun listWorkflows(
        page: Int? = null,
        pageSize: Int? = null,
        status: String? = null,
        subjectId: String? = null,
    ): PaginatedResponse<WorkflowResponse> {
        val params = mutableMapOf<String, String>()
        page?.let { params["page"] = it.toString() }
        pageSize?.let { params["pageSize"] = it.toString() }
        status?.let { params["status"] = it }
        subjectId?.let { params["subjectId"] = it }
        return get("/v1/workflows", params)
    }

    suspend fun checkCompliance(
        subjectId: String,
        tier: String,
        attributes: Map<String, Any>? = null,
    ): ComplianceResult = post(
        "/v1/compliance/check",
        buildJsonObject {
            put("subjectId", subjectId)
            put("tier", tier)
            attributes?.let { put("attributes", json.encodeToString(it)) }
        },
    )

    suspend fun getComplianceReport(subjectId: String): ComplianceReport =
        get("/v1/compliance/${java.net.URLEncoder.encode(subjectId, "UTF-8")}/report")

    private fun buildUrl(path: String, params: Map<String, String>?): String {
        val url = "$baseUrl$path"
        if (params.isNullOrEmpty()) return url
        val query = params.entries.joinToString("&") { "${it.key}=${java.net.URLEncoder.encode(it.value, "UTF-8")}" }
        return "$url?$query"
    }

    private fun bodyToJsonObject(body: Any): JsonObject {
        return when (body) {
            is Map<*, *> -> {
                val obj = buildJsonObject {
                    @Suppress("UNCHECKED_CAST")
                    (body as Map<String, Any>).forEach { (k, v) ->
                        when (v) {
                            is String -> put(k, v)
                            is Number -> put(k, v.toInt())
                            is Boolean -> put(k, v)
                            else -> put(k, v.toString())
                        }
                    }
                }
                obj
            }
            is JsonObject -> body
            else -> buildJsonObject { put("value", body.toString()) }
        }
    }
}

@Serializable
data class VerificationResult(
    val verified: Boolean,
    val checks: List<VerificationCheck>,
    val warnings: List<String>? = null,
)

@Serializable
data class VerificationCheck(
    val name: String,
    val passed: Boolean,
    val message: String? = null,
)

@Serializable
data class CredentialStatusInfo(
    val id: String,
    val status: String,
    val updatedAt: String,
    val revokedAt: String? = null,
    val revocationReason: String? = null,
)
