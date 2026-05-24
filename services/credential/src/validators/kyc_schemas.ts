import { z } from 'zod';

const didPattern = /^did:([a-z0-9]+):([a-zA-Z0-9.\-_:]+)$/;
const DIDString = z.string().regex(didPattern, 'Invalid DID format');

export const WorkflowStates = [
  'Initiated',
  'DocumentSubmission',
  'VerificationInProgress',
  'ManualReview',
  'Escalated',
  'Approved',
  'Rejected',
  'Expired',
] as const;

export const KYCTiers = ['basic', 'enhanced', 'enterprise'] as const;

export const CreateWorkflowSchema = z.object({
  subjectDid: DIDString,
  tier: z.enum(KYCTiers),
  platformId: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export const WorkflowTransitionSchema = z.object({
  newState: z.enum(WorkflowStates),
  actor: z.string().min(1),
  detail: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const DocumentUploadSchema = z.object({
  workflowId: z.string().min(1),
  documentType: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  content: z.string().min(1),
  checksum: z.string().min(1),
});

export const ReviewDecisionSchema = z.object({
  workflowId: z.string().min(1),
  decision: z.enum(['approve', 'reject', 'escalate', 'request_info']),
  reason: z.string().max(2000),
  reviewer: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export const KYCQuerySchema = z.object({
  subjectDid: DIDString.optional(),
  platformId: z.string().optional(),
  state: z.enum(WorkflowStates).optional(),
  tier: z.enum(KYCTiers).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
