import Foundation

public class KYCClient {
    private let client: KYCVaultClient

    public init(client: KYCVaultClient) {
        self.client = client
    }

    public func startWorkflow(
        workflowType: String,
        subjectId: String,
        config: [String: Any] = [:]
    ) async throws -> WorkflowResponse {
        try await client.createWorkflow(
            workflowType: workflowType,
            subjectId: subjectId,
            config: config
        )
    }

    public func getWorkflow(_ id: String) async throws -> WorkflowResponse {
        try await client.getWorkflow(id)
    }

    public func listWorkflows(
        page: Int? = nil,
        pageSize: Int? = nil,
        status: String? = nil,
        subjectId: String? = nil
    ) async throws -> [WorkflowResponse] {
        let response = try await client.listWorkflows(
            page: page,
            pageSize: pageSize,
            status: status,
            subjectId: subjectId
        )
        return response.data
    }

    public func checkCompliance(
        subjectId: String,
        tier: String,
        attributes: [String: Any]? = nil
    ) async throws -> ComplianceResult {
        try await client.checkCompliance(
            subjectId: subjectId,
            tier: tier,
            attributes: attributes
        )
    }

    public func getComplianceReport(subjectId: String) async throws -> ComplianceReport {
        try await client.getComplianceReport(subjectId: subjectId)
    }

    public func getHealth() async throws -> HealthStatus {
        try await client.health()
    }

    public static func isWorkflowCompleted(_ workflow: WorkflowResponse) -> Bool {
        workflow.status == "completed"
    }

    public static func isWorkflowFailed(_ workflow: WorkflowResponse) -> Bool {
        workflow.status == "failed" || workflow.status == "rejected"
    }

    public static func isWorkflowPending(_ workflow: WorkflowResponse) -> Bool {
        workflow.status == "pending" || workflow.status == "in_progress"
    }

    public static func isCompliant(_ result: ComplianceResult) -> Bool {
        result.compliant
    }

    public static func isReportCompliant(_ report: ComplianceReport) -> Bool {
        report.overallStatus == "compliant"
    }
}
