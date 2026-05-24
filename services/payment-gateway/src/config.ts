export interface PaymentGatewayConfig {
  port: number;
  host: string;
  stripe: {
    secretKey: string;
    webhookSecret: string;
    publishableKey: string;
  };
  paddle: {
    vendorId: string;
    apiKey: string;
    webhookSecret: string;
  };
  usdc: {
    rpcUrl: string;
    contractAddress: string;
    walletAddress: string;
    chainId: number;
  };
  eth: {
    rpcUrl: string;
    walletAddress: string;
    chainId: number;
  };
  maxRetries: number;
  idempotencyTtlMs: number;
}

export function loadConfig(): PaymentGatewayConfig {
  const env = process.env;

  return {
    port: parseInt(env.PAYMENT_GATEWAY_PORT || '3050', 10),
    host: env.PAYMENT_GATEWAY_HOST || '0.0.0.0',
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY || 'sk_test_placeholder',
      webhookSecret: env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder',
      publishableKey: env.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder',
    },
    paddle: {
      vendorId: env.PADDLE_VENDOR_ID || '',
      apiKey: env.PADDLE_API_KEY || '',
      webhookSecret: env.PADDLE_WEBHOOK_SECRET || '',
    },
    usdc: {
      rpcUrl: env.USDC_RPC_URL || 'https://mainnet.infura.io/v3/placeholder',
      contractAddress: env.USDC_CONTRACT_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      walletAddress: env.USDC_WALLET_ADDRESS || '',
      chainId: parseInt(env.USDC_CHAIN_ID || '1', 10),
    },
    eth: {
      rpcUrl: env.ETH_RPC_URL || 'https://mainnet.infura.io/v3/placeholder',
      walletAddress: env.ETH_WALLET_ADDRESS || '',
      chainId: parseInt(env.ETH_CHAIN_ID || '1', 10),
    },
    maxRetries: parseInt(env.PAYMENT_MAX_RETRIES || '3', 10),
    idempotencyTtlMs: parseInt(env.IDEMPOTENCY_TTL_MS || '86400000', 10),
  };
}
