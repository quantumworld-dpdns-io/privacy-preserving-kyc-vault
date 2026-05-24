export type AvroType =
  | 'null'
  | 'boolean'
  | 'int'
  | 'long'
  | 'float'
  | 'double'
  | 'bytes'
  | 'string'
  | { type: 'record'; name: string; fields: AvroField[] }
  | { type: 'enum'; name: string; symbols: string[] }
  | { type: 'array'; items: AvroType }
  | { type: 'map'; values: AvroType }
  | { type: 'fixed'; name: string; size: number }
  | AvroType[];

export interface AvroField {
  name: string;
  type: AvroType;
  default?: unknown;
}

export interface AvroSchema {
  type: 'record';
  name: string;
  namespace?: string;
  doc?: string;
  fields: AvroField[];
}

export class AvroEncoder {
  constructor(private schema: AvroSchema) {}

  encode(value: Record<string, unknown>): Buffer {
    const chunks: Buffer[] = [];
    this.encodeRecord(value, this.schema, chunks);
    return Buffer.concat(chunks);
  }

  encodeMany(values: Record<string, unknown>[]): Buffer {
    const chunks: Buffer[] = [];
    for (const v of values) {
      this.encodeRecord(v, this.schema, chunks);
    }
    return Buffer.concat(chunks);
  }

  private encodeRecord(value: Record<string, unknown>, schema: AvroSchema, chunks: Buffer[]): void {
    for (const field of schema.fields) {
      const fieldValue = value[field.name] ?? field.default;
      if (fieldValue === undefined || fieldValue === null) {
        this.encodeNull(chunks);
      } else {
        this.encodeValue(fieldValue, field.type, chunks);
      }
    }
  }

  private encodeValue(value: unknown, type: AvroType, chunks: Buffer[]): void {
    if (typeof type === 'string') {
      switch (type) {
        case 'null':
          break;
        case 'boolean':
          chunks.push(Buffer.from([value ? 1 : 0]));
          break;
        case 'int':
        case 'long':
          this.encodeLong(value as number, chunks);
          break;
        case 'float': {
          const buf = Buffer.alloc(4);
          buf.writeFloatLE(value as number);
          chunks.push(buf);
          break;
        }
        case 'double': {
          const buf = Buffer.alloc(8);
          buf.writeDoubleLE(value as number);
          chunks.push(buf);
          break;
        }
        case 'bytes': {
          const data = value instanceof Buffer ? value : Buffer.from(value as string, 'utf-8');
          this.encodeLong(data.length, chunks);
          chunks.push(data);
          break;
        }
        case 'string': {
          const data = Buffer.from(value as string, 'utf-8');
          this.encodeLong(data.length, chunks);
          chunks.push(data);
          break;
        }
      }
    } else if (Array.isArray(type)) {
      for (const unionType of type) {
        if (this.matchesType(value, unionType)) {
          this.encodeValue(value, unionType, chunks);
          break;
        }
      }
    } else if ('type' in type) {
      switch (type.type) {
        case 'record':
          this.encodeRecord(value as Record<string, unknown>, type as AvroSchema, chunks);
          break;
        case 'array': {
          const arr = value as unknown[];
          this.encodeLong(arr.length, chunks);
          for (const item of arr) {
            this.encodeValue(item, type.items, chunks);
          }
          break;
        }
        case 'map': {
          const map = value as Record<string, unknown>;
          const keys = Object.keys(map);
          this.encodeLong(keys.length, chunks);
          for (const key of keys) {
            this.encodeString(key, chunks);
            this.encodeValue(map[key], type.values, chunks);
          }
          break;
        }
        case 'enum':
          this.encodeLong(type.symbols.indexOf(value as string), chunks);
          break;
        case 'fixed':
          chunks.push(Buffer.from(value as ArrayBuffer));
          break;
      }
    }
  }

  private encodeLong(value: number, chunks: Buffer[]): void {
    const bytes: number[] = [];
    let v = value < 0 ? -1 - (value << 1) : value << 1;
    while (v > 0x7f) {
      bytes.push((v & 0x7f) | 0x80);
      v >>= 7;
    }
    bytes.push(v & 0x7f);
    chunks.push(Buffer.from(bytes));
  }

  private encodeString(value: string, chunks: Buffer[]): void {
    const data = Buffer.from(value, 'utf-8');
    this.encodeLong(data.length, chunks);
    chunks.push(data);
  }

