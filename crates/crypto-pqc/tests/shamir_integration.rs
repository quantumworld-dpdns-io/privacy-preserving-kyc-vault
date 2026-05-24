use kyc_vault_crypto_pqc::secret_sharing::ShamirSecretSharing;

#[test]
fn test_shamir_3_of_5_threshold() {
    let secret = [0xABu8; 32];
    let shares = ShamirSecretSharing::split(&secret, 5, 3).unwrap();
    assert_eq!(shares.len(), 5);

    let recovered = ShamirSecretSharing::combine(&shares[0..3], 3).unwrap();
    assert_eq!(recovered, secret);
}

#[test]
fn test_shamir_2_of_3_threshold() {
    let secret = [42u8; 32];
    let shares = ShamirSecretSharing::split(&secret, 3, 2).unwrap();
    assert_eq!(shares.len(), 3);

    let recovered = ShamirSecretSharing::combine(&shares[0..2], 2).unwrap();
    assert_eq!(recovered, secret);
}

#[test]
fn test_shamir_5_of_5_all_shares() {
    let secret = [0xFFu8; 32];
    let shares = ShamirSecretSharing::split(&secret, 5, 5).unwrap();
    assert_eq!(shares.len(), 5);

    let recovered = ShamirSecretSharing::combine(&shares, 5).unwrap();
    assert_eq!(recovered, secret);
}

#[test]
fn test_shamir_insufficient_shares_fails_2_of_3() {
    let secret = [0x55u8; 32];
    let shares = ShamirSecretSharing::split(&secret, 5, 3).unwrap();

    let result = ShamirSecretSharing::combine(&shares[0..2], 3);
    assert!(result.is_err());
}

#[test]
fn test_shamir_insufficient_shares_fails_4_of_5() {
    let secret = [0x77u8; 32];
    let shares = ShamirSecretSharing::split(&secret, 7, 5).unwrap();

    let result = ShamirSecretSharing::combine(&shares[0..3], 5);
    assert!(result.is_err());
}

#[test]
fn test_shamir_empty_shares_fails() {
    let result = ShamirSecretSharing::combine(&[], 2);
    assert!(result.is_err());
}

#[test]
fn test_shamir_any_subset_of_threshold_works_3_of_5() {
    let secret = [0x99u8; 32];
    let shares = ShamirSecretSharing::split(&secret, 5, 3).unwrap();

    let recovered_1 = ShamirSecretSharing::combine(
        &[shares[0].clone(), shares[2].clone(), shares[4].clone()],
        3,
    )
    .unwrap();
    assert_eq!(recovered_1, secret);

    let recovered_2 = ShamirSecretSharing::combine(
        &[shares[1].clone(), shares[3].clone(), shares[4].clone()],
        3,
    )
    .unwrap();
    assert_eq!(recovered_2, secret);
}

#[test]
fn test_shamir_different_secrets_different_shares() {
    let secret_a = [0xAAu8; 32];
    let secret_b = [0xBBu8; 32];

    let shares_a = ShamirSecretSharing::split(&secret_a, 3, 2).unwrap();
    let shares_b = ShamirSecretSharing::split(&secret_b, 3, 2).unwrap();

    assert_ne!(shares_a[0], shares_b[0]);
}

#[test]
fn test_shamir_all_zero_secret() {
    let secret = [0u8; 32];
    let shares = ShamirSecretSharing::split(&secret, 3, 2).unwrap();
    let recovered = ShamirSecretSharing::combine(&shares[0..2], 2).unwrap();
    assert_eq!(recovered, secret);
}

#[test]
fn test_shamir_ascii_secret() {
    let mut secret = [0u8; 32];
    let data = b"KYC-VAULT-SHAMIR-TEST-SECRET!!";
    secret[..data.len()].copy_from_slice(data);

    let shares = ShamirSecretSharing::split(&secret, 5, 3).unwrap();
    let recovered = ShamirSecretSharing::combine(&shares[0..3], 3).unwrap();
    assert_eq!(recovered, secret);
}

#[test]
fn test_shamir_invalid_threshold_less_than_2() {
    let secret = [0u8; 32];
    let result = ShamirSecretSharing::split(&secret, 3, 1);
    assert!(result.is_err());
}

#[test]
fn test_shamir_invalid_threshold_greater_than_total() {
    let secret = [0u8; 32];
    let result = ShamirSecretSharing::split(&secret, 3, 5);
    assert!(result.is_err());
}

#[test]
fn test_shamir_multiple_recoveries_from_same_shares() {
    let secret = [0x77u8; 32];
    let shares = ShamirSecretSharing::split(&secret, 5, 3).unwrap();

    for _ in 0..5 {
        let recovered = ShamirSecretSharing::combine(&shares[0..3], 3).unwrap();
        assert_eq!(recovered, secret);
    }
}

#[test]
fn test_shamir_exact_threshold_recovers() {
    let secret = [0x33u8; 32];
    let shares = ShamirSecretSharing::split(&secret, 10, 3).unwrap();

    let recovered = ShamirSecretSharing::combine(&shares[0..3], 3).unwrap();
    assert_eq!(recovered, secret);
}
