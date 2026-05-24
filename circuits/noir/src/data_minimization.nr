// data minimization
// Generated: KYC Vault - Privacy Preserving Identity
// Enables minimal disclosure by selectively revealing only required claims

fn main(
    all_claims: [Field; 5],
    disclosure_mask: [bool; 5],
    required_claims: [bool; 5],
) -> pub bool {
    let mut i = 0;
    while i < 5 {
        if required_claims[i] == true {
            constrain disclosure_mask[i] == true;
        }
        i = i + 1;
    }

    let mut disclosed_count: Field = 0;
    let mut j = 0;
    while j < 5 {
        if disclosure_mask[j] == true {
            disclosed_count = disclosed_count + 1;
        }
        j = j + 1;
    }

    let mut required_count: Field = 0;
    let mut k = 0;
    while k < 5 {
        if required_claims[k] == true {
            required_count = required_count + 1;
        }
        k = k + 1;
    }

    let minimized: bool = disclosed_count <= required_count + 1;
    constrain minimized == true;

    true
}

fn select_disclosed(all: [Field; 5], mask: [bool; 5]) -> [Field; 5] {
    let mut result = [0, 0, 0, 0, 0];
    let mut i = 0;
    while i < 5 {
        if mask[i] == true {
            result[i] = all[i];
        }
        i = i + 1;
    }
    result
}

fn count_disclosed(mask: [bool; 5]) -> Field {
    let mut count: Field = 0;
    let mut i = 0;
    while i < 5 {
        if mask[i] == true {
            count = count + 1;
        }
        i = i + 1;
    }
    count
}

fn claims_overlap(a: [bool; 5], b: [bool; 5]) -> bool {
    let mut overlap = false;
    let mut i = 0;
    while i < 5 {
        if a[i] == true & b[i] == true {
            overlap = true;
        }
        i = i + 1;
    }
    overlap
}

#[test]
fn test_data_minimization_exact_match() {
    let claims = [100, 200, 300, 400, 500];
    let mask = [true, true, false, false, false];
    let required = [true, true, false, false, false];
    let result = main(claims, mask, required);
    assert(result);
}

#[test]
fn test_data_minimization_extra_disclosure() {
    let claims = [100, 200, 300, 400, 500];
    let mask = [true, true, true, true, true];
    let required = [true, false, false, false, false];
    let result = main(claims, mask, required);
    assert(result == false);
}

#[test]
fn test_data_minimization_missing_required() {
    let claims = [100, 200, 300, 400, 500];
    let mask = [false, false, false, false, false];
    let required = [true, false, false, false, false];
    let result = main(claims, mask, required);
    assert(result == false);
}

#[test]
fn test_select_disclosed() {
    let all = [1, 2, 3, 4, 5];
    let mask = [true, false, true, false, true];
    let selected = select_disclosed(all, mask);
    assert(selected[0] == 1);
    assert(selected[1] == 0);
    assert(selected[2] == 3);
    assert(selected[3] == 0);
    assert(selected[4] == 5);
}

#[test]
fn test_count_disclosed() {
    assert(count_disclosed([true, false, true, false, true]) == 3);
    assert(count_disclosed([false, false, false, false, false]) == 0);
}
