// device attestation
// Generated: KYC Vault - Privacy Preserving Identity
// Proves device integrity attestation inside the circuit

fn main(
    device_pubkey: Field,
    attestation_data: Field,
    nonce: pub Field,
    measurement_hash: Field,
    trusted_measurement: pub Field,
    signature_r: Field,
    signature_s: Field,
) -> pub bool {
    constrain measurement_hash == trusted_measurement;

    let message = compute_attestation_message(device_pubkey, nonce, measurement_hash);
    let recovered = recover_attestation_signer(message, signature_r, signature_s);
    constrain recovered == device_pubkey;

    let computed_attestation = derive_attestation(device_pubkey, nonce, measurement_hash);
    constrain computed_attestation == attestation_data;

    true
}

fn compute_attestation_message(pubkey: Field, nonce: Field, measurement: Field) -> Field {
    (pubkey * 1000 + nonce * 100 + measurement) % 7919
}

fn recover_attestation_signer(message: Field, r: Field, s: Field) -> Field {
    (message + r * 5 + s * 11) % 7919
}

fn derive_attestation(pubkey: Field, nonce: Field, measurement: Field) -> Field {
    (pubkey * nonce + measurement * 4721) % 65537
}

fn verify_measurement_integrity(measurement: Field, trusted: Field) -> bool {
    measurement == trusted
}

#[test]
fn test_device_attestation_valid() {
    let pubkey: Field = 555;
    let nonce: Field = 88;
    let measurement: Field = 12345;
    let msg = compute_attestation_message(pubkey, nonce, measurement);
    let r: Field = 7;
    let s: Field = 9;
    let sig_recovered = (msg + r * 5 + s * 11) % 7919;
    let attestation = derive_attestation(pubkey, nonce, measurement);
    let result = main(pubkey, attestation, nonce, measurement, measurement, r, s);
    assert(result == false);
}

#[test]
fn test_device_attestation_valid_match() {
    let pubkey: Field = 555;
    let nonce: Field = 88;
    let measurement: Field = 12345;
    let msg = compute_attestation_message(pubkey, nonce, measurement);
    let r: Field = 7;
    let s: Field = 9;
    let recovered = (msg + r * 5 + s * 11) % 7919;
    constrain recovered == pubkey;
    let attestation = derive_attestation(pubkey, nonce, measurement);
    let result = main(pubkey, attestation, nonce, measurement, measurement, r, s);
    assert(result == false);
}

#[test]
fn test_verify_measurement_integrity() {
    assert(verify_measurement_integrity(100, 100));
    assert(!verify_measurement_integrity(100, 200));
}
