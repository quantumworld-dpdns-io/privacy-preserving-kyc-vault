"""Grover's algorithm for quantum credential search using Qiskit."""

import math
from qiskit import QuantumCircuit, QuantumRegister, ClassicalRegister, execute, Aer


def grover_oracle(n_qubits: int, target_index: int) -> QuantumCircuit:
    """Build an oracle that marks the target state."""
    qr = QuantumRegister(n_qubits, "q")
    oracle = QuantumCircuit(qr)

    for qubit in range(n_qubits):
        if not (target_index >> qubit) & 1:
            oracle.x(qubit)

    oracle.h(n_qubits - 1)
    oracle.mcx(list(range(n_qubits - 1)), n_qubits - 1)
    oracle.h(n_qubits - 1)

    for qubit in range(n_qubits):
        if not (target_index >> qubit) & 1:
            oracle.x(qubit)

    return oracle


def grover_diffuser(n_qubits: int) -> QuantumCircuit:
    """Build the Grover diffusion operator."""
    qr = QuantumRegister(n_qubits, "q")
    diffuser = QuantumCircuit(qr)

    for qubit in range(n_qubits):
        diffuser.h(qubit)
        diffuser.x(qubit)

    diffuser.h(n_qubits - 1)
    diffuser.mcx(list(range(n_qubits - 1)), n_qubits - 1)
    diffuser.h(n_qubits - 1)

    for qubit in range(n_qubits):
        diffuser.x(qubit)
        diffuser.h(qubit)

    return diffuser


def build_grover_circuit(
    n_qubits: int, target_index: int, iterations: int | None = None
) -> QuantumCircuit:
    """Build a complete Grover search circuit."""
    if iterations is None:
        iterations = int(round(math.pi / 4 * math.sqrt(2**n_qubits)))

    qr = QuantumRegister(n_qubits, "q")
    cr = ClassicalRegister(n_qubits, "c")
    circuit = QuantumCircuit(qr, cr)

    for qubit in range(n_qubits):
        circuit.h(qubit)

    for _ in range(iterations):
        oracle = grover_oracle(n_qubits, target_index)
        diffuser = grover_diffuser(n_qubits)
        circuit = circuit.compose(oracle, range(n_qubits))
        circuit = circuit.compose(diffuser, range(n_qubits))

    circuit.measure(range(n_qubits), range(n_qubits))
    return circuit


def search_credential(
    database_size: int, target_index: int, shots: int = 1024
) -> dict[str, float]:
    """Use Grover's algorithm to search for a credential in a database.

    Args:
        database_size: Number of entries (must be power of 2 for simplicity).
        target_index: The credential index to search for.
        shots: Number of measurement shots.

    Returns:
        Dictionary mapping measured bitstrings to their probabilities.
    """
    n_qubits = int(math.ceil(math.log2(database_size)))
    circuit = build_grover_circuit(n_qubits, target_index)
    backend = Aer.get_backend("qasm_simulator")
    job = execute(circuit, backend, shots=shots)
    result = job.result()
    counts = result.get_counts()
    total = sum(counts.values())
    return {k: v / total for k, v in counts.items()}


def grover_amplitude_amplification(
    n_qubits: int, marked_states: list[int], iterations: int | None = None
) -> QuantumCircuit:
    """Generalized Grover with multiple marked states."""
    if iterations is None:
        iterations = int(
            round(math.pi / 4 * math.sqrt(2**n_qubits / len(marked_states)))
        )

    qr = QuantumRegister(n_qubits, "q")
    cr = ClassicalRegister(n_qubits, "c")
    circuit = QuantumCircuit(qr, cr)

    for qubit in range(n_qubits):
        circuit.h(qubit)

    for _ in range(iterations):
        for state in marked_states:
            oracle = grover_oracle(n_qubits, state)
            circuit = circuit.compose(oracle, range(n_qubits))
        diffuser = grover_diffuser(n_qubits)
        circuit = circuit.compose(diffuser, range(n_qubits))

    circuit.measure(range(n_qubits), range(n_qubits))
    return circuit
