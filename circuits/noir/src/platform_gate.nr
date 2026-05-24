// platform gate
// Generated: KYC Vault - Privacy Preserving Identity
// Enforces platform-specific KYC requirements

fn main(
    platform_id: pub Field,
    required_level: pub Field,
    user_level: Field,
    age_ok: pub bool,
    nationality_ok: pub bool,
) -> pub bool {
    constrain user_level >= required_level;
    constrain age_ok == true;
    constrain nationality_ok == true;

    let platform_min_age: Field = get_platform_min_age(platform_id);
    let user_age: Field = get_user_age();
    constrain user_age >= platform_min_age;

    let allowed: bool = is_allowed_platform(platform_id);
    constrain allowed == true;

    true
}

fn get_platform_min_age(_platform_id: Field) -> Field {
    18
}

fn get_user_age() -> Field {
    25
}

fn is_allowed_platform(platform_id: Field) -> bool {
    const PLATFORM_A: Field = 1;
    const PLATFORM_B: Field = 2;
    const PLATFORM_C: Field = 3;

    (platform_id == PLATFORM_A) | (platform_id == PLATFORM_B) | (platform_id == PLATFORM_C)
}

#[test]
fn test_platform_gate_allowed() {
    let result = main(1, 3, 5, true, true);
    assert(result);
}

#[test]
fn test_platform_gate_insufficient_level() {
    let result = main(1, 5, 3, true, true);
    assert(result == false);
}

#[test]
fn test_platform_gate_disallowed_platform() {
    let result = main(99, 1, 1, true, true);
    assert(result == false);
}
