from __future__ import annotations

import logging
from typing import cast

import flwr as fl
import torch
import torch.nn as nn
from flwr.common import NDArrays

from flwr.fraud_detection.dataset import create_synthetic_dataset, create_dataloader
from flwr.fraud_detection.model import FraudDetectionModel

logger = logging.getLogger(__name__)


class FraudDetectionClient(fl.client.NumPyClient):
    """Flower client that trains a fraud detection model on local KYC data."""

    def __init__(
        self,
        client_id: int,
        input_dim: int = 20,
        learning_rate: float = 1e-3,
        client_bias: float = 0.0,
        n_samples: int = 800,
        device: str = "cpu",
    ) -> None:
        self.client_id = client_id
        self.device = torch.device(device)
        self.model = FraudDetectionModel(input_dim=input_dim).to(self.device)
        self.criterion = nn.BCELoss()
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=learning_rate)
        self.n_samples = n_samples

        ds = create_synthetic_dataset(
            n_samples=n_samples,
            n_features=input_dim,
            client_bias=client_bias,
            seed=42 + client_id,
        )
        self.dataloader = create_dataloader(ds, batch_size=32, shuffle=True)

    def get_parameters(self, config: dict | None = None) -> NDArrays:
        return self.model.get_weights()

    def fit(
        self, parameters: NDArrays, config: dict
    ) -> tuple[NDArrays, int, dict]:
        self.model.set_weights(parameters)
        self.model.train()

        epochs = config.get("local_epochs", 3)
        for _ in range(epochs):
            for x, y in self.dataloader:
                x, y = x.to(self.device), y.to(self.device)
                self.optimizer.zero_grad()
                loss = self.criterion(self.model(x), y)
                loss.backward()
                self.optimizer.step()

        updated_weights = self.model.get_weights()
        n_samples = len(self.dataloader.dataset)  # type: ignore[arg-type]
        return updated_weights, n_samples, {"client_id": self.client_id}

    def evaluate(
        self, parameters: NDArrays, config: dict
    ) -> tuple[float, int, dict]:
        self.model.set_weights(parameters)
        self.model.eval()

        correct = 0
        total = 0
        loss_sum = 0.0
        with torch.no_grad():
            for x, y in self.dataloader:
                x, y = x.to(self.device), y.to(self.device)
                preds = self.model(x)
                loss_sum += self.criterion(preds, y).item() * x.size(0)
                predicted = (preds > 0.5).float()
                correct += (predicted == y).sum().item()
                total += x.size(0)

        avg_loss = loss_sum / total
        accuracy = correct / total
        return avg_loss, total, {"accuracy": accuracy}


def create_client_fn(
    input_dim: int = 20,
    learning_rate: float = 1e-3,
    n_samples: int = 800,
    device: str = "cpu",
) -> FraudDetectionClient:
    from flwr.fraud_detection.dataset import create_synthetic_dataset, create_dataloader

    return FraudDetectionClient(
        client_id=0,
        input_dim=input_dim,
        learning_rate=learning_rate,
        client_bias=0.0,
        n_samples=n_samples,
        device=device,
    )
