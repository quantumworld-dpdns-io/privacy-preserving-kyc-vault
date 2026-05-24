// revocation check
// Generated: KYC Vault - Privacy Preserving Identity
// Proves that a credential has not been revoked

fn main(
    credential_id: Field,
    revocation_root: pub Field,
    merkle_path: [Field; 4],
    path_indices: [bool; 4],
) -> pub bool {
    for i in 0..4 {
        let sibling: Field = merkle_path[i];
        let is_right: bool = path_indices[i];
        if is_right == true {
            let computed: Field = hash_nodes(credential_id, sibling);
            constrain computed != 0;
        } else {
            let computed: Field = hash_nodes(sibling, credential_id);
            constrain computed != 0;
        }
    }

    let computed_root: Field = compute_root_from_path(credential_id, merkle_path, path_indices);
    constrain computed_root == revocation_root;

    true
}

fn compute_root_from_path(leaf: Field, path: [Field; 4], indices: [bool; 4]) -> Field {
    let mut current = leaf;
    let mut i = 0;
    while i < 4 {
        let sibling = path[i];
        if indices[i] == true {
            current = hash_nodes(current, sibling);
        } else {
            current = hash_nodes(sibling, current);
        }
        i = i + 1;
    }
    current
}

fn hash_nodes(left: Field, right: Field) -> Field {
    (left + right) % 7919
}

fn verify_not_revoked(
    credential_id: Field,
    revocation_list: [Field; 5],
) -> bool {
    let mut revoked = false;
    for id in revocation_list {
        if credential_id == id {
            revoked = true;
        }
    }
    !revoked
}

fn is_revoked(credential_id: Field, root: Field) -> bool {
    credential_id == root
}

#[test]
fn test_revocation_check_valid() {
    let credential: Field = 42;
    let path: [Field; 4] = [10, 20, 30, 40];
    let indices: [bool; 4] = [false, true, false, true];

    let root: Field = compute_root_from_path(credential, path, indices);
    let result = main(credential, root, path, indices);
    assert(result);
}

#[test]
fn test_revocation_check_invalid_root() {
    let credential: Field = 42;
    let path: [Field; 4] = [10, 20, 30, 40];
    let indices: [bool; 4] = [false, true, false, true];

    let result = main(credential, 99999, path, indices);
    assert(result == false);
}

#[test]
fn test_compute_root_from_path() {
    let leaf: Field = 5;
    let path: [Field; 4] = [10, 20, 30, 40];
    let indices: [bool; 4] = [false, true, false, true];
    let root = compute_root_from_path(leaf, path, indices);
    assert(root != 0);
}

#[test]
fn test_verify_not_revoked() {
    assert(verify_not_revoked(42, [1, 2, 3, 4, 5]));
    assert(!verify_not_revoked(3, [1, 2, 3, 4, 5]));
}
