export type Action = 'create' | 'read' | 'update' | 'delete' | 'approve' | 'reject' | 'verify' | 'export' | 'admin';

export type Resource =
  | 'kyc:workflow'
  | 'kyc:document'
  | 'kyc:review'
  | 'credential'
  | 'did'
  | 'user'
  | 'billing'
  | 'audit:log'
  | 'webhook'
  | 'notification'
  | 'analytics'
  | 'compliance'
  | 'admin'
  | 'privacy:data'
  | 'privacy:consent'
  | 'api:key'
  | 'mfa:settings';

export interface Permission {
  action: Action;
  resource: Resource;
  conditions?: Record<string, unknown>;
}

export interface Role {
  name: string;
  permissions: Permission[];
  inherits?: string[];
}

export type RoleName = 'admin' | 'operator' | 'analyst' | 'viewer' | 'compliance_officer' | 'auditor' | 'api_service';

const ROLES: Record<RoleName, Role> = {
  admin: {
    name: 'admin',
    permissions: [
      { action: 'admin', resource: 'admin' },
      { action: 'create', resource: 'kyc:workflow' },
      { action: 'read', resource: 'kyc:workflow' },
      { action: 'update', resource: 'kyc:workflow' },
      { action: 'delete', resource: 'kyc:workflow' },
      { action: 'create', resource: 'kyc:document' },
      { action: 'read', resource: 'kyc:document' },
      { action: 'update', resource: 'kyc:document' },
      { action: 'delete', resource: 'kyc:document' },
      { action: 'approve', resource: 'kyc:review' },
      { action: 'reject', resource: 'kyc:review' },
      { action: 'create', resource: 'credential' },
      { action: 'read', resource: 'credential' },
      { action: 'update', resource: 'credential' },
      { action: 'delete', resource: 'credential' },
      { action: 'create', resource: 'did' },
      { action: 'read', resource: 'did' },
      { action: 'update', resource: 'did' },
      { action: 'delete', resource: 'did' },
      { action: 'admin', resource: 'billing' },
      { action: 'admin', resource: 'audit:log' },
      { action: 'admin', resource: 'webhook' },
      { action: 'admin', resource: 'notification' },
      { action: 'admin', resource: 'analytics' },
      { action: 'admin', resource: 'compliance' },
      { action: 'admin', resource: 'privacy:data' },
      { action: 'admin', resource: 'privacy:consent' },
      { action: 'admin', resource: 'api:key' },
      { action: 'admin', resource: 'mfa:settings' },
    ],
  },
  operator: {
    name: 'operator',
    permissions: [
      { action: 'create', resource: 'kyc:workflow' },
      { action: 'read', resource: 'kyc:workflow' },
      { action: 'update', resource: 'kyc:workflow' },
      { action: 'create', resource: 'kyc:document' },
      { action: 'read', resource: 'kyc:document' },
      { action: 'update', resource: 'kyc:document' },
      { action: 'approve', resource: 'kyc:review' },
      { action: 'reject', resource: 'kyc:review' },
      { action: 'verify', resource: 'credential' },
      { action: 'read', resource: 'credential' },
      { action: 'read', resource: 'did' },
      { action: 'export', resource: 'analytics' },
    ],
    inherits: ['viewer'],
  },
  analyst: {
    name: 'analyst',
    permissions: [
      { action: 'read', resource: 'kyc:workflow' },
      { action: 'read', resource: 'kyc:document' },
      { action: 'read', resource: 'kyc:review' },
      { action: 'read', resource: 'credential' },
      { action: 'read', resource: 'did' },
      { action: 'read', resource: 'analytics' },
    ],
  },
  viewer: {
    name: 'viewer',
    permissions: [
      { action: 'read', resource: 'kyc:workflow', conditions: { owned: true } },
      { action: 'read', resource: 'kyc:document', conditions: { owned: true } },
      { action: 'read', resource: 'credential', conditions: { owned: true } },
      { action: 'read', resource: 'did', conditions: { owned: true } },
    ],
  },
  compliance_officer: {
    name: 'compliance_officer',
    permissions: [
      { action: 'read', resource: 'kyc:workflow' },
      { action: 'read', resource: 'kyc:document' },
      { action: 'read', resource: 'kyc:review' },
      { action: 'read', resource: 'credential' },
      { action: 'read', resource: 'did' },
      { action: 'read', resource: 'compliance' },
      { action: 'read', resource: 'audit:log' },
      { action: 'read', resource: 'privacy:data' },
      { action: 'read', resource: 'privacy:consent' },
      { action: 'export', resource: 'compliance' },
    ],
  },
  auditor: {
    name: 'auditor',
    permissions: [
      { action: 'read', resource: 'audit:log' },
      { action: 'read', resource: 'kyc:workflow' },
      { action: 'read', resource: 'credential' },
      { action: 'read', resource: 'compliance' },
      { action: 'export', resource: 'audit:log' },
    ],
  },
  api_service: {
    name: 'api_service',
    permissions: [
      { action: 'create', resource: 'kyc:workflow' },
      { action: 'read', resource: 'kyc:workflow' },
      { action: 'create', resource: 'kyc:document' },
      { action: 'read', resource: 'kyc:document' },
      { action: 'verify', resource: 'credential' },
      { action: 'create', resource: 'credential' },
      { action: 'read', resource: 'did' },
      { action: 'read', resource: 'notification' },
    ],
  },
};

export function getRole(name: RoleName): Role | undefined {
  return ROLES[name];
}

export function listRoles(): Role[] {
  return Object.values(ROLES);
}

export function getEffectivePermissions(roleName: RoleName): Permission[] {
  const role = ROLES[roleName];
  if (!role) return [];
  const permissions = new Map<string, Permission>();
  function collect(name: RoleName): void {
    const r = ROLES[name];
    if (!r) return;
    for (const p of r.permissions) {
      permissions.set(`${p.action}:${p.resource}`, p);
    }
    if (r.inherits) {
      for (const parent of r.inherits) {
        collect(parent as RoleName);
      }
    }
  }
  collect(roleName);
  return Array.from(permissions.values());
}

export function hasPermission(
  roleName: RoleName,
  action: Action,
  resource: Resource,
  conditions?: Record<string, unknown>,
): boolean {
  const permissions = getEffectivePermissions(roleName);
  return permissions.some((p) => {
    if (p.action !== action && p.action !== 'admin') return false;
    if (p.resource !== resource) return false;
    if (p.conditions && conditions) {
      return Object.entries(p.conditions).every(
        ([key, value]) => conditions[key] === value,
      );
    }
    if (p.conditions && !conditions) return false;
    return true;
  });
}

export function getPermissionsForAction(action: Action, resource: Resource): RoleName[] {
  return (Object.entries(ROLES) as [RoleName, Role][])
    .filter(([, role]) => hasPermission(role.name, action, resource))
    .map(([name]) => name);
}
