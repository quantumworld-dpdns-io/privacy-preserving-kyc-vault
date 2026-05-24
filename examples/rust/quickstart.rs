// Rust example: DID resolution, credential creation, and ZKP verification
// Run with: cargo run --example quickstart
// Add to Cargo.toml under [[example]]:
//   name = "quickstart"
//   path = "examples/rust/quickstart.rs"

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// Re-use crate types from the workspace
use kyc_vault_core::credential::{VerifiableCredential, VerifiablePresentation};
use kyc_vault_core::presentation::PresentationRequest;
use kyc_vault_did::{DIDDocument, DIDResolver, VerificationMethod};
use kyc_vault_zkp::{MockZKPEngine, ProofRequest, ZKPEngine};

// ---------------------------------------------------------------------------
// Minimal CLI demonstration
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== KYC Vault Rust Quickstart ===\n");

    // 1. Resolve a DID
    let resolver = DIDResolver::new();
    let did = "did:key:z6Mkf";
    let doc = resolver.resolve(did).await?;
    println!("Resolved DID document: {}", doc.id);
    println!("  Verification methods: {}", doc.verification_method.len());
    println!("  Authentication keys:  {}", doc.authentication.len());

    // 2. Create a verifiable credential
    let mut claims = HashMap::new();
    claims.insert("age".into(), serde_json::json!(25));
    claims.insert("nationality".into(), serde_json::json!("US"));
    claims.insert("kycTier".into(), serde_json::json!("tier-2"));

    let mut vc = VerifiableCredential::new(
        "urn:uuid:example-cred-001".into(),
        "did:kyc:issuer:vault-001".into(),
        "did:kyc:subject:alice-001".into(),
        claims,
    );
    vc.add_type("KYCIdentityCredential".into());
    println!("\nCreated credential: {}", vc.id);
    println!("  Issuer:    {}", vc.issuer);
    println!("  Issued at: {}", vc.issuance_date);

    // 3. Generate a ZKP proof using the mock engine
    let engine = MockZKPEngine;
    let proof_request = ProofRequest {
        circuit_id: "age_verification".into(),
        public_inputs: vec!["25".into(), "21".into()],
        private_inputs: vec![vec![1u8; 32]],
    };
    let proof = engine.generate_proof(&proof_request)?;
    println!("\nGenerated ZKP proof:");
    println!("  Proof ID:       {}", proof.proof_id);
    println!("  Circuit ID:     {}", proof.circuit_id);
    println!("  Proving time:   {} ms", proof.proving_time_ms);

    // 4. Verify the ZKP proof
    let result = engine.verify_proof(&proof)?;
    println!("\nVerified ZKP proof: {}", result.verified);
    println!("  Verification time: {} ms", result.verification_time_ms);

    // 5. Create a verifiable presentation
    let vp = VerifiablePresentation::new(vec![vc]);
    println!("\nCreated verifiable presentation with {} credential(s)",
        vp.verifiable_credential.len());

    // 6. Create a presentation request
    let mut req = PresentationRequest::new("urn:uuid:req-001".into());
    req.add_query(vec!["KYCIdentityCredential".into()], true);
    println!("Presentation request has {} query(s)", req.query.len());

    // 7. List available ZKP circuits
    let circuits = engine.list_circuits();
    println!("\nAvailable ZKP circuits:");
    for c in &circuits {
        println!("  - {}: {} ({} constraints)", c.id, c.name,
            c.constraint_count.unwrap_or(0));
    }

    Ok(())
}
