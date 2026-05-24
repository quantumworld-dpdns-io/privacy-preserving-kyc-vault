export interface InvoicingConfig {
  port: number;
  host: string;
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyWebsite: string;
  brandColor: string;
  logoUrl?: string;
  defaultDueDays: number;
  invoicePrefix: string;
  storagePath: string;
}

export function loadConfig(): InvoicingConfig {
  const env = process.env;

  return {
    port: parseInt(env.INVOICING_PORT || '3060', 10),
    host: env.INVOICING_HOST || '0.0.0.0',
    companyName: env.COMPANY_NAME || 'KYC Vault Inc.',
    companyAddress: env.COMPANY_ADDRESS || '100 Crypto Street, San Francisco, CA 94105, US',
    companyEmail: env.COMPANY_EMAIL || 'support@kyc-vault.com',
    companyWebsite: env.COMPANY_WEBSITE || 'https://kyc-vault.com',
    brandColor: env.BRAND_COLOR || '#1a56db',
    logoUrl: env.LOGO_URL || '',
    defaultDueDays: parseInt(env.INVOICE_DUE_DAYS || '30', 10),
    invoicePrefix: env.INVOICE_PREFIX || 'INV',
    storagePath: env.INVOICE_STORAGE_PATH || '/data/invoices',
  };
}
