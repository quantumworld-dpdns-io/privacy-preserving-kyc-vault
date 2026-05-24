export type MessagePackType =
  | 'nil'
  | 'boolean'
  | 'integer'
  | 'float'
  | 'string'
  | 'binary'
  | 'array'
  | 'map'
  | 'extension';

export const FORMAT_NIL = 0xc0;
export const FORMAT_FALSE = 0xc2;
export const FORMAT_TRUE = 0xc3;
export const FORMAT_FLOAT32 = 0xca;
export const FORMAT_FLOAT64 = 0xcb;
export const FORMAT_UINT8 = 0xcc;
export const FORMAT_UINT16 = 0xcd;
export const FORMAT_UINT32 = 0xce;
export const FORMAT_UINT64 = 0xcf;
export const FORMAT_INT8 = 0xd0;
export const FORMAT_INT16 = 0xd1;
export const FORMAT_INT32 = 0xd2;
export const FORMAT_INT64 = 0xd3;
export const FORMAT_STR8 = 0xd9;
export const FORMAT_STR16 = 0xda;
export const FORMAT_STR32 = 0xdb;
export const FORMAT_BIN8 = 0xc4;
export const FORMAT_BIN16 = 0xc5;
export const FORMAT_BIN32 = 0xc6;
export const FORMAT_ARRAY16 = 0xdc;
export const FORMAT_ARRAY32 = 0xdd;
export const FORMAT_MAP16 = 0xde;
export const FORMAT_MAP32 = 0xdf;

export class MessagePackEncoder {
  encode(value: unknown): Buffer {
    const chunks: Buffer[] = [];
    this.encodeInternal(value, chunks);
    return Buffer.concat(chunks);
  }

  private encodeInternal(value: unknown, chunks: Buffer[]): void {
    if (value === null || value === undefined) {
      chunks.push(Buffer.from([FORMAT_NIL]));
    } else if (typeof value === 'boolean') {
      chunks.push(Buffer.from([value ? FORMAT_TRUE : FORMAT_FALSE]));
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        if (value >= 0 && value <= 0x7f) {
          chunks.push(Buffer.from([value]));
        } else if (value < 0 && value >= -32) {
          chunks.push(Buffer.from([value & 0xff]));
        } else if (value >= 0 && value <= 0xff) {
          chunks.push(Buffer.from([FORMAT_UINT8, value]));
        } else if (value >= 0 && value <= 0xffff) {
          const buf = Buffer.alloc(3);
          buf[0] = FORMAT_UINT16;
          buf.writeUInt16BE(value, 1);
          chunks.push(buf);
        } else if (value >= 0 && value <= 0xffffffff) {
          const buf = Buffer.alloc(5);
          buf[0] = FORMAT_UINT32;
          buf.writeUInt32BE(value, 1);
          chunks.push(buf);
        } else if (value >= 0) {
          const buf = Buffer.alloc(9);
          buf[0] = FORMAT_UINT64;
          buf.writeBigUint64BE(BigInt(value), 1);
          chunks.push(buf);
        } else if (value >= -128) {
          chunks.push(Buffer.from([FORMAT_INT8, value & 0xff]));
        } else if (value >= -32768) {
          const buf = Buffer.alloc(3);
          buf[0] = FORMAT_INT16;
          buf.writeInt16BE(value, 1);
          chunks.push(buf);
        } else if (value >= -2147483648) {
          const buf = Buffer.alloc(5);
          buf[0] = FORMAT_INT32;
          buf.writeInt32BE(value, 1);
          chunks.push(buf);
        } else {
          const buf = Buffer.alloc(9);
          buf[0] = FORMAT_INT64;
          buf.writeBigInt64BE(BigInt(value), 1);
          chunks.push(buf);
        }
      } else {
        const buf = Buffer.alloc(9);
        buf[0] = FORMAT_FLOAT64;
        buf.writeDoubleBE(value, 1);
        chunks.push(buf);
      }
    } else if (typeof value === 'string') {
      this.encodeString(value, chunks);
    } else if (Buffer.isBuffer(value)) {
      this.encodeBinary(value, chunks);
    } else if (value instanceof Uint8Array) {
      this.encodeBinary(Buffer.from(value), chunks);
    } else if (Array.isArray(value)) {
      this.encodeArray(value, chunks);
    } else if (typeof value === 'object') {
      this.encodeMap(value as Record<string, unknown>, chunks);
    }
  }

  private encodeString(value: string, chunks: Buffer[]): void {
    const bytes = Buffer.from(value, 'utf-8');
    const len = bytes.length;
    if (len <= 31) {
      chunks.push(Buffer.from([0xa0 | len]));
    } else if (len <= 0xff) {
      chunks.push(Buffer.from([FORMAT_STR8, len]));
    } else if (len <= 0xffff) {
      const buf = Buffer.alloc(3);
      buf[0] = FORMAT_STR16;
      buf.writeUInt16BE(len, 1);
      chunks.push(buf);
    } else {
      const buf = Buffer.alloc(5);
      buf[0] = FORMAT_STR32;
      buf.writeUInt32BE(len, 1);
      chunks.push(buf);
    }
    chunks.push(bytes);
  }

  private encodeBinary(value: Buffer, chunks: Buffer[]): void {
    const len = value.length;
    if (len <= 0xff) {
      chunks.push(Buffer.from([FORMAT_BIN8, len]));
    } else if (len <= 0xffff) {
      const buf = Buffer.alloc(3);
      buf[0] = FORMAT_BIN16;
      buf.writeUInt16BE(len, 1);
      chunks.push(buf);
    } else {
      const buf = Buffer.alloc(5);
      buf[0] = FORMAT_BIN32;
      buf.writeUInt32BE(len, 1);
      chunks.push(buf);
    }
    chunks.push(value);
  }

  private encodeArray(value: unknown[], chunks: Buffer[]): void {
    const len = value.length;
    if (len <= 15) {
      chunks.push(Buffer.from([0x90 | len]));
    } else if (len <= 0xffff) {
      const buf = Buffer.alloc(3);
      buf[0] = FORMAT_ARRAY16;
      buf.writeUInt16BE(len, 1);
      chunks.push(buf);
    } else {
      const buf = Buffer.alloc(5);
      buf[0] = FORMAT_ARRAY32;
      buf.writeUInt32BE(len, 1);
      chunks.push(buf);
    }
    for (const item of value) {
      this.encodeInternal(item, chunks);
    }
  }

  private encodeMap(value: Record<string, unknown>, chunks: Buffer[]): void {
    const keys = Object.keys(value);
    const len = keys.length;
    if (len <= 15) {
      chunks.push(Buffer.from([0x80 | len]));
    } else if (len <= 0xffff) {
      const buf = Buffer.alloc(3);
      buf[0] = FORMAT_MAP16;
      buf.writeUInt16BE(len, 1);
      chunks.push(buf);
    } else {
      const buf = Buffer.alloc(5);
      buf[0] = FORMAT_MAP32;
      buf.writeUInt32BE(len, 1);
      chunks.push(buf);
    }
    for (const key of keys) {
      this.encodeString(key, chunks);
      this.encodeInternal(value[key], chunks);
    }
  }
}

