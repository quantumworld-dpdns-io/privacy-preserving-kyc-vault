package kyc_vault.credential_access

# ============================================================
# OPA/Rego Policy: Credential Access Control
# Enforces fine-grained access to credential data based on
# user role, clearance level, and credential sensitivity.
# ============================================================
# Input schema:
#   input.user: { id, role, clearance, department, region }
#   input.credential: { type, sensitivity, region, owner_id, category }
#   input.operation: { action, scope, purpose, timestamp }
#   input.context: { ip, device_id, session_id, mfa_verified }

import data.kyc_vault.roles
import data.kyc_vault.credentials

default allow = false

# ============================================================
# Clearance and sensitivity levels
# ============================================================
clearance_map = {
    "l1": 1,
    "l2": 2,
    "l3": 3,
    "l4": 4,
}

credential_sensitivity = {
    "public": 0,
    "internal": 1,
    "confidential": 2,
    "restricted": 3,
    "highly_restricted": 4,
}

# ============================================================
# Role permissions matrix
# ============================================================
role_permissions = {
    "admin": {"max_sensitivity": "highly_restricted", "actions": ["create", "read", "update", "delete", "verify", "audit", "export"]},
    "compliance_officer": {"max_sensitivity": "restricted", "actions": ["read", "verify", "screen", "audit", "export"]},
    "analyst": {"max_sensitivity": "confidential", "actions": ["read", "verify", "screen"]},
    "operator": {"max_sensitivity": "internal", "actions": ["read", "verify"]},
    "auditor": {"max_sensitivity": "restricted", "actions": ["read", "audit"]},
    "api_client": {"max_sensitivity": "internal", "actions": ["verify"]},
    "support": {"max_sensitivity": "internal", "actions": ["read"]},
}

# ============================================================
# Core access rules
# ============================================================

# Role-based access: user's role must permit the action
allow {
    perms := role_permissions[input.user.role]
    input.operation.action == perms.actions[_]
}

# Clearance check: user must have sufficient clearance for credential sensitivity
allow {
    clearance_map[input.user.clearance] >= credential_sensitivity[input.credential.sensitivity]
}

# Department isolation: users can only access credentials in their department
allow {
    input.user.department == input.credential.department
}

# Cross-department access requires L3+ clearance
allow {
    input.user.department != input.credential.department
    clearance_map[input.user.clearance] >= 3
}

# ============================================================
# Deny rules
# ============================================================

# Deny: insufficient role for action
deny[{"msg": "role_not_authorized", "code": "CRED_001"}] {
    perms := role_permissions[input.user.role]
    not perms.actions[_] == input.operation.action
}

# Deny: insufficient clearance for credential sensitivity
deny[{"msg": "insufficient_clearance", "code": "CRED_002"}] {
    clearance_map[input.user.clearance] < credential_sensitivity[input.credential.sensitivity]
}

# Deny: bulk read requires L3+ clearance
deny[{"msg": "bulk_read_requires_l3", "code": "CRED_003"}] {
    input.operation.scope == "bulk"
    input.operation.action == "read"
    clearance_map[input.user.clearance] < 3
}

# Deny: credential deletion requires dual authorization
deny[{"msg": "delete_requires_dual_auth", "code": "CRED_004"}] {
    input.operation.action == "delete"
    input.dual_authorization != true
}

# Deny: export restricted credentials requires admin approval
deny[{"msg": "export_requires_admin_approval", "code": "CRED_005"}] {
    input.operation.action == "export"
    input.credential.sensitivity == "restricted"
    input.admin_approval_id == ""
}

# Deny: MFA required for sensitive operations
deny[{"msg": "mfa_required_for_sensitive_op", "code": "CRED_006"}] {
    credential_sensitivity[input.credential.sensitivity] >= 3
    input.context.mfa_verified != true
}

# Deny: after-hours access requires justification
deny[{"msg": "after_hours_access_requires_justification", "code": "CRED_007"}] {
    hour := time.clock([input.operation.timestamp, "UTC"])[0]
    hour < 6
    hour >= 22
    input.operation.purpose == ""
}

# Deny: bulk operations after hours
deny[{"msg": "bulk_op_outside_business_hours", "code": "CRED_008"}] {
    input.operation.scope == "bulk"
    hour := time.clock([input.operation.timestamp, "UTC"])[0]
    hour < 8
}

deny[{"msg": "bulk_op_outside_business_hours", "code": "CRED_008"}] {
    input.operation.scope == "bulk"
    hour := time.clock([input.operation.timestamp, "UTC"])[0]
    hour >= 18
}

# ============================================================
# Audit requirements
# ============================================================

deny[{"msg": "audit_trail_required", "code": "CRED_009"}] {
    input.operation.action in {"read", "update", "delete", "export"}
    input.audit_id == ""
}

deny[{"msg": "access_reason_required", "code": "CRED_010"}] {
    input.operation.action in {"read", "verify", "screen"}
    input.operation.purpose == ""
}

# ============================================================
# Decision
# ============================================================
decision := {"allowed": true} {
    allow
    deny == set()
}

decision := {"allowed": false, "deny_reasons": deny} {
    deny != []
}
