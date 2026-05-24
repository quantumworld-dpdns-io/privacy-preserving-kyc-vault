import { z } from 'zod';

const didPattern = /^did:([a-z0-9]+):([a-zA-Z0-9.\-_:]+)$/;

export const DIDString = z.string().regex(didPattern, 'Invalid DID format');

export const ResolveDIDParamsSchema = z.object({
  did: DIDString,
});

export const BatchResolveSchema = z.object({
  dids: z.array(DIDString).min(1).max(100),
});

export const VerificationMethodSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['Ed25519VerificationKey2020', 'Ed25519VerificationKey2018', 'JsonWebKey2020', 'EcdsaSecp256k1VerificationKey2019']),
  controller: DIDString,
  publicKeyMultibase: z.string().optional(),
  publicKeyJwk: z.record(z.unknown()).optional(),
});

export const DIDServiceSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  serviceEndpoint: z.union([z.string(), z.array(z.string())]),
});

export const CreateDIDSchema = z.object({
  method: z.string().min(1).max(50).default('key'),
  verificationMethod: z.array(VerificationMethodSchema).min(1),
  authentication: z.array(z.string()).optional(),
  assertionMethod: z.array(z.string()).optional(),
  keyAgreement: z.array(z.string()).optional(),
  capabilityInvocation: z.array(z.string()).optional(),
  capabilityDelegation: z.array(z.string()).optional(),
  service: z.array(DIDServiceSchema).optional(),
  alsoKnownAs: z.array(z.string().url()).optional(),
});

export const UpdateDIDSchema = z.object({
  did: DIDString,
  verificationMethod: z.array(VerificationMethodSchema).optional(),
  authentication: z.array(z.string()).optional(),
  assertionMethod: z.array(z.string()).optional(),
  keyAgreement: z.array(z.string()).optional(),
  capabilityInvocation: z.array(z.string()).optional(),
  capabilityDelegation: z.array(z.string()).optional(),
  service: z.array(DIDServiceSchema).optional(),
  alsoKnownAs: z.array(z.string().url()).optional(),
});

export const DeactivateDIDSchema = z.object({
  did: DIDString,
  reason: z.string().max(500).optional(),
});

export const DIDQuerySchema = z.object({
  did: DIDString.optional(),
  controller: DIDString.optional(),
  method: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
