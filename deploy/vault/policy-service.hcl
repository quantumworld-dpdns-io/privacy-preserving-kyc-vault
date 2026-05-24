# Service policy for KYC credential decryption
path "transit/decrypt/kyc-encrypt" {
  capabilities = ["update"]
}

path "transit/verify/kyc-sign" {
  capabilities = ["update"]
}

path "transit/hmac/kyc-hmac" {
  capabilities = ["update"]
}

path "transit/random" {
  capabilities = ["update"]
}

path "transit/hash" {
  capabilities = ["update"]
}

path "secret/data/kyc-service/*" {
  capabilities = ["read"]
}

path "secret/metadata/kyc-service/*" {
  capabilities = ["list"]
}

path "sys/health" {
  capabilities = ["read"]
}
