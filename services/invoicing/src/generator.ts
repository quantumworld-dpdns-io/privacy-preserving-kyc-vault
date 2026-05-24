import { randomUUID } from 'node:crypto';

export interface InvoiceData {
  invoiceId: string;
  customerName: string;
  customerEmail: string;
  billingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode?: string;
    country: string;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    total: string;
  }>;
  subtotal: string;
  tax: string;
  taxRate: string;
  total: string;
  currency: string;
  createdAt: string;
  dueDate: string;
}

interface PdfDocument {
  pages: PdfPage[];
}

interface PdfPage {
  elements: PdfElement[];
}

interface PdfElement {
  type: 'text' | 'line' | 'rect' | 'table';
  x: number;
  y: number;
  width?: number;
  height?: number;
  content?: string;
  fontSize?: number;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
  headers?: string[];
  rows?: string[][];
  colWidths?: number[];
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const BRAND_COLOR = '#1a56db';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export async function generateInvoicePdf(data: InvoiceData): Promise<string> {
  const doc: PdfDocument = { pages: [] };
  const elements: PdfElement[] = [];
  let y = PAGE_HEIGHT - MARGIN;

  elements.push({
    type: 'rect',
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: 80,
    color: BRAND_COLOR,
  });

  elements.push({
    type: 'text',
    x: MARGIN,
    y: 50,
    content: 'KYC VAULT',
    fontSize: 24,
    bold: true,
    color: '#ffffff',
  });

  y = 110;
  elements.push({
    type: 'text',
    x: MARGIN,
    y,
    content: 'INVOICE',
    fontSize: 28,
    bold: true,
    color: BRAND_COLOR,
  });

  y += 20;
  elements.push({
    type: 'text',
    x: MARGIN,
    y,
    content: `#${data.invoiceId}`,
    fontSize: 14,
    color: '#666666',
  });

  const rightColX = PAGE_WIDTH - MARGIN - 200;
  y = 110;
  elements.push({
    type: 'text',
    x: rightColX,
    y,
    content: 'Date:',
    fontSize: 10,
    color: '#666666',
  });
  elements.push({
    type: 'text',
    x: rightColX + 60,
    y,
    content: formatDate(data.createdAt),
    fontSize: 10,
  });

  y += 15;
  elements.push({
    type: 'text',
    x: rightColX,
    y,
    content: 'Due Date:',
    fontSize: 10,
    color: '#666666',
  });
  elements.push({
    type: 'text',
    x: rightColX + 60,
    y,
    content: formatDate(data.dueDate),
    fontSize: 10,
  });

  y += 40;
  elements.push({
    type: 'text',
    x: MARGIN,
    y,
    content: 'Bill To:',
    fontSize: 12,
    bold: true,
    color: BRAND_COLOR,
  });

  y += 18;
  const addrLines = [
    data.customerName,
    data.billingAddress.line1,
    data.billingAddress.line2,
    `${data.billingAddress.city}${data.billingAddress.state ? ', ' + data.billingAddress.state : ''} ${data.billingAddress.postalCode || ''}`.trim(),
    data.billingAddress.country,
    data.customerEmail,
  ].filter(Boolean);

  for (const line of addrLines) {
    elements.push({
      type: 'text',
      x: MARGIN,
      y,
      content: line,
      fontSize: 10,
    });
    y += 14;
  }

  y += 30;
  const headers = ['Description', 'Qty', 'Unit Price', 'Total'];
  const colWidths = [250, 50, 100, 100];
  const rows = data.items.map((item) => [
    item.description,
    String(item.quantity),
    `${data.currency} ${item.unitPrice}`,
    `${data.currency} ${item.total}`,
  ]);

  elements.push({
    type: 'table',
    x: MARGIN,
    y,
    headers,
    rows,
    colWidths,
  });

  const tableHeight = (rows.length + 1) * 24;
  y += tableHeight + 20;

  const summaryX = PAGE_WIDTH - MARGIN - 200;
  elements.push({
    type: 'text',
    x: summaryX,
    y,
    content: 'Subtotal:',
    fontSize: 11,
    color: '#666666',
  });
  elements.push({
    type: 'text',
    x: summaryX + 120,
    y,
    content: `${data.currency} ${data.subtotal}`,
    fontSize: 11,
    align: 'right',
  });

  y += 18;
  elements.push({
    type: 'text',
    x: summaryX,
    y,
    content: `Tax (${(parseFloat(data.taxRate) * 100).toFixed(1)}%):`,
    fontSize: 11,
    color: '#666666',
  });
  elements.push({
    type: 'text',
    x: summaryX + 120,
    y,
    content: `${data.currency} ${data.tax}`,
    fontSize: 11,
    align: 'right',
  });

  y += 24;
  const totalY = y;
  elements.push({
    type: 'line',
    x: summaryX,
    y,
    width: 200,
  });

  y += 6;
  elements.push({
    type: 'text',
    x: summaryX,
    y,
    content: 'Total Due:',
    fontSize: 14,
    bold: true,
  });
  elements.push({
    type: 'text',
    x: summaryX + 120,
    y,
    content: `${data.currency} ${data.total}`,
    fontSize: 14,
    bold: true,
    align: 'right',
  });

  y = totalY + 60;

  elements.push({
    type: 'line',
    x: MARGIN,
    y,
    width: PAGE_WIDTH - 2 * MARGIN,
    color: '#dddddd',
  });

  y += 16;
  elements.push({
    type: 'text',
    x: MARGIN,
    y,
    content: 'KYC Vault Inc. | support@kyc-vault.com | https://kyc-vault.com',
    fontSize: 9,
    color: '#999999',
  });
  y += 12;
  elements.push({
    type: 'text',
    x: MARGIN,
    y,
    content: 'Thank you for your business!',
    fontSize: 9,
    color: '#999999',
  });

  doc.pages.push({ elements });
  return Buffer.from(JSON.stringify(doc)).toString('base64');
}
