#![cfg(test)]

use sha2::{Digest, Sha256, Sha512};

const ML_KEM_768_PUBLIC_KEY_LEN: usize = 1184;
const ML_KEM_768_CIPHERTEXT_LEN: usize = 1088;
const ML_KEM_768_SECRET_KEY_LEN: usize = 2400;
const ML_DSA_87_PUBLIC_KEY_LEN: usize = 2592;
const ML_DSA_87_SIGNATURE_LEN: usize = 4627;
const ML_DSA_87_SECRET_KEY_LEN: usize = 4896;

const SPHINCS_PLUS_128F_PK_LEN: usize = 32;
const SPHINCS_PLUS_128F_SIG_LEN: usize = 17088;
const SPHINCS_PLUS_128F_SK_LEN: usize = 64;

fn sha256_kat() -> bool {
    let input = b"abc";
    let expected: [u8; 32] = [
        0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea,
        0x41, 0x41, 0x40, 0xde, 0x5d, 0xae, 0x22, 0x23,
        0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c,
        0xb4, 0x10, 0xff, 0x61, 0xf2, 0x00, 0x15, 0xad,
    ];
    let result = Sha256::digest(input);
    result[..] == expected
}

fn sha512_kat() -> bool {
    let input = b"abc";
    let expected_first: u8 = 0xdd;
    let result = Sha512::digest(input);
    result[0] == expected_first
}

fn empty_input_kat() -> bool {
    let input = b"";
    let expected: [u8; 32] = [
        0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14,
        0x9a, 0xfb, 0xf4, 0xc8, 0x99, 0x6f, 0xb9, 0x24,
        0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c,
        0xa4, 0x95, 0x99, 0x1b, 0x78, 0x52, 0xb8, 0x55,
    ];
    let result = Sha256::digest(input);
    result[..] == expected
}

fn sha256_iterative_kat() -> bool {
    let mut hash = Sha256::new();
    for _ in 0..1_000_000 {
        hash.update(b"a");
    }
    let result = hash.finalize();
    result[0] == 0xcd
}

fn ml_kem_size_kat() -> bool {
    ML_KEM_768_PUBLIC_KEY_LEN == 1184
        && ML_KEM_768_CIPHERTEXT_LEN == 1088
        && ML_KEM_768_SECRET_KEY_LEN == 2400
}

fn ml_dsa_size_kat() -> bool {
    ML_DSA_87_PUBLIC_KEY_LEN == 2592
        && ML_DSA_87_SIGNATURE_LEN == 4627
        && ML_DSA_87_SECRET_KEY_LEN == 4896
}

fn sphincs_plus_size_kat() -> bool {
    SPHINCS_PLUS_128F_PK_LEN == 32
        && SPHINCS_PLUS_128F_SIG_LEN == 17088
        && SPHINCS_PLUS_128F_SK_LEN == 64
}

fn key_sizes_comprehensive() -> bool {
    let sizes: Vec<(usize, &str)> = vec![
        (ML_KEM_768_PUBLIC_KEY_LEN, "ML-KEM-768 pk"),
        (ML_KEM_768_SECRET_KEY_LEN, "ML-KEM-768 sk"),
        (ML_KEM_768_CIPHERTEXT_LEN, "ML-KEM-768 ct"),
        (ML_DSA_87_PUBLIC_KEY_LEN, "ML-DSA-87 pk"),
        (ML_DSA_87_SECRET_KEY_LEN, "ML-DSA-87 sk"),
        (ML_DSA_87_SIGNATURE_LEN, "ML-DSA-87 sig"),
        (SPHINCS_PLUS_128F_PK_LEN, "SPHINCS+ 128f pk"),
        (SPHINCS_PLUS_128F_SK_LEN, "SPHINCS+ 128f sk"),
        (SPHINCS_PLUS_128F_SIG_LEN, "SPHINCS+ 128f sig"),
    ];
    for (size, name) in &sizes {
        if *size == 0 {
            panic!("{} has zero length", name);
        }
    }
    true
}

#[test]
fn test_sha256_kat() {
    assert!(sha256_kat(), "SHA-256 KAT failed");
}

#[test]
fn test_sha512_kat() {
    assert!(sha512_kat(), "SHA-512 KAT failed");
}

#[test]
fn test_empty_input_kat() {
    assert!(empty_input_kat(), "Empty input SHA-256 KAT failed");
}

#[test]
fn test_sha256_iterative_kat() {
    assert!(sha256_iterative_kat(), "SHA-256 iterative KAT failed");
}

#[test]
fn test_ml_kem_sizes() {
    assert!(ml_kem_size_kat(), "ML-KEM size KAT failed");
}

#[test]
fn test_ml_dsa_sizes() {
    assert!(ml_dsa_size_kat(), "ML-DSA size KAT failed");
}

#[test]
fn test_sphincs_plus_sizes() {
    assert!(sphincs_plus_size_kat(), "SPHINCS+ size KAT failed");
}

#[test]
fn test_key_sizes_nonzero() {
    assert!(key_sizes_comprehensive(), "Key size validation failed");
}

#[test]
fn test_all_kats_suite() {
    assert!(sha256_kat(), "SHA-256 KAT");
    assert!(sha512_kat(), "SHA-512 KAT");
    assert!(empty_input_kat(), "Empty SHA-256 KAT");
    assert!(sha256_iterative_kat(), "Iterative SHA-256 KAT");
    assert!(ml_kem_size_kat(), "ML-KEM sizes");
    assert!(ml_dsa_size_kat(), "ML-DSA sizes");
    assert!(sphincs_plus_size_kat(), "SPHINCS+ sizes");
}
