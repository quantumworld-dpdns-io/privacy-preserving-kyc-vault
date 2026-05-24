import type { WasmModuleExports, WasmMemoryAccess } from '../wasm/host-interface';

export interface WitInterface {
  name: string;
  version: string;
  functions: WitFunction[];
}

export interface WitFunction {
  name: string;
  params: WitParam[];
  returns: WitType;
}

export interface WitParam {
  name: string;
  type: WitType;
}

export type WitType =
  | { kind: 'string' }
  | { kind: 'u8' }
  | { kind: 'u32' }
  | { kind: 'u64' }
  | { kind: 's32' }
  | { kind: 's64' }
  | { kind: 'float32' }
  | { kind: 'float64' }
  | { kind: 'bool' }
  | { kind: 'list'; element: WitType }
  | { kind: 'tuple'; elements: WitType[] }
  | { kind: 'option'; inner: WitType }
  | { kind: 'result'; ok: WitType | null; err: WitType | null }
  | { kind: 'record'; fields: WitParam[] }
  | { kind: 'enum'; variants: string[] }
  | { kind: 'handle' };

export interface ComponentInstance {
  exports: Record<string, WasmModuleExports>;
  deallocate(ptr: number): void;
}

function alignTo(value: number, alignment: number): number {
  return (value + alignment - 1) & ~(alignment - 1);
}

class WitSerializer {
  private memory: WebAssembly.Memory;
  private allocPtr = 65536;
  private allocs: number[] = [];

  constructor(memory: WebAssembly.Memory) {
    this.memory = memory;
  }

  get buffer(): ArrayBuffer {
    return this.memory.buffer;
  }

  private get view(): DataView {
    return new DataView(this.memory.buffer);
  }

  private get u8(): Uint8Array {
    return new Uint8Array(this.memory.buffer);
  }

  allocate(size: number, alignment: number): number {
    this.allocPtr = alignTo(this.allocPtr, alignment);
    const ptr = this.allocPtr;
    this.allocPtr += size;
    this.allocs.push(ptr);
    return ptr;
  }

  freeAll(): void {
    this.allocs = [];
    this.allocPtr = 65536;
  }

  writeString(str: string): number {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    const ptr = this.allocate(bytes.length + 1, 1);
    this.u8.set(bytes, ptr);
    this.u8[ptr + bytes.length] = 0;
    return ptr;
  }

  writeBytes(data: Uint8Array): number {
    const ptr = this.allocate(data.length, 1);
    this.u8.set(data, ptr);
    return ptr;
  }

  writeU32(val: number, ptr: number): void {
    this.view.setUint32(ptr, val, true);
  }

  writeS32(val: number, ptr: number): void {
    this.view.setInt32(ptr, val, true);
  }

  writeU64(val: bigint, ptr: number): void {
    this.view.setBigUint64(ptr, val, true);
  }

  writeBool(val: boolean, ptr: number): void {
    this.u8[ptr] = val ? 1 : 0;
  }

  readString(ptr: number): string {
    const end = ptr + 1024;
    let len = 0;
    while (ptr + len < end && this.u8[ptr + len] !== 0) {
      len++;
    }
    const bytes = this.u8.slice(ptr, ptr + len);
    return new TextDecoder().decode(bytes);
  }

  readBytes(ptr: number, len: number): Uint8Array {
    return this.u8.slice(ptr, ptr + len);
  }

  readU32(ptr: number): number {
    return this.view.getUint32(ptr, true);
  }

  readS32(ptr: number): number {
    return this.view.getInt32(ptr, true);
  }

  readU64(ptr: number): bigint {
    return this.view.getBigUint64(ptr, true);
  }

  readBool(ptr: number): boolean {
    return this.u8[ptr] !== 0;
  }
}

export class ComponentAdapter {
  private serializer!: WitSerializer;
  private memory!: WebAssembly.Memory;
  private exports!: WasmModuleExports;

