use thiserror::Error;

#[derive(Error, Debug)]
pub enum DIDError {
    #[error("Invalid DID format: {0}")]
    InvalidDID(String),

    #[error("Unsupported DID method: {0}")]
    UnsupportedMethod(String),

    #[error("DID not found: {0}")]
    NotFound(String),

    #[error("Resolution error: {0}")]
    ResolutionError(String),

    #[error("Cryptographic error: {0}")]
    CryptoError(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Key rotation not allowed: {0}")]
    KeyRotationNotAllowed(String),

    #[error("DID deactivated")]
    Deactivated,

    #[error("Invalid verification method: {0}")]
    InvalidVerificationMethod(String),

    #[error("Network error: {0}")]
    NetworkError(#[from] std::io::Error),
}
