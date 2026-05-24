from __future__ import annotations

from collections import OrderedDict

import numpy as np
import torch
from torch import nn


class FraudNet(nn.Module):
    """PyTorch model for KYC fraud detection (NVIDIA FLARE version).

    Architecture matchs the Flower variant so weights are compatible.
    """

    def __init__(
        self,
        input_dim: int = 20,
        hidden_dims: list[int] | None = None,
    ) -> None:
        super().__init__()
        self.input_dim = input_dim
        hidden_dims = hidden_dims or [64, 32, 16]

        modules: list[nn.Module] = []
        prev = input_dim
        for i, h in enumerate(hidden_dims):
            modules.append(nn.Linear(prev, h))
            modules.append(nn.BatchNorm1d(h))
            modules.append(nn.ReLU(inplace=True))
            modules.append(nn.Dropout(0.3 if i < len(hidden_dims) - 1 else 0.2))
            prev = h
        modules.append(nn.Linear(prev, 1))
        modules.append(nn.Sigmoid())

        self.net = nn.Sequential(*modules)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)

    def get_weights(self) -> list[np.ndarray]:
        return [val.cpu().numpy() for _, val in self.state_dict().items()]

    def set_weights(self, weights: list[np.ndarray]) -> None:
        state_dict = OrderedDict(
            {k: torch.tensor(v) for k, v in zip(self.state_dict().keys(), weights)}
        )
        self.load_state_dict(state_dict, strict=True)
