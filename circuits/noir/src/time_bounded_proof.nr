// time bounded proof
// Generated: KYC Vault - Privacy Preserving Identity
// Verifies that a proof is valid within a specific time window

fn main(
    current_timestamp: pub Field,
    valid_from: Field,
    valid_until: Field,
) -> pub bool {
    constrain current_timestamp >= valid_from;
    constrain current_timestamp <= valid_until;

    let window_duration: Field = valid_until - valid_from;
    constrain window_duration >= 0;

    true
}

fn is_within_window(ts: Field, start: Field, end: Field) -> bool {
    (ts >= start) & (ts <= end)
}

fn is_not_expired(ts: Field, expiry: Field) -> bool {
    ts <= expiry
}

fn has_started(ts: Field, start: Field) -> bool {
    ts >= start
}

#[test]
fn test_time_bounded_valid() {
    let result = main(1000, 500, 2000);
    assert(result);
}

#[test]
fn test_time_bounded_before_start() {
    let result = main(100, 500, 2000);
    assert(result == false);
}

#[test]
fn test_time_bounded_after_end() {
    let result = main(3000, 500, 2000);
    assert(result == false);
}

#[test]
fn test_is_within_window() {
    assert(is_within_window(1000, 500, 2000));
    assert(is_within_window(500, 500, 2000));
    assert(is_within_window(2000, 500, 2000));
    assert(!is_within_window(499, 500, 2000));
    assert(!is_within_window(2001, 500, 2000));
}

#[test]
fn test_is_not_expired() {
    assert(is_not_expired(100, 200));
    assert(is_not_expired(200, 200));
    assert(!is_not_expired(300, 200));
}

#[test]
fn test_has_started() {
    assert(has_started(100, 50));
    assert(has_started(50, 50));
    assert(!has_started(49, 50));
}
