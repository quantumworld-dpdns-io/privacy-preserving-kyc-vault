export type WireType = 'varint' | 'fixed64' | 'length_delimited' | 'fixed32';

export const WIRE_TYPE_VARINT = 0;
export const WIRE_TYPE_FIXED64 = 1;
export const WIRE_TYPE_LENGTH_DELIMITED = 2;
export const WIRE_TYPE_FIXED32 = 5;

export interface ProtobufField {
  number: number;
  wireType: WireType;
  value: unknown;
}

export interface ProtobufMessage {
  fields: ProtobufField[];
}

function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>= 7;
  }
  bytes.push(value & 0x7f);
  return Buffer.from(bytes);
}

function decodeVarint(buffer: Buffer, offset: number): { value: number; length: number } {
  let value = 0;
  let shift = 0;
  let length = 0;
  while (true) {
    const byte = buffer[offset + length];
    value |= (byte & 0x7f) << shift;
    shift += 7;
    length++;
    if (!(byte & 0x80)) break;
  }
  return { value, length };
}

export function encodeKey(fieldNumber: number, wireType: number): Buffer {
  return encodeVarint((fieldNumber << 3) | wireType);
}

export function decodeKey(buffer: Buffer, offset: number): { fieldNumber: number; wireType: number; length: number } {
  const { value, length } = decodeVarint(buffer, offset);
  return { fieldNumber: value >> 3, wireType: value & 0x07, length };
}

export function encodeFloat32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeFloatLE(value);
  return buf;
}

export function encodeFloat64(value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeDoubleLE(value);
  return buf;
}

export function decodeFloat32(buffer: Buffer, offset: number): number {
  return buffer.readFloatLE(offset);
}

export function decodeFloat64(buffer: Buffer, offset: number): number {
  return buffer.readDoubleLE(offset);
}

export function encodeSignedVarint(value: number): Buffer {
  return encodeVarint(value < 0 ? -1 - (value << 1) : value << 1);
}

export function encodeLengthDelimited(data: Buffer): Buffer {
  return Buffer.concat([encodeVarint(data.length), data]);
}

export class ProtobufEncoder {
  encode(fields: Record<number, { wireType: WireType; value: unknown }>): Buffer {
    const chunks: Buffer[] = [];

    for (const [num, field] of Object.entries(fields)) {
      const fieldNumber = Number(num);
      const key = encodeKey(fieldNumber, wireTypeToInt(field.wireType));
      chunks.push(key);

      switch (field.wireType) {
        case 'varint':
          chunks.push(encodeVarint(field.value as number));
          break;
        case 'fixed64':
          chunks.push(encodeFloat64(field.value as number));
          break;
        case 'fixed32':
          chunks.push(encodeFloat32(field.value as number));
          break;
        case 'length_delimited': {
          const data = field.value instanceof Buffer ? field.value : Buffer.from(field.value as string, 'utf-8');
          chunks.push(encodeLengthDelimited(data));
          break;
        }
      }
    }

    return Buffer.concat(chunks);
  }

  encodeMessage(message: Record<string, unknown>, fieldMap: Record<string, { number: number; wireType: WireType }>): Buffer {
    const fields: Record<number, { wireType: WireType; value: unknown }> = {};
    for (const [key, value] of Object.entries(message)) {
      const mapping = fieldMap[key];
      if (!mapping) continue;
      fields[mapping.number] = { wireType: mapping.wireType, value };
    }
    return this.encode(fields);
  }
}

export class ProtobufDecoder {
  decode(buffer: Buffer): ProtobufMessage {
    const fields: ProtobufField[] = [];
    let offset = 0;

    while (offset < buffer.length) {
      const { fieldNumber, wireType: wt, length } = decodeKey(buffer, offset);
      offset += length;

      let value: unknown;
      switch (wt) {
        case WIRE_TYPE_VARINT: {
          const result = decodeVarint(buffer, offset);
          value = result.value;
          offset += result.length;
          break;
        }
        case WIRE_TYPE_FIXED64: {
          value = decodeFloat64(buffer, offset);
          offset += 8;
          break;
        }
        case WIRE_TYPE_LENGTH_DELIMITED: {
          const { value: len, length: varintLen } = decodeVarint(buffer, offset);
          offset += varintLen;
          value = Buffer.from(buffer.subarray(offset, offset + len));
          offset += len;
          break;
        }
        case WIRE_TYPE_FIXED32: {
          value = decodeFloat32(buffer, offset);
          offset += 4;
          break;
        }
        default:
          throw new Error(`Unknown wire type: ${wt}`);
      }

      fields.push({
        number: fieldNumber,
        wireType: getWireTypeName(wt),
        value,
      });
    }

    return { fields };
  }

  decodeToObject(buffer: Buffer, fieldMap: Record<string, { number: number; wireType: WireType }>): Record<string, unknown> {
    const message = this.decode(buffer);
    const result: Record<string, unknown> = {};
    const reverseMap = new Map(Object.entries(fieldMap).map(([key, val]) => [val.number, { key, wireType: val.wireType }]));

    for (const field of message.fields) {
      const mapping = reverseMap.get(field.number);
      if (!mapping) continue;
      if (field.wireType === 'length_delimited' && field.value instanceof Buffer) {
        result[mapping.key] = field.value.toString('utf-8');
      } else {
        result[mapping.key] = field.value;
      }
    }

    return result;
  }
}

function wireTypeToInt(wt: WireType): number {
  switch (wt) {
    case 'varint': return WIRE_TYPE_VARINT;
    case 'fixed64': return WIRE_TYPE_FIXED64;
    case 'length_delimited': return WIRE_TYPE_LENGTH_DELIMITED;
    case 'fixed32': return WIRE_TYPE_FIXED32;
  }
}

function getWireTypeName(wt: number): WireType {
  switch (wt) {
    case WIRE_TYPE_VARINT: return 'varint';
    case WIRE_TYPE_FIXED64: return 'fixed64';
    case WIRE_TYPE_LENGTH_DELIMITED: return 'length_delimited';
    case WIRE_TYPE_FIXED32: return 'fixed32';
    default: throw new Error(`Unknown wire type: ${wt}`);
  }
}

export function encodeProtobuf(fields: Record<number, { wireType: WireType; value: unknown }>): Buffer {
  return new ProtobufEncoder().encode(fields);
}

export function decodeProtobuf(buffer: Buffer): ProtobufMessage {
  return new ProtobufDecoder().decode(buffer);
}
