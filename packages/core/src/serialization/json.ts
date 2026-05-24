export function toJSON<T>(value: T, pretty = false): string {
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

export function fromJSON<T>(json: string): T {
  return JSON.parse(json) as T;
}

export function safeFromJSON<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function toJSONBuffer<T>(value: T): Buffer {
  return Buffer.from(JSON.stringify(value), 'utf-8');
}

export function fromJSONBuffer<T>(buffer: Buffer): T {
  return JSON.parse(buffer.toString('utf-8')) as T;
}

export function safeFromJSONBuffer<T>(buffer: Buffer, fallback: T): T {
  try {
    return JSON.parse(buffer.toString('utf-8')) as T;
  } catch {
    return fallback;
  }
}

export function jsonSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf-8');
}

export function isJSON(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  additionalProperties?: boolean;
}

export function validateJSON(value: unknown, schema: JSONSchema): boolean {
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const obj = value as Record<string, unknown>;
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in obj)) return false;
      }
    }
    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (key in obj && !validateJSON(obj[key], prop)) return false;
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(obj)) {
        if (!(key in schema.properties)) return false;
      }
    }
    return true;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return false;
    if (schema.items) {
      for (const item of value) {
        if (!validateJSON(item, schema.items)) return false;
      }
    }
    return true;
  }
  if (schema.type === 'string') return typeof value === 'string';
  if (schema.type === 'number') return typeof value === 'number';
  if (schema.type === 'boolean') return typeof value === 'boolean';
  if (schema.type === 'integer') return Number.isInteger(value);
  if (schema.type === 'null') return value === null;
  return false;
}
