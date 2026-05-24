package kyc_vault.audit

# ============================================================
# OPA/Rego Policy: Mandatory Audit Logging
# ============================================================
# Enforces that all credential operations are logged with
# required audit fields before they can proceed.
#
# Input schema:
#   input.operation: { type, resource, credential_type }
#   input.user: { id, role, clearance }
#   input.audit: { id, timestamp, action, outcome, reason }
#   input.source: { ip, user_agent, correlation_id }

import data.kyc_vault.audit_config

# ============================================================
# Mandatory audit fields
# ============================================================

required_audit_fields = {
    "audit_id",
    "timestamp",
    "user_id",
    "user_role",
    "action",
    "resource",
    "resource_type",
    "outcome",
    "reason",
    "source_ip",
    "correlation_id",
}

# ============================================================
# Audit event classification
# ============================================================

critical_operations := {"delete", "bulk_read", "export", "permission_change", "key_rotation"}
high_operations := {"write", "update", "screen", "verify", "decrypt"}
medium_operations := {"read", "search", "list"}
low_operations := {"audit_read", "health_check", "metadata"}

audit_categories := {
    "critical": critical_operations,
    "high": high_operations,
    "medium": medium_operations,
    "low": low_operations,
}

# ============================================================
# Core audit rules
# ============================================================

# All operations must have an audit trail
deny[{"msg": "audit_trail_required", "code": "AUDIT_MISSING"}] {
    not input.audit.audit_id
    not input.audit.action
}

# Critical operations must be logged before execution (pre-audit)
deny[{"msg": "critical_op_missing_pre_audit", "code": "AUDIT_PRE_REQUIRED"}] {
    input.operation.type == critical_operations[_]
    not input.audit.pre_audit
}

# All required fields must be present
deny[{"msg": sprintf("missing_audit_field: %s", [field]), "code": "AUDIT_FIELD_MISSING"}] {
    field := required_audit_fields[_]
    object.get(input.audit, field, "") == ""
    input.operation.type != "health_check"
}

# ============================================================
# Retention and archival rules
# ============================================================

# Critical audit logs must be retained for 7 years (regulatory)
deny[{"msg": "critical_audit_retention_insufficient", "code": "AUDIT_RETENTION"}] {
    input.operation.type == critical_operations[_]
    retention_days := input.audit.retention_days
    retention_days < 2555  # 7 years
}

# High-sensitivity logs retained for 5 years
deny[{"msg": "high_audit_retention_insufficient", "code": "AUDIT_RETENTION"}] {
    input.operation.type == high_operations[_]
    input.operation.sensitivity == "high"
    retention_days := input.audit.retention_days
    retention_days < 1825  # 5 years
}

# ============================================================
# Immutability rules
# ============================================================

# Audit logs must be append-only (immutable)
deny[{"msg": "audit_log_must_be_immutable", "code": "AUDIT_IMMUTABLE"}] {
    input.audit.immutable != true
}

# Audit logs must be write-once (WORM)
deny[{"msg": "audit_log_must_be_worm", "code": "AUDIT_WORM"}] {
    input.audit.worm_storage != true
}

# ============================================================
# Regulatory compliance checks
# ============================================================

# GDPR: Data access logging
deny[{"msg": "gdpr_access_log_required", "code": "GDPR_001"}] {
    input.credential.region == "eu"
    input.operation.type in {"read", "verify", "screen"}
    not input.audit.gdpr_compliant
}

# SOX: Financial credential access logging
deny[{"msg": "sox_financial_access_audit", "code": "SOX_001"}] {
    input.operation.credential_type in {"bank_statement", "tax_document"}
    input.operation.type in {"read", "write", "update", "delete"}
    input.audit.sox_compliant != true
}

# PCI-DSS: PII access logging (if containing financial data)
deny[{"msg": "pci_dss_access_log_required", "code": "PCI_001"}] {
    input.operation.credential_type in {"credit_card", "bank_statement"}
    input.audit.pci_compliant != true
}

# ============================================================
# Real-time alerting rules
# ============================================================

# Failed access attempts must be logged immediately
deny[{"msg": "failed_access_not_logged", "code": "ALERT_001"}] {
    input.audit.outcome == "denied"
    input.audit.alert_sent != true
}

# Anomalous access patterns
deny[{"msg": "anomalous_access_pattern", "code": "ALERT_002"}] {
    input.audit.consecutive_failures >= 3
    input.audit.alert_sent != true
}

# After-hours access (high ops only)
deny[{"msg": "after_hours_high_sensitivity_access", "code": "ALERT_003"}] {
    input.operation.type == high_operations[_]
    input.operation.sensitivity == "high"
    hour := time.clock([input.audit.timestamp, "UTC"])[0]
    hour < 6
    hour >= 22
    input.audit.alert_sent != true
}

# ============================================================
# Data integrity verification
# ============================================================

# Audit logs must be cryptographically signed
deny[{"msg": "audit_log_not_signed", "code": "INTEGRITY_001"}] {
    not input.audit.cryptographic_signature
    input.operation.type != "health_check"
}

# Audit logs must include a hash chain reference
deny[{"msg": "hash_chain_missing", "code": "INTEGRITY_002"}] {
    not input.audit.previous_hash
    input.operation.type in {"write", "update", "delete"}
}

# ============================================================
# Notification requirements
# ============================================================

# Critical operations must notify compliance team
deny[{"msg": "compliance_notification_missing", "code": "NOTIFY_001"}] {
    input.operation.type == critical_operations[_]
    not input.audit.compliance_notified
}

# Data subject access requests (DSAR) must be logged
deny[{"msg": "dsar_must_be_logged", "code": "NOTIFY_002"}] {
    input.operation.type == "read"
    input.operation.is_dsar == true
    not input.audit.dsar_logged
}

# ============================================================
# Audit summary
# ============================================================

audit_decision := {"audit_logged": true} {
    deny == set()
}

audit_decision := {"audit_logged": false, "violations": deny} {
    deny != []
}
