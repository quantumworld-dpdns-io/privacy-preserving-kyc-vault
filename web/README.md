# KYC Vault Web Dashboard

A modern Nuxt 3 frontend for managing the Privacy-Preserving KYC Vault.

## Features

- **Dashboard**: Real-time service status and system metrics.
- **DID Registry**: Interface for identity resolution and registration.
- **KYC Workflows**: Pipeline management for identity verification.
- **ZKP Demo**: Client-side proof generation and service-side verification.
- **Dark Mode**: Professional, high-contrast dark theme using Tailwind CSS.

## Setup

1. **Install Dependencies**:
   ```bash
   pnpm install
   ```

2. **Configuration**:
   Copy `.env.example` to `.env` and set the `NUXT_PUBLIC_API_BASE`.
   Default: `https://localhost/api/v1` (via Nginx gateway).

3. **Run Development Server**:
   ```bash
   pnpm dev
   ```

4. **Build for Production**:
   ```bash
   pnpm build
   ```

## Integration

The frontend communicates with the backend services through the **Nginx API Gateway**. Ensure the gateway and microservices are running (e.g., via `docker-compose up`).

*Note: Since the gateway uses self-signed certificates for development, you may need to trust the certificate in your browser.*
