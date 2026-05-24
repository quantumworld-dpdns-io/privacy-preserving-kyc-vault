// jurisdiction compliance
// Generated: KYC Vault - Privacy Preserving Identity
// Proves compliance with jurisdiction-specific regulatory rules

fn main(
    jurisdiction_id: Field,
    user_nationality: Field,
    allowed_jurisdictions: [Field; 5],
    min_age_local: Field,
    user_age: Field,
) -> pub bool {
    let mut in_allowed = false;
    for j in allowed_jurisdictions {
        if jurisdiction_id == j {
            in_allowed = true;
        }
    }
    constrain in_allowed == true;

    constrain user_age >= min_age_local;

    let is_domestic: bool = user_nationality == jurisdiction_id;
    let requires_extra: Field;
    if is_domestic {
        requires_extra = 0;
    } else {
        requires_extra = 1;
    }

    if requires_extra == 1 {
        constrain user_age >= min_age_local + 3;
    }

    true
}

fn is_sanctioned_jurisdiction(jurisdiction_id: Field) -> bool {
    const SANCTIONED_A: Field = 99;
    const SANCTIONED_B: Field = 100;
    (jurisdiction_id == SANCTIONED_A) | (jurisdiction_id == SANCTIONED_B)
}

fn get_jurisdiction_min_age(jurisdiction_id: Field) -> Field {
    if jurisdiction_id == 1 {
        18
    } else if jurisdiction_id == 2 {
        21
    } else {
        16
    }
}

#[test]
fn test_jurisdiction_compliance_allowed() {
    let result = main(1, 2, [1, 2, 3, 4, 5], 18, 25);
    assert(result);
}

#[test]
fn test_jurisdiction_compliance_underage() {
    let result = main(1, 2, [1, 2, 3, 4, 5], 18, 16);
    assert(result == false);
}

#[test]
fn test_jurisdiction_not_allowed() {
    let result = main(99, 2, [1, 2, 3, 4, 5], 18, 25);
    assert(result == false);
}