  async load(url: string): Promise<ComponentInstance> {
    const response = await fetch(url);
    const bytes = await response.arrayBuffer();

    const importObj: WebAssembly.Imports = {
      'kyc-vault:did/did-resolver': this.createDidResolverImports(),
      'kyc-vault:credential/credential-verification': this.createCredentialVerificationImports(),
      'kyc-vault:kyc/kyc-age-proof': this.createAgeProofImports(),
      'kyc-vault:kyc/kyc-workflow-management': this.createWorkflowImports(),
      wasi_snapshot_preview1: this.createWasiImports(),
    };

    const instance = await WebAssembly.instantiate(bytes, importObj);
    this.exports = instance.exports as unknown as WasmModuleExports;
    this.memory = this.exports.memory;
    this.serializer = new WitSerializer(this.memory);

    const wrappedExports: Record<string, WasmModuleExports> = {};
    for (const key of Object.getOwnPropertyNames(this.exports)) {
      if (typeof this.exports[key] === 'function') {
        wrappedExports[key] = this.exports;
      }
    }

    return {
      exports: wrappedExports,
      deallocate: (ptr: number) => this.deallocate(ptr),
    };
  }

  private deallocate(_ptr: number): void {
    this.serializer.freeAll();
  }

  private createWasiImports(): WebAssembly.Imports {
    return {
      fd_write: (_fd: number, _iovs: number, _iovsLen: number, _nwritten: number): number => 0,
      fd_close: (_fd: number): number => 0,
      fd_read: (_fd: number, _iovs: number, _iovsLen: number, _nread: number): number => 0,
      proc_exit: (_code: number): void => {},
      environ_sizes_get: (_count: number, _size: number): number => 0,
      environ_get: (_environ: number, _environBuf: number): number => 0,
      args_sizes_get: (_count: number, _size: number): number => 0,
      args_get: (_argv: number, _argvBuf: number): number => 0,
    };
  }

  private createDidResolverImports(): WebAssembly.Imports {
    return {
      'parse-did': (didPtr: number, didLen: number, outPtr: number): number => {
        const did = this.serializer.readString(didPtr);
        const parts = did.split(':');
        if (parts.length < 3 || parts[0] !== 'did') {
          this.serializer.writeS32(-1, outPtr);
          return -1;
        }
        const method = parts[1];
        const msi = parts.slice(2).join(':');
        this.serializer.writeString(msi);
        this.serializer.writeString(method + ':' + msi);
        return 0;
      },
      'resolve': (didPtr: number, didLen: number, outPtr: number): number => {
        const did = this.serializer.readString(didPtr);
        const parts = did.split(':');
        const method = parts[1] || 'unknown';
        const msi = parts.slice(2).join(':');

        const docPtr = this.serializer.allocate(256, 4);
        this.serializer.writeString(did);
        const methodPtr = this.serializer.writeString(method);
        const msiPtr = this.serializer.writeString(msi);
        const tsPtr = this.serializer.writeString(new Date().toISOString());

        this.serializer.writeU32(docPtr, outPtr);
        this.serializer.writeU32(methodPtr, outPtr + 4);
        this.serializer.writeU32(msiPtr, outPtr + 8);
        this.serializer.writeU32(tsPtr, outPtr + 12);
        this.serializer.writeBool(false, outPtr + 16);

        return 0;
      },
    };
  }

  private createCredentialVerificationImports(): WebAssembly.Imports {
    return {
      'verify-credential': (
        _credPtr: number,
        _credLen: number,
        outPtr: number,
      ): number => {
        this.serializer.writeBool(true, outPtr);
        this.serializer.writeString('');
        const tsPtr = this.serializer.writeString(new Date().toISOString());
        this.serializer.writeU32(tsPtr, outPtr + 9);
        return 0;
      },
      'hash-credential': (
        dataPtr: number,
        dataLen: number,
        _algorithmPtr: number,
        _algorithmLen: number,
        outPtr: number,
      ): number => {
        const data = this.serializer.readBytes(dataPtr, dataLen);
        const hashPtr = this.serializer.allocate(32, 1);

        crypto.subtle.digest('SHA-256', data).then((hash) => {
          const hashBytes = new Uint8Array(hash);
          this.serializer.u8.set(hashBytes, hashPtr);
        });

        const algoPtr = this.serializer.writeString('SHA-256');
        this.serializer.writeU32(algoPtr, outPtr);
        this.serializer.writeU32(hashPtr, outPtr + 4);
        return 0;
      },
    };
  }

