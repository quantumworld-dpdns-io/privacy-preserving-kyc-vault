// CUDA-Q Quantum Phase Estimation kernel for credential validation
#include <cudaq.h>
#include <cmath>

struct qpe_kernel {
    auto operator()(int n_control_qubits, double target_phase) __qpu__ {
        cudaq::qvector control(n_control_qubits);
        cudaq::qubit target;

        // Prepare target in |1> state (eigenstate of the unitary)
        x(target);

        // Apply Hadamard to all control qubits
        h(control);

        // Apply controlled-unitary operations
        for (int i = 0; i < n_control_qubits; i++) {
            int power = 1 << i;
            for (int j = 0; j < power; j++) {
                cudaq::control(control[i], [&]() {
                    rz(2.0 * M_PI * target_phase, target);
                });
            }
        }

        // Inverse QFT on control qubits
        for (int i = 0; i < n_control_qubits / 2; i++) {
            swap(control[i], control[n_control_qubits - 1 - i]);
        }
        for (int i = 0; i < n_control_qubits - 1; i++) {
            h(control[i]);
            for (int j = i + 1; j < n_control_qubits; j++) {
                double angle = M_PI / (double)(1 << (j - i));
                cudaq::control(control[j], [&]() {
                    rz(-angle, control[i]);
                });
            }
        }
        for (int i = n_control_qubits - 1; i >= 0; i--) {
            h(control[i]);
        }

        // Measure control qubits to extract phase estimate
        auto results = mz(control);
        return results;
    }
};

struct credential_validation_qpe {
    auto operator()(cudaq::qvector<> &credential_register, int n_control) __qpu__ {
        const int n_qubits = credential_register.size();
        cudaq::qvector control(n_control);

        h(control);

        // Apply phase based on credential properties
        for (int i = 0; i < n_qubits; i++) {
            for (int j = 0; j < n_control; j++) {
                double phase = 2.0 * M_PI / (double)(1 << (j + 1));
                cudaq::control(credential_register[i], [&]() {
                    cudaq::control(control[j], [&]() {
                        rz(phase, credential_register[i]);
                    });
                });
            }
        }

        // Inverse QFT on control register
        for (int i = 0; i < n_control / 2; i++) {
            swap(control[i], control[n_control - 1 - i]);
        }
        for (int i = 0; i < n_control - 1; i++) {
            h(control[i]);
        }

        auto phase_estimate = mz(control);
        return phase_estimate;
    }
};
