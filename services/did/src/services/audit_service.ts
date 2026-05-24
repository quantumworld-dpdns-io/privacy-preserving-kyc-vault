import { randomUUID, createHash } from 'node:crypto';
import { AuditLogEntry, UUID } from '../types/index.js';

interface ChainedAuditEntry extends AuditLogEntry {
  chainHash: string;
  previousHash: string;
}

export interface AuditQuery {
  action?: string;
  severity?: string;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  success?: boolean;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

export class AuditService {
  private chain: ChainedAuditEntry[] = [];
  private genesisHash: string;

  constructor() {
    this.genesisHash = createHash('sha256').update('KYC-VAULT-AUDIT-GENESIS').digest('hex');
  }

  async log(entry: Omit<AuditLogEntry, 'auditId' | 'chainHash' | 'previousHash' | 'timestamp'>): Promise<AuditLogEntry> {
    const previousEntry = this.chain[this.chain.length - 1];
    const previousHash = previousEntry ? previousEntry.chainHash : this.genesisHash;

    const timestamp = new Date().toISOString();
    const chainedEntry: ChainedAuditEntry = {
      ...entry,
      auditId: randomUUID() as UUID,
      chainHash: '',
      previousHash,
      timestamp,
    };

    const chainPayload = `${timestamp}:${entry.action}:${entry.actorId}:${entry.resourceType}:${previousHash}`;
    chainedEntry.chainHash = createHash('sha256').update(chainPayload).digest('hex');

    this.chain.push(chainedEntry);
    return chainedEntry;
  }

  async query(query: AuditQuery): Promise<{ data: AuditLogEntry[]; total: number; page: number; limit: number }> {
    let results = [...this.chain];

    if (query.action) {
      results = results.filter((e) => e.action === query.action);
    }
    if (query.severity) {
      results = results.filter((e) => e.severity === query.severity);
    }
    if (query.actorId) {
      results = results.filter((e) => e.actorId === query.actorId);
    }
    if (query.resourceType) {
      results = results.filter((e) => e.resourceType === query.resourceType);
    }
    if (query.resourceId) {
      results = results.filter((e) => e.resourceId === query.resourceId);
    }
    if (query.success !== undefined) {
      results = results.filter((e) => e.success === query.success);
    }
    if (query.from) {
      results = results.filter((e) => e.timestamp >= query.from!);
    }
    if (query.to) {
      results = results.filter((e) => e.timestamp <= query.to!);
    }

    const total = results.length;
    const start = (query.page - 1) * query.limit;
    const data = results.slice(start, start + query.limit);

    return { data, total, page: query.page, limit: query.limit };
  }

  async verifyChainIntegrity(): Promise<{ valid: boolean; brokenLinks: number; entriesChecked: number }> {
    let brokenLinks = 0;

    for (let i = 0; i < this.chain.length; i++) {
      const entry = this.chain[i];
      const expectedPreviousHash = i === 0 ? this.genesisHash : this.chain[i - 1].chainHash;

      if (entry.previousHash !== expectedPreviousHash) {
        brokenLinks++;
      }

      const chainPayload = `${entry.timestamp}:${entry.action}:${entry.actorId}:${entry.resourceType}:${entry.previousHash}`;
      const expectedHash = createHash('sha256').update(chainPayload).digest('hex');

      if (entry.chainHash !== expectedHash) {
        brokenLinks++;
      }
    }

    return {
      valid: brokenLinks === 0,
      brokenLinks,
      entriesChecked: this.chain.length,
    };
  }

  async export(format: 'json' | 'csv' = 'json', query?: AuditQuery): Promise<string> {
    const data = query ? (await this.query(query)).data : this.chain;

    if (format === 'csv') {
      const headers = Object.keys(data[0] || {}).join(',');
      const rows = data.map((entry) =>
        Object.values(entry)
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      );
      return [headers, ...rows].join('\n');
    }

    return JSON.stringify(data, null, 2);
  }
}
