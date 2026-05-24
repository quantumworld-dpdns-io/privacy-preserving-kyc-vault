# Aggregation Service

A unified API aggregation service that combines multiple third-party services into a single interface for the KYC Vault platform.

## Features

- **Unified Interface**: Single API endpoint for multiple third-party services
- **Rate Limiting**: Protects against abuse and ensures fair usage
- **Caching**: Redis-based caching for improved performance
- **Circuit Breaker**: Prevents cascade failures when external services are unavailable
- **API Key Management**: Secure storage and rotation of API credentials
- **GraphQL Gateway**: Flexible query interface for clients
- **Comprehensive Logging**: Structured logging with Winston
- **Docker & Kubernetes Ready**: Containerized deployment with orchestration support

## Supported Services

- **Payments**: Stripe
- **Banking/Financial Data**: Plaid
- **Identity Verification**: Jumio, Onfido
- **Credit Scoring**: Experian, Equifax
- **Address Verification**: Google Maps
- **Messaging**: Twilio (SMS/WhatsApp)
- **Email**: SendGrid, AWS SES
- **File Storage**: AWS S3
- **Blockchain Data**: Web3 providers (Ethereum, Polygon, BSC, Arbitrum)
- **Authentication**: OAuth providers (Google, Facebook, Apple)

## Architecture

```
Client → Aggregation Service → Third-party APIs
         │
         ├─ Rate Limiting
         ├─ Request/Response Transformation
         ├─ Caching Layer (Redis)
         ├─ Circuit Breaker Pattern
         └─ Logging & Monitoring
```

## Installation

```bash
# Install dependencies
npm install

# Build TypeScript code
npm run build

# Start the service
npm start

# Development mode with hot reload
npm run dev
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Redis Connection
REDIS_URL=redis://localhost:6379

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key

# Plaid
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox

# Jumio
JUMIO_API_TOKEN=your_jumio_api_token
JUMIO_API_SECRET=your_jumio_api_secret

# Onfido
ONFIDO_API_TOKEN=your_onfido_api_token

# Credit Bureaus
EXPERIAN_CLIENT_ID=your_experian_client_id
EXPERIAN_CLIENT_SECRET=your_experian_client_secret
EQUIFAX_CLIENT_ID=your_equifax_client_id
EQUIFAX_CLIENT_SECRET=your_equifax_client_secret

# Google Maps
GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# Twilio
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_VERIFY_SERVICE_SID=your_twilio_verify_service_sid

# Email Services
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=your_sendgrid_from_email
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
AWS_REGION=your_aws_region
AWS_S3_BUCKET=your_aws_s3_bucket

# Web3 Providers
ETHEREUM_RPC_URL=your_ethereum_rpc_url
POLYGON_RPC_URL=your_polygon_rpc_url
BSC_RPC_URL=your_bsc_rpc_url
ARBITRUM_RPC_URL=your_arbitrum_rpc_url
INFURA_PROJECT_ID=your_infura_project_id

# OAuth Providers
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=your_google_redirect_uri
FACEBOOK_CLIENT_ID=your_facebook_client_id
FACEBOOK_CLIENT_SECRET=your_facebook_client_secret
APPLE_CLIENT_ID=your_apple_client_id
APPLE_CLIENT_SECRET=your_apple_client_secret
```

## API Endpoints

### Health Check
```
GET /health
```

### GraphQL Endpoint
```
POST /graphql
```

## Docker Deployment

```bash
# Build the Docker image
docker build -t aggregation-service .

# Run the container
docker run -p 3000:3000 --env-file .env aggregation-service
```

## Docker Compose

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down
```

## Kubernetes Deployment

```bash
# Apply the Kubernetes manifests
kubectl apply -f kubernetes/aggregation-service/

# Check deployment status
kubectl get deployments aggregation-service

# View service logs
kubectl logs -f deployment/aggregation-service
```

## Monitoring & Logging

The service uses Winston for structured logging with the following levels:
- error
- warn
- info
- http
- verbose
- debug
- silly

Logs are output to both console and rotating file storage.

## Testing

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch
```

## License

MIT