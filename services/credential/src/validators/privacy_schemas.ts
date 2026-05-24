import { z } from 'zod';

export const ConsentPurposeSchema = z.enum([
  'kyc_verification',
  'identity_verification',
  'document_processing',
  'data_analytics',
  'compliance_reporting',
  'marketing',
  'third_party_sharing',
  'fraud_prevention',
  'risk_assessment',
  'account_management',
]);

export const ConsentScopeSchema = z.enum([
  'read:personal_info',
  'read:identity_documents',
  'read:financial_data',
  'read:biometric_data',
  'write:personal_info',
  'export:all_data',
  'delete:all_data',
  'share:with_platforms',
  'process:analytics',
  'retain:audit_logs',
]);

export const CreateConsentSchema = z.object({
  userId: z.string().min(1),
  purpose: ConsentPurposeSchema,
  scope: z.array(ConsentScopeSchema).min(1),
  expiresAt: z.string().datetime().optional(),
  source: z.string().default('api'),
});

export const RevokeConsentSchema = z.object({
  consentId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export const CheckConsentSchema = z.object({
  userId: z.string().min(1),
  purpose: ConsentPurposeSchema,
  scope: ConsentScopeSchema,
});

export const DeletionScopeSchema = z.union([
  z.literal('all'),
  z.object({
    dataTypes: z.array(z.string()).min(1),
  }),
  z.object({
    timeRange: z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    }),
  }),
]);

export const CreateDeletionRequestSchema = z.object({
  userId: z.string().min(1),
  scope: DeletionScopeSchema,
  reason: z.string().max(1000).optional(),
});

export const DeletionStatusSchema = z.object({
  requestId: z.string().min(1),
});

export const DataExportFormatSchema = z.enum(['json', 'csv', 'cbor']);

export const DataExportRequestSchema = z.object({
  userId: z.string().min(1),
  categories: z.array(z.string()).min(1).max(50),
  format: DataExportFormatSchema.optional().default('json'),
  data: z.record(z.unknown()).optional(),
});

export const ConsentRecordSchema = z.object({
  id: z.string(),
  userId: z.string(),
  purpose: ConsentPurposeSchema,
  scope: z.array(ConsentScopeSchema),
  granted: z.boolean(),
  timestamp: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable().optional(),
});

export const PrivacyQuerySchema = z.object({
  userId: z.string().optional(),
  purpose: ConsentPurposeSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
