// liveness proof
// Generated: KYC Vault - Privacy Preserving Identity
// Proves that a liveness check challenge was answered correctly

fn main(
    challenge_nonce: pub Field,
    response_hash: Field,
    expected_response: pub Field,
    user_secret: Field,
) -> pub bool {
    let computed = compute_liveness_response(challenge_nonce, user_secret);
    constrain computed == expected_response;
    constrain response_hash == hash_response(computed);

    true
}

fn compute_liveness_response(nonce: Field, secret: Field) -> Field {
    (nonce * secret + 1337) % 7919
}

fn hash_response(response: Field) -> Field {
    (response * 2657) % 65537
}

fn verify_challenge_response(nonce: Field, secret: Field, expected: Field) -> bool {
    let computed = compute_liveness_response(nonce, secret);
    computed == expected
}

fn derive_challenge_hash(nonce: Field, secret: Field) -> Field {
    let response = compute_liveness_response(nonce, secret);
    hash_response(response)
}

#[test]
fn test_liveness_valid() {
    let nonce: Field = 42;
    let secret: Field = 999;
    let expected = compute_liveness_response(nonce, secret);
    let hash = hash_response(expected);
    let result = main(nonce, hash, expected, secret);
    assert(result);
}

#[test]
fn test_liveness_invalid_response() {
    let nonce: Field = 42;
    let secret: Field = 999;
    let hash = hash_response(0);
    let result = main(nonce, hash, 0, secret);
    assert(result == false);
}

#[test]
fn test_verify_challenge_response() {
    let nonce: Field = 7;
    let secret: Field = 123;
    let expected = compute_liveness_response(nonce, secret);
    assert(verify_challenge_response(nonce, secret, expected));
    assert(!verify_challenge_response(nonce, secret, 0));
}

#[test]
fn test_derive_challenge_hash() {
    let nonce: Field = 5;
    let secret: Field = 50;
    let expected = compute_liveness_response(nonce, secret);
    let expected_hash = hash_response(expected);
    assert(derive_challenge_hash(nonce, secret) == expected_hash);
}
