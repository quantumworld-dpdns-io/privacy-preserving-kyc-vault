const MAJOR_TYPE_MASK = 0xe0;
const ADDITIONAL_MASK = 0x1f;
const ADDITIONAL_MAX_7BIT = 23;

const MAJOR_UNSIGNED = 0x00;
const MAJOR_NEGATIVE = 0x20;
const MAJOR_BYTES = 0x40;
const MAJOR_TEXT = 0x60;
const MAJOR_ARRAY = 0x80;
const MAJOR_MAP = 0xa0;
const MAJOR_TAG = 0xc0;
const MAJOR_SIMPLE = 0xe0;

const SIMPLE_FALSE = 20;
const SIMPLE_TRUE = 21;
const SIMPLE_NULL = 22;
const SIMPLE_UNDEFINED = 23;

const TAG_DATE = 0;
const TAG_EPOCH = 1;
const TAG_BIGNUM = 2;
const TAG_NEGBIGNUM = 3;
const TAG_DECIMAL = 4;
const TAG_CBOR = 24;

export class CBOREncoder {
  encode(value: unknown): Buffer {
    const chunks: Buffer[] = [];
    this.encodeInternal(value, chunks);
    return Buffer.concat(chunks);
  }

  private encodeInternal(value: unknown, chunks: Buffer[]): void {
    if (value === null) {
      this.encodeSimple(SIMPLE_NULL, chunks);
    } else if (value === undefined) {
      this.encodeSimple(SIMPLE_UNDEFINED, chunks);
    } else if (value === true) {
      this.encodeSimple(SIMPLE_TRUE, chunks);
    } else if (value === false) {
      this.encodeSimple(SIMPLE_FALSE, chunks);
    } else if (typeof value === 'number') {
      if (Number.isInteger(value) && value >= 0) {
        this.encodeUnsigned(value, chunks);
      } else if (Number.isInteger(value) && value < 0) {
        this.encodeNegative(value, chunks);
      } else {
        this.encodeFloat(value, chunks);
      }
    } else if (typeof value === 'string') {
      this.encodeText(value, chunks);
    } else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes = new Uint8Array(value as ArrayBufferLike);
      this.encodeBytes(Buffer.from(bytes), chunks);
    } else if (Buffer.isBuffer(value)) {
      this.encodeBytes(value, chunks);
    } else if (Array.isArray(value)) {
      this.encodeArray(value, chunks);
    } else if (typeof value === 'object') {
      this.encodeMap(value as Record<string, unknown>, chunks);
    }
  }

  private encodeHeader(major: number, additional: number, chunks: Buffer[]): void {
    if (additional <= ADDITIONAL_MAX_7BIT) {
      chunks.push(Buffer.from([major | additional]));
    } else if (additional <= 0xff) {
      chunks.push(Buffer.from([major | 24, additional]));
    } else if (additional <= 0xffff) {
      const buf = Buffer.alloc(3);
      buf[0] = major | 25;
      buf.writeUInt16BE(additional, 1);
      chunks.push(buf);
    } else if (additional <= 0xffffffff) {
      const buf = Buffer.alloc(5);
      buf[0] = major | 26;
      buf.writeUInt32BE(additional, 1);
      chunks.push(buf);
    } else {
      const buf = Buffer.alloc(9);
      buf[0] = major | 27;
      buf.writeBigUint64BE(BigInt(additional), 1);
      chunks.push(buf);
    }
  }

  private encodeUnsigned(value: number, chunks: Buffer[]): void {
    this.encodeHeader(MAJOR_UNSIGNED, value, chunks);
  }

  private encodeNegative(value: number, chunks: Buffer[]): void {
    this.encodeHeader(MAJOR_NEGATIVE, -1 - value, chunks);
  }

  private encodeFloat(value: number, chunks: Buffer[]): void {
    const buf = Buffer.alloc(9);
    buf[0] = MAJOR_SIMPLE | 27;
    buf.writeDoubleBE(value, 1);
    chunks.push(buf);
  }

  private encodeBytes(value: Buffer, chunks: Buffer[]): void {
    this.encodeHeader(MAJOR_BYTES, value.length, chunks);
    chunks.push(value);
  }

  private encodeText(value: string, chunks: Buffer[]): void {
    const bytes = Buffer.from(value, 'utf-8');
    this.encodeHeader(MAJOR_TEXT, bytes.length, chunks);
    chunks.push(bytes);
  }

  private encodeArray(value: unknown[], chunks: Buffer[]): void {
    this.encodeHeader(MAJOR_ARRAY, value.length, chunks);
    for (const item of value) {
      this.encodeInternal(item, chunks);
    }
  }

  private encodeMap(value: Record<string, unknown>, chunks: Buffer[]): void {
    const keys = Object.keys(value);
    this.encodeHeader(MAJOR_MAP, keys.length, chunks);
    for (const key of keys) {
      this.encodeText(key, chunks);
      this.encodeInternal(value[key], chunks);
    }
  }

  private encodeSimple(value: number, chunks: Buffer[]): void {
    this.encodeHeader(MAJOR_SIMPLE, value, chunks);
  }
}

