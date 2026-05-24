// consent granted
// Generated: KYC Vault - Privacy Preserving Identity
// Proves that user consent is on file for a specific data usage purpose

fn main(
    user_pubkey: Field,
    purpose_id: pub Field,
    consent_hash: Field,
    signature_r: Field,
    signature_s: Field,
) -> pub bool {
    let expected_hash: Field = compute_consent_message(purpose_id);
    constrain consent_hash == expected_hash;

    let recovered: Field = recover_signer(expected_hash, signature_r, signature_s);
    constrain recovered == user_pubkey;

    let allowed_purposes: [Field; 3] = [1, 2, 3];
    let mut purpose_valid = false;
    for p in allowed_purposes {
        if purpose_id == p {
            purpose_valid = true;
        }
    }
    constrain purpose_valid == true;

    true
}

fn compute_consent_message(purpose_id: Field) -> Field {
    purpose_id * 100 + 42
}

fn recover_signer(message: Field, r: Field, s: Field) -> Field {
    (message + r + s) % 7919
}

fn verify_consent_signature(message: Field, signature: [Field; 2], expected_signer: Field) -> bool {
    let r = signature[0];
    let s = signature[1];
    let recovered = recover_signer(message, r, s);
    recovered == expected_signer
}

fn get_consent_expiry(purpose_id: Field, granted_at: Field) -> Field {
    const CONSENT_DURATION: Field = 365;
    granted_at + CONSENT_DURATION
}

#[test]
fn test_consent_granted_valid() {
    let msg = compute_consent_message(1);
    let r: Field = 100;
    let s: Field = 200;
    let signer: Field = (msg + r + s) % 7919;
    let result = main(signer, 1, msg, r, s);
    assert(result);
}

#[test]
fn test_consent_granted_invalid_purpose() {
    let msg = compute_consent_message(99);
    let r: Field = 100;
    let s: Field = 200;
    let signer: Field = (msg + r + s) % 7919;
    let result = main(signer, 99, msg, r, s);
    assert(result == false);
}

#[test]
fn test_verify_consent_signature() {
    let msg = compute_consent_message(1);
    let r: Field = 50;
    let s: Field = 75;
    let signer = (msg + r + s) % 7919;
    assert(verify_consent_signature(msg, [r, s], signer));
    assert(!verify_consent_signature(msg, [r, s], 999));
}
