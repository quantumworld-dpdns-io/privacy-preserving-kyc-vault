import { randomUUID } from 'node:crypto';
import { loadConfig, type KycTier } from './config.js';

const config = loadConfig();

export type WorkflowStatus =
  | 'created'
  | 'pending_submission'
  | 'submitted'
  | 'verifying'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export type WorkflowEvent =
  | 'submit'
  | 'verify'
  | 'approve'
  | 'reject'
  | 'expire'
  | 'cancel'
  | 'request_info'
  | 'provide_info';

export interface KycStep {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  result?: Record<string, unknown>;
  error?: string;
}

export interface KycWorkflow {
  id: string;
  userId: string;
  tier: KycTier;
  status: WorkflowStatus;
  steps: KycStep[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  completedAt?: string;
  metadata: Record<string, unknown>;
}

interface TransitionMap {
  [key: string]: { from: WorkflowStatus[]; to: WorkflowStatus };
}

const TRANSITIONS: TransitionMap = {
  submit: { from: ['created', 'pending_submission'], to: 'submitted' },
  verify: { from: ['submitted'], to: 'verifying' },
  approve: { from: ['verifying'], to: 'approved' },
  reject: { from: ['verifying', 'submitted'], to: 'rejected' },
  expire: { from: ['created', 'pending_submission', 'submitted', 'verifying'], to: 'expired' },
  cancel: { from: ['created', 'pending_submission', 'submitted', 'verifying'], to: 'cancelled' },
  request_info: { from: ['submitted', 'verifying'], to: 'pending_submission' },
  provide_info: { from: ['pending_submission'], to: 'submitted' },
};

export class KycOrchestrator {
  private workflows: Map<string, KycWorkflow> = new Map();
  private userWorkflows: Map<string, string[]> = new Map();

  createWorkflow(userId: string, tier: KycTier): KycWorkflow {
    const activeWorkflows = (this.userWorkflows.get(userId) || [])
      .map((id) => this.workflows.get(id))
      .filter((w): w is KycWorkflow => w !== undefined)
      .filter((w) => ['created', 'pending_submission', 'submitted', 'verifying'].includes(w.status));

    if (activeWorkflows.length >= config.maxActiveWorkflowsPerUser) {
      throw new Error(`User ${userId} already has ${config.maxActiveWorkflowsPerUser} active workflows`);
    }

    const tierDef = config.tiers.find((t) => t.tier === tier);
    if (!tierDef) {
      throw new Error(`Unknown tier: ${tier}`);
    }

    const now = new Date();
    const workflow: KycWorkflow = {
      id: randomUUID(),
      userId,
      tier,
      status: 'created',
      steps: tierDef.requiredVerifications.map((verification) => ({
        id: randomUUID(),
        name: verification,
        status: 'pending',
      })),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + config.timeouts.overallTimeoutMs).toISOString(),
      metadata: {},
    };

    this.workflows.set(workflow.id, workflow);
    const userList = this.userWorkflows.get(userId) || [];
    userList.push(workflow.id);
    this.userWorkflows.set(userId, userList);

    return workflow;
  }

  transitionWorkflow(workflowId: string, event: WorkflowEvent): KycWorkflow {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const transition = TRANSITIONS[event];
    if (!transition) {
      throw new Error(`Unknown event: ${event}`);
    }

    if (!transition.from.includes(workflow.status)) {
      throw new Error(
        `Cannot transition from ${workflow.status} with event ${event}`,
      );
    }

    workflow.status = transition.to;
    workflow.updatedAt = new Date().toISOString();

    if (['approved', 'rejected', 'cancelled'].includes(transition.to)) {
      workflow.completedAt = workflow.updatedAt;
    }

    return workflow;
  }

  getWorkflow(workflowId: string): KycWorkflow {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    return workflow;
  }

  getUserWorkflows(userId: string): KycWorkflow[] {
    const workflowIds = this.userWorkflows.get(userId) || [];
    return workflowIds
      .map((id) => this.workflows.get(id))
      .filter((w): w is KycWorkflow => w !== undefined);
  }

  listWorkflows(status?: WorkflowStatus): KycWorkflow[] {
    const all = Array.from(this.workflows.values());
    if (status) {
      return all.filter((w) => w.status === status);
    }
    return all;
  }

  updateStep(
    workflowId: string,
    stepId: string,
    update: Partial<Pick<KycStep, 'status' | 'result' | 'error'>>,
  ): KycWorkflow {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const step = workflow.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }

    Object.assign(step, update);
    if (update.status === 'in_progress' && !step.startedAt) {
      step.startedAt = new Date().toISOString();
    }
    if (update.status === 'completed' || update.status === 'failed') {
      step.completedAt = new Date().toISOString();
    }

    workflow.updatedAt = new Date().toISOString();
    return workflow;
  }

  checkExpired(): string[] {
    const now = new Date();
    const expired: string[] = [];

    for (const [id, workflow] of this.workflows) {
      if (
        ['created', 'pending_submission', 'submitted', 'verifying'].includes(workflow.status) &&
        new Date(workflow.expiresAt) <= now
      ) {
        workflow.status = 'expired';
        workflow.updatedAt = now.toISOString();
        expired.push(id);
      }
    }

    return expired;
  }

  updateMetadata(
    workflowId: string,
    metadata: Record<string, unknown>,
  ): KycWorkflow {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    workflow.metadata = { ...workflow.metadata, ...metadata };
    workflow.updatedAt = new Date().toISOString();
    return workflow;
  }
}

export const orchestrator = new KycOrchestrator();
