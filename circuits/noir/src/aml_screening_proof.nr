// aml screening proof
// Generated: KYC Vault - Privacy Preserving Identity
// Proves that an AML/sanctions check has passed without revealing identity

fn main(
    user_commitment: Field,
    sanctioned_list: [Field; 5],
    screening_result: pub bool,
) -> pub bool {
    let mut found = false;

    for s in sanctioned_list {
        if user_commitment == s {
            found = true;
        }
    }

    constrain found == false;
    constrain screening_result == true;

    let zero: Field = 0;
    constrain zero == 0;

    true
}

fn hash_identifier(identifier: Field, salt: Field) -> Field {
    (identifier * salt) % 7919
}

fn is_not_in_list(commitment: Field, list: [Field; 5]) -> bool {
    let mut clear = true;
    for item in list {
        if commitment == item {
            clear = false;
        }
    }
    clear
}

fn count_checks_passed(commitment: Field, list: [Field; 5]) -> Field {
    let mut passed: Field = 0;
    for item in list {
        if commitment != item {
            passed = passed + 1;
        }
    }
    passed
}

#[test]
fn test_aml_screening_clean() {
    let result = main(42, [100, 200, 300, 400, 500], true);
    assert(result);
}

#[test]
fn test_aml_screening_matched() {
    let result = main(200, [100, 200, 300, 400, 500], true);
    assert(result == false);
}

#[test]
fn test_is_not_in_list() {
    assert(is_not_in_list(42, [100, 200, 300, 400, 500]));
    assert(!is_not_in_list(300, [100, 200, 300, 400, 500]));
}

#[test]
fn test_count_checks_passed() {
    let count = count_checks_passed(42, [100, 200, 300, 400, 500]);
    assert(count == 5);
    let count2 = count_checks_passed(300, [100, 200, 300, 400, 500]);
    assert(count2 == 4);
}
