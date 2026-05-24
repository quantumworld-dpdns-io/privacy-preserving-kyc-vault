"""Quantum-enhanced key generation with entropy amplification."""

import hashlib
import os

from .quantum_rng import QuantumRNG


class QuantumKeyGenerator:
    """Generate cryptographic keys using quantum-enhanced entropy."""

    def __init__(self, num_qubits: int = 16):
        self.qrng = QuantumRNG(num_qubits=num_qubits)

    def generate_private_key(self, key_size: int = 32) -> bytes:
        """Generate a private key using quantum entropy sources."""
        quantum_entropy = self.qrng.generate_with_entropy_extraction(key_size + 16)
        classical_entropy = os.urandom(key_size)
        return self._amplify_entropy(quantum_entropy + classical_entropy, key_size)

    def generate_keypair_seed(self) -> bytes:
        """Generate a seed for deterministic keypair generation."""
        return self.qrng.generate_seed_for_pqc(seed_length=48)

    def generate_dilithium_key_seed(self) -> bytes:
        """Generate a 64-byte seed for ML-DSA key generation."""
        return self.qrng.generate_seed_for_pqc(seed_length=64)

    def generate_kyber_key_seed(self) -> bytes:
        """Generate a 64-byte seed for ML-KEM key generation."""
        return self.qrng.generate_seed_for_pqc(seed_length=64)

    def generate_sphincs_key_seed(self) -> bytes:
        """Generate a 48-byte seed for SPHINCS+ key generation."""
        return self.qrng.generate_seed_for_pqc(seed_length=48)

    @staticmethod
    def _amplify_entropy(seed: bytes, output_length: int) -> bytes:
        """Amplify entropy using multiple hash rounds."""
        current = seed
        for _ in range(3):
            current = hashlib.shake_256(current).digest(len(current) + 32)
        return hashlib.shake_256(current).digest(output_length)

    @staticmethod
    def key_derivation_function(master_seed: bytes, context: bytes, length: int) -> bytes:
        """KDF using quantum-enhanced seed material."""
        material = master_seed + context + os.urandom(8)
        return hashlib.blake2b(material, digest_size=length).digest()

    def generate_hybrid_key_material(self) -> dict[str, bytes]:
        """Generate key material for hybrid (classical + PQC) schemes."""
        return {
            "ed25519_seed": self.generate_private_key(32),
            "x25519_seed": self.generate_private_key(32),
            "ml_dsa_seed": self.generate_dilithium_key_seed(),
            "ml_kem_seed": self.generate_kyber_key_seed(),
            "sphincs_seed": self.generate_sphincs_key_seed(),
        }

    def entropy_amplification_ratio(self, input_entropy: bytes) -> tuple[float, bytes]:
        """Return amplification ratio and expanded output."""
        input_len = len(input_entropy)
        expanded = self._amplify_entropy(input_entropy, input_len * 4)
        ratio = len(expanded) / max(input_len, 1)
        return ratio, expanded

    def generate_master_secret(self, strength: int = 256) -> bytes:
        """Generate a high-entropy master secret for the vault."""
        quantum_part = self.qrng.quantum_entropy_pool(pool_size=64)
        classical_part = os.urandom(64)
        combined = quantum_part + classical_part
        return hashlib.blake2b(combined, digest_size=strength // 8).digest()