export class CBORDecoder {
  private offset = 0;

  decode(buffer: Buffer): unknown {
    this.offset = 0;
    return this.decodeInternal(buffer);
  }

  private decodeInternal(buffer: Buffer): unknown {
    const first = buffer[this.offset++];
    if (first === undefined) throw new Error('Unexpected end of CBOR data');
    const major = first & MAJOR_TYPE_MASK;
    let additional = first & ADDITIONAL_MASK;
    if (additional >= 24 && additional <= 27) {
      additional = this.readExtra(buffer, additional);
    }
    switch (major) {
      case MAJOR_UNSIGNED: return additional;
      case MAJOR_NEGATIVE: return -1 - additional;
      case MAJOR_BYTES: return this.readBytes(buffer, additional);
      case MAJOR_TEXT: return this.readText(buffer, additional);
      case MAJOR_ARRAY: return this.readArray(buffer, additional);
      case MAJOR_MAP: return this.readMap(buffer, additional);
      case MAJOR_TAG: return this.readTag(buffer, additional);
      case MAJOR_SIMPLE: return this.readSimple(additional);
      default: throw new Error(`Unknown major type: ${major}`);
    }
  }

  private readExtra(buffer: Buffer, additional: number): number {
    const size = 1 << (additional - 24);
    const buf = buffer.subarray(this.offset, this.offset + size);
    this.offset += size;
    if (size === 1) return buf.readUInt8();
    if (size === 2) return buf.readUInt16BE();
    if (size === 4) return buf.readUInt32BE();
    return Number(buf.readBigUint64BE());
  }

  private readBytes(buffer: Buffer, length: number): Buffer {
    const result = buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return Buffer.from(result);
  }

  private readText(buffer: Buffer, length: number): string {
    const result = buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return result.toString('utf-8');
  }

  private readArray(buffer: Buffer, length: number): unknown[] {
    const result: unknown[] = [];
    for (let i = 0; i < length; i++) {
      result.push(this.decodeInternal(buffer));
    }
    return result;
  }

  private readMap(buffer: Buffer, length: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (let i = 0; i < length; i++) {
      const key = this.decodeInternal(buffer) as string;
      result[key] = this.decodeInternal(buffer);
    }
    return result;
  }

  private readTag(buffer: Buffer, tag: number): unknown {
    const value = this.decodeInternal(buffer);
    return value;
  }

  private readSimple(additional: number): unknown {
    if (additional === SIMPLE_FALSE) return false;
    if (additional === SIMPLE_TRUE) return true;
    if (additional === SIMPLE_NULL) return null;
    if (additional === SIMPLE_UNDEFINED) return undefined;
    if (additional >= 24 && additional <= 27) return undefined;
    return additional;
  }
}

export function encodeCBOR(value: unknown): Buffer {
  return new CBOREncoder().encode(value);
}

export function decodeCBOR<T = unknown>(buffer: Buffer): T {
  return new CBORDecoder().decode(buffer) as T;
}
