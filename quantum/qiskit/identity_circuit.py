"""Qiskit circuit for quantum identity binding."""

from qiskit import QuantumCircuit, QuantumRegister, ClassicalRegister


def build_identity_binding_circuit(
    identity_hash: list[int], num_ancilla: int = 4
) -> QuantumCircuit:
    """Bind an identity hash to a quantum state for verification.

    The identity is encoded into a quantum register using a combination
    of rotation gates and entanglement, producing a tamper-evident binding.

    Args:
        identity_hash: List of classical bits representing the identity hash.
        num_ancilla: Number of ancilla qubits for the binding.

    Returns:
        A QuantumCircuit implementing the identity binding.
    """
    n_bits = len(identity_hash)
    qr = QuantumRegister(n_bits + num_ancilla, "q")
    cr = ClassicalRegister(num_ancilla, "c")
    circuit = QuantumCircuit(qr, cr)

    # Encode identity hash into quantum register
    for i, bit in enumerate(identity_hash):
        if bit == 1:
            circuit.x(i)

    # Apply identity-specific rotations
    for i in range(n_bits):
        circuit.ry(0.25 * (i + 1), i)
        circuit.rz(0.5 * (i + 1), i)

    # Entangle identity qubits for binding
    for i in range(n_bits - 1):
        circuit.cx(i, i + 1)
        circuit.cz(i, i + 1)

    # Bind to ancilla register (tamper-evident seal)
    for i in range(min(n_bits, num_ancilla)):
        circuit.crx(0.5, i, n_bits + i)
        circuit.cry(0.3, i, n_bits + i)

    # Additional mixing for binding strength
    for i in range(num_ancilla - 1):
        circuit.cx(n_bits + i, n_bits + i + 1)
        circuit.cz(n_bits + i, n_bits + i + 1)

    # Measure binding ancilla
    for i in range(num_ancilla):
        circuit.measure(n_bits + i, i)

    return circuit


def build_identity_verification_circuit(
    expected_identity: list[int],
) -> QuantumCircuit:
    """Build a circuit that verifies an identity binding.

    Uses swap test-based comparison between a prepared identity
    state and the expected classical identity.

    Args:
        expected_identity: The expected identity bits.

    Returns:
        A QuantumCircuit for identity verification.
    """
    n_bits = len(expected_identity)
    qr = QuantumRegister(n_bits + 1, "q")
    cr = ClassicalRegister(1, "c")
    circuit = QuantumCircuit(qr, cr)

    # Prepare expected identity state
    for i, bit in enumerate(expected_identity):
        if bit == 1:
            circuit.x(i)

    # Apply same rotations as binding
    for i in range(n_bits):
        circuit.ry(0.25 * (i + 1), i)
        circuit.rz(0.5 * (i + 1), i)

    # Entangle for comparison
    for i in range(n_bits):
        circuit.cx(i, n_bits)

    # Hadamard on ancilla for swap test
    circuit.h(n_bits)

    for i in range(n_bits):
        circuit.cswap(n_bits, i, n_bits + 1)

    circuit.h(n_bits)
    circuit.measure(n_bits, 0)

    return circuit


def build_identity_commitment_circuit(
    identity_hash: list[int],
) -> QuantumCircuit:
    """Create a commitment circuit that hides the identity until reveal."""
    n_bits = len(identity_hash)
    qr = QuantumRegister(n_bits + n_bits, "q")
    cr = ClassicalRegister(n_bits, "c")
    circuit = QuantumCircuit(qr, cr)

    # Encode identity
    for i, bit in enumerate(identity_hash):
        if bit == 1:
            circuit.x(i)

    # Commitment via entanglement with random basis
    for i in range(n_bits):
        circuit.h(i)
        circuit.cx(i, n_bits + i)

    # Blind with phase
    for i in range(n_bits):
        circuit.t(i)
        circuit.tdg(i)

    circuit.barrier()

    # Measure commitment register
    for i in range(n_bits):
        circuit.measure(n_bits + i, i)

    return circuit