  private encodeNull(chunks: Buffer[]): void {
    chunks.push(Buffer.from([0]));
  }

  private matchesType(value: unknown, type: AvroType): boolean {
    if (type === 'null') return value === null || value === undefined;
    if (type === 'boolean') return typeof value === 'boolean';
    if (type === 'int') return Number.isInteger(value);
    if (type === 'long') return typeof value === 'number';
    if (type === 'float' || type === 'double') return typeof value === 'number';
    if (type === 'bytes') return value instanceof Buffer || value instanceof Uint8Array;
    if (type === 'string') return typeof value === 'string';
    if (typeof type === 'object' && !Array.isArray(type)) {
      if (type.type === 'record') return typeof value === 'object' && value !== null;
      if (type.type === 'array') return Array.isArray(value);
      if (type.type === 'map') return typeof value === 'object' && value !== null;
      if (type.type === 'enum') return typeof value === 'string';
    }
    return false;
  }
}

export class AvroDecoder {
  private offset = 0;

  constructor(private schema: AvroSchema) {}

  decode(buffer: Buffer): Record<string, unknown> {
    this.offset = 0;
    return this.decodeRecord(buffer, this.schema);
  }

  decodeMany(buffer: Buffer, count: number): Record<string, unknown>[] {
    this.offset = 0;
    const results: Record<string, unknown>[] = [];
    for (let i = 0; i < count; i++) {
      results.push(this.decodeRecord(buffer, this.schema));
    }
    return results;
  }

  private decodeRecord(buffer: Buffer, schema: AvroSchema): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const field of schema.fields) {
      result[field.name] = this.decodeValue(buffer, field.type);
    }
    return result;
  }

  private decodeValue(buffer: Buffer, type: AvroType): unknown {
    if (typeof type === 'string') {
      switch (type) {
        case 'null': return null;
        case 'boolean': return buffer[this.offset++] !== 0;
        case 'int':
        case 'long': return this.decodeLong(buffer);
        case 'float': {
          const value = buffer.readFloatLE(this.offset);
          this.offset += 4;
          return value;
        }
        case 'double': {
          const value = buffer.readDoubleLE(this.offset);
          this.offset += 8;
          return value;
        }
        case 'bytes': {
          const len = this.decodeLong(buffer);
          const data = Buffer.from(buffer.subarray(this.offset, this.offset + len));
          this.offset += len;
          return data;
        }
        case 'string': {
          const len = this.decodeLong(buffer);
          const str = buffer.subarray(this.offset, this.offset + len).toString('utf-8');
          this.offset += len;
          return str;
        }
      }
    } else if (Array.isArray(type)) {
      return this.decodeValue(buffer, type[0]);
    } else {
      switch (type.type) {
        case 'record':
          return this.decodeRecord(buffer, type as AvroSchema);
        case 'array': {
          const len = this.decodeLong(buffer);
          const arr: unknown[] = [];
          for (let i = 0; i < len; i++) {
            arr.push(this.decodeValue(buffer, type.items));
          }
          return arr;
        }
        case 'map': {
          const len = this.decodeLong(buffer);
          const map: Record<string, unknown> = {};
          for (let i = 0; i < len; i++) {
            const key = this.decodeValue(buffer, 'string') as string;
            map[key] = this.decodeValue(buffer, type.values);
          }
          return map;
        }
        case 'enum': {
          const idx = this.decodeLong(buffer);
          return type.symbols[idx];
        }
        case 'fixed': {
          const data = Buffer.from(buffer.subarray(this.offset, this.offset + type.size));
          this.offset += type.size;
          return data;
        }
      }
    }
    return null;
  }

  private decodeLong(buffer: Buffer): number {
    let value = 0;
    let shift = 0;
    while (true) {
      const byte = buffer[this.offset++];
      value |= (byte & 0x7f) << shift;
      shift += 7;
      if (!(byte & 0x80)) break;
    }
    return (value >>> 1) ^ -(value & 1);
  }
}

export function encodeAvro(schema: AvroSchema, value: Record<string, unknown>): Buffer {
  return new AvroEncoder(schema).encode(value);
}

export function decodeAvro(schema: AvroSchema, buffer: Buffer): Record<string, unknown> {
  return new AvroDecoder(schema).decode(buffer);
}

export function avroToJSON(schema: AvroSchema): Record<string, unknown> {
  return JSON.parse(JSON.stringify(schema));
}
