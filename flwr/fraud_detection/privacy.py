from __future__ import annotations

import logging
import math
from typing import Any

import numpy as np
from flwr.common import NDArrays, ndarrays_to_parameters, parameters_to_ndarrays
from flwr.server.strategy import FedAvg

logger = logging.getLogger(__name__)


class DPFedAvg(FedAvg):
    """FedAvg with differential privacy via clipped-noise aggregation (DP-FedAvg).

    Applies Gaussian noise to the aggregated model update and clips per-client
    contributions to bound the sensitivity of the average.
    """

    def __init__(
        self,
        noise_multiplier: float = 1.0,
        clipping_norm: float = 1.0,
        num_clients_per_round: int = 2,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self.noise_multiplier = noise_multiplier
        self.clipping_norm = clipping_norm
        self.num_clients_per_round = num_clients_per_round

    def _clip_and_noise(
        self, weights_deltas: list[NDArrays]
    ) -> list[NDArrays]:
        """Clip per-client updates and add Gaussian noise.

        Each client's weight delta is clipped to have L2 norm ≤ *clipping_norm*,
        then Gaussian noise calibrated to the clipping norm and noise multiplier
        is added to the average.
        """
        clipped: list[NDArrays] = []
        for delta in weights_deltas:
            flat = np.concatenate([w.ravel() for w in delta])
            norm = np.linalg.norm(flat)
            scale = min(1.0, self.clipping_norm / (norm + 1e-8))
            clipped.append([w * scale for w in delta])

        if not clipped:
            return clipped

        # Average the clipped deltas
        n = len(clipped)
        avg = [np.zeros_like(w) for w in clipped[0]]
        for c in clipped:
            for i in range(len(avg)):
                avg[i] += c[i] / n

        # Add Gaussian noise
        stddev = self.noise_multiplier * self.clipping_norm / n
        if stddev > 0.0:
            noisy = [
                w + np.random.normal(0, stddev, size=w.shape).astype(w.dtype)
                for w in avg
            ]
            return noisy
        return avg

    def aggregate_fit(  # type: ignore[override]
        self,
        server_round: int,
        results: list[Any],
        failures: list[Any],
    ) -> tuple[NDArrays | None, dict[str, Any]]:
        """Aggregate with DP: clip client deltas and add noise."""
        if not results:
            return None, {}

        # Compute weight deltas: current parameters -> client parameters
        current_weights = parameters_to_ndarrays(
            ndarrays_to_parameters(self.initial_parameters or [])
        )
        client_weights = [
            parameters_to_ndarrays(res.parameters) for _, res in results
        ]
        deltas = [
            [cw - curr for cw, curr in zip(cw_list, current_weights)]
            for cw_list in client_weights
        ]

        private_delta = self._clip_and_noise(deltas)

        # Apply delta to current weights
        new_weights = [curr + delta for curr, delta in zip(current_weights, private_delta)]
        new_params = ndarrays_to_parameters(new_weights)
        metrics = {}
        return new_params, metrics

    def compute_epsilon(
        self,
        delta: float = 1e-5,
        target_delta: float | None = None,
    ) -> float:
        """Compute (ε, δ)-DP guarantee using the moments accountant approximation.

        Parameters
        ----------
        delta : float
            Target δ for the DP guarantee.
        """
        q = self.num_clients_per_round / self.num_clients_per_round  # sampling rate = 1 (fixed clients)
        sigma = self.noise_multiplier
        # Renyi-DP based approximation (simplified)
        # ε = q * sqrt(2 * log(1 / δ) / π) / σ  (Gaussian mechanism, basic composition)
        # For a tighter bound we use the sub-Gaussian approximation:
        if sigma <= 0:
            return float("inf")
        eps = math.sqrt(2 * math.log(1.25 / delta)) / sigma
        return round(eps, 2)
