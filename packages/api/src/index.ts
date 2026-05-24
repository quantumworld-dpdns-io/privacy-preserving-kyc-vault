import { createServer } from './server.js';
import didRoutes from './routes/did.js';
import credentialRoutes from './routes/credential.js';
import kycRoutes from './routes/kyc.js';

const app = createServer();

app.use('/api/v1/did', didRoutes);
app.use('/api/v1/credentials', credentialRoutes);
app.use('/api/v1/kyc', kycRoutes);

const PORT = parseInt(process.env.API_PORT || '3000', 10);

app.listen(PORT, () => {
  console.log(`KYC Vault API server running on port ${PORT}`);
});

export { app };
