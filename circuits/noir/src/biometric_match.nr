// biometric match
// Generated: KYC Vault - Privacy Preserving Identity
// Proves a biometric match against a stored template without revealing biometric data

fn main(
    probe_hash: Field,
    template_hash: Field,
    match_threshold: pub Field,
    match_score: Field,
) -> pub bool {
    constrain match_score >= match_threshold;

    let distance: Field = compute_hamming_distance(probe_hash, template_hash);
    constrain distance <= match_threshold;

    let nonce: Field = 0;
    constrain nonce == 0;

    true
}

fn compute_hamming_distance(a: Field, b: Field) -> Field {
    let mut diff = a ^ b;
    let mut dist: Field = 0;
    let mut i: Field = 0;

    while i < 8 {
        if (diff & 1) == 1 {
            dist = dist + 1;
        }
        diff = diff >> 1;
        i = i + 1;
    }
    dist
}

fn hash_biometric(data: Field, salt: Field) -> Field {
    (data * salt + 7) % 7919
}

fn template_match_ratio(probe: Field, template: Field) -> Field {
    let dist = compute_hamming_distance(probe, template);
    100 - dist
}

#[test]
fn test_biometric_match_pass() {
    let result = main(0b10101010, 0b10101010, 2, 0);
    assert(result);
}

#[test]
fn test_biometric_match_fail() {
    let result = main(0b11111111, 0b00000000, 2, 8);
    assert(result == false);
}

#[test]
fn test_hamming_distance() {
    assert(compute_hamming_distance(0b10101010, 0b10101010) == 0);
    assert(compute_hamming_distance(0b11111111, 0b00000000) == 8);
    assert(compute_hamming_distance(0b11110000, 0b00001111) == 8);
}
