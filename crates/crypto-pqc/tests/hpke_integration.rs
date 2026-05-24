use kyc_vault_crypto_pqc::hpke::{generate_keypair, HPKECiphertext, HPKE};

#[test]
fn test_hpke_roundtrip_small_message() {
    let (secret, public) = generate_keypair();
    let plaintext = b"Hello, KYC Vault!";
    let aad = b"test-aad";

    let ct = HPKE::encrypt(public.as_bytes(), plaintext, aad).unwrap();
    let decrypted = HPKE::decrypt(&secret, &ct, aad).unwrap();

    assert_eq!(decrypted, plaintext);
}

#[test]
fn test_hpke_roundtrip_with_multiple_aad_values() {
    let (secret, public) = generate_keypair();
    let plaintext = b"message with AAD";

    let aads = vec![
        b"" as &[u8],
        b"a" as &[u8],
        b"kyc-vault-aad" as &[u8],
        b"12345678901234567890" as &[u8],
    ];

    for aad in aads {
        let ct = HPKE::encrypt(public.as_bytes(), plaintext, aad).unwrap();
        let decrypted = HPKE::decrypt(&secret, &ct, aad).unwrap();
        assert_eq!(decrypted, plaintext, "HPKE roundtrip failed for AAD: {:?}", aad);
    }
}

#[test]
fn test_hpke_empty_message() {
    let (secret, public) = generate_keypair();
    let plaintext = b"";
    let aad = b"empty-test";

    let ct = HPKE::encrypt(public.as_bytes(), plaintext, aad).unwrap();
    let decrypted = HPKE::decrypt(&secret, &ct, aad).unwrap();

    assert_eq!(decrypted, plaintext);
}

#[test]
fn test_hpke_large_data_64kb() {
    let (secret, public) = generate_keypair();
    let plaintext = vec![0xABu8; 65536];
    let aad = b"large-data-aad";

    let ct = HPKE::encrypt(public.as_bytes(), &plaintext, aad).unwrap();
    let decrypted = HPKE::decrypt(&secret, &ct, aad).unwrap();

    assert_eq!(decrypted.len(), 65536);
    assert_eq!(decrypted, plaintext);
}

#[test]
fn test_hpke_large_data_512kb() {
    let (secret, public) = generate_keypair();
    let plaintext = vec![0x42u8; 524288];
    let aad = b"very-large-aad";

    let ct = HPKE::encrypt(public.as_bytes(), &plaintext, aad).unwrap();
    let decrypted = HPKE::decrypt(&secret, &ct, aad).unwrap();

    assert_eq!(decrypted, plaintext);
}

#[test]
fn test_hpke_wrong_key_fails() {
    let (alice_secret, alice_public) = generate_keypair();
    let (bob_secret, _) = generate_keypair();
    let plaintext = b"secret data";
    let aad = b"aad";

    let ct = HPKE::encrypt(alice_public.as_bytes(), plaintext, aad).unwrap();
    let result = HPKE::decrypt(&bob_secret, &ct, aad);

    assert!(result.is_err());
}

#[test]
fn test_hpke_wrong_aad_fails() {
    let (secret, public) = generate_keypair();
    let plaintext = b"aad mismatch";
    let encrypt_aad = b"correct-aad";
    let decrypt_aad = b"wrong-aad";

    let ct = HPKE::encrypt(public.as_bytes(), plaintext, encrypt_aad).unwrap();
    let result = HPKE::decrypt(&secret, &ct, decrypt_aad);

    assert!(result.is_err());
}

#[test]
fn test_hpke_tampered_ciphertext_fails() {
    let (secret, public) = generate_keypair();
    let plaintext = b"tamper me";
    let aad = b"aad";

    let mut ct = HPKE::encrypt(public.as_bytes(), plaintext, aad).unwrap();
    ct.ciphertext[0] ^= 0xFF;

    let result = HPKE::decrypt(&secret, &ct, aad);
    assert!(result.is_err());
}

#[test]
fn test_hpke_tampered_nonce_fails() {
    let (secret, public) = generate_keypair();
    let plaintext = b"nonce tamper";
    let aad = b"aad";

    let mut ct = HPKE::encrypt(public.as_bytes(), plaintext, aad).unwrap();
    ct.nonce[0] ^= 0xFF;

    let result = HPKE::decrypt(&secret, &ct, aad);
    assert!(result.is_err());
}

#[test]
fn test_hpke_multiple_roundtrips() {
    let (secret, public) = generate_keypair();

    for i in 0..10 {
        let plaintext = format!("message-{}", i);
        let aad = format!("aad-{}", i);
        let ct = HPKE::encrypt(public.as_bytes(), plaintext.as_bytes(), aad.as_bytes()).unwrap();
        let decrypted = HPKE::decrypt(&secret, &ct, aad.as_bytes()).unwrap();
        assert_eq!(decrypted, plaintext.as_bytes());
    }
}

#[test]
fn test_hpke_ciphertext_structure() {
    let (secret, public) = generate_keypair();
    let plaintext = b"check structure";
    let aad = b"aad";

    let ct = HPKE::encrypt(public.as_bytes(), plaintext, aad).unwrap();

    assert_eq!(ct.enc.len(), 32, "enc should be 32 bytes (X25519 public key)");
    assert_eq!(ct.nonce.len(), 12, "nonce should be 12 bytes (AES-GCM IV)");
    assert!(!ct.ciphertext.is_empty(), "ciphertext should not be empty");
    assert_eq!(ct.kem_id, "DHKEM(X25519)");
    assert_eq!(ct.kdf_id, "HKDF-SHA256");
    assert_eq!(ct.aead_id, "AES-256-GCM");
}

#[test]
fn test_hpke_independent_keypairs() {
    let (secret1, public1) = generate_keypair();
    let (secret2, public2) = generate_keypair();

    assert_ne!(secret1, secret2, "secrets should be different");
    assert_ne!(public1.to_bytes(), public2.to_bytes(), "public keys should be different");
}

#[test]
fn test_hpke_binary_data() {
    let (secret, public) = generate_keypair();
    let plaintext: Vec<u8> = (0..255).collect();
    let aad = b"binary";

    let ct = HPKE::encrypt(public.as_bytes(), &plaintext, aad).unwrap();
    let decrypted = HPKE::decrypt(&secret, &ct, aad).unwrap();

    assert_eq!(decrypted, plaintext);
}

#[test]
fn test_hpke_malformed_enc_fails() {
    let (secret, _public) = generate_keypair();
    let ct = HPKECiphertext {
        enc: vec![0u8; 16],
        ciphertext: vec![1, 2, 3],
        nonce: vec![0u8; 12],
        kem_id: "DHKEM(X25519)".into(),
        kdf_id: "HKDF-SHA256".into(),
        aead_id: "AES-256-GCM".into(),
    };

    let result = HPKE::decrypt(&secret, &ct, b"aad");
    assert!(result.is_err());
}

#[test]
fn test_hpke_long_aad() {
    let (secret, public) = generate_keypair();
    let plaintext = b"long aad test";
    let aad = vec![0x42u8; 4096];

    let ct = HPKE::encrypt(public.as_bytes(), plaintext, &aad).unwrap();
    let decrypted = HPKE::decrypt(&secret, &ct, &aad).unwrap();

    assert_eq!(decrypted, plaintext);
}
