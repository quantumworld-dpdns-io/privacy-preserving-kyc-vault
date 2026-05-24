"""Quantum Shor's Algorithm (Order Finding) for factoring using Qiskit."""

import math
import numpy as np
from qiskit import QuantumCircuit, QuantumRegister, ClassicalRegister, execute, Aer


def qft_dagger(n: int) -> QuantumCircuit:
    """n-qubit Inverse QFT."""
    qc = QuantumCircuit(n)
    for qubit in range(n // 2):
        qc.swap(qubit, n - qubit - 1)
    for j in range(n):
        for m in range(j):
            qc.cp(-math.pi / float(2 ** (j - m)), m, j)
        qc.h(j)
    qc.name = "QFT†"
    return qc


def amod15(a: int, power: int) -> QuantumCircuit:
    """Controlled multiplication by a mod 15."""
    if a not in [2, 7, 8, 11, 13]:
        raise ValueError("'a' must be 2, 7, 8, 11, or 13")
    qc = QuantumCircuit(4)
    for _iteration in range(power):
        if a in [2, 13]:
            qc.swap(0, 1)
            qc.swap(1, 2)
            qc.swap(2, 3)
        if a in [7, 8]:
            qc.swap(2, 3)
            qc.swap(1, 2)
            qc.swap(0, 1)
        if a == 11:
            qc.swap(0, 2)
            qc.swap(1, 3)
        if a in [13, 8, 11]:
            for j in range(4):
                qc.x(j)
    qc = qc.to_gate()
    qc.name = f"{a}^{power} mod 15"
    c_qc = qc.control()
    return c_qc


def build_shor_circuit(a: int, n: int = 15) -> QuantumCircuit:
    """Build Shor's order-finding circuit for N=15."""
    n_count = 8  # Number of counting qubits
    qr_count = QuantumRegister(n_count, "count")
    qr_target = QuantumRegister(4, "target")
    cr = ClassicalRegister(n_count, "c")
    qc = QuantumCircuit(qr_count, qr_target, cr)

    for q in range(n_count):
        qc.h(q)

    qc.x(n_count)  # Auxiliary register in state |1>

    for q in range(n_count):
        qc.append(amod15(a, 2**q), [q] + [i + n_count for i in range(4)])

    qc.append(qft_dagger(n_count), range(n_count))
    qc.measure(range(n_count), range(n_count))
    return qc


def factorize_15(a: int = 7) -> int:
    """Run Shor's algorithm to factor 15 using a=7."""
    backend = Aer.get_backend("qasm_simulator")
    qc = build_shor_circuit(a)
    job = execute(qc, backend, shots=1)
    result = job.result()
    counts = result.get_counts()

    # Get the measured value and convert to phase
    measured_str = list(counts.keys())[0]
    measured_int = int(measured_str, 2)
    phase = measured_int / (2**8)

    # Simplified order finding
    from fractions import Fraction
    r = Fraction(phase).limit_denominator(15).denominator
    return r


def get_qasm_shor(a: int = 7) -> str:
    """Return OpenQASM 2.0 representation of Shor's circuit."""
    qc = build_shor_circuit(a)
    return qc.qasm()
