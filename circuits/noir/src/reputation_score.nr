// reputation score
// Generated: KYC Vault - Privacy Preserving Identity
// Proves that a reputation score meets a minimum threshold

fn main(
    score: Field,
    threshold: pub Field,
    score_commitment: pub Field,
    blinding: Field,
) -> pub bool {
    constrain score >= threshold;

    let computed_commitment = commit_score(score, blinding);
    constrain computed_commitment == score_commitment;

    let within_range = (score >= 0) & (score <= 1000);
    constrain within_range == true;

    true
}

fn commit_score(score: Field, blinding: Field) -> Field {
    (score * 4721 + blinding * 2657) % 65537
}

fn is_above_threshold(s: Field, t: Field) -> bool {
    s >= t
}

fn compute_reputation_tier(score: Field) -> Field {
    if score >= 800 {
        4
    } else if score >= 600 {
        3
    } else if score >= 400 {
        2
    } else if score >= 200 {
        1
    } else {
        0
    }
}

fn verify_score_commitment(score: Field, blinding: Field, commitment: Field) -> bool {
    let computed = commit_score(score, blinding);
    computed == commitment
}

#[test]
fn test_reputation_score_above_threshold() {
    let score: Field = 750;
    let threshold: Field = 500;
    let blinding: Field = 123;
    let commitment = commit_score(score, blinding);
    let result = main(score, threshold, commitment, blinding);
    assert(result);
}

#[test]
fn test_reputation_score_below_threshold() {
    let score: Field = 300;
    let threshold: Field = 500;
    let blinding: Field = 123;
    let commitment = commit_score(score, blinding);
    let result = main(score, threshold, commitment, blinding);
    assert(result == false);
}

#[test]
fn test_is_above_threshold() {
    assert(is_above_threshold(100, 50));
    assert(is_above_threshold(50, 50));
    assert(!is_above_threshold(49, 50));
}

#[test]
fn test_compute_reputation_tier() {
    assert(compute_reputation_tier(900) == 4);
    assert(compute_reputation_tier(700) == 3);
    assert(compute_reputation_tier(500) == 2);
    assert(compute_reputation_tier(300) == 1);
    assert(compute_reputation_tier(100) == 0);
}

#[test]
fn test_verify_score_commitment() {
    let s: Field = 600;
    let b: Field = 42;
    let c = commit_score(s, b);
    assert(verify_score_commitment(s, b, c));
    assert(!verify_score_commitment(s, 999, c));
}
