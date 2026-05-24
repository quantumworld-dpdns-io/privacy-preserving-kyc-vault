"""Quantum random number generator using IBM Quantum backends."""

import hashlib
import os
from qiskit import QuantumCircuit, QuantumRegister, ClassicalRegister, execute, Aer


class QuantumRNG:
    """Generate random numbers using quantum superposition measurements."""

    def __init__(self, num_qubits: int = 8):
        self.num_qubits = num_qubits
        self._entropy_pool = b""

    def generate_raw_bits(self, shots: int = 1024) -> list[int]:
        """Generate random bits by measuring qubits in superposition."""
        qr = QuantumRegister(self.num_qubits, "q")
        cr = ClassicalRegister(self.num_qubits, "c")
        circuit = QuantumCircuit(qr, cr)

        for qubit in range(self.num_qubits):
            circuit.h(qubit)

        circuit.measure(range(self.num_qubits), range(self.num_qubits))

        backend = Aer.get_backend("qasm_simulator")
        job = execute(circuit, backend, shots=shots)
        result = job.result()
        counts = result.get_counts()

        raw_bits = []
        for bitstring, count in counts.items():
            for _ in range(count):
                raw_bits.append(int(bitstring, 2))

        return raw_bits

    def generate_random_bytes(self, num_bytes: int = 32) -> bytes:
        """Generate random bytes using quantum randomness."""
        raw_bits = self.generate_raw_bits(shots=num_bytes * 8)
        byte_array = bytearray()
        for i in range(0, len(raw_bits), 8):
            chunk = raw_bits[i : i + 8]
            if len(chunk) == 8:
                byte_val = sum(b << (7 - j) for j, b in enumerate(chunk))
                byte_array.append(byte_val)
        return bytes(byte_array[:num_bytes])

    def generate_with_entropy_extraction(self, num_bytes: int = 32) -> bytes:
        """Generate quantum random bytes with entropy extraction via hashing."""
        raw = self.generate_random_bytes(max(num_bytes * 2, 64))
        combined = raw + os.urandom(16)
        return hashlib.sha512(combined).digest()[:num_bytes]

    def von_neumann_extractor(self, bits: list[int]) -> list[int]:
        """Von Neumann debiasing for quantum random bits."""
        unbiased = []
        i = 0
        while i + 1 < len(bits):
            if bits[i] == 0 and bits[i + 1] == 1:
                unbiased.append(1)
            elif bits[i] == 1 and bits[i + 1] == 0:
                unbiased.append(0)
            i += 2
        return unbiased

    def generate_seed_for_pqc(self, seed_length: int = 48) -> bytes:
        """Generate a seed suitable for PQC algorithms (quantum-enhanced)."""
        raw_seed = self.generate_random_bytes(seed_length + 16)
        classical_entropy = os.urandom(32)
        combined = raw_seed + classical_entropy
        return hashlib.sha3_512(combined).digest()[:seed_length]

    def quantum_entropy_pool(self, pool_size: int = 256) -> bytes:
        """Build an entropy pool from repeated quantum measurements."""
        pool = bytearray()
        while len(pool) < pool_size:
            bits = self.generate_raw_bits(shots=128)
            extracted = self.von_neumann_extractor(bits)
            for i in range(0, len(extracted), 8):
                chunk = extracted[i : i + 8]
                if len(chunk) == 8:
                    pool.append(sum(b << (7 - j) for j, b in enumerate(chunk)))
        return bytes(pool[:pool_size])
