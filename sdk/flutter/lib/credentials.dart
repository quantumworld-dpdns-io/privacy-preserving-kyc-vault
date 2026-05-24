import 'kyc_vault.dart';

class CredentialManager {
  final KYCVaultClient _client;

  CredentialManager(this._client);

  void _validateSubject(String did) {
    if (!did.startsWith('did:')) {
      throw CredentialError("Invalid subject DID: '$did'", 'VALIDATION_ERROR');
    }
  }

  void _validateCredential(Map<String, dynamic> credential) {
    if (credential['id'] == null) {
      throw CredentialError('Credential must have an id', 'VALIDATION_ERROR');
    }
    if (credential['issuer'] == null) {
      throw CredentialError(
          'Credential must have an issuer', 'VALIDATION_ERROR');
    }
    if (credential['credentialSubject'] == null ||
        credential['credentialSubject']['id'] == null) {
      throw CredentialError(
          'Credential subject must have an id', 'VALIDATION_ERROR');
    }
  }

  Future<Map<String, dynamic>> issue({
    required String issuerDid,
    required String subjectDid,
    required Map<String, dynamic> claims,
    String? expirationDate,
    List<String>? credentialType,
    String? proofPurpose,
  }) async {
    _validateSubject(subjectDid);
    final response = await _client.issueCredential(
      issuerDid,
      subjectDid,
      claims,
      expirationDate: expirationDate,
      credentialType: credentialType,
      proofPurpose: proofPurpose,
    );
    return response['credential'] as Map<String, dynamic>;
  }

  Future<bool> verify(
    Map<String, dynamic> credential, {
    String? challenge,
    String? domain,
  }) async {
    _validateCredential(credential);

    if (credential['expirationDate'] != null) {
      final now = DateTime.now();
      final exp = DateTime.parse(credential['expirationDate'] as String);
      if (now.isAfter(exp)) {
        throw CredentialError(
            "Credential '${credential['id']}' is expired", 'EXPIRED_CREDENTIAL');
      }
    }

    final result = await _client.verifyCredential(
      credential,
      challenge: challenge,
      domain: domain,
    );
    return result['verified'] as bool;
  }

  Future<Map<String, dynamic>> verifyWithDetail(
    Map<String, dynamic> credential, {
    String? challenge,
    String? domain,
  }) async {
    _validateCredential(credential);
    final result = await _client.verifyCredential(
      credential,
      challenge: challenge,
      domain: domain,
    );
    return {
      'verified': result['verified'],
      'checks': result['checks'],
    };
  }

  Future<Map<String, dynamic>> createPresentation({
    required List<Map<String, dynamic>> credentials,
    required String holderDid,
    String? challenge,
    String? domain,
  }) async {
    if (credentials.isEmpty) {
      throw CredentialError(
        'At least one credential is required to create a presentation',
        'VALIDATION_ERROR',
      );
    }
    return _client.createPresentation(
      credentials,
      holderDid,
      challenge: challenge,
      domain: domain,
    );
  }

  Future<bool> verifyPresentation(
    Map<String, dynamic> presentation, {
    String? challenge,
    String? domain,
  }) async {
    final vc = presentation['verifiableCredential'];
    if (vc == null || (vc as List).isEmpty) {
      throw CredentialError(
        'Presentation must contain at least one credential',
        'VALIDATION_ERROR',
      );
    }
    final result = await _client.verifyPresentation(
      presentation,
      challenge: challenge,
      domain: domain,
    );
    return result['verified'] as bool;
  }

  Future<void> revoke(String id, {String? reason}) async {
    final result = await _client.revokeCredential(id, reason: reason);
    if (result['revoked'] != true) {
      throw CredentialError("Failed to revoke credential '$id'", 'INTERNAL_ERROR');
    }
  }

  Future<Map<String, dynamic>> getStatus(String id) async {
    return _client.checkCredentialStatus(id);
  }

  Future<Map<String, dynamic>> get(String id) async {
    return _client.getCredential(id);
  }

  Future<List<Map<String, dynamic>>> list({
    int? page,
    int? pageSize,
    String? subjectDid,
    String? issuerDid,
    String? status,
  }) async {
    final response = await _client.listCredentials(
      page: page,
      pageSize: pageSize,
      subjectDid: subjectDid,
      issuerDid: issuerDid,
      status: status,
    );
    return List<Map<String, dynamic>>.from(response['data'] ?? []);
  }

  Future<bool> isExpired(Map<String, dynamic> credential) async {
    if (credential['expirationDate'] == null) return false;
    try {
      final status = await getStatus(credential['id'] as String);
      return status['status'] == 'expired';
    } catch (_) {
      final now = DateTime.now();
      final exp = DateTime.parse(credential['expirationDate'] as String);
      return now.isAfter(exp);
    }
  }

  Future<bool> isRevoked(Map<String, dynamic> credential) async {
    try {
      final status = await getStatus(credential['id'] as String);
      return status['status'] == 'revoked';
    } catch (_) {
      return false;
    }
  }

  Future<List<Map<String, dynamic>>> selectByType(
    List<Map<String, dynamic>> credentials,
    String type,
  ) async {
    return credentials.where((c) {
      final types = List<String>.from(c['type'] ?? []);
      return types.contains(type);
    }).toList();
  }

  Future<List<Map<String, dynamic>>> selectNonExpired(
    List<Map<String, dynamic>> credentials,
  ) async {
    final now = DateTime.now();
    return credentials.where((c) {
      if (c['expirationDate'] == null) return true;
      final exp = DateTime.parse(c['expirationDate'] as String);
      return !now.isAfter(exp);
    }).toList();
  }
}

class CredentialError implements Exception {
  final String message;
  final String code;
  final Map<String, dynamic>? details;

  CredentialError(this.message, this.code, [this.details]);

  @override
  String toString() => 'CredentialError($code): $message';
}

Map<String, dynamic> createCredential(
  String issuer,
  String subjectId,
  Map<String, dynamic> claims, {
  String? id,
  List<String>? types,
  String? expirationDate,
}) {
  final now = DateTime.now().toIso8601String();
  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://www.w3.org/2018/credentials/examples/v1',
    ],
    'id': id ?? 'urn:uuid:${_uuidV4()}',
    'type': types ?? ['VerifiableCredential'],
    'issuer': issuer,
    'issuanceDate': now,
    if (expirationDate != null) 'expirationDate': expirationDate,
    'credentialSubject': {
      'id': subjectId,
      ...claims,
    },
  };
}

Map<String, dynamic> addProof(
  Map<String, dynamic> credential,
  Map<String, dynamic> proof,
) {
  return {
    ...credential,
    'proof': proof,
  };
}

String credentialToJSON(Map<String, dynamic> credential) {
  return credential.toString();
}

Map<String, dynamic> credentialFromJSON(String json) {
  return json as Map<String, dynamic>;
}

bool isVerifiableCredential(dynamic obj) {
  if (obj is! Map<String, dynamic>) return false;
  return obj['id'] is String &&
      obj['issuer'] is String &&
      obj['type'] is List &&
      obj['credentialSubject'] is Map &&
      obj['credentialSubject']['id'] is String;
}

String _uuidV4() {
  final now = DateTime.now().millisecondsSinceEpoch;
  return '${now}-${now.hashCode}';
}
