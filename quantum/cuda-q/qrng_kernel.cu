// CUDA-Q Quantum Random Number Generator Kernel
#include <cudaq.h>

struct qrng_kernel {
    auto operator()() __qpu__ {
        cudaq::qubit q;
        auto result = mz(q);
        return result;
    }
};
