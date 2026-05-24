from __future__ import annotations

from collections import OrderedDict

import torch
from torch import nn


class FraudDetectionModel(nn.Module):
    """Feed-forward neural network for KYC fraud detection.

    Binary classifier that maps raw KYC feature vectors to fraud probabilities.
    Uses batch normalisation and dropout for regularisation.
    """

    def __init__(self, input_dim: int = 20, hidden_dims: list[int] | None = None) -> None:
        super().__init__()
        self.input_dim = input_dim
        hidden_dims = hidden_dims or [64, 32, 16]

        layers: list[nn.Module] = []
        prev = input_dim
        for i, h in enumerate(hidden_dims):
            layers.append(nn.Linear(prev, h))
            layers.append(nn.BatchNorm1d(h))
            layers.append(nn.ReLU())
            layers.append(nn.Dropout(0.3 if i < len(hidden_dims) - 1 else 0.2))
            prev = h
        layers.append(nn.Linear(prev, 1))
        layers.append(nn.Sigmoid())

        self.network = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.network(x)

    def get_weights(self) -> list[np.ndarray]:
        """Return model weights as a list of NumPy arrays (for Flower serialisation)."""
        return [val.cpu().numpy() for _, val in self.state_dict().items()]

    def set_weights(self, weights: list[np.ndarray]) -> None:
        """Load model weights from a list of NumPy arrays."""
        state_dict = OrderedDict(
            {k: torch.tensor(v) for k, v in zip(self.state_dict().keys(), weights)}
        )
        self.load_state_dict(state_dict, strict=True)


import numpy as np
