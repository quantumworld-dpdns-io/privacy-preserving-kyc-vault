// identity verification
// Generated: KYC Vault - Privacy Preserving Identity
// Proves that an identity was verified by a trusted authority

fn main(
    user_identifier: Field,
    authority_pubkey: pub Field,
    signature_r: Field,
    signature_s: Field,
    identity_commitment: pub Field,
) -> pub bool {
    let message = compute_identity_message(user_identifier);
    let recovered = recover_signer(message, signature_r, signature_s);
    constrain recovered == authority_pubkey;

    let computed_commitment = commit_identity(user_identifier);
    constrain computed_commitment == identity_commitment;

    true
}

fn compute_identity_message(uid: Field) -> Field {
    uid * 1000 + 42
}

fn recover_signer(message: Field, r: Field, s: Field) -> Field {
    (message + r * 3 + s * 7) % 7919
}

fn commit_identity(uid: Field) -> Field {
    (uid * 4721) % 65537
}

fn verify_authority_sig(uid: Field, authority: Field, sig: [Field; 2]) -> bool {
    let msg = compute_identity_message(uid);
    let recovered = recover_signer(msg, sig[0], sig[1]);
    recovered == authority
}

#[test]
fn test_identity_verification_valid() {
    let uid: Field = 777;
    let msg = compute_identity_message(uid);
    let r: Field = 11;
    let s: Field = 13;
    let authority = (msg + r * 3 + s * 7) % 7919;
    let commitment = commit_identity(uid);
    let result = main(uid, authority, r, s, commitment);
    assert(result);
}

#[test]
fn test_identity_verification_invalid_sig() {
    let uid: Field = 777;
    let msg = compute_identity_message(uid);
    let r: Field = 11;
    let s: Field = 13;
    let authority = (msg + r * 3 + s * 7) % 7919;
    let commitment = commit_identity(uid);
    let result = main(uid, authority, 0, 0, commitment);
    assert(result == false);
}

#[test]
fn test_verify_authority_sig() {
    let uid: Field = 100;
    let msg = compute_identity_message(uid);
    let r: Field = 3;
    let s: Field = 5;
    let authority = (msg + r * 3 + s * 7) % 7919;
    assert(verify_authority_sig(uid, authority, [r, s]));
    assert(!verify_authority_sig(uid, 999, [r, s]));
}
