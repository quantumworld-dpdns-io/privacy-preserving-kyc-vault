"""Quantum vs classical performance benchmark suite."""

import hashlib
import os
import time

from .grover_search import build_grover_circuit
from .quantum_keygen import QuantumKeyGenerator
from .quantum_rng import QuantumRNG


class BenchmarkResult:
    """Holds a single benchmark result."""

    def __init__(self, name: str, classical_time: float, quantum_time: float):
        self.name = name
        self.classical_time = classical_time
        self.quantum_time = quantum_time

    @property
    def speedup(self) -> float:
        if self.quantum_time == 0:
            return float("inf")
        return self.classical_time / self.quantum_time

    def __repr__(self) -> str:
        return (
            f"{self.name}: classical={self.classical_time:.4f}s, "
            f"quantum={self.quantum_time:.4f}s, "
            f"speedup={self.speedup:.2f}x"
        )


class PQCBenchmark:
    """Benchmarks for post-quantum cryptographic operations."""

    @staticmethod
    def benchmark_hash(num_iterations: int = 100_000) -> BenchmarkResult:
        classical_start = time.perf_counter()
        for _ in range(num_iterations):
            hashlib.sha256(b"benchmark data").digest()
        classical_time = time.perf_counter() - classical_start

        quantum_start = time.perf_counter()
        qrng = QuantumRNG(num_qubits=4)
        for _ in range(num_iterations // 100):
            qrng.generate_raw_bits(shots=16)
        quantum_time = time.perf_counter() - quantum_start

        return BenchmarkResult("Hash", classical_time, quantum_time)

    @staticmethod
    def benchmark_key_generation(num_keys: int = 100) -> BenchmarkResult:
        keygen = QuantumKeyGenerator(num_qubits=8)

        classical_start = time.perf_counter()
        for _ in range(num_keys):
            os.urandom(32)
        classical_time = time.perf_counter() - classical_start

        quantum_start = time.perf_counter()
        for _ in range(num_keys):
            keygen.generate_private_key(32)
        quantum_time = time.perf_counter() - quantum_start

        return BenchmarkResult("KeyGen", classical_time, quantum_time)

    @staticmethod
    def benchmark_entropy_amplification(samples: int = 50) -> BenchmarkResult:
        keygen = QuantumKeyGenerator()

        classical_start = time.perf_counter()
        for _ in range(samples):
            seed = os.urandom(32)
            hashlib.shake_256(seed).digest(64)
        classical_time = time.perf_counter() - classical_start

        quantum_start = time.perf_counter()
        for _ in range(samples):
            quantum_seed = keygen.qrng.generate_random_bytes(32)
            keygen._amplify_entropy(quantum_seed, 64)
        quantum_time = time.perf_counter() - quantum_start

        return BenchmarkResult("EntropyAmp", classical_time, quantum_time)

    @staticmethod
    def benchmark_grover_circuit(database_bits: int = 8) -> BenchmarkResult:
        n_qubits = database_bits

        classical_start = time.perf_counter()
        _ = list(range(2**n_qubits))
        classical_time = time.perf_counter() - classical_start

        quantum_start = time.perf_counter()
        _ = build_grover_circuit(n_qubits, target_index=42)
        quantum_time = time.perf_counter() - quantum_start

        return BenchmarkResult(f"Grover({n_qubits}q)", classical_time, quantum_time)


def run_full_benchmark() -> list[BenchmarkResult]:
    """Run the full quantum vs classical benchmark suite."""
    results = []

    results.append(PQCBenchmark.benchmark_hash())
    results.append(PQCBenchmark.benchmark_key_generation())
    results.append(PQCBenchmark.benchmark_entropy_amplification())
    results.append(PQCBenchmark.benchmark_grover_circuit(6))
    results.append(PQCBenchmark.benchmark_grover_circuit(8))
    results.append(PQCBenchmark.benchmark_grover_circuit(10))

    return results


if __name__ == "__main__":
    print("Running quantum vs classical benchmark suite...\n")
    results = run_full_benchmark()
    for r in results:
        print(r)