  private createAgeProofImports(): WebAssembly.Imports {
    return {
      'prove-age-range': (
        age: number,
        minPtr: number,
        maxPtr: number,
        outPtr: number,
      ): number => {
        const min = this.serializer.readU32(minPtr);
        const max = this.serializer.readU32(maxPtr);
        const inRange = age >= min && age <= max;

        this.serializer.writeBool(inRange, outPtr);
        this.serializer.writeU32(min, outPtr + 1);
        this.serializer.writeU32(max, outPtr + 5);
        const tsPtr = this.serializer.writeString(new Date().toISOString());
        this.serializer.writeU32(tsPtr, outPtr + 9);

        return inRange ? 1 : 0;
      },
      'verify-age-range': (
        proofPtr: number,
        _proofLen: number,
        min: number,
        max: number,
        outPtr: number,
      ): number => {
        this.serializer.writeU32(min, outPtr);
        this.serializer.writeU32(max, outPtr + 4);
        const tsPtr = this.serializer.writeString(new Date().toISOString());
        this.serializer.writeU32(tsPtr, outPtr + 8);
        return 1;
      },
    };
  }

  private createWorkflowImports(): WebAssembly.Imports {
    return {
      'create-workflow': (
        subjectPtr: number,
        _subjectLen: number,
        tierPtr: number,
        _tierLen: number,
        platformPtr: number,
        _platformLen: number,
        outPtr: number,
      ): number => {
        const subject = this.serializer.readString(subjectPtr);
        const id = `wf-${Date.now()}`;
        this.serializer.writeString(id);
        this.serializer.writeString(subject);
        this.serializer.writeString('initiated');
        this.serializer.writeString('');
        this.serializer.writeString(new Date().toISOString());
        this.serializer.writeString(new Date().toISOString());
        return 0;
      },
      'get-workflow': (
        _wfPtr: number,
        _wfLen: number,
        outPtr: number,
      ): number => {
        this.serializer.writeString('not-found');
        this.serializer.writeString('');
        this.serializer.writeString('error');
        return -1;
      },
    };
  }

  callFunction(
    exportName: string,
    fn: (serializer: WitSerializer) => void,
  ): void {
    fn(this.serializer);
  }
}

export async function createAdapter(): Promise<ComponentAdapter> {
  const adapter = new ComponentAdapter();
  return adapter;
}

export function serializeWitValue(value: unknown, type: WitType, serializer: WitSerializer): number {
  switch (type.kind) {
    case 'string': {
      return serializer.writeString(value as string);
    }
    case 'u32':
    case 's32': {
      const ptr = serializer.allocate(4, 4);
      serializer.writeU32(value as number, ptr);
      return ptr;
    }
    case 'u64': {
      const ptr = serializer.allocate(8, 8);
      serializer.writeU64(value as bigint, ptr);
      return ptr;
    }
    case 'bool': {
      const ptr = serializer.allocate(1, 1);
      serializer.writeBool(value as boolean, ptr);
      return ptr;
    }
    case 'list': {
      const arr = value as unknown[];
      const len = arr.length;
      const elemSize = 4;
      const dataPtr = serializer.allocate(len * elemSize, 4);
      const ptr = serializer.allocate(8, 4);
      serializer.writeU32(dataPtr, ptr);
      serializer.writeU32(len, ptr + 4);

      for (let i = 0; i < len; i++) {
        const elemPtr = serializeWitValue(arr[i], type.element, serializer);
        serializer.writeU32(elemPtr, dataPtr + i * elemSize);
      }
      return ptr;
    }
    default:
      return 0;
  }
}
