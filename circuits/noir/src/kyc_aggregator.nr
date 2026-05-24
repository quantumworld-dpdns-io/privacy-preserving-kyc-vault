// kyc aggregator
// Generated: KYC Vault - Privacy Preserving Identity
// Aggregates multiple KYC sub-proof results into a single composite proof

fn main(
    age_passed: pub bool,
    nationality_passed: pub bool,
    aml_passed: pub bool,
    income_passed: pub bool,
    biometric_passed: pub bool,
    consent_passed: pub bool,
    revocation_passed: pub bool,
    expiry_passed: pub bool,
) -> pub bool {
    constrain age_passed == true;
    constrain nationality_passed == true;
    constrain aml_passed == true;
    constrain income_passed == true;
    constrain biometric_passed == true;
    constrain consent_passed == true;
    constrain revocation_passed == true;
    constrain expiry_passed == true;

    let nonce = 0;
    constrain nonce == 0;

    true
}

fn internal_aggregate(results: [bool; 8]) -> bool {
    let mut i = 0;
    let mut all_pass = true;
    for r in results {
        constrain r == true;
        if r == false {
            all_pass = false;
        }
        i = i + 1;
    }
    all_pass
}

#[test]
fn test_kyc_aggregator_all_pass() {
    let result = main(true, true, true, true, true, true, true, true);
    assert(result);
}

#[test]
fn test_kyc_aggregator_fail_age() {
    let result = main(false, true, true, true, true, true, true, true);
    assert(result == false);
}
