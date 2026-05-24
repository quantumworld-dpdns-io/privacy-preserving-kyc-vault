package kyc_vault.rbac

# ============================================================
# OPA/Rego Policy: Fine-grained RBAC for credential operations
# ============================================================
# Key principal dimensions:
#   - user.role: admin, compliance_officer, auditor, operator, api_client
#   - user.region: us, eu, apac (data residency)
#   - user.clearance: l1, l2, l3 (sensitivity clearance level)
#
# Key operation dimensions:
#   - operation.type: read, write, delete, verify, audit, screen
#   - operation.credential_type: passport, drivers_license, national_id, bank_statement
#   - operation.sensitivity: high, medium, low

import data.kyc_vault.roles
import data.kyc_vault.permissions

# ============================================================
# Default: Deny
# ============================================================
default allow = false

# ============================================================
# Role definitions with permission matrices
# ============================================================

# Role hierarchy: admin > compliance_officer > auditor > operator > api_client
role_hierarchy = {
    "admin": 100,
    "compliance_officer": 80,
    "auditor": 60,
    "operator": 40,
    "api_client": 20,
}

# Sensitivity clearance levels
clearance_levels = {
    "l3": 3,  # Full access (admin, compliance officer)
    "l2": 2,  # Moderate access (auditor, operator)
    "l1": 1,  # Limited access (api_client)
}

# ============================================================
# Helper functions
# ============================================================

user_role_level(user) := role_hierarchy[user.role]
clearance_value(user) := clearance_levels[user.clearance]

operation_requires_clearance(op) := {
    "read": 1,
    "verify": 1,
    "audit": 1,
    "screen": 2,
    "write": 2,
    "delete": 3,
}[op.type]

sensitivity_level(op) := {
    "high": 3,
    "medium": 2,
    "low": 1,
}[op.sensitivity]

# ============================================================
# Allow rules
# ============================================================

# Admins can perform any operation
allow {
    input.user.role == "admin"
}

# Compliance officers can read, verify, screen credentials
allow {
    input.user.role == "compliance_officer"
    input.operation.type in {"read", "verify", "screen", "audit"}
}

# Compliance officers can write/update (but not delete)
allow {
    input.user.role == "compliance_officer"
    input.operation.type in {"write", "update"}
    input.operation.sensitivity != "high"
}

# Auditors can read and audit only
allow {
    input.user.role == "auditor"
    input.operation.type in {"read", "audit"}
}

# Operators can read and verify low-to-medium sensitivity
allow {
    input.user.role == "operator"
    input.operation.type in {"read", "verify"}
    input.operation.sensitivity != "high"
}

# API clients can only verify credentials (no raw data access)
allow {
    input.user.role == "api_client"
    input.operation.type == "verify"
    input.operation.sensitivity == "low"
}

# ============================================================
# Data residency controls
# ============================================================

# Users can only access credentials from their region
allow {
    input.user.region == input.credential.region
}

# Exception: global roles can access any region
allow {
    input.user.region == "global"
}

# EU data must stay in EU (GDPR)
deny[{"msg": "eu_data_residency_violation"}] {
    input.credential.region == "eu"
    input.user.region != "eu"
    input.user.region != "global"
}

# ============================================================
# Clearance-based access control
# ============================================================

# User must have sufficient clearance for the operation
deny[{"msg": "insufficient_clearance"}] {
    clearance_value(input.user) < operation_requires_clearance(input.operation)
}

# User must have sufficient clearance for the data sensitivity
deny[{"msg": "insensitive_to_sensitivity"}] {
    clearance_value(input.user) < sensitivity_level(input.operation)
}

# ============================================================
# Operational controls
# ============================================================

# Bulk operations require higher clearance
deny[{"msg": "bulk_requires_l3"}] {
    input.operation.type == "read"
    input.operation.is_bulk == true
    clearance_value(input.user) < 3
}

# Delete operations require dual authorization
deny[{"msg": "delete_requires_dual_auth"}] {
    input.operation.type == "delete"
    input.dual_authorization != true
}

# Write operations require audit log
deny[{"msg": "write_missing_audit"}] {
    input.operation.type == "write"
    input.audit_trail_id == ""
}

# ============================================================
# Time-based access restrictions
# ============================================================

# API clients restricted to business hours
deny[{"msg": "outside_business_hours"}] {
    input.user.role == "api_client"
    hour := time.clock([input.time.now, "UTC"])[0]
    hour < 8
}

deny[{"msg": "outside_business_hours"}] {
    input.user.role == "api_client"
    hour := time.clock([input.time.now, "UTC"])[0]
    hour >= 18
}

# ============================================================
# Rate limiting
# ============================================================

# API clients have rate limits
deny[{"msg": "rate_limit_exceeded"}] {
    input.user.role == "api_client"
    input.request_count > 100
}

# ============================================================
# Audit requirements
# ============================================================

# All operations must be auditable
deny[{"msg": "audit_required"}] {
    input.audit_trail_id == ""
    input.operation.type != "audit"
}

# ============================================================
# Summary decision
# ============================================================

# If any deny rules match, the request is denied
decision := {"allowed": allow, "deny_reasons": deny} {
    deny != []
}

decision := {"allowed": true} {
    allow
    deny == set()
}
