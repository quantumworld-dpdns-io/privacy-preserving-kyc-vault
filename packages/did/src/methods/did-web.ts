import { DIDError, DIDErrorCode } from '../error.js';
import { DIDDocument } from '../document.js';

const DEFAULT_HTTPS_PORT = 443;
const FETCH_TIMEOUT_MS = 10_000;

export interface DIDWebOptions {
  timeout?: number;
  fetchImpl?: typeof fetch;
}

export async function resolveDIDWeb(
  domain: string,
  options: DIDWebOptions = {},
): Promise<DIDDocument> {
  const timeout = options.timeout ?? FETCH_TIMEOUT_MS;
  const fetchFn = options.fetchImpl ?? globalThis.fetch;

  const normalizedDomain = domain.replace(/^did:web:/, '');

  const segments = normalizedDomain.split(':');
  const hostname = segments.join('.');

  const pathIdx = hostname.indexOf('/');
  let authority: string;
  let wellKnownPath: string;

  if (pathIdx !== -1) {
    authority = hostname.slice(0, pathIdx);
    const pathSegment = hostname.slice(pathIdx + 1);
    wellKnownPath = `/.well-known/did.json`;
  } else {
    authority = hostname;
    wellKnownPath = '/.well-known/did.json';
  }

  const url = `https://${authority}${wellKnownPath}`;

  let resp: Response;
  try {
    resp = await fetchFn(url, { signal: AbortSignal.timeout(timeout) });
  } catch (err) {
    throw new DIDError(
      `Failed to fetch did:web document from ${url}: ${(err as Error).message}`,
      DIDErrorCode.ResolutionError,
    );
  }

  if (!resp.ok) {
    throw new DIDError(
      `did:web:${domain} not found at ${url} (HTTP ${resp.status})`,
      DIDErrorCode.NotFound,
    );
  }

  let data: Record<string, unknown>;
  try {
    data = (await resp.json()) as Record<string, unknown>;
  } catch (err) {
    throw new DIDError(
      `Invalid JSON response from ${url}: ${(err as Error).message}`,
      DIDErrorCode.SerializationError,
    );
  }

  const doc = DIDDocument.fromJSON(data);

  const expectedId = `did:web:${normalizedDomain}`;
  if (doc.id !== expectedId) {
    throw new DIDError(
      `DID document id mismatch: expected ${expectedId}, got ${doc.id}`,
      DIDErrorCode.InvalidDID,
    );
  }

  return doc;
}
