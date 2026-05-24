// consent scope
// Generated: KYC Vault - Privacy Preserving Identity
// Proves that a requested data usage scope is within the granted consent scope

fn main(
    granted_purposes: [bool; 5],
    requested_purposes: [pub bool; 5],
    user_pubkey: Field,
    consent_signature_r: Field,
    consent_signature_s: Field,
    consent_nonce: pub Field,
) -> pub bool {
    let mut i = 0;
    while i < 5 {
        if requested_purposes[i] == true {
            constrain granted_purposes[i] == true;
        }
        i = i + 1;
    }

    let message = compute_consent_scope_message(granted_purposes, consent_nonce);
    let recovered = recover_consent_signer(message, consent_signature_r, consent_signature_s);
    constrain recovered == user_pubkey;

    true
}

fn compute_consent_scope_message(purposes: [bool; 5], nonce: Field) -> Field {
    let mut acc: Field = 0;
    let mut i = 0;
    while i < 5 {
        let val: Field = if purposes[i] { 1 } else { 0 };
        acc = (acc * 2 + val) % 7919;
        i = i + 1;
    }
    (acc * 1000 + nonce) % 7919
}

fn recover_consent_signer(message: Field, r: Field, s: Field) -> Field {
    (message + r * 7 + s * 13) % 7919
}

fn is_scope_sufficient(granted: [bool; 5], requested: [bool; 5]) -> bool {
    let mut i = 0;
    while i < 5 {
        if requested[i] == true & granted[i] == false {
            return false;
        }
        i = i + 1;
    }
    true
}

fn encode_scope(purposes: [bool; 5]) -> Field {
    let mut encoded: Field = 0;
    let mut i = 0;
    while i < 5 {
        let val: Field = if purposes[i] { 1 } else { 0 };
        encoded = encoded * 2 + val;
        i = i + 1;
    }
    encoded
}

#[test]
fn test_consent_scope_sufficient() {
    let granted: [bool; 5] = [true, true, false, false, false];
    let requested: [bool; 5] = [true, false, false, false, false];
    let nonce: Field = 42;
    let msg = compute_consent_scope_message(granted, nonce);
    let r: Field = 11;
    let s: Field = 13;
    let user = (msg + r * 7 + s * 13) % 7919;
    let result = main(granted, requested, user, r, s, nonce);
    assert(result);
}

#[test]
fn test_consent_scope_insufficient() {
    let granted: [bool; 5] = [false, true, false, false, false];
    let requested: [bool; 5] = [true, false, false, false, false];
    let nonce: Field = 42;
    let msg = compute_consent_scope_message(granted, nonce);
    let r: Field = 11;
    let s: Field = 13;
    let user = (msg + r * 7 + s * 13) % 7919;
    let result = main(granted, requested, user, r, s, nonce);
    assert(result == false);
}

#[test]
fn test_is_scope_sufficient() {
    let granted: [bool; 5] = [true, true, true, false, false];
    assert(is_scope_sufficient(granted, [true, false, false, false, false]));
    assert(is_scope_sufficient(granted, [true, true, false, false, false]));
    assert(!is_scope_sufficient(granted, [true, false, true, true, false]));
    assert(!is_scope_sufficient(granted, [false, false, false, true, false]));
}

#[test]
fn test_encode_scope() {
    assert(encode_scope([false, false, false, false, false]) == 0);
    assert(encode_scope([true, false, false, false, false]) == 1);
    assert(encode_scope([true, true, false, false, false]) == 3);
    assert(encode_scope([true, true, true, true, true]) == 31);
}
