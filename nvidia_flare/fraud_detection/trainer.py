from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from nvidia_flare.fraud_detection.config import FraudDetectionConfig
from nvidia_flare.fraud_detection.model import FraudNet

logger = logging.getLogger(__name__)


class FraudTrainer:
    """Trainer executor for NVIDIA FLARE.

    Receives global model weights, trains on local synthetic data, and returns
    updated weights together with training metrics.
    """

    def __init__(
        self,
        config: FraudDetectionConfig | None = None,
        client_id: int = 0,
        client_bias: float = 0.0,
        data: TensorDataset | None = None,
        device: str = "cpu",
    ) -> None:
        self.config = config or FraudDetectionConfig.from_env()
        self.client_id = client_id
        self.device = torch.device(device)
        self.model = FraudNet(
            input_dim=self.config.n_features,
            hidden_dims=self.config.hidden_dims,
        ).to(self.device)

        if data is not None:
            self._data = data
        else:
            self._data = self._load_or_generate_data(client_bias)

        self.dataloader = DataLoader(
            self._data,
            batch_size=self.config.batch_size,
            shuffle=True,
        )

    def _load_or_generate_data(self, bias: float) -> TensorDataset:
        """Generate a synthetic dataset for this client."""
        from flwr.fraud_detection.dataset import create_synthetic_dataset

        return create_synthetic_dataset(
            n_samples=self.config.n_samples_per_client,
            n_features=self.config.n_features,
            fraud_ratio=self.config.fraud_ratio,
            client_bias=bias,
            seed=42 + self.client_id,
        )

    def train(
        self,
        weights: list[np.ndarray],
        epochs: int | None = None,
    ) -> tuple[list[np.ndarray], dict[str, float]]:
        """Run local training starting from *weights*.

        Returns (updated_weights, metrics).
        """
        self.model.set_weights(weights)
        self.model.train()

        optimizer = torch.optim.Adam(
            self.model.parameters(), lr=self.config.learning_rate
        )
        criterion = nn.BCELoss()

        n_epochs = epochs or self.config.epochs_per_round
        total_loss = 0.0
        n_batches = 0

        for _ in range(n_epochs):
            for x, y in self.dataloader:
                x, y = x.to(self.device), y.to(self.device)
                optimizer.zero_grad()
                loss = criterion(self.model(x), y)
                loss.backward()
                optimizer.step()
                total_loss += loss.item()
                n_batches += 1

        avg_loss = total_loss / max(n_batches, 1)
        updated = self.model.get_weights()
        metrics = {
            "train_loss": avg_loss,
            "client_id": float(self.client_id),
        }
        return updated, metrics

    def save_model(self, path: str) -> Path:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        torch.save(self.model.state_dict(), p)
        logger.info("Model saved to %s", p)
        return p

    def load_model(self, path: str) -> None:
        p = Path(path)
        state = torch.load(p, map_location=self.device, weights_only=True)
        self.model.load_state_dict(state)
        logger.info("Model loaded from %s", p)
