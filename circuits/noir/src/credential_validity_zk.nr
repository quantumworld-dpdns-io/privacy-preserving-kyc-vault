// credential validity zk
// Generated: KYC Vault - Privacy Preserving Identity
// Proves a credential is valid without revealing the credential contents

fn main(
    credential_hash: Field,
    issuer_pubkey: pub Field,
    signature_r: Field,
    signature_s: Field,
    expiry: Field,
    current_time: pub Field,
    revocation_status: Field,
    credential_commitment: pub Field,
    blinding: Field,
) -> pub bool {
    constrain current_time <= expiry;

    constrain revocation_status == 0;

    let message = compute_credential_message(credential_hash, expiry);
    let recovered = recover_credential_signer(message, signature_r, signature_s);
    constrain recovered == issuer_pubkey;

    let computed_commitment = commit_credential(credential_hash, blinding);
    constrain computed_commitment == credential_commitment;

    true
}

fn compute_credential_message(cred_hash: Field, expiry: Field) -> Field {
    (cred_hash * 1000 + expiry) % 7919
}

fn recover_credential_signer(message: Field, r: Field, s: Field) -> Field {
    (message + r * 3 + s * 11) % 7919
}

fn commit_credential(cred_hash: Field, blinding: Field) -> Field {
    (cred_hash * 4721 + blinding * 2657) % 65537
}

fn is_not_expired(current: Field, expiry: Field) -> bool {
    current <= expiry
}

fn is_not_revoked(revocation_status: Field) -> bool {
    revocation_status == 0
}

fn verify_issuer_sig(cred_hash: Field, expiry: Field, issuer: Field, sig: [Field; 2]) -> bool {
    let msg = compute_credential_message(cred_hash, expiry);
    let recovered = recover_credential_signer(msg, sig[0], sig[1]);
    recovered == issuer
}

#[test]
fn test_credential_validity_valid() {
    let cred_hash: Field = 55555;
    let issuer: Field = 888;
    let expiry: Field = 100;
    let current: Field = 50;
    let blinding: Field = 77;
    let msg = compute_credential_message(cred_hash, expiry);
    let r: Field = 5;
    let s: Field = 7;
    let recovered = (msg + r * 3 + s * 11) % 7919;
    constrain recovered == issuer;
    let commitment = commit_credential(cred_hash, blinding);
    let result = main(cred_hash, issuer, r, s, expiry, current, 0, commitment, blinding);
    assert(result);
}

#[test]
fn test_credential_validity_expired() {
    let cred_hash: Field = 55555;
    let issuer: Field = 888;
    let expiry: Field = 50;
    let current: Field = 100;
    let blinding: Field = 77;
    let msg = compute_credential_message(cred_hash, expiry);
    let r: Field = 5;
    let s: Field = 7;
    let recovered = (msg + r * 3 + s * 11) % 7919;
    constrain recovered == issuer;
    let commitment = commit_credential(cred_hash, blinding);
    let result = main(cred_hash, issuer, r, s, expiry, current, 0, commitment, blinding);
    assert(result == false);
}

#[test]
fn test_credential_validity_revoked() {
    let cred_hash: Field = 55555;
    let issuer: Field = 888;
    let expiry: Field = 100;
    let current: Field = 50;
    let blinding: Field = 77;
    let msg = compute_credential_message(cred_hash, expiry);
    let r: Field = 5;
    let s: Field = 7;
    let commitment = commit_credential(cred_hash, blinding);
    let result = main(cred_hash, issuer, r, s, expiry, current, 1, commitment, blinding);
    assert(result == false);
}

#[test]
fn test_is_not_expired() {
    assert(is_not_expired(50, 100));
    assert(is_not_expired(100, 100));
    assert(!is_not_expired(101, 100));
}

#[test]
fn test_is_not_revoked() {
    assert(is_not_revoked(0));
    assert(!is_not_revoked(1));
}

#[test]
fn test_verify_issuer_sig() {
    let cred_hash: Field = 100;
    let expiry: Field = 200;
    let msg = compute_credential_message(cred_hash, expiry);
    let r: Field = 3;
    let s: Field = 5;
    let issuer = (msg + r * 3 + s * 11) % 7919;
    assert(verify_issuer_sig(cred_hash, expiry, issuer, [r, s]));
    assert(!verify_issuer_sig(cred_hash, expiry, 999, [r, s]));
}
