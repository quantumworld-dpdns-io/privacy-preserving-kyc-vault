import fs from 'fs/promises';
import path from 'path';

export interface LegacyCredential {
  id: string;
  type: string;
  subject: string;
  issuer: string;
  issuedAt: string;
  expiresAt?: string;
  attributes: Record<string, unknown>;
  signature?: string;
  format: 'json' | 'xml' | 'csv' | 'custom';
  source: string;
}

export interface LegacySystemConfig {
  name: string;
  type: 'database' | 'filesystem' | 'api' | 'ldap';
  connectionString?: string;
  basePath?: string;
  apiEndpoint?: string;
  apiKey?: string;
  format: 'json' | 'xml' | 'csv' | 'custom';
  schema: Record<string, string>;
}

export interface ImportResult {
  totalFound: number;
  totalImported: number;
  totalFailed: number;
  errors: ImportError[];
  importedCredentials: LegacyCredential[];
  startedAt: string;
  completedAt: string;
}

export interface ImportError {
  sourceId: string;
  message: string;
  code: string;
  recoverable: boolean;
}

export interface MigrationMapping {
  sourceField: string;
  targetField: string;
  transform?: (value: unknown) => unknown;
  required?: boolean;
  defaultValue?: unknown;
}

export class LegacyImporter {
  private mappings: Map<string, MigrationMapping[]> = new Map();
  private defaultMapping: MigrationMapping[] = [];

  constructor() {
    this.registerDefaultMappings();
  }

  private registerDefaultMappings(): void {
    this.defaultMapping = [
      { sourceField: 'id', targetField: 'id', required: true },
      { sourceField: 'type', targetField: 'type', required: true },
      { sourceField: 'subject', targetField: 'subject', required: true },
      { sourceField: 'subject_id', targetField: 'subject', required: false },
      { sourceField: 'issuer', targetField: 'issuer', required: true },
      { sourceField: 'issued_at', targetField: 'issuedAt', required: true },
      { sourceField: 'issuedDate', targetField: 'issuedAt' },
      { sourceField: 'created_at', targetField: 'issuedAt' },
      { sourceField: 'expires_at', targetField: 'expiresAt' },
      { sourceField: 'expiryDate', targetField: 'expiresAt' },
      { sourceField: 'valid_until', targetField: 'expiresAt' },
      { sourceField: 'signature', targetField: 'signature' },
      { sourceField: 'format', targetField: 'format', defaultValue: 'json' },
    ];
  }

  registerMapping(systemName: string, mappings: MigrationMapping[]): void {
    this.mappings.set(systemName, mappings);
  }

  async importFromDirectory(dirPath: string, systemName: string, format: string): Promise<ImportResult> {
    const startedAt = new Date().toISOString();
    const errors: ImportError[] = [];
    const imported: LegacyCredential[] = [];
    let totalFound = 0;

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (ext !== '.json' && ext !== '.xml' && ext !== '.csv') continue;

      totalFound++;
      const filePath = path.join(dirPath, entry.name);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const records = await this.parseFile(content, format, ext);
        const systemMappings = this.mappings.get(systemName) || this.defaultMapping;

        for (const record of records) {
          try {
            const credential = this.mapToCredential(record as Record<string, unknown>, systemMappings, systemName);
            imported.push(credential);
          } catch (mapErr) {
            errors.push({
              sourceId: `${entry.name}:${(record as Record<string, string>).id || 'unknown'}`,
              message: (mapErr as Error).message,
              code: 'MAPPING_FAILED',
              recoverable: true,
            });
          }
        }
      } catch (fileErr) {
        errors.push({
          sourceId: entry.name,
          message: (fileErr as Error).message,
          code: 'READ_FAILED',
          recoverable: true,
        });
      }
    }

    return {
      totalFound,
      totalImported: imported.length,
      totalFailed: errors.length,
      errors,
      importedCredentials: imported,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  async importFromFile(filePath: string, systemName: string, format: string): Promise<ImportResult> {
    const startedAt = new Date().toISOString();
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();
    const records = await this.parseFile(content, format, ext);
    const errors: ImportError[] = [];
    const imported: LegacyCredential[] = [];
    const systemMappings = this.mappings.get(systemName) || this.defaultMapping;

    for (const record of records) {
      try {
        const credential = this.mapToCredential(record as Record<string, unknown>, systemMappings, systemName);
        imported.push(credential);
      } catch (mapErr) {
        errors.push({
          sourceId: path.basename(filePath),
          message: (mapErr as Error).message,
          code: 'MAPPING_FAILED',
          recoverable: true,
        });
      }
    }

    return {
      totalFound: records.length,
      totalImported: imported.length,
      totalFailed: errors.length,
      errors,
      importedCredentials: imported,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  async parseFile(content: string, format: string, extension: string): Promise<Record<string, unknown>[]> {
    switch (format) {
      case 'json': {
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : [parsed];
      }
      case 'csv': {
        return this.parseCsv(content);
      }
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private parseCsv(content: string): Record<string, unknown>[] {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim());
    const records: Record<string, unknown>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        record[header] = values[index] || '';
      });
      records.push(record);
    }

    return records;
  }

  mapToCredential(
    source: Record<string, unknown>,
    mappings: MigrationMapping[],
    systemName: string,
  ): LegacyCredential {
    const result: Record<string, unknown> = {
      attributes: {},
      source: systemName,
    };

    for (const mapping of mappings) {
      let value = source[mapping.sourceField];

      if (value === undefined || value === null) {
        if (mapping.required) {
          throw new Error(`Required field '${mapping.sourceField}' not found in source data`);
        }
        if (mapping.defaultValue !== undefined) {
          value = mapping.defaultValue;
        } else {
          continue;
        }
      }

      if (mapping.transform) {
        value = mapping.transform(value);
      }

      if (mapping.targetField === 'attributes') {
        Object.assign(result.attributes as Record<string, unknown>, value as Record<string, unknown>);
      } else {
        result[mapping.targetField] = value;
      }
    }

    return result as unknown as LegacyCredential;
  }
}
