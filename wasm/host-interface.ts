import type { WASI } from '@wasmer/wasi';

export interface WasmMemoryAccess {
  readBytes(ptr: number, len: number): Uint8Array;
  readString(ptr: number, len?: number): string;
  writeBytes(ptr: number, data: Uint8Array): void;
  writeString(ptr: number, str: string): number;
  allocate(size: number): number;
  deallocate(ptr: number): void;
}

export interface HostFunctions {
  hash(data: Uint8Array): Uint8Array;
  verifyCredential(data: Uint8Array, proof: Uint8Array): boolean;
  checkAttribute(attribute: string, value: unknown): boolean;
  storeBlob(key: string, data: Uint8Array): void;
  getBlob(key: string): Uint8Array | null;
  emitEvent(eventType: string, payload: Uint8Array): void;
  logMessage(message: string): void;
  randomBytes(len: number): Uint8Array;
}

export interface WasmModuleExports {
  memory: WebAssembly.Memory;
  get_module_info(): number;
  [key: string]: WebAssembly.ExportValue;
}

export interface CredentialVerifyExports extends WasmModuleExports {
  verify(dataPtr: number, dataLen: number, proofPtr: number, proofLen: number): number;
  verify_credential(credPtr: number, credLen: number): number;
  get_credential_hash(credPtr: number, credLen: number): number;
  check_attribute(attrPtr: number, attrLen: number, valuePtr: number, valueLen: number): number;
}

export interface DidResolveExports extends WasmModuleExports {
  resolve_did(didPtr: number, didLen: number): number;
  get_method_name(methodId: number): number;
  extract_method_specific_id(didPtr: number, didLen: number): number;
}

export interface AgeProofExports extends WasmModuleExports {
  prove_age_range(agePtr: number, ageLen: number, min: number, max: number): number;
  verify_age_range(proofPtr: number, proofLen: number, min: number, max: number): number;
  commit_age(agePtr: number, ageLen: number): number;
}

export interface WasmInstance {
  exports: WasmModuleExports;
  memory: WebAssembly.Memory;
}

export type WasmModuleName = 'credential-verify' | 'did-resolve' | 'age-proof';

export interface ModuleManifest {
  name: WasmModuleName;
  path: string;
  sha256: string;
  imports: string[];
  exports: string[];
  requiredCapabilities: string[];
}

export interface HostInterface {
  instantiate(name: WasmModuleName): Promise<WasmInstance>;
  getCredentialVerify(): Promise<CredentialVerifyExports>;
  getDidResolve(): Promise<DidResolveExports>;
  getAgeProof(): Promise<AgeProofExports>;
  invoke<T extends WasmModuleExports>(name: WasmModuleName): Promise<T>;
}

export interface WasmResult<T> {
  success: boolean;
  data: T;
  fuelConsumed: number;
  durationMs: number;
}

export interface WasmError {
  code: string;
  message: string;
  moduleName: WasmModuleName;
  trap?: string;
}

export function readWasmString(memory: WebAssembly.Memory, ptr: number, maxLen: number = 1024): string {
  const bytes = new Uint8Array(memory.buffer);
  const end = bytes.indexOf(0, ptr);
  const len = end >= 0 ? end - ptr : maxLen;
  const slice = bytes.slice(ptr, ptr + len);
  return new TextDecoder().decode(slice);
}

export function writeWasmString(memory: WebAssembly.Memory, ptr: number, str: string): number {
  const bytes = new TextEncoder().encode(str);
  const view = new Uint8Array(memory.buffer);
  view.set(bytes, ptr);
  view[ptr + bytes.length] = 0;
  return bytes.length;
}

export function readWasmBytes(memory: WebAssembly.Memory, ptr: number, len: number): Uint8Array {
  return new Uint8Array(memory.buffer).slice(ptr, ptr + len);
}

export function writeWasmBytes(memory: WebAssembly.Memory, ptr: number, data: Uint8Array): void {
  new Uint8Array(memory.buffer).set(data, ptr);
}

export class WasmHostInterface implements HostInterface {
  private instances = new Map<WasmModuleName, WebAssembly.Instance>();
  private hostFunctions: HostFunctions;
  private wasi?: WASI;

  constructor(hostFunctions: HostFunctions, wasi?: WASI) {
    this.hostFunctions = hostFunctions;
    this.wasi = wasi;
  }

