package com.kycvault

class DIDResolver(private val client: KYCVaultClient) {
    companion object {
        private val SUPPORTED_METHODS = listOf("key", "web", "ethr", "ion", "indy")

        fun parseDID(did: String): Pair<String, String> {
            val parts = did.split(":")
            require(parts.size >= 3 && parts[0] == "did") { "Invalid DID: $did" }
            return Pair(parts[1], parts.drop(2).joinToString(":"))
        }

        fun isValidDID(did: String): Boolean = try {
            parseDID(did)
            true
        } catch (_: Exception) {
            false
        }

        fun generateDocURI(did: String, fragment: String): String = "$did#$fragment"
        fun createKeyDocURI(did: String, keyTag: String): String = "$did#$keyTag"
    }

    private fun validateDID(did: String) {
        require(did.isNotEmpty()) { "DID string is required" }
        val parts = did.split(":")
        require(parts.size >= 3 && parts[0] == "did") { "Invalid DID format: '$did'" }
        require(parts[1].isNotEmpty()) { "DID method is required" }
    }

    suspend fun resolve(did: String): DIDDocument {
        validateDID(did)
        return client.resolveDID(did)
    }

    suspend fun create(
        method: String,
        keyType: String? = null,
        network: String? = null,
        services: List<ServiceEndpoint>? = null,
    ): DIDDocument {
        require(method.isNotEmpty()) { "DID method is required" }
        require(SUPPORTED_METHODS.contains(method)) { "Unsupported DID method: '$method'" }
        return client.createDID(method, keyType, network, services)
    }

    suspend fun deactivate(did: String) {
        validateDID(did)
        client.deactivateDID(did)
    }

    suspend fun rotateKey(did: String, keyId: String, keyType: String? = null): DIDDocument {
        validateDID(did)
        require(keyId.isNotEmpty()) { "Key ID is required for rotation" }
        return client.rotateKey(did, keyId, keyType)
    }

    suspend fun resolveWithMetadata(did: String): Triple<DIDDocument, Long, Long> {
        val start = System.currentTimeMillis()
        val document = resolve(did)
        val duration = System.currentTimeMillis() - start
        return Triple(document, duration, System.currentTimeMillis() / 1000)
    }

    suspend fun getVerificationMethods(did: String): List<DIDVerificationMethod> {
        val doc = resolve(did)
        return doc.verificationMethod
    }

    suspend fun getServices(did: String): List<ServiceEndpoint> {
        val doc = resolve(did)
        return doc.service ?: emptyList()
    }

    suspend fun findServiceByType(did: String, serviceType: String): ServiceEndpoint? {
        val services = getServices(did)
        return services.find { it.type == serviceType }
    }

    suspend fun getController(did: String): List<String> {
        val doc = resolve(did)
        return doc.controller ?: listOf(doc.id)
    }

    suspend fun isDeactivated(did: String): Boolean = try {
        resolve(did)
        false
    } catch (e: Exception) {
        e.message?.contains("deactivated") == true
    }

    suspend fun batchResolve(dids: List<String>): Map<String, DIDDocument> {
        return dids.mapNotNull { did ->
            try {
                did to resolve(did)
            } catch (_: Exception) {
                null
            }
        }.toMap()
    }

    fun createDIDDocument(
        id: String,
        controller: List<String>? = null,
        verificationMethods: List<DIDVerificationMethod> = emptyList(),
        services: List<ServiceEndpoint>? = null,
        alsoKnownAs: List<String>? = null,
    ): DIDDocument {
        val now = java.time.Instant.now().toString()
        return DIDDocument(
            context = listOf(
                "https://www.w3.org/ns/did/v1",
                "https://w3id.org/security/suites/ed25519-2020/v1",
            ),
            id = id,
            controller = controller,
            alsoKnownAs = alsoKnownAs,
            verificationMethod = verificationMethods,
            authentication = verificationMethods.map { it.id },
            service = services,
            created = now,
            updated = now,
        )
    }

    fun createVerificationMethod(
        id: String,
        type: String,
        controller: String,
        publicKey: Pair<String?, Map<String, Any>?>,
    ): DIDVerificationMethod {
        return DIDVerificationMethod(
            id = id,
            type = type,
            controller = controller,
            publicKeyMultibase = publicKey.first,
            publicKeyJwk = publicKey.second,
        )
    }

    fun addVerificationMethod(
        doc: DIDDocument,
        method: DIDVerificationMethod,
    ): DIDDocument {
        return doc.copy(
            verificationMethod = doc.verificationMethod + method,
            authentication = doc.authentication + method.id,
        )
    }

    fun removeVerificationMethod(
        doc: DIDDocument,
        methodId: String,
    ): DIDDocument {
        return doc.copy(
            verificationMethod = doc.verificationMethod.filter { it.id != methodId },
            authentication = doc.authentication.filter { it != methodId },
            assertionMethod = doc.assertionMethod?.filter { it != methodId },
            keyAgreement = doc.keyAgreement?.filter { it != methodId },
        )
    }

    fun addService(doc: DIDDocument, service: ServiceEndpoint): DIDDocument {
        return doc.copy(
            service = (doc.service ?: emptyList()) + service,
        )
    }

    fun removeService(doc: DIDDocument, serviceId: String): DIDDocument {
        return doc.copy(
            service = doc.service?.filter { it.id != serviceId },
        )
    }
}
