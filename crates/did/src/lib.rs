pub mod document;
pub mod error;
pub mod methods;
pub mod resolver;
pub mod service;
pub mod verification;

pub use document::DIDDocument;
pub use error::DIDError;
pub use methods::*;
pub use resolver::DIDResolver;
pub use service::Service;
pub use verification::VerificationMethod;
