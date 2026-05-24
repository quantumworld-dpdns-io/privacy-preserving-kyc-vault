use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationMethod {
    pub id: String,
    #[serde(rename = "type")]
    pub verification_type: VerificationType,
    pub controller: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_key_multibase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_key_jwk: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blockchain_account_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "UPPERCASE")]
pub enum VerificationType {
    Ed25519VerificationKey2020,
    Ed25519VerificationKey2018,
    JsonWebKey2020,
    EcdsaSecp256k1VerificationKey2019,
    Bls12381G2Key2020,
    #[serde(untagged)]
    Other(String),
}

impl VerificationMethod {
    pub fn new_ed25519(id: String, controller: String, key_bytes: &[u8; 32]) -> Self {
        use multibase::Base;
        use multikey::MultiKey;

        let multi = MultiKey::from_ed25519(key_bytes);
        let encoded = multibase::encode(Base::Base58Btc, multi.as_bytes());

        Self {
            id,
            verification_type: VerificationType::Ed25519VerificationKey2020,
            controller,
            public_key_multibase: Some(encoded),
            public_key_jwk: None,
            blockchain_account_id: None,
        }
    }

    pub fn new_secp256k1(id: String, controller: String, key_bytes: &[u8; 33]) -> Self {
        use multibase::Base;
        use multikey::MultiKey;

        let multi = MultiKey::from_secp256k1(key_bytes);
        let encoded = multibase::encode(Base::Base58Btc, multi.as_bytes());

        Self {
            id,
            verification_type: VerificationType::EcdsaSecp256k1VerificationKey2019,
            controller,
            public_key_multibase: Some(encoded),
            public_key_jwk: None,
            blockchain_account_id: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ed25519_verification_method() {
        let key = [0u8; 32];
        let vm = VerificationMethod::new_ed25519(
            "did:key:z6Mkf#z6Mkf".into(),
            "did:key:z6Mkf".into(),
            &key,
        );
        assert_eq!(vm.verification_type, VerificationType::Ed25519VerificationKey2020);
        assert!(vm.public_key_multibase.is_some());
    }

    #[test]
    fn test_secp256k1_verification_method() {
        let key = [0u8; 33];
        let vm = VerificationMethod::new_secp256k1(
            "did:ethr:0xabc#key".into(),
            "did:ethr:0xabc".into(),
            &key,
        );
        assert_eq!(vm.verification_type, VerificationType::EcdsaSecp256k1VerificationKey2019);
    }
}
