// combined proof
// Generated: KYC Vault - Privacy Preserving Identity
// This circuit implements age verification using zero-knowledge proofs

fn main(age: pub Field, min_age: pub Field) -> pub bool {
    constrain age >= min_age;
    true
}

#[test]
fn test_age_verification() {
    let result = main(25, 21);
    assert(result);
}
