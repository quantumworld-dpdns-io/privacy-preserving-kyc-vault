"""Quantum Key Distribution (BB84 Protocol) Simulation using Qiskit."""

import random
from qiskit import QuantumCircuit, execute, Aer


def simulate_bb84(n_bits: int = 100) -> dict:
    """Simulate the BB84 protocol for secure key exchange."""
    
    # 1. Alice generates random bits and bases
    alice_bits = [random.randint(0, 1) for _ in range(n_bits)]
    alice_bases = [random.randint(0, 1) for _ in range(n_bits)] # 0: Z-basis, 1: X-basis
    
    # 2. Alice prepares qubits
    circuits = []
    for i in range(n_bits):
        qc = QuantumCircuit(1, 1)
        if alice_bits[i] == 1:
            qc.x(0)
        if alice_bases[i] == 1:
            qc.h(0)
        circuits.append(qc)
        
    # 3. Bob chooses random bases
    bob_bases = [random.randint(0, 1) for _ in range(n_bits)]
    
    # 4. Bob measures Alice's qubits
    backend = Aer.get_backend('qasm_simulator')
    bob_results = []
    for i in range(n_bits):
        qc = circuits[i]
        if bob_bases[i] == 1:
            qc.h(0)
        qc.measure(0, 0)
        result = execute(qc, backend, shots=1).result()
        measured_bit = int(list(result.get_counts().keys())[0])
        bob_results.append(measured_bit)
        
    # 5. Sifting: Alice and Bob compare bases
    shared_key = []
    for i in range(n_bits):
        if alice_bases[i] == bob_bases[i]:
            shared_key.append(alice_bits[i])
            
    return {
        "alice_bits_sample": alice_bits[:10],
        "alice_bases_sample": alice_bases[:10],
        "bob_bases_sample": bob_bases[:10],
        "shared_key_length": len(shared_key),
        "shared_key_sample": shared_key[:10],
        "efficiency": len(shared_key) / n_bits
    }

if __name__ == "__main__":
    result = simulate_bb84()
    print(f"BB84 Simulation Complete.")
    print(f"Key Length: {result['shared_key_length']} bits from 100 qubits")
    print(f"Efficiency: {result['efficiency']:.2%}")
