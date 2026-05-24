// recursive proof combiner
// Generated: KYC Vault - Privacy Preserving Identity
// Merges multiple ZKP outcomes into a single composite proof

fn main(
    sub_proofs: [bool; 5],
    sub_proof_hashes: [Field; 5],
    expected_hashes: [pub Field; 5],
    combiner_secret: Field,
) -> pub bool {
    let mut i = 0;
    let mut all_pass = true;
    while i < 5 {
        if sub_proofs[i] == false {
            all_pass = false;
        }
        let computed_hash = hash_sub_proof(sub_proofs[i], combiner_secret);
        constrain computed_hash == expected_hashes[i];
        i = i + 1;
    }

    constrain all_pass == true;

    let combined_hash = hash_combined_result(sub_proofs, combiner_secret);
    constrain combined_hash > 0;

    true
}

fn hash_sub_proof(result: bool, secret: Field) -> Field {
    let val: Field = if result { 1 } else { 0 };
    (val * 4721 + secret * 2657) % 65537
}

fn hash_combined_result(results: [bool; 5], secret: Field) -> Field {
    let mut acc: Field = 0;
    let mut i = 0;
    while i < 5 {
        let val: Field = if results[i] { 1 } else { 0 };
        acc = (acc * 31 + val) % 65537;
        i = i + 1;
    }
    (acc * secret) % 65537
}

fn all_proofs_pass(proofs: [bool; 5]) -> bool {
    let mut i = 0;
    while i < 5 {
        if proofs[i] == false {
            return false;
        }
        i = i + 1;
    }
    true
}

fn combine_hashes(hashes: [Field; 5]) -> Field {
    let mut combined: Field = 0;
    let mut i = 0;
    while i < 5 {
        combined = (combined * 31 + hashes[i]) % 65537;
        i = i + 1;
    }
    combined
}

#[test]
fn test_recursive_combiner_all_pass() {
    let proofs: [bool; 5] = [true, true, true, true, true];
    let secret: Field = 42;
    let mut hashes: [Field; 5] = [0, 0, 0, 0, 0];
    let mut expected: [Field; 5] = [0, 0, 0, 0, 0];
    let mut i = 0;
    while i < 5 {
        hashes[i] = hash_sub_proof(proofs[i], secret);
        expected[i] = hashes[i];
        i = i + 1;
    }
    let result = main(proofs, hashes, expected, secret);
    assert(result);
}

#[test]
fn test_recursive_combiner_one_fail() {
    let proofs: [bool; 5] = [true, false, true, true, true];
    let secret: Field = 42;
    let mut hashes: [Field; 5] = [0, 0, 0, 0, 0];
    let mut expected: [Field; 5] = [0, 0, 0, 0, 0];
    let mut i = 0;
    while i < 5 {
        hashes[i] = hash_sub_proof(proofs[i], secret);
        expected[i] = hashes[i];
        i = i + 1;
    }
    let result = main(proofs, hashes, expected, secret);
    assert(result == false);
}

#[test]
fn test_all_proofs_pass() {
    assert(all_proofs_pass([true, true, true]));
    assert(!all_proofs_pass([true, false, true]));
}

#[test]
fn test_combine_hashes() {
    let h: [Field; 5] = [1, 2, 3, 4, 5];
    let combined = combine_hashes(h);
    assert(combined > 0);
}