  async instantiate(name: WasmModuleName): Promise<WasmInstance> {
    const existing = this.instances.get(name);
    if (existing) {
      return { exports: existing.exports as WasmModuleExports, memory: (existing.exports as WasmModuleExports).memory };
    }

    const response = await fetch(`/wasm/${name}.wasm`);
    const bytes = await response.arrayBuffer();
    const importObject = this.buildImportObject();

    const instance = await WebAssembly.instantiate(bytes, importObject);
    this.instances.set(name, instance);

    return {
      exports: instance.exports as WasmModuleExports,
      memory: (instance.exports as WasmModuleExports).memory,
    };
  }

  async getCredentialVerify(): Promise<CredentialVerifyExports> {
    return (await this.instantiate('credential-verify')).exports as CredentialVerifyExports;
  }

  async getDidResolve(): Promise<DidResolveExports> {
    return (await this.instantiate('did-resolve')).exports as DidResolveExports;
  }

  async getAgeProof(): Promise<AgeProofExports> {
    return (await this.instantiate('age-proof')).exports as AgeProofExports;
  }

  async invoke<T extends WasmModuleExports>(name: WasmModuleName): Promise<T> {
    return (await this.instantiate(name)).exports as T;
  }

  private buildImportObject(): WebAssembly.Imports {
    const kyc: WebAssembly.Imports['kyc'] = {
      hash: (ptr: number, len: number, outPtr: number): number => {
        const memory = this.getActiveMemory();
        const data = readWasmBytes(memory, ptr, len);
        const hash = this.hostFunctions.hash(data);
        writeWasmBytes(memory, outPtr, hash);
        return hash.length;
      },
      verify_credential: (dataPtr: number, dataLen: number, proofPtr: number, proofLen: number): number => {
        const memory = this.getActiveMemory();
        const data = readWasmBytes(memory, dataPtr, dataLen);
        const proof = readWasmBytes(memory, proofPtr, proofLen);
        return this.hostFunctions.verifyCredential(data, proof) ? 1 : 0;
      },
      check_attribute: (attrPtr: number, attrLen: number, valuePtr: number, valueLen: number): number => {
        const memory = this.getActiveMemory();
        const attr = readWasmString(memory, attrPtr, attrLen);
        const valueStr = readWasmString(memory, valuePtr, valueLen);
        try {
          const value = JSON.parse(valueStr);
          return this.hostFunctions.checkAttribute(attr, value) ? 1 : 0;
        } catch {
          return -1;
        }
      },
      store_blob: (keyPtr: number, keyLen: number, dataPtr: number, dataLen: number): number => {
        const memory = this.getActiveMemory();
        const key = readWasmString(memory, keyPtr, keyLen);
        const data = readWasmBytes(memory, dataPtr, dataLen);
        this.hostFunctions.storeBlob(key, data);
        return 0;
      },
      get_blob: (keyPtr: number, keyLen: number, outPtr: number, outLen: number): number => {
        const memory = this.getActiveMemory();
        const key = readWasmString(memory, keyPtr, keyLen);
        const data = this.hostFunctions.getBlob(key);
        if (!data) return -2;
        const writeLen = Math.min(data.length, outLen);
        writeWasmBytes(memory, outPtr, data.slice(0, writeLen));
        return writeLen;
      },
      emit_event: (typePtr: number, typeLen: number, payloadPtr: number, payloadLen: number): number => {
        const memory = this.getActiveMemory();
        const eventType = readWasmString(memory, typePtr, typeLen);
        const payload = readWasmBytes(memory, payloadPtr, payloadLen);
        this.hostFunctions.emitEvent(eventType, payload);
        return 0;
      },
      log_message: (msgPtr: number, msgLen: number): number => {
        const memory = this.getActiveMemory();
        const msg = readWasmString(memory, msgPtr, msgLen);
        this.hostFunctions.logMessage(msg);
        return 0;
      },
      random_bytes: (outPtr: number, len: number): number => {
        const memory = this.getActiveMemory();
        const bytes = this.hostFunctions.randomBytes(len);
        writeWasmBytes(memory, outPtr, bytes);
        return len;
      },
    };

    const env: WebAssembly.Imports['env'] = {
      log: (msg: number): void => {
        const memory = this.getActiveMemory();
        const str = readWasmString(memory, msg);
        this.hostFunctions.logMessage(str);
      },
      get_credential: (id: number): number => 0,
      verify_proof: (_proofPtr: number, _proofLen: number): number => 1,
      emit_event: (_eventType: number, _dataPtr: number): number => 0,
    };

    return { kyc, env, ...(this.wasi ? this.wasi.getImports() : {}) };
  }

  private getActiveMemory(): WebAssembly.Memory {
    for (const instance of this.instances.values()) {
      const exports = instance.exports as WasmModuleExports;
      if (exports.memory) return exports.memory;
    }
    throw new Error('No active Wasm memory found');
  }

  destroy(): void {
    this.instances.clear();
  }
}
