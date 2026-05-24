export interface EntropySource {
  name: string;
  bytes: Uint8Array;
}

export interface EntropyResult {
  seed: Uint8Array;
  sources: EntropySource[];
  timestamp: number;
}

export function collectTimingEntropy(): Uint8Array {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, BigInt(performance.now() * 1_000_000), true);
  return buf;
}

export function collectNavigatorEntropy(): Uint8Array {
  const parts: string[] = [];
  if (typeof navigator !== 'undefined') {
    parts.push(navigator.userAgent ?? '');
    parts.push(navigator.language ?? '');
    parts.push(navigator.platform ?? '');
    parts.push(String(navigator.hardwareConcurrency ?? 0));
  }
  const enc = new TextEncoder();
  return enc.encode(parts.join('|'));
}

export function collectSystemEntropy(): Uint8Array {
  const parts: string[] = [];
  parts.push(String(process?.pid ?? 0));
  parts.push(String(process?.ppid ?? 0));
  parts.push(String(process?.uptime() ?? 0));
  parts.push(String(process?.memoryUsage?.()?.heapUsed ?? 0));
  parts.push(String(Date.now()));
  parts.push(String(typeof globalThis));
  const enc = new TextEncoder();
  return enc.encode(parts.join('|'));
}

export function collectCryptoEntropy(length: number = 32): Uint8Array {
  const buf = new Uint8Array(length);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

async function digest(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data));
}

export async function collectEntropy(): Promise<EntropyResult> {
  const timestamp = Date.now();
  const cryptoBytes = collectCryptoEntropy(64);
  const timingBytes = collectTimingEntropy();
  const systemBytes = collectSystemEntropy();
  const navBytes = collectNavigatorEntropy();

  const sources: EntropySource[] = [
    { name: 'crypto', bytes: cryptoBytes },
    { name: 'timing', bytes: timingBytes },
    { name: 'system', bytes: systemBytes },
    { name: 'navigator', bytes: navBytes },
  ];

  const combined = new Uint8Array(
    sources.reduce((acc, s) => acc + s.bytes.length, 0),
  );
  let offset = 0;
  for (const source of sources) {
    combined.set(source.bytes, offset);
    offset += source.bytes.length;
  }

  const seed = await digest(combined);

  return { seed, sources, timestamp };
}

export async function reseed(
  previousSeed: Uint8Array,
  additionalEntropy?: Uint8Array,
): Promise<Uint8Array> {
  const fresh = collectCryptoEntropy(32);
  const toHash = additionalEntropy
    ? new Uint8Array([...previousSeed, ...fresh, ...additionalEntropy])
    : new Uint8Array([...previousSeed, ...fresh]);
  return digest(toHash);
}
