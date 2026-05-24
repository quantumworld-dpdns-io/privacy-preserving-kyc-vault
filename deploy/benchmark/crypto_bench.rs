//! Cryptographic operation benchmarks for KYC Vault.
//! Measures HPKE, Ed25519 signing/verification, and post-quantum
//! signature (Falcon / Dilithium) performance.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use hpke::{
    aead::AesGcm128, kdf::HkdfSha256, kem::X25519HkdfSha256,
    Deserializable, Encapsulated, OpModeR, OpModeS, Serializable,
};
use rand::rngs::OsRng;

// ── Ed25519 ─────────────────────────────────────────────────────
fn ed25519_bench(c: &mut Criterion) {
    let mut rng = OsRng;

    let sign_kp = ed25519_dalek::SigningKey::generate(&mut rng);
    let verify_key = sign_kp.verifying_key();
    let msg = b"KYC credential attestation payload v1";

    c.bench_function("ed25519_sign", |b| {
        b.iter(|| {
            black_box(sign_kp.sign(black_box(msg)));
        })
    });

    let sig = sign_kp.sign(msg);
    c.bench_function("ed25519_verify", |b| {
        b.iter(|| {
            black_box(verify_key.verify(black_box(msg), black_box(&sig)));
        })
    });

    c.bench_function("ed25519_keygen", |b| {
        b.iter(|| {
            black_box(ed25519_dalek::SigningKey::generate(&mut OsRng));
        })
    });
}

// ── HPKE (X25519 + HKDF-SHA256 + AES-128-GCM) ──────────────────
fn hpke_bench(c: &mut Criterion) {
    type Kem = X25519HkdfSha256;
    type Aead = AesGcm128;
    type Kdf = HkdfSha256;

    let mut rng = OsRng;
    let (sk_r, pk_r) = Kem::gen_keypair(&mut rng);
    let info = b"kyc-vault-hpke-context";

    let (encapped, ct) = {
        let (sk_s, _pk_s) = Kem::gen_keypair(&mut rng);
        let mut csrng = OsRng;
        hpke::single_shot_seal::<Aead, Kdf, Kem>(
            &mut csrng,
            &pk_r,
            &[],
            b"credential-id-001",
            info,
        )
        .expect("HPKE seal failed")
    };

    c.bench_function("hpke_encrypt_64b", |b| {
        b.iter(|| {
            let (sk_s, _pk_s) = Kem::gen_keypair(&mut rng);
            let mut csrng = OsRng;
            black_box(
                hpke::single_shot_seal::<Aead, Kdf, Kem>(
                    &mut csrng,
                    black_box(&pk_r),
                    &[],
                    black_box(b"credential-id-001"),
                    black_box(info),
                )
                .expect("HPKE seal failed"),
            );
        })
    });

    c.bench_function("hpke_decrypt_64b", |b| {
        b.iter(|| {
            black_box(
                hpke::single_shot_open::<Aead, Kdf, Kem>(
                    black_box(&encapped),
                    black_box(&sk_r),
                    &[],
                    black_box(&ct),
                    black_box(info),
                )
                .expect("HPKE open failed"),
            );
        })
    });

    c.bench_function("hpke_keygen", |b| {
        b.iter(|| {
            black_box(Kem::gen_keypair(&mut OsRng));
        })
    });
}

// ── Post-Quantum Signatures (Falcon-512 via liboqs) ────────────
fn pq_sign_bench(c: &mut Criterion) {
    use oqs::sig::Sig;

    let sig = Sig::new(oqs::sig::Algorithm::Falcon512)
        .expect("Falcon-512 not available");
    let (pk, sk) = sig.keypair().expect("Falcon keygen failed");
    let msg = b"KYC credential batch #0420";

    c.bench_function("falcon512_keygen", |b| {
        b.iter(|| {
            black_box(sig.keypair().expect("keygen failed"));
        })
    });

    c.bench_function("falcon512_sign", |b| {
        b.iter(|| {
            let sig =
                Sig::new(oqs::sig::Algorithm::Falcon512).unwrap();
            black_box(
                sig.sign(black_box(msg), &sk)
                    .expect("sign failed"),
            );
        })
    });

    let signature = sig.sign(msg, &sk).expect("sign failed");
    c.bench_function("falcon512_verify", |b| {
        b.iter(|| {
            black_box(
                sig.verify(black_box(msg), &signature, &pk)
                    .expect("verify failed"),
            );
        })
    });

    // Dilithium3 (ML-KEM-768 equivalent)
    let dil = Sig::new(oqs::sig::Algorithm::Dilithium3)
        .expect("Dilithium3 not available");
    let (dpk, dsk) = dil.keypair().expect("Dilithium keygen failed");
    let dsig = dil.sign(msg, &dsk).expect("Dilithium sign failed");

    c.bench_function("dilithium3_sign", |b| {
        b.iter(|| {
            let d = Sig::new(oqs::sig::Algorithm::Dilithium3).unwrap();
            black_box(d.sign(black_box(msg), &dsk).expect("sign failed"));
        })
    });

    c.bench_function("dilithium3_verify", |b| {
        b.iter(|| {
            black_box(
                dil.verify(black_box(msg), &dsig, &dpk)
                    .expect("verify failed"),
            );
        })
    });
}

criterion_group!(
    name = crypto;
    config = Criterion::default()
        .sample_size(100)
        .warm_up_time(std::time::Duration::from_secs(2))
        .measurement_time(std::time::Duration::from_secs(10));
    targets = ed25519_bench, hpke_bench, pq_sign_bench
);
criterion_main!(crypto);
