use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};

const MEMORY_COST: u32 = 19456;
const TIME_COST: u32 = 2;
const PARALLELISM: u32 = 1;

pub struct PasswordHasherArgon2;

impl PasswordHasherArgon2 {
    pub fn hash(password: &[u8]) -> Result<String, String> {
        let salt = SaltString::generate(&mut OsRng);
        let params = Params::new(MEMORY_COST, TIME_COST, PARALLELISM, None)
            .map_err(|e| format!("Argon2 params: {}", e))?;

        let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
        let hash = argon2
            .hash_password(password, &salt)
            .map_err(|e| format!("Hashing failed: {}", e))?;

        Ok(hash.to_string())
    }

    pub fn hash_with_params(
        password: &[u8],
        memory_cost: u32,
        time_cost: u32,
        parallelism: u32,
    ) -> Result<String, String> {
        let salt = SaltString::generate(&mut OsRng);
        let params =
            Params::new(memory_cost, time_cost, parallelism, None)
                .map_err(|e| format!("Argon2 params: {}", e))?;

        let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
        let hash = argon2
            .hash_password(password, &salt)
            .map_err(|e| format!("Hashing failed: {}", e))?;

        Ok(hash.to_string())
    }

    pub fn verify(password: &[u8], hash_str: &str) -> Result<bool, String> {
        let parsed_hash =
            PasswordHash::new(hash_str).map_err(|e| format!("Invalid hash: {}", e))?;
        let argon2 = Argon2::default();
        Ok(argon2
            .verify_password(password, &parsed_hash)
            .is_ok())
    }

    pub fn needs_rehash(hash_str: &str) -> Result<bool, String> {
        let parsed_hash =
            PasswordHash::new(hash_str).map_err(|e| format!("Invalid hash: {}", e))?;

        let m = parsed_hash.params.get("m").map(|v| v.as_str()).unwrap_or("");
        let t = parsed_hash.params.get("t").map(|v| v.as_str()).unwrap_or("");
        let p = parsed_hash.params.get("p").map(|v| v.as_str()).unwrap_or("");

        let expected_m = MEMORY_COST.to_string();
        let expected_t = TIME_COST.to_string();
        let expected_p = PARALLELISM.to_string();

        Ok(m != expected_m || t != expected_t || p != expected_p)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_and_verify() {
        let password = b"correct-horse-battery-staple";
        let hash = PasswordHasherArgon2::hash(password).unwrap();
        assert!(PasswordHasherArgon2::verify(password, &hash).unwrap());
    }

    #[test]
    fn test_verify_wrong_password() {
        let hash = PasswordHasherArgon2::hash(b"real-password").unwrap();
        assert!(!PasswordHasherArgon2::verify(b"wrong-password", &hash).unwrap());
    }

    #[test]
    fn test_custom_params() {
        let password = b"test-password";
        let hash =
            PasswordHasherArgon2::hash_with_params(password, 8192, 1, 1).unwrap();
        assert!(PasswordHasherArgon2::verify(password, &hash).unwrap());
    }

    #[test]
    fn test_invalid_hash() {
        assert!(PasswordHasherArgon2::verify(b"password", "not-a-valid-hash").is_err());
    }
}
