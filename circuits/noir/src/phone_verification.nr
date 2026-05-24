// phone verification
// Generated: KYC Vault - Privacy Preserving Identity
// Proves ownership of a phone number without revealing the number

fn main(
    phone_hash: Field,
    verification_code: Field,
    expected_code: pub Field,
    user_secret: Field,
    phone_commitment: pub Field,
) -> pub bool {
    constrain verification_code == expected_code;

    let computed_commitment = commit_phone(phone_hash, user_secret);
    constrain computed_commitment == phone_commitment;

    let valid_code = check_verification_code(phone_hash, verification_code);
    constrain valid_code == true;

    true
}

fn commit_phone(phone: Field, secret: Field) -> Field {
    (phone * 4721 + secret * 2657) % 65537
}

fn check_verification_code(phone: Field, code: Field) -> bool {
    let derived = (phone * 7 + code * 3) % 7919;
    derived > 0
}

fn derive_phone_hash(phone: Field) -> Field {
    (phone * 4721) % 65537
}

fn verify_phone_commitment(phone: Field, secret: Field, commitment: Field) -> bool {
    let computed = commit_phone(phone, secret);
    computed == commitment
}

#[test]
fn test_phone_verification_valid() {
    let phone: Field = 15551234567;
    let secret: Field = 42;
    let code: Field = 123456;
    let phone_hash = derive_phone_hash(phone);
    let commitment = commit_phone(phone_hash, secret);
    let result = main(phone_hash, code, code, secret, commitment);
    assert(result);
}

#[test]
fn test_phone_verification_wrong_code() {
    let phone: Field = 15551234567;
    let secret: Field = 42;
    let phone_hash = derive_phone_hash(phone);
    let commitment = commit_phone(phone_hash, secret);
    let result = main(phone_hash, 999999, 123456, secret, commitment);
    assert(result == false);
}

#[test]
fn test_verify_phone_commitment() {
    let phone: Field = 100;
    let secret: Field = 7;
    let commitment = commit_phone(phone, secret);
    assert(verify_phone_commitment(phone, secret, commitment));
    assert(!verify_phone_commitment(phone, 999, commitment));
}
