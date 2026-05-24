import * as crypto from 'node:crypto';

export type CapabilityAction = string;
export type CapabilityResource = string;

export interface Capability {
  id: string;
  namespace: string;
  object: string;
  relation: string;
  subject: string;
  caveats?: Record<string, unknown>;
  issuedAt: number;
  expiresAt: number;
  issuer: string;
}

export interface CapabilityToken {
  capability: Capability;
  proof: string;
}

export interface RelationshipTuple {
  namespace: string;
  object: string;
  relation: string;
  subject: string;
}

export interface CapabilityCheck {
  allowed: boolean;
  capabilityId?: string;
  error?: string;
}

export class CapabilityEngine {
  private tuples = new Map<string, RelationshipTuple[]>();
  private capabilities = new Map<string, Capability>();
  private issuerKey: crypto.KeyLike;

  constructor(issuerKey: crypto.KeyLike) {
    this.issuerKey = issuerKey;
  }

  writeTuple(tuple: RelationshipTuple): void {
    const key = `${tuple.namespace}:${tuple.object}`;
    const existing = this.tuples.get(key) ?? [];
    existing.push(tuple);
    this.tuples.set(key, existing);
  }

  deleteTuple(tuple: RelationshipTuple): void {
    const key = `${tuple.namespace}:${tuple.object}`;
    const existing = this.tuples.get(key) ?? [];
    this.tuples.set(
      key,
      existing.filter(
        (t) =>
          t.relation !== tuple.relation || t.subject !== tuple.subject,
      ),
    );
  }

  readTuples(namespace: string, object: string): RelationshipTuple[] {
    return this.tuples.get(`${namespace}:${object}`) ?? [];
  }

  check(namespace: string, object: string, relation: string, subject: string): CapabilityCheck {
    const tuples = this.tuples.get(`${namespace}:${object}`) ?? [];

    const direct = tuples.some(
      (t) => t.relation === relation && t.subject === subject,
    );
    if (direct) return { allowed: true };

    const parentTuples = tuples.filter((t) => t.relation === 'parent');
    for (const pt of parentTuples) {
      const result = this.check(namespace, pt.object, relation, subject);
      if (result.allowed) return result;
    }

    const wildcard = tuples.some(
      (t) => t.relation === relation && t.subject === '*',
    );
    if (wildcard) return { allowed: true };

    return { allowed: false, error: 'No matching relation found' };
  }

  issueCapability(cap: Omit<Capability, 'id' | 'issuedAt' | 'issuer'>): CapabilityToken {
    const id = crypto.randomUUID();
    const capability: Capability = {
      ...cap,
      id,
      issuedAt: Date.now(),
      issuer: 'capability-engine',
    };

    const sign = crypto.createSign('sha256');
    sign.update(JSON.stringify(capability));
    sign.end();
    const proof = sign.sign(this.issuerKey).toString('base64url');

    this.capabilities.set(id, capability);
    return { capability, proof };
  }

  verifyCapabilityToken(token: CapabilityToken): CapabilityCheck {
    try {
      const verify = crypto.createVerify('sha256');
      verify.update(JSON.stringify(token.capability));
      verify.end();
      const valid = verify.verify(
        this.issuerKey,
        Buffer.from(token.proof, 'base64url'),
      );
      if (!valid) return { allowed: false, error: 'Invalid proof' };

      if (Date.now() > token.capability.expiresAt) {
        return { allowed: false, error: 'Capability expired' };
      }

      const result = this.check(
        token.capability.namespace,
        token.capability.object,
        token.capability.relation,
        token.capability.subject,
      );

      if (!result.allowed) {
        return { allowed: false, error: 'Capability revoked' };
      }

      return {
        allowed: true,
        capabilityId: token.capability.id,
      };
    } catch (err) {
      return { allowed: false, error: (err as Error).message };
    }
  }

  revokeCapability(capabilityId: string): void {
    this.capabilities.delete(capabilityId);
  }

  expandTree(namespace: string, object: string): RelationshipTuple[] {
    const visited = new Set<string>();
    const result: RelationshipTuple[] = [];

    function traverse(
      engine: CapabilityEngine,
      ns: string,
      obj: string,
    ): void {
      const key = `${ns}:${obj}`;
      if (visited.has(key)) return;
      visited.add(key);

      const tuples = engine.tuples.get(key) ?? [];
      for (const t of tuples) {
        result.push(t);
        if (t.relation === 'parent') {
          traverse(engine, t.namespace, t.object);
        }
      }
    }

    traverse(this, namespace, object);
    return result;
  }
}

export function zanzibarNamespace<T extends string>(name: T): { name: T; resource: (id: string) => string } {
  return {
    name,
    resource: (id: string) => `${name}:${id}`,
  };
}

export const Namespaces = {
  organization: zanzibarNamespace('organization'),
  workspace: zanzibarNamespace('workspace'),
  kycWorkflow: zanzibarNamespace('kyc_workflow'),
  credential: zanzibarNamespace('credential'),
  document: zanzibarNamespace('document'),
  team: zanzibarNamespace('team'),
} as const;

export function expandSubject(subject: string): string[] {
  const subjects: string[] = [subject];
  if (!subject.startsWith('team:')) {
    subjects.push('*');
  }
  return subjects;
}
