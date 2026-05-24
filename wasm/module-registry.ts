import type { WasmModuleName, ModuleManifest } from './host-interface';

export interface TrustedModuleEntry {
  name: WasmModuleName;
  sha256: string;
  sizeBytes: number;
  version: string;
  signerPublicKey?: string;
  signature?: string;
  requiredCapabilities: string[];
  allowedImports: string[];
  allowedExports: string[];
  maxMemoryPages: number;
  maxFuel: number;
}

export interface ModuleRegistryConfig {
  modules: TrustedModuleEntry[];
  allowUnsignedModules: boolean;
  enforceHashVerification: boolean;
  onVerificationFailure?: (name: WasmModuleName, expected: string, actual: string) => void;
}

const TRUSTED_MODULES: TrustedModuleEntry[] = [
  {
    name: 'credential-verify',
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    sizeBytes: 2048,
    version: '1.0.0',
    requiredCapabilities: ['hash', 'verify', 'emit_event'],
    allowedImports: [
      'kyc.hash',
      'kyc.verify_credential',
      'kyc.check_attribute',
      'kyc.emit_event',
      'kyc.log_message',
    ],
    allowedExports: [
      'memory',
      'get_module_info',
      'verify',
      'verify_credential',
      'get_credential_hash',
      'check_attribute',
    ],
    maxMemoryPages: 2,
    maxFuel: 500_000,
  },
  {
    name: 'did-resolve',
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    sizeBytes: 1792,
    version: '1.0.0',
    requiredCapabilities: ['hash', 'kv_store', 'emit_event'],
    allowedImports: [
      'kyc.hash',
      'kyc.emit_event',
      'kyc.log_message',
      'kyc.store_blob',
      'kyc.get_blob',
    ],
    allowedExports: [
      'memory',
      'get_module_info',
      'resolve_did',
      'get_method_name',
      'extract_method_specific_id',
    ],
    maxMemoryPages: 2,
    maxFuel: 300_000,
  },
  {
    name: 'age-proof',
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    sizeBytes: 2304,
    version: '1.0.0',
    requiredCapabilities: ['hash', 'random', 'emit_event'],
    allowedImports: [
      'kyc.hash',
      'kyc.random_bytes',
      'kyc.emit_event',
      'kyc.log_message',
    ],
    allowedExports: [
      'memory',
      'get_module_info',
      'prove_age_range',
      'verify_age_range',
      'commit_age',
    ],
    maxMemoryPages: 2,
    maxFuel: 400_000,
  },
];

export class ModuleRegistry {
  private modules: Map<WasmModuleName, TrustedModuleEntry>;
  private config: ModuleRegistryConfig;

  constructor(config?: Partial<ModuleRegistryConfig>) {
    this.config = {
      modules: TRUSTED_MODULES,
      allowUnsignedModules: false,
      enforceHashVerification: true,
      ...config,
    };
    this.modules = new Map();
    for (const entry of this.config.modules) {
      this.modules.set(entry.name, entry);
    }
  }

  getEntry(name: WasmModuleName): TrustedModuleEntry | undefined {
    return this.modules.get(name);
  }

  verifyModule(name: WasmModuleName, wasmBytes: ArrayBuffer): boolean {
    const entry = this.modules.get(name);
    if (!entry) {
      if (!this.config.allowUnsignedModules) {
        throw new Error(`Module '${name}' not found in trusted registry`);
      }
      return true;
    }

    if (!this.config.enforceHashVerification) {
      return true;
    }

    return this.verifyHash(wasmBytes, entry.sha256, name);
  }

  private async verifyHash(
    wasmBytes: ArrayBuffer,
    expectedHash: string,
    name: WasmModuleName,
  ): Promise<boolean> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', wasmBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const actualHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    if (actualHash !== expectedHash) {
      const msg = `Hash mismatch for '${name}': expected ${expectedHash}, got ${actualHash}`;
      if (this.config.onVerificationFailure) {
        this.config.onVerificationFailure(name, expectedHash, actualHash);
      }
      if (!this.config.allowUnsignedModules) {
        throw new Error(msg);
      }
      return false;
    }

    return true;
  }

  verifyImports(name: WasmModuleName, imports: string[]): boolean {
    const entry = this.modules.get(name);
    if (!entry) return this.config.allowUnsignedModules;

    for (const imp of imports) {
      if (!entry.allowedImports.includes(imp)) {
        throw new Error(`Import '${imp}' not allowed for module '${name}'`);
      }
    }
    return true;
  }

  verifyExports(name: WasmModuleName, exports: string[]): boolean {
    const entry = this.modules.get(name);
    if (!entry) return this.config.allowUnsignedModules;

    for (const exp of exports) {
      if (!entry.allowedExports.includes(exp)) {
        throw new Error(`Export '${exp}' not allowed for module '${name}'`);
      }
    }
    return true;
  }

  getCapabilities(name: WasmModuleName): string[] {
    const entry = this.modules.get(name);
    return entry?.requiredCapabilities ?? [];
  }

  getMaxFuel(name: WasmModuleName): number {
    const entry = this.modules.get(name);
    return entry?.maxFuel ?? 100_000;
  }

  getMaxMemoryPages(name: WasmModuleName): number {
    const entry = this.modules.get(name);
    return entry?.maxMemoryPages ?? 1;
  }

  registerModule(entry: TrustedModuleEntry): void {
    const existing = this.modules.get(entry.name);
    if (existing) {
      throw new Error(`Module '${entry.name}' is already registered`);
    }
    this.modules.set(entry.name, entry);
  }

  updateModuleHash(name: WasmModuleName, newSha256: string): void {
    const entry = this.modules.get(name);
    if (!entry) {
      throw new Error(`Module '${name}' not found in registry`);
    }
    entry.sha256 = newSha256;
  }

  listModules(): TrustedModuleEntry[] {
    return Array.from(this.modules.values());
  }

  isTrusted(name: WasmModuleName): boolean {
    return this.modules.has(name);
  }
}

export const defaultRegistry = new ModuleRegistry();

export async function fetchAndVerify(
  registry: ModuleRegistry,
  name: WasmModuleName,
  url: string,
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch module '${name}' from ${url}: ${response.statusText}`);
  }

  const wasmBytes = await response.arrayBuffer();

  if (!registry.verifyModule(name, wasmBytes)) {
    throw new Error(`Module '${name}' failed hash verification`);
  }

  return wasmBytes;
}
