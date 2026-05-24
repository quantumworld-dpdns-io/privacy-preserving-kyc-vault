# HashiCorp Vault Policy for KYC Vault
# ============================================================
# Fine-grained access control for credential secrets management

# ============================================================
# Credential Data Secrets
# ============================================================
path "kyc-vault/data/credentials/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
  required_parameters = ["data"]
  allowed_parameters = {
    "data" = []
  }
}

path "kyc-vault/metadata/credentials/*" {
  capabilities = ["read", "list", "delete"]
}

path "kyc-vault/destroy/credentials/*" {
  capabilities = ["update"]
}

path "kyc-vault/undelete/credentials/*" {
  capabilities = ["update"]
}

# ============================================================
# Credential Encryption Keys
# ============================================================
path "kyc-vault/transit/encrypt/credentials" {
  capabilities = ["create", "update"]
}

path "kyc-vault/transit/decrypt/credentials" {
  capabilities = ["create", "update"]
}

path "kyc-vault/transit/rewrap/credentials" {
  capabilities = ["update"]
}

path "kyc-vault/transit/datakey/plaintext/credentials" {
  capabilities = ["create", "update"]
}

path "kyc-vault/transit/keys/credentials" {
  capabilities = ["read", "list"]
}

path "kyc-vault/transit/keys/credentials/rotate" {
  capabilities = ["update"]
}

path "kyc-vault/transit/hmac/credentials" {
  capabilities = ["create", "update"]
}

path "kyc-vault/transit/sign/credentials" {
  capabilities = ["create", "update"]
}

path "kyc-vault/transit/verify/credentials" {
  capabilities = ["create", "update"]
}

# ============================================================
# AI Model Weights and Configuration
# ============================================================
path "kyc-vault/data/ai-models/*" {
  capabilities = ["read", "list"]
  denied_parameters = {
    "data" = []
  }
}

path "kyc-vault/metadata/ai-models/*" {
  capabilities = ["read", "list"]
}

# ============================================================
# Database Credentials (Dynamic Secrets)
# ============================================================
path "kyc-vault/database/creds/kyc-readonly" {
  capabilities = ["read"]
}

path "kyc-vault/database/creds/kyc-readwrite" {
  capabilities = ["read"]
}

path "kyc-vault/database/creds/kyc-admin" {
  capabilities = ["read"]
}

# ============================================================
# PKI/TLS Certificate Management
# ============================================================
path "kyc-vault/pki/issue/kyc-internal" {
  capabilities = ["create", "update"]
  allowed_parameters = {
    "common_name" = []
    "alt_names" = []
    "ip_sans" = []
    "ttl" = []
  }
}

path "kyc-vault/pki/issue/kyc-external" {
  capabilities = ["create", "update"]
}

path "kyc-vault/pki/cert/*" {
  capabilities = ["read"]
}

path "kyc-vault/pki/revoke" {
  capabilities = ["create", "update"]
}

# ============================================================
# Kubernetes Auth Configuration
# ============================================================
path "auth/kubernetes/login" {
  capabilities = ["create", "update"]
}

path "auth/kubernetes/config" {
  capabilities = ["read", "update"]
}

path "auth/kubernetes/role/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# ============================================================
# Token Management
# ============================================================
path "auth/token/create/kyc-workload" {
  capabilities = ["create", "update"]
  allowed_parameters = {
    "policies" = []
    "ttl" = []
    "renewable" = []
    "display_name" = []
  }
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/revoke-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}

# ============================================================
# Audit and Monitoring
# ============================================================
path "sys/audit" {
  capabilities = ["read", "list"]
}

path "sys/metrics" {
  capabilities = ["read", "list"]
}

path "sys/health" {
  capabilities = ["read"]
}

path "sys/leader" {
  capabilities = ["read"]
}

path "sys/seal-status" {
  capabilities = ["read"]
}

# ============================================================
# Lease Management
# ============================================================
path "sys/leases/lookup/*" {
  capabilities = ["read", "list"]
}

path "sys/leases/renew/*" {
  capabilities = ["update"]
}

path "sys/leases/revoke/*" {
  capabilities = ["update"]
}
