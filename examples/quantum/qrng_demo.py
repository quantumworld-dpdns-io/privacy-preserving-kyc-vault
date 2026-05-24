"""Quantum Random Number Generator demo using CUDA-Q.

Demonstrates quantum random number generation using NVIDIA CUDA-Q (cudaq)
for the KYC Vault's post-quantum cryptography subsystem.

Prerequisites:
    pip install cuda-quantum

Usage:
    python qrng_demo.py --num-qubits 8 --shots 1024
"""

from __future__ import annotations

import argparse
import hashlib
import struct
import sys
from typing import Optional

try:
    import cudaq
except ImportError:
    print("CUDA-Q not installed. Install with: pip install cuda-quantum", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Quantum kernels (CUDA-Q)
# ---------------------------------------------------------------------------

@cudaq.kernel
def qrng_kernel() -> int:
    """Sample a single random bit from a qubit in superposition."""
    qubit = cudaq.qubit()
    h(qubit)
    return mz(qubit)


@cudaq.kernel
def multi_qubit_rng(num_qubits: int) -> list[int]:
    """Sample multiple random bits in parallel."""
    qubits = cudaq.qvector(num_qubits)
    for i in range(num_qubits):
        h(qubits[i])
    return mz(qubits)


# ---------------------------------------------------------------------------
# Quantum RNG class
# ---------------------------------------------------------------------------

class QuantumRNG:
    """Quantum random number generator backed by CUDA-Q."""

    def __init__(self, num_qubits: int = 8, target: Optional[str] = None):
        self.num_qubits = num_qubits
        if target:
            cudaq.set_target(target)
        self.target = cudaq.get_target()
        print(f"[QRNG] Target backend: {self.target} ({num_qubits} qubits)")

    def random_bit(self) -> int:
        """Generate a single random bit."""
        return qrng_kernel()

    def random_bits(self, count: int) -> list[int]:
        """Generate `count` random bits using batched multi-qubit sampling."""
        bits: list[int] = []
        while len(bits) < count:
            remaining = min(self.num_qubits, count - len(bits))
            result = multi_qubit_rng(remaining)
            bits.extend(int(b) for b in result)
        return bits[:count]

    def random_bytes(self, num_bytes: int = 32) -> bytes:
        """Generate `num_bytes` random bytes from quantum measurements."""
        bits = self.random_bits(num_bytes * 8)
        result = bytearray()
        for i in range(0, len(bits), 8):
            byte_val = sum(bits[i + j] << (7 - j) for j in range(8))
            result.append(byte_val)
        return bytes(result)

    def random_int(self, min_val: int = 0, max_val: int = 2 ** 32 - 1) -> int:
        """Generate a random integer in [min_val, max_val]."""
        range_size = max_val - min_val + 1
        num_bytes = (range_size.bit_length() + 7) // 8
        while True:
            val = int.from_bytes(self.random_bytes(num_bytes), "big")
            if val < range_size:
                return min_val + val

    def random_float(self) -> float:
        """Generate a random float in [0.0, 1.0)."""
        bits = self.random_bytes(8)
        return struct.unpack("Q", bits)[0] / (2 ** 64)

    def generate_seed(self, seed_length: int = 48) -> bytes:
        """Generate a cryptographically strong seed for PQC algorithms."""
        raw = self.random_bytes(seed_length + 32)
        classical = hashlib.shake_256(raw).digest(seed_length)
        return classical

    def von_neumann_extractor(self, bits: list[int]) -> list[int]:
        """Apply Von Neumann debiasing to remove bias from quantum measurements."""
        unbiased: list[int] = []
        i = 0
        while i + 1 < len(bits):
            if bits[i] == 0 and bits[i + 1] == 1:
                unbiased.append(0)
            elif bits[i] == 1 and bits[i + 1] == 0:
                unbiased.append(1)
            i += 2
        return unbiased


# ---------------------------------------------------------------------------
# Demo
# ---------------------------------------------------------------------------

def demo(args: argparse.Namespace):
    qrng = QuantumRNG(num_qubits=args.num_qubits, target=args.target)

    print("\n=== Quantum Random Number Generator Demo ===\n")

    # Single bit
    bit = qrng.random_bit()
    print(f"Random bit:          {bit}")

    # Multiple bits
    bits = qrng.random_bits(16)
    print(f"Random bits (16):    {''.join(str(b) for b in bits)}")

    # Random bytes
    entropy_bytes = qrng.random_bytes(32)
    print(f"Random bytes (32):   {entropy_bytes.hex()}")

    # Random integer
    rand_int = qrng.random_int(0, 1000)
    print(f"Random int [0,1000]: {rand_int}")

    # Random float
    rand_float = qrng.random_float()
    print(f"Random float [0,1):  {rand_float:.10f}")

    # PQC seed
    seed = qrng.generate_seed(48)
    print(f"PQC seed (48B):      {seed.hex()}")

    # Von Neumann extraction
    biased = [1, 1, 0, 1, 0, 0, 1, 0]
    unbiased = qrng.von_neumann_extractor(biased)
    print(f"Von Neumann extract: {biased} -> {unbiased}")

    # Entropy estimation
    samples = qrng.random_bits(4096)
    ones = sum(samples)
    p1 = ones / len(samples)
    entropy = -p1 * (p1 and (p1).bit_length())  # approximate
    print(f"\nEntropy estimate:    {p1:.4f} probability of 1 over {len(samples)} samples")

    print("\n============================================")


def main():
    parser = argparse.ArgumentParser(description="CUDA-Q Quantum RNG Demo")
    parser.add_argument("--num-qubits", type=int, default=8, help="Number of qubits (default: 8)")
    parser.add_argument("--target", type=str, default=None, help="CUDA-Q target backend")
    parser.add_argument("--shots", type=int, default=1024, help="Number of shots per circuit")
    args = parser.parse_args()
    demo(args)


if __name__ == "__main__":
    main()
