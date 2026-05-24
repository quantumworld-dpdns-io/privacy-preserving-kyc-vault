package com.kycvault

class KYCService(private val client: KYCVaultClient) {

    suspend fun startWorkflow(
        workflowType: String,
        subjectId: String,
        config: Map<String, Any> = emptyMap(),
    ): WorkflowResponse {
        return client.createWorkflow(workflowType, subjectId, config)
    }

    suspend fun getWorkflow(id: String): WorkflowResponse {
        return client.getWorkflow(id)
    }

    suspend fun listWorkflows(
        page: Int? = null,
        pageSize: Int? = null,
        status: String? = null,
        subjectId: String? = null,
    ): List<WorkflowResponse> {
        val response = client.listWorkflows(page, pageSize, status, subjectId)
        return response.data
    }

    suspend fun checkCompliance(
        subjectId: String,
        tier: String,
        attributes: Map<String, Any>? = null,
    ): ComplianceResult {
        return client.checkCompliance(subjectId, tier, attributes)
    }

    suspend fun getComplianceReport(subjectId: String): ComplianceReport {
        return client.getComplianceReport(subjectId)
    }

    suspend fun getHealth(): HealthStatus {
        return client.health()
    }

    companion object {
        fun isWorkflowCompleted(workflow: WorkflowResponse): Boolean =
            workflow.status == "completed"

        fun isWorkflowFailed(workflow: WorkflowResponse): Boolean =
            workflow.status == "failed" || workflow.status == "rejected"

        fun isWorkflowPending(workflow: WorkflowResponse): Boolean =
            workflow.status == "pending" || workflow.status == "in_progress"

        fun isCompliant(result: ComplianceResult): Boolean =
            result.compliant

        fun isReportCompliant(report: ComplianceReport): Boolean =
            report.overallStatus == "compliant"
    }
}
