import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

class KYCVaultClient {
  final String _baseUrl;
  final String? _apiKey;
  final String? _jwtToken;
  final int _timeout;
  final int _retryCount;
  final int _retryDelay;
  final Map<String, String> _defaultHeaders;

  KYCVaultClient({
    required String baseUrl,
    String? apiKey,
    String? jwtToken,
    int timeout = 30000,
    int retryCount = 3,
    int retryDelay = 1000,
    Map<String, String>? headers,
  })  : _baseUrl = baseUrl.replaceAll(RegExp(r'\/+$'), ''),
        _apiKey = apiKey,
        _jwtToken = jwtToken,
        _timeout = timeout,
        _retryCount = retryCount,
        _retryDelay = retryDelay,
        _defaultHeaders = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          if (headers != null) ...headers,
        };

  Map<String, String> get _headers {
    final headers = Map<String, String>.from(_defaultHeaders);
    if (_jwtToken != null) {
      headers['Authorization'] = 'Bearer $_jwtToken';
    } else if (_apiKey != null) {
      headers['X-API-Key'] = _apiKey!;
    }
    return headers;
  }

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Object? body,
    Map<String, String>? params,
  }) async {
    final uri = _buildUri(path, params);
    final headers = _headers;

    var lastError;

    for (var attempt = 0; attempt <= _retryCount; attempt++) {
      try {
        http.Response response;

        switch (method) {
          case 'GET':
            response = await http.get(uri, headers: headers)
                .timeout(Duration(milliseconds: _timeout));
            break;
          case 'POST':
            response = await http.post(
              uri,
              headers: headers,
              body: body != null ? jsonEncode(body) : null,
            ).timeout(Duration(milliseconds: _timeout));
            break;
          case 'PUT':
            response = await http.put(
              uri,
              headers: headers,
              body: body != null ? jsonEncode(body) : null,
            ).timeout(Duration(milliseconds: _timeout));
            break;
          case 'DELETE':
            response = await http.delete(uri, headers: headers)
                .timeout(Duration(milliseconds: _timeout));
            break;
          default:
            throw Exception('Unsupported HTTP method: $method');
        }

        if (response.statusCode == 204) {
          return <String, dynamic>{};
        }

        final responseBody = jsonDecode(response.body) as Map<String, dynamic>;

        if (response.statusCode >= 400) {
          throw KYCError(
            responseBody['message'] as String? ?? 'HTTP ${response.statusCode}',
            responseBody['error'] as String? ?? 'UNKNOWN',
            response.statusCode,
            responseBody,
          );
        }

        return responseBody;
      } catch (e) {
        lastError = e;

        if (e is KYCError && e.statusCode < 500) {
          rethrow;
        }

        if (attempt < _retryCount) {
          await Future.delayed(
            Duration(milliseconds: _retryDelay * (1 << attempt)),
          );
        }
      }
    }

    throw lastError ?? Exception('Request failed');
  }

  Uri _buildUri(String path, Map<String, String>? params) {
    final uri = Uri.parse('$_baseUrl$path');
    if (params != null && params.isNotEmpty) {
      return uri.replace(queryParameters: params);
    }
    return uri;
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, String>? params}) =>
      _request('GET', path, params: params);

  Future<Map<String, dynamic>> post(String path, {Object? body}) =>
      _request('POST', path, body: body);

  Future<Map<String, dynamic>> put(String path, {Object? body}) =>
      _request('PUT', path, body: body);

  Future<Map<String, dynamic>> delete(String path) =>
      _request('DELETE', path);

  Future<Map<String, dynamic>> getHealth() => get('/health');

  Future<Map<String, dynamic>> resolveDID(String did) =>
      get('/v1/did/${Uri.encodeComponent(did)}');

  Future<Map<String, dynamic>> createDID(
    String method, {
    String? keyType,
    String? network,
    List<Map<String, dynamic>>? services,
  }) =>
      post('/v1/did/create', body: {
        'method': method,
        if (keyType != null) 'keyType': keyType,
        if (network != null) 'network': network,
        if (services != null) 'services': services,
      });

  Future<Map<String, dynamic>> rotateKey(
    String did,
    String keyId, {
    String? keyType,
  }) =>
      post('/v1/did/${Uri.encodeComponent(did)}/rotate', body: {
        'keyId': keyId,
        if (keyType != null) 'keyType': keyType,
      });

  Future<void> deactivateDID(String did) async {
    await post('/v1/did/${Uri.encodeComponent(did)}/deactivate', body: {});
  }

  Future<Map<String, dynamic>> issueCredential(
    String issuerDid,
    String subjectDid,
    Map<String, dynamic> claims, {
    String? expirationDate,
    List<String>? credentialType,
    String? proofPurpose,
  }) =>
      post('/v1/credentials/issue', body: {
        'issuerDid': issuerDid,
        'subjectDid': subjectDid,
        'claims': claims,
        if (expirationDate != null) 'expirationDate': expirationDate,
        if (credentialType != null) 'credentialType': credentialType,
        if (proofPurpose != null) 'proofPurpose': proofPurpose,
      });

  Future<Map<String, dynamic>> verifyCredential(
    Map<String, dynamic> credential, {
    String? challenge,
    String? domain,
  }) =>
      post('/v1/credentials/verify', body: {
        'credential': credential,
        if (challenge != null) 'challenge': challenge,
        if (domain != null) 'domain': domain,
      });

  Future<Map<String, dynamic>> getCredential(String id) =>
      get('/v1/credentials/${Uri.encodeComponent(id)}');

  Future<Map<String, dynamic>> revokeCredential(
    String id, {
    String? reason,
  }) =>
      post('/v1/credentials/${Uri.encodeComponent(id)}/revoke', body: {
        if (reason != null) 'reason': reason,
      });

  Future<Map<String, dynamic>> checkCredentialStatus(String id) =>
      get('/v1/credentials/${Uri.encodeComponent(id)}/status');

  Future<Map<String, dynamic>> listCredentials({
    int? page,
    int? pageSize,
    String? subjectDid,
    String? issuerDid,
    String? status,
  }) {
    final params = <String, String>{};
    if (page != null) params['page'] = page.toString();
    if (pageSize != null) params['pageSize'] = pageSize.toString();
    if (subjectDid != null) params['subjectDid'] = subjectDid;
    if (issuerDid != null) params['issuerDid'] = issuerDid;
    if (status != null) params['status'] = status;
    return get('/v1/credentials', params: params);
  }

  Future<Map<String, dynamic>> createPresentation(
    List<Map<String, dynamic>> credentials,
    String holderDid, {
    String? challenge,
    String? domain,
  }) =>
      post('/v1/presentations/create', body: {
        'credentials': credentials,
        'holderDid': holderDid,
        if (challenge != null) 'challenge': challenge,
        if (domain != null) 'domain': domain,
      });

  Future<Map<String, dynamic>> verifyPresentation(
    Map<String, dynamic> presentation, {
    String? challenge,
    String? domain,
  }) =>
      post('/v1/presentations/verify', body: {
        'presentation': presentation,
        if (challenge != null) 'challenge': challenge,
        if (domain != null) 'domain': domain,
      });

  Future<Map<String, dynamic>> createWorkflow(
    String workflowType,
    String subjectId,
    Map<String, dynamic> config,
  ) =>
      post('/v1/workflows', body: {
        'workflowType': workflowType,
        'subjectId': subjectId,
        'config': config,
      });

  Future<Map<String, dynamic>> getWorkflow(String id) =>
      get('/v1/workflows/${Uri.encodeComponent(id)}');

  Future<Map<String, dynamic>> listWorkflows({
    int? page,
    int? pageSize,
    String? status,
    String? subjectId,
  }) {
    final params = <String, String>{};
    if (page != null) params['page'] = page.toString();
    if (pageSize != null) params['pageSize'] = pageSize.toString();
    if (status != null) params['status'] = status;
    if (subjectId != null) params['subjectId'] = subjectId;
    return get('/v1/workflows', params: params);
  }

  Future<Map<String, dynamic>> checkCompliance(
    String subjectId,
    String tier, {
    Map<String, dynamic>? attributes,
  }) =>
      post('/v1/compliance/check', body: {
        'subjectId': subjectId,
        'tier': tier,
        if (attributes != null) 'attributes': attributes,
      });

  Future<Map<String, dynamic>> getComplianceReport(String subjectId) =>
      get('/v1/compliance/${Uri.encodeComponent(subjectId)}/report');

  Future<Map<String, dynamic>> createDIDDocument(
    String id, {
    List<String>? controller,
    List<Map<String, dynamic>>? verificationMethods,
    List<Map<String, dynamic>>? services,
    List<String>? alsoKnownAs,
  }) {
    return Future.value({
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      'id': id,
      'verificationMethod': verificationMethods ?? [],
      'authentication': (verificationMethods ?? []).map((vm) => vm['id']).toList(),
      'service': services,
      'alsoKnownAs': alsoKnownAs,
      'controller': controller,
      'created': DateTime.now().toIso8601String(),
      'updated': DateTime.now().toIso8601String(),
    });
  }

  void setJWT(String token) {
    _jwtToken = token;
  }

  void clearAuth() {
    _apiKey = null;
    _jwtToken = null;
  }
}

class KYCError implements Exception {
  final String message;
  final String code;
  final int statusCode;
  final Map<String, dynamic>? details;

  KYCError(this.message, this.code, this.statusCode, [this.details]);

  @override
  String toString() => 'KYCError($statusCode): $message';
}
