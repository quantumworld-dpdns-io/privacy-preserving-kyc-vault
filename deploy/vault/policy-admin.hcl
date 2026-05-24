# Admin policy for KYC Vault key management
path "transit/keys/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "transit/keys/kyc-encrypt" {
  capabilities = ["create", "read", "update", "delete"]
}

path "transit/keys/kyc-sign" {
  capabilities = ["create", "read", "update", "delete"]
}

path "transit/keys/kyc-hmac" {
  capabilities = ["create", "read", "update", "delete"]
}

path "transit/action/*" {
  capabilities = ["create", "update"]
}

path "secret/metadata/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "secret/data/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "secret/delete/*" {
  capabilities = ["update"]
}

path "secret/undelete/*" {
  capabilities = ["update"]
}

path "secret/destroy/*" {
  capabilities = ["update"]
}

path "sys/mounts" {
  capabilities = ["read", "list"]
}

path "sys/mounts/*" {
  capabilities = ["create", "read", "update", "delete"]
}

path "sys/policies/acl/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "sys/health" {
  capabilities = ["read"]
}
