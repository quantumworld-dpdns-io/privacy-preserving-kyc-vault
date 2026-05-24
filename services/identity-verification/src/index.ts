import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

export interface VerificationRequest {
  userId: string;
  sessionId?: string;
  firstName: string;
  lastName: string;
  email?: string;
  dateOfBirth?: string;
  nationality?: string;
  address?: {
    street: string;
    city: string;
    state?: string;
    postalCode?: string;
    country: string;
  };
  requireIdentityVerification: boolean;
  requireAddressVerification: boolean;
  requireAgeVerification: boolean;
  metadata?: Record<string, unknown>;
}

export interface VerificationResult {
  id: string;
  provider: string;
  status: 'completed' | 'pending' | 'failed';
  verified: boolean;
  score: number;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface ProviderHealth {
  provider: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  timestamp: string;
}

export interface VerificationProvider {
  readonly name: string;
  verify(request: VerificationRequest): Promise<VerificationResult>;
  health(): Promise<ProviderHealth>;
}

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'identity-verification', timestamp: new Date().toISOString() });
});

app.listen(3030, '0.0.0.0', () => {
  console.log('Identity verification service listening on 0.0.0.0:3030');
});

export { app };
