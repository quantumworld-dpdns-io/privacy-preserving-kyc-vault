//! Zero-Knowledge Proof benchmark for KYC Vault.
//! Measures Groth16 and PLONK proof generation times for
//! credential attribute verification circuits.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use rand::rngs::OsRng;

// ── Groth16 (BN254) ─────────────────────────────────────────────
fn groth16_bench(c: &mut Criterion) {
    use ark_bn254::{Bn254, Fr};
    use ark_circom::CircomReduction;
    use ark_groth16::{create_random_proof, generate_random_parameters, ProvingKey};
    use ark_relations::r1cs::{ConstraintSystem, SynthesisError};
    use ark_serialize::CanonicalSerialize;
    use ark_std::rand::Rng;

    // Simulate a simple credential circuit with 10 public + 5 private inputs
    let cs = ConstraintSystem::<Fr>::new_ref();
    let public_vars: Vec<_> = (0..10)
        .map(|i| cs.new_input_variable(|| Ok(Fr::from(i as u64))))
        .collect::<Result<_, SynthesisError>>()
        .unwrap();
    let private_vars: Vec<_> = (0..5)
        .map(|i| cs.new_witness_variable(|| Ok(Fr::from(100 + i as u64))))
        .collect::<Result<_, SynthesisError>>()
        .unwrap();

    // Constraint: sum(public) + sum(private) == constant
    let sum: Fr = (0..10)
        .map(|i| Fr::from(i as u64))
        .chain((0..5).map(|i| Fr::from(100 + i as u64)))
        .sum();
    let expected: Fr = sum;
    let _ = cs.new_input_variable(|| Ok(expected)).unwrap();

    let circom = CircomReduction::new();
    let (pk, vk) = generate_random_parameters::<Bn254, _, _>(
        &circom, cs.clone(),
    )
    .expect("Groth16 param generation failed");

    // Serialize PK size for reporting
    let pk_size = {
        let mut buf = Vec::new();
        pk.serialize_uncompressed(&mut buf).unwrap();
        buf.len()
    };
    let vk_size = {
        let mut buf = Vec::new();
        vk.serialize_uncompressed(&mut buf).unwrap();
        buf.len()
    };

    println!("Groth16 PK size: {} bytes", pk_size);
    println!("Groth16 VK size: {} bytes", vk_size);

    let mut rng = OsRng;
    let inputs = public_vars
        .iter()
        .map(|v| v.value().unwrap())
        .collect::<Vec<_>>();

    c.bench_function("groth16_prove_10pub_5priv", |b| {
        b.iter(|| {
            let proof = create_random_proof(
                black_box(cs.clone()),
                black_box(&pk),
                &mut rng,
            )
            .expect("Groth16 proof generation failed");
            black_box(proof);
        })
    });

    c.bench_function("groth16_verify_10pub_5priv", |b| {
        b.iter(|| {
            let proof = create_random_proof(
                black_box(cs.clone()),
                black_box(&pk),
                &mut rng,
            )
            .expect("Groth16 proof generation failed");
            let valid = ark_groth16::verify_proof(
                &vk,
                &proof,
                &inputs,
            )
            .expect("Groth16 verification check failed");
            assert!(valid);
            black_box(valid);
        })
    });
}

// ── PLONK (KZG-based, BLS12-381) ───────────────────────────────
fn plonk_bench(c: &mut Criterion) {
    use ark_bls12_381::Bls12_381;
    use ark_poly_commit::kzg10;
    use ark_poly_commit::sonic_pc::SonicKZG10;
    use decaf377::Fq;
    use decaf377_r1cs::{Mnt6, ConstraintSystem as DCS};
    use jf_plonk::prover::PlonkProver;
    use jf_plonk::verifier::PlonkVerifier;

    // Simple circuit: prove knowledge of preimage of a hash
    let num_pub_inputs = 8;
    let num_priv_inputs = 4;
    let mut cs = DCS::new_ref();

    let pub_vars: Vec<_> = (0..num_pub_inputs)
        .map(|i| cs.new_input_variable(|| Ok(Fq::from(i as u64))))
        .collect::<Result<_, _>>()
        .unwrap();
    let priv_vars: Vec<_> = (0..num_priv_inputs)
        .map(|i| cs.new_witness_variable(|| Ok(Fq::from(200 + i as u64))))
        .collect::<Result<_, _>>()
        .unwrap();

    // Simple linear constraint
    let computed: Fq = pub_vars
        .iter()
        .chain(priv_vars.iter())
        .map(|v| v.value().unwrap())
        .sum();
    let expected = cs.new_input_variable(|| Ok(computed)).unwrap();

    let srs = kzg10::SRS::<Bls12_381>::generate(
        &mut OsRng, 1 << 12,
    )
    .expect("SRS generation failed");
    let prover = PlonkProver::new(1 << 12);
    let verifier = PlonkVerifier::new();

    // Key generation
    let (pk, vk) = prover
        .preprocess(&mut cs.clone())
        .expect("PLONK preprocess failed");

    c.bench_function("plonk_prove_8pub_4priv", |b| {
        b.iter(|| {
            let proof = prover
                .prove::<SonicKZG10<_>>(
                    black_box(&mut cs.clone()),
                    &pk,
                    &[],
                    &srs,
                    &mut OsRng,
                )
                .expect("PLONK proof generation failed");
            black_box(proof);
        })
    });

    // Verify benchmark requires a concrete proof
    let proof = prover
        .prove::<SonicKZG10<_>>(&mut cs.clone(), &pk, &[], &srs, &mut OsRng)
        .expect("PLONK proof generation failed");
    let pub_inputs = (0..num_pub_inputs)
        .map(|i| Fq::from(i as u64))
        .collect::<Vec<_>>();

    c.bench_function("plonk_verify_8pub_4priv", |b| {
        b.iter(|| {
            let valid = verifier
                .verify::<SonicKZG10<_>>(
                    black_box(&proof),
                    &vk,
                    &pub_inputs,
                    &srs,
                )
                .expect("PLONK verification failed");
            assert!(valid);
            black_box(valid);
        })
    });
}

criterion_group!(
    name = zkp;
    config = Criterion::default()
        .sample_size(50)
        .warm_up_time(std::time::Duration::from_secs(5))
        .measurement_time(std::time::Duration::from_secs(30));
    targets = groth16_bench, plonk_bench
);
criterion_main!(zkp);
