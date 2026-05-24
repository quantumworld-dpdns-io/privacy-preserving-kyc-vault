// forward secret proof
// Generated: KYC Vault - Privacy Preserving Identity
// Past proofs are invalidated by key rotation via epoch-based key derivation

fn main(
    proof_epoch: pub Field,
    current_epoch: pub Field,
    secret_key: Field,
    rotated_key: pub Field,
    proof_data: Field,
    expected_proof: pub Field,
) -> pub bool {
    constrain current_epoch >= proof_epoch;

    let derived_key = derive_rotation_key(secret_key, proof_epoch);
    constrain derived_key == rotated_key;

    let computed_proof = compute_forward_proof(proof_data, derived_key);
    constrain computed_proof == expected_proof;

    true
}

fn derive_rotation_key(secret: Field, epoch: Field) -> Field {
    (secret * 7919 + epoch * 4721) % 65537
}

fn compute_forward_proof(data: Field, key: Field) -> Field {
    (data * key) % 7919
}

fn is_key_valid(secret: Field, epoch: Field, rotated: Field) -> bool {
    let derived = derive_rotation_key(secret, epoch);
    derived == rotated
}

fn is_proof_epoch_valid(proof_epoch: Field, current_epoch: Field) -> bool {
    current_epoch >= proof_epoch
}

#[test]
fn test_forward_secret_valid() {
    let secret: Field = 777;
    let epoch: Field = 3;
    let current: Field = 5;
    let rotated = derive_rotation_key(secret, epoch);
    let data: Field = 12345;
    let expected = compute_forward_proof(data, rotated);
    let result = main(epoch, current, secret, rotated, data, expected);
    assert(result);
}

#[test]
fn test_forward_secret_expired() {
    let secret: Field = 777;
    let epoch: Field = 10;
    let current: Field = 5;
    let rotated = derive_rotation_key(secret, epoch);
    let data: Field = 12345;
    let expected = compute_forward_proof(data, rotated);
    let result = main(epoch, current, secret, rotated, data, expected);
    assert(result == false);
}

#[test]
fn test_is_key_valid() {
    let secret: Field = 100;
    let epoch: Field = 2;
    let rotated = derive_rotation_key(secret, epoch);
    assert(is_key_valid(secret, epoch, rotated));
    assert(!is_key_valid(secret, 99, rotated));
}

#[test]
fn test_is_proof_epoch_valid() {
    assert(is_proof_epoch_valid(3, 5));
    assert(is_proof_epoch_valid(5, 5));
    assert(!is_proof_epoch_valid(6, 5));
}
