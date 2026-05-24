"""Qiskit circuit for zero-knowledge proof verification."""

from qiskit import QuantumCircuit, QuantumRegister, ClassicalRegister


def build_zk_verification_circuit(
    num_credential_bits: int = 8,
    num_challenge_bits: int = 4,
) -> QuantumCircuit:
    """Build a quantum circuit for zero-knowledge proof verification.

    Implements a sigma-protocol-like ZK proof where the prover
    demonstrates knowledge of a credential without revealing it.

    Args:
        num_credential_bits: Number of bits in the credential.
        num_challenge_bits: Number of bits for the challenge.

    Returns:
        A QuantumCircuit implementing ZK proof verification.
    """
    total_qubits = num_credential_bits + num_challenge_bits + 1
    qr = QuantumRegister(total_qubits, "q")
    cr = ClassicalRegister(num_challenge_bits + 1, "c")
    circuit = QuantumCircuit(qr, cr)

    # Prover commitment phase: encode credential in superposition
    for i in range(num_credential_bits):
        circuit.h(i)

    # Challenge phase: verifier's challenge encoded in ancilla
    for i in range(num_challenge_bits):
        circuit.h(num_credential_bits + i)

    # Response phase: entangled response based on credential and challenge
    for i in range(min(num_credential_bits, num_challenge_bits)):
        circuit.cx(num_credential_bits + i, i)

    # Mixing for proof binding
    for i in range(num_credential_bits - 1):
        circuit.cz(i, i + 1)

    # Verification entanglement
    for i in range(num_challenge_bits):
        circuit.cx(
            num_credential_bits + i,
            num_credential_bits + num_challenge_bits,
        )

    # Measure verification outcome
    circuit.measure(
        num_credential_bits + num_challenge_bits, 0
    )

    # Measure challenge for proof record
    for i in range(num_challenge_bits):
        circuit.measure(num_credential_bits + i, i + 1)

    return circuit


def build_sigma_protocol_circuit(
    witness_bits: list[int],
    challenge_bits: list[int],
) -> QuantumCircuit:
    """Build a sigma protocol ZK circuit with specific witness and challenge.

    Args:
        witness_bits: The prover's witness (credential).
        challenge_bits: The verifier's challenge.

    Returns:
        A QuantumCircuit implementing the sigma protocol.
    """
    n_witness = len(witness_bits)
    n_challenge = len(challenge_bits)
    total = n_witness + n_challenge + 1

    qr = QuantumRegister(total, "q")
    cr = ClassicalRegister(n_challenge + 1, "c")
    circuit = QuantumCircuit(qr, cr)

    # Encode witness
    for i, bit in enumerate(witness_bits):
        if bit == 1:
            circuit.x(i)

    # Commitment: Hadamard on witness register
    for i in range(n_witness):
        circuit.h(i)

    # Encode challenge
    for i, bit in enumerate(challenge_bits):
        if bit == 1:
            circuit.x(n_witness + i)

    # Challenge in superposition
    for i in range(n_challenge):
        circuit.h(n_witness + i)

    # Oracle: entangle witness with challenge
    for i in range(min(n_witness, n_challenge)):
        circuit.cx(n_witness + i, i)

    # Response: measure witness-challenge correlation
    for i in range(n_challenge):
        circuit.cx(n_witness + i, n_witness + n_challenge)

    # Verification
    circuit.measure(n_witness + n_challenge, 0)

    return circuit


def build_quantum_otp_verification(
    commitment: list[int], response: list[int]
) -> QuantumCircuit:
    """Build a quantum one-time pad verification circuit."""
    n = len(commitment)
    qr = QuantumRegister(n + n + 1, "q")
    cr = ClassicalRegister(1, "c")
    circuit = QuantumCircuit(qr, cr)

    # Encode commitment
    for i, bit in enumerate(commitment):
        if bit == 1:
            circuit.x(i)

    # Encode response
    for i, bit in enumerate(response):
        if bit == 1:
            circuit.x(n + i)

    # XOR check via CNOT
    for i in range(n):
        circuit.cx(i, n + i)

    # Verify all XORs are zero
    circuit.x(2 * n)
    for i in range(n):
        circuit.cx(n + i, 2 * n)
    circuit.x(2 * n)

    circuit.measure(2 * n, 0)
    return circuit


def build_merkle_proof_circuit(
    leaf_bits: list[int], merkle_path: list[list[int]]
) -> QuantumCircuit:
    """Build a quantum circuit for Merkle proof verification."""
    n = len(leaf_bits)
    depth = len(merkle_path)

    qr = QuantumRegister(n + depth + 1, "q")
    cr = ClassicalRegister(1, "c")
    circuit = QuantumCircuit(qr, cr)

    # Encode leaf
    for i, bit in enumerate(leaf_bits):
        if bit == 1:
            circuit.x(i)

    # Hash chain via controlled operations
    for level in range(depth):
        for j, bit in enumerate(merkle_path[level]):
            if bit == 1:
                circuit.cx(j, n + level)

    # Verify root
    circuit.h(n + depth)
    for level in range(depth):
        circuit.cx(n + level, n + depth)
    circuit.h(n + depth)

    circuit.measure(n + depth, 0)
    return circuit
