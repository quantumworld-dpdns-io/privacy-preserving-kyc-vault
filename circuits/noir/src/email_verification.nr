// email verification
// Generated: KYC Vault - Privacy Preserving Identity
// Proves ownership of an email address without revealing the address

fn main(
    email_hash: Field,
    verification_token: Field,
    expected_token: pub Field,
    user_secret: Field,
    email_commitment: pub Field,
) -> pub bool {
    constrain verification_token == expected_token;

    let computed_commitment = commit_email(email_hash, user_secret);
    constrain computed_commitment == email_commitment;

    let valid = check_email_token(email_hash, verification_token);
    constrain valid == true;

    true
}

fn commit_email(email: Field, secret: Field) -> Field {
    (email * 7919 + secret * 4721) % 65537
}

fn check_email_token(email: Field, token: Field) -> bool {
    let derived = (email * 11 + token * 5) % 7919;
    derived > 0
}

fn derive_email_hash(email: Field) -> Field {
    (email * 7919) % 65537
}

fn verify_email_commitment(email: Field, secret: Field, commitment: Field) -> bool {
    let computed = commit_email(email, secret);
    computed == commitment
}

#[test]
fn test_email_verification_valid() {
    let email: Field = 999;
    let secret: Field = 77;
    let token: Field = 888888;
    let email_hash = derive_email_hash(email);
    let commitment = commit_email(email_hash, secret);
    let result = main(email_hash, token, token, secret, commitment);
    assert(result);
}

#[test]
fn test_email_verification_wrong_token() {
    let email: Field = 999;
    let secret: Field = 77;
    let email_hash = derive_email_hash(email);
    let commitment = commit_email(email_hash, secret);
    let result = main(email_hash, 111111, 888888, secret, commitment);
    assert(result == false);
}

#[test]
fn test_verify_email_commitment() {
    let email: Field = 200;
    let secret: Field = 5;
    let commitment = commit_email(email, secret);
    assert(verify_email_commitment(email, secret, commitment));
    assert(!verify_email_commitment(email, 999, commitment));
}
