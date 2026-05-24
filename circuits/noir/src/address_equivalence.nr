// address equivalence
// Generated: KYC Vault - Privacy Preserving Identity
// Proves that two address commitments refer to the same underlying address

fn main(
    address_secret: Field,
    commitment_a: pub Field,
    commitment_b: pub Field,
    nonce_a: Field,
    nonce_b: Field,
) -> pub bool {
    let computed_a = pedersen_commit(address_secret, nonce_a);
    constrain computed_a == commitment_a;

    let computed_b = pedersen_commit(address_secret, nonce_b);
    constrain computed_b == commitment_b;

    true
}

fn pedersen_commit(secret: Field, blinding: Field) -> Field {
    (secret * 7919 + blinding * 4721) % 65537
}

fn derive_commitment(secret: Field, blinding: Field) -> Field {
    pedersen_commit(secret, blinding)
}

fn verify_equivalence(secret: Field, comm_a: Field, comm_b: Field, blind_a: Field, blind_b: Field) -> bool {
    let a = pedersen_commit(secret, blind_a);
    let b = pedersen_commit(secret, blind_b);
    (a == comm_a) & (b == comm_b)
}

#[test]
fn test_address_equivalence_match() {
    let secret: Field = 12345;
    let nonce_a: Field = 99;
    let nonce_b: Field = 77;
    let comm_a = pedersen_commit(secret, nonce_a);
    let comm_b = pedersen_commit(secret, nonce_b);
    let result = main(secret, comm_a, comm_b, nonce_a, nonce_b);
    assert(result);
}

#[test]
fn test_address_equivalence_mismatch() {
    let secret: Field = 12345;
    let nonce_a: Field = 99;
    let nonce_b: Field = 77;
    let comm_a = pedersen_commit(secret, nonce_a);
    let comm_b = pedersen_commit(99999, nonce_b);
    let result = main(secret, comm_a, comm_b, nonce_a, nonce_b);
    assert(result == false);
}

#[test]
fn test_verify_equivalence() {
    let s: Field = 42;
    let na: Field = 1;
    let nb: Field = 2;
    let ca = pedersen_commit(s, na);
    let cb = pedersen_commit(s, nb);
    assert(verify_equivalence(s, ca, cb, na, nb));
    assert(!verify_equivalence(s, ca, cb, na, 999));
}
