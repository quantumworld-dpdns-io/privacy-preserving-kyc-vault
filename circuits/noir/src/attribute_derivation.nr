// attribute derivation
// Generated: KYC Vault - Privacy Preserving Identity
// Derives disclosed attributes from original credential attributes

fn main(
    original_attributes: [Field; 5],
    disclosure_mask: [bool; 5],
    derived_attributes: [pub Field; 5],
    derivation_secret: Field,
) -> pub bool {
    let mut i = 0;
    while i < 5 {
        if disclosure_mask[i] == true {
            let derived = derive_attribute(original_attributes[i], derivation_secret);
            constrain derived == derived_attributes[i];
        } else {
            constrain derived_attributes[i] == 0;
        }
        i = i + 1;
    }

    true
}

fn derive_attribute(original: Field, secret: Field) -> Field {
    (original * 4721 + secret * 2657) % 65537
}

fn derive_partial(original: Field, secret: Field, mask: Field) -> Field {
    if mask != 0 {
        derive_attribute(original, secret)
    } else {
        0
    }
}

fn hash_derived_attributes(derived: [Field; 5]) -> Field {
    let mut acc: Field = 0;
    let mut i = 0;
    while i < 5 {
        acc = (acc * 31 + derived[i]) % 65537;
        i = i + 1;
    }
    acc
}

fn count_disclosed_attributes(mask: [bool; 5]) -> Field {
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

#[test]
fn test_attribute_derivation_valid() {
    let originals: [Field; 5] = [100, 200, 300, 400, 500];
    let mask: [bool; 5] = [true, false, true, false, false];
    let secret: Field = 42;
    let mut derived: [Field; 5] = [0, 0, 0, 0, 0];
    derived[0] = derive_attribute(originals[0], secret);
    derived[2] = derive_attribute(originals[2], secret);
    let result = main(originals, mask, derived, secret);
    assert(result);
}

#[test]
fn test_attribute_derivation_wrong_derivation() {
    let originals: [Field; 5] = [100, 200, 300, 400, 500];
    let mask: [bool; 5] = [true, false, false, false, false];
    let secret: Field = 42;
    let mut derived: [Field; 5] = [0, 0, 0, 0, 0];
    derived[0] = 999;
    let result = main(originals, mask, derived, secret);
    assert(result == false);
}

#[test]
fn test_derive_partial() {
    let secret: Field = 7;
    let full = derive_attribute(100, secret);
    assert(derive_partial(100, secret, 1) == full);
    assert(derive_partial(100, secret, 0) == 0);
}

#[test]
fn test_hash_derived_attributes() {
    let d: [Field; 5] = [10, 20, 30, 40, 50];
    let h = hash_derived_attributes(d);
    assert(h > 0);
}

#[test]
fn test_count_disclosed_attributes() {
    assert(count_disclosed_attributes([true, false, true, true, false]) == 3);
    assert(count_disclosed_attributes([false, false, false, false, false]) == 0);
}
