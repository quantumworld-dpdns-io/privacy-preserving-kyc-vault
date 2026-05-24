import { z } from 'zod';

const didPattern = /^did:([a-z0-9]+):([a-zA-Z0-9.\-_:]+)$/;
const DIDString = z.string().regex(didPattern, 'Invalid DID format');

export const CredentialSubjectSchema = z.object({
  id: DIDString,
}).catchall(z.unknown());

export const CredentialStatusSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
});

export const ProofSchema = z.object({
  type: z.string().min(1),
  created: z.string().datetime(),
  verificationMethod: z.string().min(1),
  proofPurpose: z.string().min(1),
  proofValue: z.string().min(1),
}).catchall(z.unknown());

export const IssueCredentialSchema = z.object({
  type: z.union([z.string(), z.array(z.string())]),
  issuer: DIDString,
  subject: DIDString,
  claims: z.record(z.unknown()).optional(),
  expirationDate: z.string().datetime().optional(),
  credentialStatus: CredentialStatusSchema.optional(),
});

export const VerifyCredentialSchema = z.object({
  credential: z.record(z.unknown()),
  options: z.object({
    proofPurpose: z.string().optional(),
    challenge: z.string().optional(),
    domain: z.string().optional(),
  }).optional(),
});

export const RevokeCredentialSchema = z.object({
  credentialId: z.string().min(1),
  reason: z.string().max(1000).optional(),
});

export const CredentialQuerySchema = z.object({
  issuer: DIDString.optional(),
  subject: DIDString.optional(),
  type: z.string().optional(),
  status: z.enum(['active', 'revoked', 'expired', 'suspended']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
