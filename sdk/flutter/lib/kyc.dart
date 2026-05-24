import 'kyc_vault.dart';

class KYCService {
  final KYCVaultClient _client;

  KYCService(this._client);

  Future<Map<String, dynamic>> startWorkflow(
    String workflowType,
    String subjectId, {
    Map<String, dynamic>? config,
  }) async {
    return _client.createWorkflow(
      workflowType,
      subjectId,
      config ?? {},
    );
  }

  Future<Map<String, dynamic>> getWorkflow(String id) async {
    return _client.getWorkflow(id);
  }

  Future<List<Map<String, dynamic>>> listWorkflows({
    int? page,
    int? pageSize,
    String? status,
    String? subjectId,
  }) async {
    final response = await _client.listWorkflows(
      page: page,
      pageSize: pageSize,
      status: status,
      subjectId: subjectId,
    );
    return List<Map<String, dynamic>>.from(response['data'] ?? []);
  }

  Future<Map<String, dynamic>> checkCompliance(
    String subjectId,
    String tier, {
    Map<String, dynamic>? attributes,
  }) async {
    return _client.checkCompliance(
      subjectId,
      tier,
      attributes: attributes,
    );
  }

  Future<Map<String, dynamic>> getComplianceReport(String subjectId) async {
    return _client.getComplianceReport(subjectId);
  }

  Future<Map<String, dynamic>> getHealth() async {
    return _client.getHealth();
  }

  bool isWorkflowCompleted(Map<String, dynamic> workflow) {
    return workflow['status'] == 'completed';
  }

  bool isWorkflowFailed(Map<String, dynamic> workflow) {
    return workflow['status'] == 'failed' || workflow['status'] == 'rejected';
  }

  bool isWorkflowPending(Map<String, dynamic> workflow) {
    return workflow['status'] == 'pending' || workflow['status'] == 'in_progress';
  }

  bool isCompliant(Map<String, dynamic> complianceResult) {
    return complianceResult['compliant'] == true;
  }

  bool isReportCompliant(Map<String, dynamic> report) {
    return report['overallStatus'] == 'compliant';
  }
}
