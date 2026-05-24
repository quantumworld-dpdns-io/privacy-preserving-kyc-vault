package com.kycvault

class CredentialManager(private val client: KYCVaultClient) {
    private fun validateSubject(did: String) {
        require(did.startsWith("did:")) { "Invalid subject DID: '$did'" }
    }

    private fun validateCredential(credential: VerifiableCredential) {
        require(credential.id.isNotEmpty()) { "Credential must have an id" }
        require(credential.issuer.isNotEmpty()) { "Credential must have an issuer" }
        require(credential.credentialSubject.id.isNotEmpty()) { "Credential subject must have an id" }
    }

    suspend fun issue(
        issuerDid: String,
        subjectDid: String,
        claims: Map<String, Any>,
        expirationDate: String? = null,
        credentialType: List<String>? = null,
        proofPurpose: String? = null,
    ): VerifiableCredential {
        validateSubject(subjectDid)
        return client.issueCredential(issuerDid, subjectDid, claims, expirationDate, credentialType, proofPurpose)
    }

    suspend fun verify(
        credential: VerifiableCredential,
        challenge: String? = null,
        domain: String? = null,
    ): Boolean {
        validateCredential(credential)

        credential.expirationDate?.let { expStr ->
            val now = java.time.Instant.now()
            val exp = java.time.Instant.parse(expStr)
            if (now.isAfter(exp)) {
                throw CredentialException("Credential '${credential.id}' is expired", "EXPIRED_CREDENTIAL")
            }
        }

        val result = client.verifyCredential(credential, challenge, domain)
        return result.verified
    }

    suspend fun verifyWithDetail(
        credential: VerifiableCredential,
        challenge: String? = null,
        domain: String? = null,
    ): Pair<Boolean, List<VerificationCheck>> {
        validateCredential(credential)
        val result = client.verifyCredential(credential, challenge, domain)
        return Pair(result.verified, result.checks)
    }

    suspend fun createPresentation(
        credentials: List<VerifiableCredential>,
        holderDid: String,
        challenge: String? = null,
        domain: String? = null,
    ): VerifiablePresentation {
        require(credentials.isNotEmpty()) {
            "At least one credential is required to create a presentation"
        }
        return client.createPresentation(credentials, holderDid, challenge, domain)
    }

    suspend fun verifyPresentation(
        presentation: VerifiablePresentation,
        challenge: String? = null,
        domain: String? = null,
    ): Boolean {
        require(presentation.verifiableCredential.isNotEmpty()) {
            "Presentation must contain at least one credential"
        }
        val result = client.verifyPresentation(presentation, challenge, domain)
        return result.verified
    }

    suspend fun revoke(id: String, reason: String? = null) {
        client.revokeCredential(id, reason)
    }

    suspend fun getStatus(id: String): CredentialStatusInfo {
        return client.checkCredentialStatus(id)
    }

    suspend fun get(id: String): VerifiableCredential {
        return client.getCredential(id)
    }

    suspend fun list(
        page: Int? = null,
        pageSize: Int? = null,
        subjectDid: String? = null,
        issuerDid: String? = null,
        status: String? = null,
    ): List<VerifiableCredential> {
        val response = client.listCredentials(page, pageSize, subjectDid, issuerDid, status)
        return response.data
    }

    suspend fun isExpired(credential: VerifiableCredential): Boolean {
        if (credential.expirationDate == null) return false
        return try {
            val status = getStatus(credential.id)
            status.status == "expired"
        } catch (_: Exception) {
            val now = java.time.Instant.now()
            val exp = java.time.Instant.parse(credential.expirationDate)
            now.isAfter(exp)
        }
    }

    suspend fun isRevoked(credential: VerifiableCredential): Boolean {
        return try {
            val status = getStatus(credential.id)
            status.status == "revoked"
        } catch (_: Exception) {
            false
        }
    }

    fun selectByType(credentials: List<VerifiableCredential>, type: String): List<VerifiableCredential> {
        return credentials.filter { it.type.contains(type) }
    }

    fun selectNonExpired(credentials: List<VerifiableCredential>): List<VerifiableCredential> {
        val now = java.time.Instant.now()
        return credentials.filter { cred ->
            if (cred.expirationDate == null) return@filter true
            try {
                val exp = java.time.Instant.parse(cred.expirationDate)
                !now.isAfter(exp)
            } catch (_: Exception) {
                true
            }
        }
    }
}

class CredentialException(
    message: String,
    code: String,
    details: Map<String, Any>? = null,
) : Exception(message)

fun createCredential(
    issuer: String,
    subjectId: String,
    claims: Map<String, Any>,
    id: String? = null,
    types: List<String>? = null,
    expirationDate: String? = null,
): VerifiableCredential {
    val now = java.time.Instant.now().toString()
    return VerifiableCredential(
        context = listOf(
            "https://www.w3.org/2018/credentials/v1",
            "https://www.w3.org/2018/credentials/examples/v1",
        ),
        id = id ?: java.util.UUID.randomUUID().toString(),
        type = types ?: listOf("VerifiableCredential"),
        issuer = issuer,
        issuanceDate = now,
        expirationDate = expirationDate,
        credentialSubject = CredentialSubject(id = subjectId, additionalProperties = claims),
    )
}

fun addProof(credential: VerifiableCredential, proof: Proof): VerifiableCredential {
    return credential.copy(proof = proof)
}

fun isVerifiableCredential(obj: Any): Boolean {
    if (obj !is Map<*, *>) return false
    return obj["id"] is String &&
            obj["issuer"] is String &&
            obj["type"] is List<*> &&
            obj["credentialSubject"] is Map<*, *> &&
            (obj["credentialSubject"] as Map<*, *>)["id"] is String
}
