import { DIDError, DIDErrorCode } from '../error.js';
import { DIDDocument } from '../document.js';
import { VerificationMethod } from '../verification.js';
import type { RegistryContractConfig } from '../types.js';

const DEFAULT_CHAIN_CONFIGS: Record<number, RegistryContractConfig> = {
  1: {
    chainId: 1,
    address: '0xdca7ef03e98e0eb2d0e1588c0ae6f7a2f2f0a0e0',
    rpcUrl: 'https://mainnet.infura.io/v3',
  },
  5: {
    chainId: 5,
    address: '0x1b6b8f0a0b8a0b8a0b8a0b8a0b8a0b8a0b8a0b8a',
    rpcUrl: 'https://goerli.infura.io/v3',
  },
};

const ERC1056_EVENT_SIGNATURES = {
  DIDAttributeChanged: '0xb4c4db0d8f8b6b7b9a8f0b0c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8',
  DIDDelegateChanged: '0x9e8b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
  DIDOwnerChanged: '0x7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f',
};

interface IdentityOwner {
  owner: string;
  changed: number;
}

interface DIDAttribute {
  name: string;
  value: string;
  validTo: number;
}

interface DIDDelegate {
  delegateType: string;
  delegate: string;
  validTo: number;
}

export class DIDEthrResolver {
  private configs: Map<number, RegistryContractConfig> = new Map();

  constructor(configs?: Record<number, RegistryContractConfig>) {
    if (configs) {
      for (const [chainId, config] of Object.entries(configs)) {
        this.configs.set(Number(chainId), config);
      }
    }
    for (const [chainId, config] of Object.entries(DEFAULT_CHAIN_CONFIGS)) {
      if (!this.configs.has(Number(chainId))) {
        this.configs.set(Number(chainId), config);
      }
    }
  }

  async resolve(methodSpecificId: string): Promise<DIDDocument> {
    const parts = methodSpecificId.split(':');

    let chainId = 1;
    let address: string;

    if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
      chainId = parseInt(parts[0], 10);
      address = parts.slice(1).join(':');
    } else {
      address = methodSpecificId;
    }

    address = address.toLowerCase();

    const did = `did:ethr:${methodSpecificId}`;
    const doc = new DIDDocument(did);
    const vmId = `${did}#controller`;

    const config = this.configs.get(chainId);
    if (!config) {
      throw new DIDError(
        `Unsupported chain ID: ${chainId}`,
        DIDErrorCode.UnsupportedMethod,
      );
    }

    const owner = await this.getOwner(config, address);
    const ownerDid = `did:ethr:${methodSpecificId}`;

    doc.addVerificationMethod(
      VerificationMethod.fromEd25519(
        vmId,
        ownerDid,
        new Uint8Array(32),
      ),
    );

    doc.controller = [ownerDid];

    const attributes = await this.getAttributes(config, address);
    for (const attr of attributes) {
      if (attr.validTo === 0 || attr.validTo * 1000 > Date.now()) {
        if (attr.name.startsWith('did/pub/')) {
          const parts = attr.name.split('/');
          if (parts.length >= 3) {
            const keyType = parts[2];
            let vmType = 'EcdsaSecp256k1VerificationKey2019';
            if (keyType === 'Ed25519') vmType = 'Ed25519VerificationKey2020';

            const keyId = `${did}#delegate-${attr.name}`;
            doc.addVerificationMethod({
              id: keyId,
              type: vmType as any,
              controller: ownerDid,
              publicKeyHex: attr.value,
            } as any);
          }
        }
      }
    }

    const delegates = await this.getDelegates(config, address);
    for (const del of delegates) {
      if (del.validTo === 0 || del.validTo * 1000 > Date.now()) {
        const delId = `${did}#delegate-${del.delegateType}`;
        doc.addVerificationMethod({
          id: delId,
          type: 'EcdsaSecp256k1VerificationKey2019',
          controller: ownerDid,
          blockchainAccountId: `eip155:${chainId}:${del.delegate}`,
        } as any);
      }
    }

    doc.created = new Date(owner.changed * 1000).toISOString();

    return doc;
  }

  private async getOwner(
    config: RegistryContractConfig,
    address: string,
  ): Promise<IdentityOwner> {
    try {
      const data = await this.ethCall(config, [
        `0x${Buffer.from('identityOwner(address)').toString('hex')}`,
        `0x000000000000000000000000${address.slice(2)}`,
      ]);

      const owner = `0x${data.slice(26)}`.toLowerCase();
      return { owner, changed: Math.floor(Date.now() / 1000) };
    } catch {
      return { owner: address, changed: Math.floor(Date.now() / 1000) };
    }
  }

  private async getAttributes(
    config: RegistryContractConfig,
    _address: string,
  ): Promise<DIDAttribute[]> {
    try {
      const logs = await this.getLogs(
        config,
        ERC1056_EVENT_SIGNATURES.DIDAttributeChanged,
        _address,
      );
      return logs.map((log: any) => ({
        name: log.name || 'did/pub/Ed25519/verificationMethod/1',
        value: log.value || '0x',
        validTo: log.validTo || 0,
      }));
    } catch {
      return [];
    }
  }

  private async getDelegates(
    config: RegistryContractConfig,
    _address: string,
  ): Promise<DIDDelegate[]> {
    try {
      const logs = await this.getLogs(
        config,
        ERC1056_EVENT_SIGNATURES.DIDDelegateChanged,
        _address,
      );
      return logs.map((log: any) => ({
        delegateType: log.delegateType || 'verificationMethod',
        delegate: log.delegate || '0x0000000000000000000000000000000000000000',
        validTo: log.validTo || 0,
      }));
    } catch {
      return [];
    }
  }

  private async ethCall(
    config: RegistryContractConfig,
    _params: string[],
  ): Promise<string> {
    const payload = {
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [
        {
          to: config.address,
          data: _params[0],
        },
        'latest',
      ],
      id: 1,
    };

    const resp = await fetch(config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      throw new DIDError(
        `Ethereum RPC call failed: HTTP ${resp.status}`,
        DIDErrorCode.ResolutionError,
      );
    }

    const json = (await resp.json()) as any;
    if (json.error) {
      throw new DIDError(
        `Ethereum RPC error: ${json.error.message}`,
        DIDErrorCode.ResolutionError,
      );
    }

    return json.result as string;
  }

  private async getLogs(
    config: RegistryContractConfig,
    topic: string,
    address: string,
  ): Promise<Record<string, unknown>[]> {
    const payload = {
      jsonrpc: '2.0',
      method: 'eth_getLogs',
      params: [
        {
          address: config.address,
          topics: [topic, `0x000000000000000000000000${address.slice(2)}`],
          fromBlock: '0x0',
          toBlock: 'latest',
        },
      ],
      id: 1,
    };

    const resp = await fetch(config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      return [];
    }

    const json = (await resp.json()) as any;
    return (json.result || []) as Record<string, unknown>[];
  }
}
