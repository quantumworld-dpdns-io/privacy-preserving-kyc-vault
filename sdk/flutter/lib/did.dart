import 'kyc_vault.dart';

class DIDManager {
  final KYCVaultClient _client;

  DIDManager(this._client);

  static const _supportedMethods = [
    'key',
    'web',
    'ethr',
    'ion',
    'indy',
  ];

  void _validateDID(String did) {
    if (did.isEmpty) {
      throw DIDError('DID string is required', 'VALIDATION_ERROR');
    }
    final parts = did.split(':');
    if (parts.length < 3 || parts[0] != 'did') {
      throw DIDError("Invalid DID format: '$did'", 'VALIDATION_ERROR');
    }
    if (parts[1].isEmpty) {
      throw DIDError('DID method is required', 'VALIDATION_ERROR');
    }
  }

  Future<Map<String, dynamic>> resolve(String did) async {
    _validateDID(did);
    return _client.resolveDID(did);
  }

  Future<Map<String, dynamic>> create(
    String method, {
    String? keyType,
    String? network,
    List<Map<String, dynamic>>? services,
  }) async {
    if (method.isEmpty) {
      throw DIDError('method', 'DID method is required');
    }
    if (!_supportedMethods.contains(method)) {
      throw DIDError('Unsupported DID method: $method', 'UNSUPPORTED_DID_METHOD');
    }
    return _client.createDID(method,
        keyType: keyType, network: network, services: services);
  }

  Future<void> deactivate(String did) async {
    _validateDID(did);
    await _client.deactivateDID(did);
  }

  Future<Map<String, dynamic>> rotateKey(
    String did,
    String keyId, {
    String? keyType,
  }) async {
    _validateDID(did);
    if (keyId.isEmpty) {
      throw DIDError('keyId', 'Key ID is required for rotation');
    }
    return _client.rotateKey(did, keyId, keyType: keyType);
  }

  Future<Map<String, dynamic>> resolveWithMetadata(String did) async {
    final start = DateTime.now().millisecondsSinceEpoch;
    final document = await resolve(did);
    final duration = DateTime.now().millisecondsSinceEpoch - start;
    return {
      'document': document,
      'duration': duration,
      'resolvedAt': DateTime.now().millisecondsSinceEpoch ~/ 1000,
    };
  }

  Future<List<Map<String, dynamic>>> getVerificationMethods(String did) async {
    final doc = await resolve(did);
    return List<Map<String, dynamic>>.from(doc['verificationMethod'] ?? []);
  }

  Future<List<Map<String, dynamic>>> getServices(String did) async {
    final doc = await resolve(did);
    return List<Map<String, dynamic>>.from(doc['service'] ?? []);
  }

  Future<Map<String, dynamic>?> findServiceByType(
    String did,
    String serviceType,
  ) async {
    final services = await getServices(did);
    try {
      return services.firstWhere((s) => s['type'] == serviceType);
    } catch (_) {
      return null;
    }
  }

  Future<List<String>> getController(String did) async {
    final doc = await resolve(did);
    final controller = doc['controller'];
    if (controller != null) {
      return List<String>.from(controller);
    }
    return [doc['id'] as String];
  }

  Future<bool> isDeactivated(String did) async {
    try {
      await resolve(did);
      return false;
    } catch (e) {
      if (e is DIDError && e.toString().contains('deactivated')) {
        return true;
      }
      rethrow;
    }
  }

  Future<Map<String, Map<String, dynamic>>> batchResolve(
    List<String> dids,
  ) async {
    final results = <String, Map<String, dynamic>>{};
    final futures = dids.map((did) async {
      try {
        final doc = await resolve(did);
        return MapEntry(did, doc);
      } catch (_) {
        return null;
      }
    });
    final entries = await Future.wait(futures);
    for (final entry in entries) {
      if (entry != null) {
        results[entry.key] = entry.value;
      }
    }
    return results;
  }

  static Map<String, String> parseDID(String did) {
    final parts = did.split(':');
    if (parts.length < 3 || parts[0] != 'did') {
      throw Exception('Invalid DID: $did');
    }
    return {
      'method': parts[1],
      'methodSpecificId': parts.sublist(2).join(':'),
    };
  }

  static bool isValidDID(String did) {
    try {
      parseDID(did);
      return true;
    } catch (_) {
      return false;
    }
  }

  static String generateDocURI(String did, String fragment) => '$did#$fragment';
  static String createKeyDocURI(String did, String keyTag) => '$did#$keyTag';

  Map<String, dynamic> createDIDDocument(
    String id, {
    List<String>? controller,
    List<Map<String, dynamic>>? verificationMethods,
    List<Map<String, dynamic>>? services,
    List<String>? alsoKnownAs,
  }) {
    return {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      'id': id,
      'verificationMethod': verificationMethods ?? [],
      'authentication':
          (verificationMethods ?? []).map((vm) => vm['id']).toList(),
      'service': services,
      'alsoKnownAs': alsoKnownAs,
      'controller': controller,
      'created': DateTime.now().toIso8601String(),
      'updated': DateTime.now().toIso8601String(),
    };
  }

  Map<String, dynamic> createVerificationMethod(
    String id,
    String type,
    String controller,
    Map<String, dynamic> publicKey,
  ) {
    return {
      'id': id,
      'type': type,
      'controller': controller,
      'publicKeyMultibase': publicKey['multibase'],
      'publicKeyJwk': publicKey['jwk'],
    };
  }

  Map<String, dynamic> addVerificationMethod(
    Map<String, dynamic> doc,
    Map<String, dynamic> method,
  ) {
    final methods = List<Map<String, dynamic>>.from(doc['verificationMethod'] ?? []);
    final auth = List<String>.from(doc['authentication'] ?? []);
    return {
      ...doc,
      'verificationMethod': [...methods, method],
      'authentication': [...auth, method['id']],
    };
  }

  Map<String, dynamic> removeVerificationMethod(
    Map<String, dynamic> doc,
    String methodId,
  ) {
    return {
      ...doc,
      'verificationMethod': (doc['verificationMethod'] as List?)
              ?.where((vm) => vm['id'] != methodId)
              .toList() ??
          [],
      'authentication': (doc['authentication'] as List?)
              ?.where((id) => id != methodId)
              .toList() ??
          [],
      'assertionMethod': (doc['assertionMethod'] as List?)
              ?.where((id) => id != methodId)
              .toList() ??
          [],
      'keyAgreement': (doc['keyAgreement'] as List?)
              ?.where((id) => id != methodId)
              .toList() ??
          [],
    };
  }

  Map<String, dynamic> addService(
    Map<String, dynamic> doc,
    Map<String, dynamic> service,
  ) {
    final services = List<Map<String, dynamic>>.from(doc['service'] ?? []);
    return {
      ...doc,
      'service': [...services, service],
    };
  }

  Map<String, dynamic> removeService(
    Map<String, dynamic> doc,
    String serviceId,
  ) {
    return {
      ...doc,
      'service': (doc['service'] as List?)
              ?.where((s) => s['id'] != serviceId)
              .toList() ??
          [],
    };
  }
}

class DIDError implements Exception {
  final String message;
  final String code;
  final Map<String, dynamic>? details;

  DIDError(this.message, this.code, [this.details]);

  @override
  String toString() => 'DIDError($code): $message';
}
