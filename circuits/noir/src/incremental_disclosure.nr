// incremental disclosure
// Generated: KYC Vault - Privacy Preserving Identity
// Gradual reveal of attributes with expiration control

fn main(
    all_attributes: [Field; 5],
    disclosure_epoch: pub Field,
    current_epoch: pub Field,
    epoch_expiry: Field,
    disclosure_mask: [bool; 5],
    epoch_key: Field,
) -> pub bool {
    constrain current_epoch <= epoch_expiry;
    constrain current_epoch >= disclosure_epoch;

    let derived_key = derive_epoch_key(disclosure_epoch, epoch_key);
    let mut i = 0;
    while i < 5 {
        if disclosure_mask[i] == true {
            let revealed = derive_disclosed_attribute(all_attributes[i], derived_key);
            constrain revealed != 0;
        }
        i = i + 1;
    }

    true
}

fn derive_epoch_key(epoch: Field, base_key: Field) -> Field {
    (epoch * 4721 + base_key * 2657) % 65537
}

fn derive_disclosed_attribute(attr: Field, epoch_key: Field) -> Field {
    (attr * epoch_key) % 7919
}

fn is_epoch_active(current: Field, epoch: Field, expiry: Field) -> bool {
    (current >= epoch) & (current <= expiry)
}

fn compute_disclosure_hash(attr: Field, key: Field) -> Field {
    derive_disclosed_attribute(attr, key)
}

fn get_remaining_epochs(current: Field, expiry: Field) -> Field {
    if expiry >= current {
        expiry - current
    } else {
        0
    }
}

#[test]
fn test_incremental_disclosure_valid() {
    let attrs: [Field; 5] = [10, 20, 30, 40, 50];
    let mask: [bool; 5] = [true, false, true, false, false];
    let result = main(attrs, 5, 5, 10, mask, 999);
    assert(result);
}

#[test]
fn test_incremental_disclosure_expired() {
    let attrs: [Field; 5] = [10, 20, 30, 40, 50];
    let mask: [bool; 5] = [true, false, true, false, false];
    let result = main(attrs, 5, 15, 10, mask, 999);
    assert(result == false);
}

#[test]
fn test_incremental_disclosure_before_epoch() {
    let attrs: [Field; 5] = [10, 20, 30, 40, 50];
    let mask: [bool; 5] = [true, false, true, false, false];
    let result = main(attrs, 10, 5, 20, mask, 999);
    assert(result == false);
}

#[test]
fn test_is_epoch_active() {
    assert(is_epoch_active(5, 5, 10));
    assert(is_epoch_active(10, 5, 10));
    assert(is_epoch_active(7, 5, 10));
    assert(!is_epoch_active(4, 5, 10));
    assert(!is_epoch_active(11, 5, 10));
}

#[test]
fn test_get_remaining_epochs() {
    assert(get_remaining_epochs(5, 10) == 5);
    assert(get_remaining_epochs(15, 10) == 0);
}
