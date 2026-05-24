"""Qiskit circuit for quantum credential commitment scheme."""

from qiskit import QuantumCircuit, QuantumRegister, ClassicalRegister


def build_credential_commitment_circuit(
    credential_bits: list[int],
    num_ancilla: int = 4,
) -> QuantumCircuit:
    """Build a quantum circuit that commits a credential value.

    Uses a commitment scheme where the credential is encoded into
    qubit rotations and committed via a hash-like circuit structure.

    Args:
        credential_bits: Classical bits representing the credential.
        num_ancilla: Number of ancilla qubits for commitment.

    Returns:
        A QuantumCircuit implementing the commitment.
    """
    n_bits = len(credential_bits)
    qr = QuantumRegister(n_bits + num_ancilla, "q")
    cr = ClassicalRegister(num_ancilla, "c")
    circuit = QuantumCircuit(qr, cr)

    # Encode credential into qubit states
    for i, bit in enumerate(credential_bits):
        if bit == 1:
            circuit.x(i)

    # Apply Hadamard to create superposition
    for i in range(n_bits):
        circuit.h(i)

    # Commitment layer: entangle credential qubits with ancilla
    for i in range(min(n_bits, num_ancilla)):
        circuit.cx(i, n_bits + i)

    # Mixing layer for commitment hiding
    for i in range(num_ancilla - 1):
        circuit.cx(n_bits + i, n_bits + i + 1)

    # Apply phase based on credential value (blinding)
    for i in range(n_bits):
        if credential_bits[i] == 1:
            circuit.rz(0.5, i)

    # Second entangling layer
    for i in range(min(n_bits, num_ancilla)):
        circuit.cz(i, n_bits + i)

    # Measure ancilla to produce commitment string
    for i in range(num_ancilla):
        circuit.h(n_bits + i)
        circuit.measure(n_bits + i, i)

    return circuit


def build_credential_reveal_circuit(
    credential_bits: list[int],
    commitment_measurements: list[int],
) -> QuantumCircuit:
    """Build a circuit to reveal and verify a committed credential."""
    n_bits = len(credential_bits)
    n_ancilla = len(commitment_measurements)
    total_qubits = n_bits + n_ancilla

    qr = QuantumRegister(total_qubits, "q")
    cr = ClassicalRegister(n_bits, "c")
    circuit = QuantumCircuit(qr, cr)

    # Re-encode credential
    for i, bit in enumerate(credential_bits):
        if bit == 1:
            circuit.x(i)

    # Re-apply commitment operations
    for i in range(n_bits):
        circuit.h(i)
    for i in range(min(n_bits, n_ancilla)):
        circuit.cx(i, n_bits + i)
    for i in range(n_ancilla - 1):
        circuit.cx(n_bits + i, n_bits + i + 1)
    for i in range(n_bits):
        if credential_bits[i] == 1:
            circuit.rz(0.5, i)
    for i in range(min(n_bits, n_ancilla)):
        circuit.cz(i, n_bits + i)

    # Uncompute ancilla
    for i in range(min(n_bits, n_ancilla)):
        circuit.cx(i, n_bits + i)

    # Measure credential qubits to reveal
    for i in range(n_bits):
        circuit.measure(i, i)

    return circuit


def create_credential_superposition_circuit(
    num_credentials: int = 4,
) -> QuantumCircuit:
    """Create a circuit that places all credential states in superposition."""
    qr = QuantumRegister(num_credentials, "q")
    cr = ClassicalRegister(num_credentials, "c")
    circuit = QuantumCircuit(qr, cr)

    for i in range(num_credentials):
        circuit.h(i)

    circuit.measure(range(num_credentials), range(num_credentials))
    return circuit
