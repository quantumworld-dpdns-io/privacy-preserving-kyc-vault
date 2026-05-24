"""Quantum Superdense Coding Simulation using Qiskit."""

from qiskit import QuantumCircuit, execute, Aer


def build_superdense_circuit(message: str) -> QuantumCircuit:
    """Build a circuit to transmit 2 classical bits using 1 qubit."""
    if message not in ["00", "01", "10", "11"]:
        raise ValueError("Message must be 00, 01, 10, or 11")
        
    qc = QuantumCircuit(2, 2)
    
    # Step 1: Create Bell Pair (Entanglement)
    qc.h(0)
    qc.cx(0, 1)
    qc.barrier()
    
    # Step 2: Alice encodes her 2-bit message on qubit 0
    if message == "00":
        qc.id(0)
    elif message == "01":
        qc.z(0)
    elif message == "10":
        qc.x(0)
    elif message == "11":
        qc.x(0)
        qc.z(0)
    qc.barrier()
    
    # Step 3: Alice sends her qubit to Bob, Bob decodes
    qc.cx(0, 1)
    qc.h(0)
    qc.barrier()
    
    # Step 4: Measurement
    qc.measure(0, 0)
    qc.measure(1, 1)
    
    return qc


def transmit_message(message: str) -> str:
    """Simulate superdense coding transmission."""
    qc = build_superdense_circuit(message)
    backend = Aer.get_backend('qasm_simulator')
    result = execute(qc, backend, shots=1).result()
    counts = result.get_counts()
    return list(counts.keys())[0] # Returns 'q1q0' order in Qiskit


if __name__ == "__main__":
    msg = "11"
    received = transmit_message(msg)
    print(f"Original Message: {msg}")
    print(f"Received Message (decoded): {received[::-1]}") # Reverse to match bit order
