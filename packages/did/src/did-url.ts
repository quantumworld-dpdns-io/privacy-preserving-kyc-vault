import { DIDError, DIDErrorCode } from './error.js';
import { DIDMethod, parseDID } from './methods.js';
import type { DIDUrl as IDIDUrl } from './types.js';

export class DIDUrl implements IDIDUrl {
  public readonly did: string;
  public readonly method: DIDMethod;
  public readonly methodSpecificId: string;
  public readonly path?: string;
  public readonly query?: string;
  public readonly fragment?: string;

  private constructor(
    did: string,
    method: DIDMethod,
    methodSpecificId: string,
    path?: string,
    query?: string,
    fragment?: string,
  ) {
    this.did = did;
    this.method = method;
    this.methodSpecificId = methodSpecificId;
    this.path = path;
    this.query = query;
    this.fragment = fragment;
  }

  static parse(url: string): DIDUrl {
    const fragmentIdx = url.indexOf('#');
    const fragment = fragmentIdx !== -1 ? url.slice(fragmentIdx + 1) : undefined;

    const beforeFragment = fragmentIdx !== -1 ? url.slice(0, fragmentIdx) : url;

    const queryIdx = beforeFragment.indexOf('?');
    const query = queryIdx !== -1 ? beforeFragment.slice(queryIdx + 1) : undefined;

    const beforeQuery = queryIdx !== -1 ? beforeFragment.slice(0, queryIdx) : beforeFragment;

    const pathStart = beforeQuery.indexOf('/', 4);
    let methodSpecificId: string;
    let path: string | undefined;

    if (pathStart !== -1) {
      const rest = beforeQuery.slice(pathStart + 1);
      const methodEnd = beforeQuery.indexOf(':', 4);
      const methodPart = methodEnd !== -1 ? beforeQuery.slice(0, methodEnd) : beforeQuery;
      const methodOnly = methodPart.slice(4);

      if (rest.length > 0 && !rest.includes(':')) {
        methodSpecificId = rest;
      } else {
        const colIdx = rest.indexOf(':');
        if (colIdx !== -1) {
          methodSpecificId = rest.slice(0, colIdx);
          path = rest.slice(colIdx + 1);
          if (path === '') path = undefined;
        } else {
          methodSpecificId = rest;
        }
      }
    } else {
      const { method, methodSpecificId: msi } = parseDID(beforeQuery);
      if (method !== (beforeQuery.split(':')[1] as DIDMethod)) {
        if (msi.includes('/')) {
          const slashIdx = msi.indexOf('/');
          methodSpecificId = msi.slice(0, slashIdx);
          path = msi.slice(slashIdx + 1);
          if (path === '') path = undefined;
        } else {
          methodSpecificId = msi;
        }
      } else {
        methodSpecificId = msi;
      }
    }

    const { method } = parseDID(beforeFragment);

    const parts = beforeFragment.split(':');
    const msiWithPath = parts.slice(2).join(':');
    const slashIdx = msiWithPath.indexOf('/');

    let finalMsi: string;
    let finalPath: string | undefined;
    if (slashIdx !== -1) {
      finalMsi = msiWithPath.slice(0, slashIdx);
      finalPath = msiWithPath.slice(slashIdx + 1);
      if (finalPath === '') finalPath = undefined;
    } else {
      finalMsi = msiWithPath;
    }

    return new DIDUrl(
      url,
      method,
      finalMsi,
      finalPath ?? path,
      query,
      fragment,
    );
  }

  toString(): string {
    let result = `did:${this.method}:${this.methodSpecificId}`;
    if (this.path) result += `/${this.path}`;
    if (this.query) result += `?${this.query}`;
    if (this.fragment) result += `#${this.fragment}`;
    return result;
  }

  withFragment(fragment: string): DIDUrl {
    return new DIDUrl(
      this.did,
      this.method,
      this.methodSpecificId,
      this.path,
      this.query,
      fragment,
    );
  }

  withQuery(query: string): DIDUrl {
    return new DIDUrl(
      this.did,
      this.method,
      this.methodSpecificId,
      this.path,
      query,
      this.fragment,
    );
  }

  withPath(path: string): DIDUrl {
    return new DIDUrl(
      this.did,
      this.method,
      this.methodSpecificId,
      path,
      this.query,
      this.fragment,
    );
  }

  equals(other: DIDUrl): boolean {
    return this.toString() === other.toString();
  }
}
