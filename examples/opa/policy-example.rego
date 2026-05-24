package kyc_vault.example_policy

# OPA/Rego policy example for credential access control.
#
# Uses the same input schema as deploy/opa/credential_access.rego but
# with additional rules specific to KYC workflow access and ZKP proof
# verification permissions.
#
# Test with:
#   opa eval --data policy-example.rego --input input.json "data.kyc_vault.example_policy.allow"
#
# Example input.json:
#   {
#     "user": {"role": "api_client", "clearance": "l2", "department": "compliance"},
#     "credential": {"type": "KYCIdentityCredential", "sensitivity": "confidential", "region": "US", "owner_id": "did:kyc:subject:alice"},
#     "operation": {"action": "verify", "scope": "single", "purpose": "age_verification", "timestamp": 1700000000},
#     "context": {"ip": "10.0.1.100", "session_id": "sess_abc123", "mfa_verified": true}
#   }

import data.kyc_vault.roles
import data.kyc_vault.credentials

default allow = false

# =============================================================================
# Configuration
# =============================================================================

clearance_levels = {
    "l1": 1,
    "l2": 2,
    "l3": 3,
    "l4": 4,
}

sensitivity_levels = {
    "public": 0,
    "internal": 1,
    "confidential": 2,
    "restricted": 3,
    "highly_restricted": 4,
}

role_permissions = {
    "admin":            {"max_sensitivity": "highly_restricted", "actions": ["create", "read", "update", "delete", "verify", "audit", "export", "admin"]},
    "compliance_officer": {"max_sensitivity": "restricted", "actions": ["read", "verify", "screen", "audit", "export"]},
    "analyst":         {"max_sensitivity": "confidential", "actions": ["read", "verify", "screen"]},
    "operator":        {"max_sensitivity": "internal", "actions": ["read", "verify"]},
    "auditor":         {"max_sensitivity": "restricted", "actions": ["read", "audit"]},
    "api_client":      {"max_sensitivity": "internal", "actions": ["verify"]},
    "support":         {"max_sensitivity": "internal", "actions": ["read"]},
}

# =============================================================================
# Core Access Rules
# =============================================================================

# Rule 1: Role-based access
allow {
    perms := role_permissions[input.user.role]
    input.operation.action == perms.actions[_]
}

# Rule 2: Sufficient clearance level
allow {
    clearance_levels[input.user.clearance] >= sensitivity_levels[input.credential.sensitivity]
}

# Rule 3: Department isolation (same department)
allow {
    input.user.department == input.credential.department
}

# Rule 4: Cross-department with L3+ clearance
allow {
    input.user.department != input.credential.department
    clearance_levels[input.user.clearance] >= 3
}

# Rule 5: Data residency - only access credentials in allowed regions
allow {
    allowed_regions := {"US", "EU", "UK"}
    input.credential.region == allowed_regions[_]
}

# Rule 6: Self-access - users can always access their own credentials
allow {
    input.user.id == input.credential.owner_id
    input.operation.action in {"read", "verify"}
}

# =============================================================================
# Deny Rules
# =============================================================================

# Insufficient role
deny["role_not_authorized"] {
    perms := role_permissions[input.user.role]
    not perms.actions[_] == input.operation.action
}

# Insufficient clearance
deny["insufficient_clearance"] {
    clearance_levels[input.user.clearance] < sensitivity_levels[input.credential.sensitivity]
}

# Bulk read requires L3+
deny["bulk_read_requires_l3"] {
    input.operation.scope == "bulk"
    input.operation.action == "read"
    clearance_levels[input.user.clearance] < 3
}

# Delete requires dual authorization
deny["delete_requires_dual_auth"] {
    input.operation.action == "delete"
    input.dual_authorization != true
}

# Export restricted requires approval
deny["export_requires_admin_approval"] {
    input.operation.action == "export"
    input.credential.sensitivity == "restricted"
    input.admin_approval_id == ""
}

# MFA required for sensitive operations
deny["mfa_required"] {
    sensitivity_levels[input.credential.sensitivity] >= 3
    input.context.mfa_verified != true
}

# After-hours access requires purpose
deny["after_hours_requires_purpose"] {
    hour := time.clock([input.operation.timestamp, "UTC"])[0]
    hour < 6
    input.operation.purpose == ""
}

# Bulk operations restricted to business hours
deny["bulk_op_outside_business_hours"] {
    input.operation.scope == "bulk"
    hour := time.clock([input.operation.timestamp, "UTC"])[0]
    hour < 8
}

deny["bulk_op_outside_business_hours"] {
    input.operation.scope == "bulk"
    hour := time.clock([input.operation.timestamp, "UTC"])[0]
    hour >= 18
}

# Audit trail required
deny["audit_trail_required"] {
    input.operation.action in {"read", "update", "delete", "export"}
    input.audit_id == ""
}

# Purpose required for sensitive operations
deny["purpose_required"] {
    input.operation.action in {"read", "verify", "screen"}
    input.operation.purpose == ""
}

# Data residency violation
deny["data_residency_violation"] {
    not allowed_regions[_]
}

allowed_regions := {"US", "EU", "UK", "JP", "AU"}

# =============================================================================
# ZKP-specific rules
# =============================================================================

# API clients can only verify, never read raw data
deny["api_clients_verify_only"] {
    input.user.role == "api_client"
    input.operation.action != "verify"
}

# ZKP verification does not require the same clearance as raw data access
allow {
    input.user.role == "api_client"
    input.operation.action == "verify"
    input.operation.purpose != ""
}

# =============================================================================
# Decision
# =============================================================================

decision := {"allowed": true} {
    allow
    deny == set()
}

decision := {"allowed": false, "deny_reasons": deny} {
    deny != set()
}
