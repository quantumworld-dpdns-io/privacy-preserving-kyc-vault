import { randomUUID } from 'node:crypto';
import { KYCWorkflow, KYCWorkflowState, KYCTier, KYCDocument, KYCReview, DID } from '../types/index.js';

export interface CreateWorkflowInput {
  subjectDid: DID;
  tier: KYCTier;
  platformId: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowTransitionInput {
  workflowId: string;
  newState: KYCWorkflowState;
  actor: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentUploadInput {
  workflowId: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  content: string;
  checksum: string;
}

export interface ReviewDecisionInput {
  workflowId: string;
  decision: 'approve' | 'reject' | 'escalate' | 'request_info';
  reason: string;
  reviewer: string;
  metadata?: Record<string, unknown>;
}

const VALID_TRANSITIONS: Record<KYCWorkflowState, KYCWorkflowState[]> = {
  'Initiated': ['DocumentSubmission'],
  'DocumentSubmission': ['VerificationInProgress', 'ManualReview'],
  'VerificationInProgress': ['ManualReview', 'Approved', 'Rejected'],
  'ManualReview': ['Approved', 'Rejected', 'Escalated', 'DocumentSubmission'],
  'Escalated': ['ManualReview', 'Approved', 'Rejected'],
  'Approved': [],
  'Rejected': [],
  'Expired': [],
};

export class KYCService {
  private workflows = new Map<string, KYCWorkflow>();

  async createWorkflow(input: CreateWorkflowInput): Promise<KYCWorkflow> {
    const id = `wf-${randomUUID()}`;
    const workflow: KYCWorkflow = {
      id,
      subjectDid: input.subjectDid,
      tier: input.tier,
      platformId: input.platformId,
      state: 'Initiated',
      documents: [],
      reviews: [],
      history: [{
        eventType: 'workflow_created',
        timestamp: new Date().toISOString(),
        actor: 'system',
        detail: `KYC workflow created for ${input.subjectDid}`,
        metadata: input.metadata,
      }],
      createdAt: new Date().toISOString(),
    };

    this.workflows.set(id, workflow);
    return workflow;
  }

  async getWorkflow(id: string): Promise<KYCWorkflow> {
    const workflow = this.workflows.get(id);
    if (!workflow) {
      throw new Object.assign(new Error(`Workflow not found: ${id}`), { statusCode: 404 });
    }
    return workflow;
  }

  async transition(input: WorkflowTransitionInput): Promise<KYCWorkflow> {
    const workflow = await this.getWorkflow(input.workflowId);
    const allowed = VALID_TRANSITIONS[workflow.state];

    if (!allowed.includes(input.newState)) {
      throw new Object.assign(
        new Error(`Invalid transition from ${workflow.state} to ${input.newState}`),
        { statusCode: 400 },
      );
    }

    workflow.state = input.newState;
    workflow.updatedAt = new Date().toISOString();

    if (input.newState === 'Approved' || input.newState === 'Rejected') {
      workflow.completedAt = new Date().toISOString();
    }

    workflow.history.push({
      eventType: `state_change:${input.newState}`,
      timestamp: new Date().toISOString(),
      actor: input.actor,
      detail: input.detail,
      metadata: input.metadata,
    });

    this.workflows.set(input.workflowId, workflow);
    return workflow;
  }

  async uploadDocument(input: DocumentUploadInput): Promise<KYCDocument> {
    const workflow = await this.getWorkflow(input.workflowId);
    const doc: KYCDocument = {
      id: randomUUID(),
      type: input.documentType,
      fileName: input.fileName,
      mimeType: input.mimeType,
      storageRef: `uploads/${input.workflowId}/${doc.id}`,
      checksum: input.checksum,
      verified: false,
      uploadedAt: new Date().toISOString(),
    };

    workflow.documents.push(doc);
    workflow.updatedAt = new Date().toISOString();

    workflow.history.push({
      eventType: 'document_uploaded',
      timestamp: new Date().toISOString(),
      actor: workflow.subjectDid,
      detail: `Document ${input.documentType} uploaded`,
    });

    this.workflows.set(input.workflowId, workflow);
    return doc;
  }

  async review(input: ReviewDecisionInput): Promise<KYCWorkflow> {
    const workflow = await this.getWorkflow(input.workflowId);
    const review: KYCReview = {
      id: randomUUID(),
      reviewer: input.reviewer,
      decision: input.decision,
      reason: input.reason,
      createdAt: new Date().toISOString(),
    };

    workflow.reviews.push(review);
    workflow.updatedAt = new Date().toISOString();

    const stateMap: Record<string, KYCWorkflowState> = {
      approve: 'Approved',
      reject: 'Rejected',
      escalate: 'Escalated',
      request_info: 'DocumentSubmission',
    };

    const newState = stateMap[input.decision];
    if (newState) {
      workflow.state = newState;
      if (newState === 'Approved' || newState === 'Rejected') {
        workflow.completedAt = new Date().toISOString();
      }
    }

    workflow.history.push({
      eventType: `review:${input.decision}`,
      timestamp: new Date().toISOString(),
      actor: input.reviewer,
      detail: input.reason,
      metadata: input.metadata,
    });

    this.workflows.set(input.workflowId, workflow);
    return workflow;
  }

  async list(query: {
    subjectDid?: DID;
    platformId?: string;
    state?: KYCWorkflowState;
    tier?: KYCTier;
    page: number;
    limit: number;
  }): Promise<{ data: KYCWorkflow[]; total: number; page: number; limit: number }> {
    let workflows = Array.from(this.workflows.values());

    if (query.subjectDid) {
      workflows = workflows.filter((w) => w.subjectDid === query.subjectDid);
    }
    if (query.platformId) {
      workflows = workflows.filter((w) => w.platformId === query.platformId);
    }
    if (query.state) {
      workflows = workflows.filter((w) => w.state === query.state);
    }
    if (query.tier) {
      workflows = workflows.filter((w) => w.tier === query.tier);
    }

    const total = workflows.length;
    const start = (query.page - 1) * query.limit;
    const data = workflows.slice(start, start + query.limit);

    return { data, total, page: query.page, limit: query.limit };
  }
}
