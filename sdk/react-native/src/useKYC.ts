import { useState, useCallback } from "react";
import { useAPIClient } from "./KYCVaultProvider";

interface WorkflowResponse {
  id: string;
  workflowType: string;
  subjectId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  config: Record<string, unknown>;
  result?: Record<string, unknown>;
}

interface ComplianceResult {
  compliant: boolean;
  tier: string;
  checks: ComplianceCheck[];
  validUntil?: string;
}

interface ComplianceCheck {
  name: string;
  passed: boolean;
  details?: string;
}

interface ComplianceReport {
  subjectId: string;
  overallStatus: "compliant" | "non_compliant" | "pending_review";
  tiers: Record<string, ComplianceResult>;
  generatedAt: string;
}

interface UseKYCReturn {
  workflow: WorkflowResponse | null;
  workflows: WorkflowResponse[];
  isLoading: boolean;
  error: string | null;
  startWorkflow: (
    workflowType: string,
    subjectId: string,
    config?: Record<string, unknown>,
  ) => Promise<WorkflowResponse>;
  getWorkflow: (id: string) => Promise<WorkflowResponse>;
  listWorkflows: (params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    subjectId?: string;
  }) => Promise<WorkflowResponse[]>;
  checkCompliance: (
    subjectId: string,
    tier: string,
    attributes?: Record<string, unknown>,
  ) => Promise<ComplianceResult>;
  getComplianceReport: (subjectId: string) => Promise<ComplianceReport>;
  getHealth: () => Promise<{ status: string; version: string }>;
}

export function useKYC(): UseKYCReturn {
  const { get, post } = useAPIClient();
  const [workflow, setWorkflow] = useState<WorkflowResponse | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startWorkflow = useCallback(
    async (
      workflowType: string,
      subjectId: string,
      config?: Record<string, unknown>,
    ): Promise<WorkflowResponse> => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await post<WorkflowResponse>("/v1/workflows", {
          workflowType,
          subjectId,
          config: config || {},
        });
        setWorkflow(response);
        return response;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to start workflow";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [post],
  );

  const getWorkflow = useCallback(
    async (id: string): Promise<WorkflowResponse> => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await get<WorkflowResponse>(
          `/v1/workflows/${encodeURIComponent(id)}`,
        );
        setWorkflow(response);
        return response;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to get workflow";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [get],
  );

  const listWorkflows = useCallback(
    async (params?: {
      page?: number;
      pageSize?: number;
      status?: string;
      subjectId?: string;
    }): Promise<WorkflowResponse[]> => {
      setIsLoading(true);
      setError(null);
      try {
        const queryParams: Record<string, string> = {};
        if (params?.page) queryParams.page = String(params.page);
        if (params?.pageSize) queryParams.pageSize = String(params.pageSize);
        if (params?.status) queryParams.status = params.status;
        if (params?.subjectId) queryParams.subjectId = params.subjectId;

        const response = await get<{ data: WorkflowResponse[]; total: number; page: number; pageSize: number; hasMore: boolean }>(
          "/v1/workflows",
          queryParams,
        );
        setWorkflows(response.data);
        return response.data;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to list workflows";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [get],
  );

  const checkCompliance = useCallback(
    async (
      subjectId: string,
      tier: string,
      attributes?: Record<string, unknown>,
    ): Promise<ComplianceResult> => {
      setIsLoading(true);
      setError(null);
      try {
        return await post<ComplianceResult>("/v1/compliance/check", {
          subjectId,
          tier,
          attributes,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to check compliance";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [post],
  );

  const getComplianceReport = useCallback(
    async (subjectId: string): Promise<ComplianceReport> => {
      setIsLoading(true);
      setError(null);
      try {
        return await get<ComplianceReport>(
          `/v1/compliance/${encodeURIComponent(subjectId)}/report`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to get compliance report";
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [get],
  );

  const getHealth = useCallback(async () => {
    try {
      return await get<{ status: string; version: string }>("/health");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to get health";
      setError(msg);
      throw err;
    }
  }, [get]);

  return {
    workflow,
    workflows,
    isLoading,
    error,
    startWorkflow,
    getWorkflow,
    listWorkflows,
    checkCompliance,
    getComplianceReport,
    getHealth,
  };
}
