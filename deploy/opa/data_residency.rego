package kyc_vault.data_residency

# ============================================================
# OPA/Rego Policy: Data Residency Enforcement
# Enforces data residency constraints based on regulatory
# frameworks (GDPR, CCPA, LGPD, PIPL) and contractual
# data processing agreements.
# ============================================================
# Input schema:
#   input.credential: { region, owner_region, category, contains_pii, contains_financial }
#   input.user: { region, role, clearance }
#   input.operation: { action, storage_region, processing_region, transfer_reason }
#   input.regulation: { gdpr, ccpa, lgpd, pipl, soc2, pci }

import data.kyc_vault.regions

# ============================================================
# Region classifications
# ============================================================
eu_regions = {"at", "be", "bg", "hr", "cy", "cz", "dk", "ee", "fi", "fr", "de", "gr", "hu", "ie", "it", "lv", "lt", "lu", "mt", "nl", "pl", "pt", "ro", "sk", "si", "es", "se", "eu"}
us_states_with_ccpa = {"ca", "va", "co", "ct", "ut", "tx"}
china_regions = {"cn", "hk"}
brazil_regions = {"br"}
global_regions = {"global", "us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1", "ap-northeast-1"}

# ============================================================
# Regulatory requirements
# ============================================================
regulation_map = {
    "gdpr": {"regions": eu_regions, "min_retention_days": 1825, "requires_consent": true, "requires_dpa": true, "requires_dpo": true},
    "ccpa": {"regions": us_states_with_ccpa, "min_retention_days": 730, "requires_consent": true, "requires_opt_out": true},
    "lgpd": {"regions": brazil_regions, "min_retention_days": 1825, "requires_consent": true, "requires_dpo": true},
    "pipl": {"regions": china_regions, "min_retention_days": 1095, "requires_consent": true, "requires_data_localization": true},
}

default allow = false

# ============================================================
# General residency rules
# ============================================================

# Data must be stored in the credential's home region
allow {
    input.credential.region == input.operation.storage_region
}

# Processing region must match credential region
allow {
    input.credential.region == input.operation.processing_region
}

# ============================================================
# GDPR-specific rules (EU data subjects)
# ============================================================

# EU personal data must stay within EU or have adequate safeguards
allow {
    input.credential.region == eu_regions[_]
    input.operation.storage_region == eu_regions[_]
    input.operation.processing_region == eu_regions[_]
}

# EU data may transfer to adequacy decision regions
allow {
    input.credential.region == eu_regions[_]
    input.operation.storage_region == "us"
    input.regulation.gdpr.adequacy_decision == true
    input.regulation.gdpr.scc_in_place == true
}

# EU data transfer with Standard Contractual Clauses
allow {
    input.credential.region == eu_regions[_]
    input.operation.storage_region != eu_regions[_]
    input.regulation.gdpr.scc_in_place == true
    input.regulation.gdpr.dpa_in_place == true
    input.regulation.gdpr.data_protection_impact_assessment == true
}

# ============================================================
# CCPA-specific rules (California residents)
# ============================================================

# CCPA data access requires opt-out mechanism
allow {
    input.credential.region == us_states_with_ccpa[_]
    input.credential.contains_pii == true
    input.regulation.ccpa.opt_out_available == true
}

# CCPA: deletion requests must be honored within 45 days
allow {
    input.operation.action == "delete"
    input.credential.region == us_states_with_ccpa[_]
    input.credential.contains_pii == true
}

# ============================================================
# China PIPL rules
# ============================================================

# PIPL: personal information must be stored in China
allow {
    input.credential.region == china_regions[_]
    input.credential.contains_pii == true
    input.operation.storage_region == china_regions[_]
}

# PIPL cross-border transfer requires security assessment
allow {
    input.credential.region == china_regions[_]
    input.credential.contains_pii == true
    input.operation.storage_region != china_regions[_]
    input.regulation.pipl.security_assessment == true
    input.regulation.pipl.consent_obtained == true
}

# ============================================================
# Brazil LGPD rules
# ============================================================

# LGPD: processing requires consent
allow {
    input.credential.region == brazil_regions[_]
    input.regulation.lgpd.consent_obtained == true
}

# ============================================================
# Deny rules
# ============================================================

# Deny: EU data stored outside EU without safeguards
deny[{"msg": "eu_data_residency_violation", "code": "RES_001", "regulation": "GDPR"}] {
    input.credential.region == eu_regions[_]
    input.credential.contains_pii == true
    input.operation.storage_region != eu_regions[_]
    input.regulation.gdpr.scc_in_place != true
}

# Deny: EU data processed in non-EU region without DPIA
deny[{"msg": "eu_processing_outside_eu_without_dpia", "code": "RES_002", "regulation": "GDPR"}] {
    input.credential.region == eu_regions[_]
    input.operation.processing_region != eu_regions[_]
    input.regulation.gdpr.data_protection_impact_assessment != true
}

# Deny: CCPA opt-out not honored
deny[{"msg": "ccpa_opt_out_not_available", "code": "RES_003", "regulation": "CCPA"}] {
    input.credential.region == us_states_with_ccpa[_]
    input.credential.contains_pii == true
    input.regulation.ccpa.opt_out_available != true
    input.operation.action in {"read", "verify", "screen"}
}

# Deny: PIPL data localization not met
deny[{"msg": "pipl_data_localization_required", "code": "RES_004", "regulation": "PIPL"}] {
    input.credential.region == china_regions[_]
    input.credential.contains_pii == true
    input.operation.storage_region != china_regions[_]
    input.regulation.pipl.security_assessment != true
}

# Deny: LGPD consent not obtained
deny[{"msg": "lgpd_consent_not_obtained", "code": "RES_005", "regulation": "LGPD"}] {
    input.credential.region == brazil_regions[_]
    input.regulation.lgpd.consent_obtained != true
}

# Deny: cross-region credential access
deny[{"msg": "cross_region_access_denied", "code": "RES_006"}] {
    input.user.region != input.credential.region
    input.user.region != "global"
    input.user.role != "admin"
}

# Deny: retention period violation
deny[{"msg": "retention_period_insufficient", "code": "RES_007"}] {
    input.credential.region == eu_regions[_]
    input.credential.retention_days < 1825
}

deny[{"msg": "retention_period_insufficient", "code": "RES_007"}] {
    input.credential.region == us_states_with_ccpa[_]
    input.credential.retention_days < 730
}

# ============================================================
# Data classification rules
# ============================================================

# Financial data has additional residency constraints
deny[{"msg": "financial_data_requires_domestic_storage", "code": "RES_008"}] {
    input.credential.contains_financial == true
    input.operation.storage_region != input.credential.region
}

# PII data requires encryption at rest in all regions
deny[{"msg": "pii_requires_encryption_at_rest", "code": "RES_009"}] {
    input.credential.contains_pii == true
    input.encryption_at_rest != true
}

# ============================================================
# Decision
# ============================================================
decision := {"residency_compliant": true} {
    allow
    deny == set()
}

decision := {"residency_compliant": false, "violations": deny} {
    deny != []
}