export class MessagePackDecoder {
  private offset = 0;

  decode(buffer: Buffer): unknown {
    this.offset = 0;
    return this.decodeInternal(buffer);
  }

  private decodeInternal(buffer: Buffer): unknown {
    const token = buffer[this.offset++];
    if (token === undefined) throw new Error('Unexpected end of MessagePack data');

    if (token === FORMAT_NIL) return null;
    if (token === FORMAT_FALSE) return false;
    if (token === FORMAT_TRUE) return true;
    if (token === FORMAT_FLOAT64) {
      const value = buffer.readDoubleBE(this.offset);
      this.offset += 8;
      return value;
    }
    if (token === FORMAT_FLOAT32) {
      const value = buffer.readFloatBE(this.offset);
      this.offset += 4;
      return value;
    }

    if (token >= 0xe0) return token - 256;
    if (token <= 0x7f) return token;

    if ((token & 0xe0) === 0xa0) {
      const len = token & 0x1f;
      return this.readString(buffer, len);
    }
    if ((token & 0xe0) === 0x80) {
      const len = token & 0x0f;
      return this.readMap(buffer, len);
    }
    if ((token & 0xe0) === 0x90) {
      const len = token & 0x0f;
      return this.readArray(buffer, len);
    }

    switch (token) {
      case FORMAT_UINT8: return buffer.readUInt8(this.offset++);
      case FORMAT_UINT16: {
        const value = buffer.readUInt16BE(this.offset);
        this.offset += 2;
        return value;
      }
      case FORMAT_UINT32: {
        const value = buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return value;
      }
      case FORMAT_UINT64: {
        const value = buffer.readBigUint64BE(this.offset);
        this.offset += 8;
        return Number(value);
      }
      case FORMAT_INT8: return buffer.readInt8(this.offset++);
      case FORMAT_INT16: {
        const value = buffer.readInt16BE(this.offset);
        this.offset += 2;
        return value;
      }
      case FORMAT_INT32: {
        const value = buffer.readInt32BE(this.offset);
        this.offset += 4;
        return value;
      }
      case FORMAT_INT64: {
        const value = buffer.readBigInt64BE(this.offset);
        this.offset += 8;
        return Number(value);
      }
      case FORMAT_STR8: {
        const len = buffer.readUInt8(this.offset++);
        return this.readString(buffer, len);
      }
      case FORMAT_STR16: {
        const len = buffer.readUInt16BE(this.offset);
        this.offset += 2;
        return this.readString(buffer, len);
      }
      case FORMAT_STR32: {
        const len = buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return this.readString(buffer, len);
      }
      case FORMAT_BIN8: {
        const len = buffer.readUInt8(this.offset++);
        return this.readBytes(buffer, len);
      }
      case FORMAT_BIN16: {
        const len = buffer.readUInt16BE(this.offset);
        this.offset += 2;
        return this.readBytes(buffer, len);
      }
      case FORMAT_BIN32: {
        const len = buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return this.readBytes(buffer, len);
      }
      case FORMAT_ARRAY16: {
        const len = buffer.readUInt16BE(this.offset);
        this.offset += 2;
        return this.readArray(buffer, len);
      }
      case FORMAT_ARRAY32: {
        const len = buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return this.readArray(buffer, len);
      }
      case FORMAT_MAP16: {
        const len = buffer.readUInt16BE(this.offset);
        this.offset += 2;
        return this.readMap(buffer, len);
      }
      case FORMAT_MAP32: {
        const len = buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return this.readMap(buffer, len);
      }
      default:
        throw new Error(`Unknown MessagePack format: 0x${token.toString(16)}`);
    }
  }

  private readString(buffer: Buffer, length: number): string {
    const result = buffer.subarray(this.offset, this.offset + length).toString('utf-8');
    this.offset += length;
    return result;
  }

  private readBytes(buffer: Buffer, length: number): Buffer {
    const result = Buffer.from(buffer.subarray(this.offset, this.offset + length));
    this.offset += length;
    return result;
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
}

export function encodeMessagePack(value: unknown): Buffer {
  return new MessagePackEncoder().encode(value);
}

export function decodeMessagePack<T = unknown>(buffer: Buffer): T {
  return new MessagePackDecoder().decode(buffer) as T;
}
