// multi issuer aggregator
// Generated: KYC Vault - Privacy Preserving Identity
// Aggregates attestations from multiple independent issuers

fn main(
    issuer_pubkeys: [Field; 3],
    attestations: [Field; 3],
    signatures: [[Field; 2]; 3],
    user_id: Field,
    required_issuers: pub Field,
) -> pub bool {
    let mut valid_count: Field = 0;

    let mut i = 0;
    while i < 3 {
        let msg = compute_attestation_message(issuer_pubkeys[i], user_id, attestations[i]);
        let recovered = recover_aggregate_signer(msg, signatures[i][0], signatures[i][1]);
        if recovered == issuer_pubkeys[i] {
            valid_count = valid_count + 1;
        }
        i = i + 1;
    }

    constrain valid_count >= required_issuers;
    true
}

fn compute_attestation_message(issuer: Field, user: Field, att: Field) -> Field {
    (issuer * 1000 + user * 100 + att) % 7919
}

fn recover_aggregate_signer(message: Field, r: Field, s: Field) -> Field {
    (message + r * 7 + s * 13) % 7919
}

fn count_valid_attestations(
    issuers: [Field; 3], atts: [Field; 3], sigs: [[Field; 2]; 3], user: Field,
) -> Field {
    let mut count: Field = 0;
    let mut i = 0;
    while i < 3 {
        let msg = compute_attestation_message(issuers[i], user, atts[i]);
        let recovered = recover_aggregate_signer(msg, sigs[i][0], sigs[i][1]);
        if recovered == issuers[i] {
            count = count + 1;
        }
        i = i + 1;
    }
    count
}

fn all_issuers_valid(issuers: [Field; 3], atts: [Field; 3], sigs: [[Field; 2]; 3], user: Field) -> bool {
    let count = count_valid_attestations(issuers, atts, sigs, user);
    count == 3
}

#[test]
fn test_multi_issuer_aggregator_all_valid() {
    let user: Field = 42;
    let pubkeys: [Field; 3] = [100, 200, 300];
    let atts: [Field; 3] = [1, 2, 3];
    let mut sigs: [[Field; 2]; 3] = [[0, 0], [0, 0], [0, 0]];
    let mut i = 0;
    while i < 3 {
        let msg = compute_attestation_message(pubkeys[i], user, atts[i]);
        sigs[i] = [msg + 7, msg + 13];
        i = i + 1;
    }
    let result = main(pubkeys, atts, sigs, user, 2);
    assert(result);
}

#[test]
fn test_multi_issuer_aggregator_not_enough() {
    let user: Field = 42;
    let pubkeys: [Field; 3] = [100, 200, 300];
    let atts: [Field; 3] = [1, 2, 3];
    let sigs: [[Field; 2]; 3] = [[0, 0], [0, 0], [0, 0]];
    let result = main(pubkeys, atts, sigs, user, 2);
    assert(result == false);
}

#[test]
fn test_count_valid_attestations() {
    let user: Field = 10;
    let pubkeys: [Field; 3] = [1, 2, 3];
    let atts: [Field; 3] = [10, 20, 30];
    let mut sigs: [[Field; 2]; 3] = [[0, 0], [0, 0], [0, 0]];
    let mut i = 0;
    while i < 3 {
        let msg = compute_attestation_message(pubkeys[i], user, atts[i]);
        sigs[i] = [msg + 7, msg + 13];
        i = i + 1;
    }
    assert(count_valid_attestations(pubkeys, atts, sigs, user) == 3);
    assert(count_valid_attestations(pubkeys, atts, [[0, 0], [0, 0], [0, 0]], user) == 0);
}

#[test]
fn test_all_issuers_valid() {
    let user: Field = 5;
    let pubkeys: [Field; 3] = [10, 20, 30];
    let atts: [Field; 3] = [100, 200, 300];
    let mut sigs: [[Field; 2]; 3] = [[0, 0], [0, 0], [0, 0]];
    let mut i = 0;
    while i < 3 {
        let msg = compute_attestation_message(pubkeys[i], user, atts[i]);
        sigs[i] = [msg + 7, msg + 13];
        i = i + 1;
    }
    assert(all_issuers_valid(pubkeys, atts, sigs, user));
    assert(!all_issuers_valid(pubkeys, atts, [[0, 0], [0, 0], [0, 0]], user));
}
