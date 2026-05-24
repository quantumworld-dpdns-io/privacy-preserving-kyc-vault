"""Complete Flower federated learning example for KYC fraud detection.

Trains a fraud detection model across multiple simulated institutions
without sharing raw KYC data. Uses FedAvg with differential privacy.

Usage:
    # Start the server
    python federated_kyc.py --mode server --rounds 15

    # Start clients (in separate terminals)
    python federated_kyc.py --mode client --client-id 0 --port 8080
    python federated_kyc.py --mode client --client-id 1 --port 8080
    python federated_kyc.py --mode client --client-id 2 --port 8080
"""

from __future__ import annotations

import argparse
import logging
import os
from collections import OrderedDict
from typing import Any

import flwr as fl
import numpy as np
import torch
import torch.nn as nn
from flwr.common import NDArrays, Metrics, ndarrays_to_parameters, parameters_to_ndarrays
from flwr.server import ServerConfig
from flwr.server.strategy import FedAvg

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model: fraud detection neural network
# ---------------------------------------------------------------------------

class FraudDetectionModel(nn.Module):
    """Binary classifier for KYC fraud detection using federated learning."""

    def __init__(self, input_dim: int = 20):
        super().__init__()
        self.input_dim = input_dim
        self.network = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.BatchNorm1d(64),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(64, 32),
            nn.BatchNorm1d(32),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(32, 16),
            nn.ReLU(),
            nn.Linear(16, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.network(x)

    def get_weights(self) -> NDArrays:
        return [val.cpu().numpy() for _, val in self.state_dict().items()]

    def set_weights(self, weights: NDArrays) -> None:
        state_dict = OrderedDict(
            {k: torch.tensor(v) for k, v in zip(self.state_dict().keys(), weights)}
        )
        self.load_state_dict(state_dict, strict=True)


# ---------------------------------------------------------------------------
# Dataset: synthetic KYC fraud data
# ---------------------------------------------------------------------------

def create_synthetic_dataset(
    n_samples: int = 1000,
    n_features: int = 20,
    fraud_rate: float = 0.08,
    client_bias: float = 0.0,
    seed: int = 42,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Generate synthetic KYC feature vectors with fraud labels."""
    rng = np.random.default_rng(seed)
    x = rng.normal(0, 1, (n_samples, n_features)).astype(np.float32)
    x[:, 0] += client_bias
    logits = x[:, 0] * 0.5 + x[:, 1] * 0.3 + x[:, 2] * (-0.4) + rng.normal(0, 0.3, n_samples)
    probs = 1.0 / (1.0 + np.exp(-logits))
    probs = np.clip(probs, 0.01, 0.99)
    probs = probs * (1 - fraud_rate) + fraud_rate * (1 - probs)
    y = (rng.uniform(0, 1, n_samples) < probs).astype(np.float32)
    return torch.from_numpy(x), torch.from_numpy(y).unsqueeze(1)


def create_dataloader(
    x: torch.Tensor, y: torch.Tensor, batch_size: int = 32, shuffle: bool = True
) -> torch.utils.data.DataLoader:
    ds = torch.utils.data.TensorDataset(x, y)
    return torch.utils.data.DataLoader(ds, batch_size=batch_size, shuffle=shuffle)


# ---------------------------------------------------------------------------
# Differential Privacy utilities
# ---------------------------------------------------------------------------

def add_dp_noise(weights: NDArrays, sigma: float = 0.01) -> NDArrays:
    """Add Gaussian noise for differential privacy."""
    return [w + np.random.normal(0, sigma, w.shape) for w in weights]


def clip_weights(weights: NDArrays, max_norm: float = 1.0) -> NDArrays:
    """Clip gradients/weights by L2 norm."""
    total_norm = np.sqrt(sum(np.sum(w ** 2) for w in weights))
    factor = min(1.0, max_norm / (total_norm + 1e-12))
    return [w * factor for w in weights]


# ---------------------------------------------------------------------------
# Flower Client
# ---------------------------------------------------------------------------

class KYCFraudClient(fl.client.NumPyClient):
    """Flower client that trains fraud detection on local KYC data."""

    def __init__(
        self,
        client_id: int,
        input_dim: int = 20,
        learning_rate: float = 1e-3,
        client_bias: float = 0.0,
        n_samples: int = 800,
        dp_sigma: float = 0.0,
    ) -> None:
        self.client_id = client_id
        self.dp_sigma = dp_sigma
        self.model = FraudDetectionModel(input_dim=input_dim)
        self.criterion = nn.BCELoss()
        self.optimizer = torch.optim.Adam(self.model.parameters(), lr=learning_rate)
        x, y = create_synthetic_dataset(
            n_samples=n_samples, n_features=input_dim,
            client_bias=client_bias, seed=42 + client_id,
        )
        self.dataloader = create_dataloader(x, y, batch_size=32, shuffle=True)

    def get_parameters(self, config: dict | None = None) -> NDArrays:
        return self.model.get_weights()

    def fit(self, parameters: NDArrays, config: dict) -> tuple[NDArrays, int, dict]:
        self.model.set_weights(parameters)
        self.model.train()
        epochs = config.get("local_epochs", 3)
        for _ in range(epochs):
            for x, y in self.dataloader:
                self.optimizer.zero_grad()
                loss = self.criterion(self.model(x), y)
                loss.backward()
                self.optimizer.step()
        weights = self.model.get_weights()
        weights = clip_weights(weights, max_norm=1.0)
        if self.dp_sigma > 0:
            weights = add_dp_noise(weights, sigma=self.dp_sigma)
        return weights, len(self.dataloader.dataset), {"client_id": self.client_id}

    def evaluate(self, parameters: NDArrays, config: dict) -> tuple[float, int, dict]:
        self.model.set_weights(parameters)
        self.model.eval()
        correct = total = 0
        loss_sum = 0.0
        with torch.no_grad():
            for x, y in self.dataloader:
                preds = self.model(x)
                loss_sum += self.criterion(preds, y).item() * x.size(0)
                predicted = (preds > 0.5).float()
                correct += (predicted == y).sum().item()
                total += x.size(0)
        return loss_sum / total, total, {"accuracy": correct / total}


# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------

def weighted_average(metrics: list[tuple[int, Metrics]]) -> Metrics:
    acc = sum(n * m["accuracy"] for n, m in metrics)
    loss = sum(n * m.get("loss", 0.0) for n, m in metrics)
    total = sum(n for n, _ in metrics)
    return {"accuracy": acc / total, "loss": loss / total} if total else {}


def run_server(num_rounds: int = 10, min_clients: int = 2, server_address: str = "0.0.0.0:8080"):
    model = FraudDetectionModel()
    strategy = FedAvg(
        fraction_fit=1.0,
        fraction_evaluate=1.0,
        min_fit_clients=min_clients,
        min_evaluate_clients=min_clients,
        min_available_clients=min_clients,
        initial_parameters=ndarrays_to_parameters(model.get_weights()),
        evaluate_metrics_aggregation_fn=weighted_average,
    )
    config = ServerConfig(num_rounds=num_rounds)
    logger.info("Starting Flower server on %s (%d rounds)", server_address, num_rounds)
    history = fl.server.start_server(
        server_address=server_address,
        config=config,
        strategy=strategy,
        grpc_max_message_length=256_000_000,
    )
    logger.info("Training complete. Best accuracy: %.4f", max(history.metrics_centralized.get("accuracy", [(0, 0)])[1]))


def run_client(client_id: int, server_address: str = "127.0.0.1:8080", dp_sigma: float = 0.0):
    client = KYCFraudClient(
        client_id=client_id,
        client_bias=0.1 * client_id,
        n_samples=500 + client_id * 200,
        dp_sigma=dp_sigma,
    )
    fl.client.start_numpy_client(
        server_address=server_address,
        client=client,
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Federated KYC Fraud Detection")
    parser.add_argument("--mode", choices=["server", "client"], default="server")
    parser.add_argument("--client-id", type=int, default=0)
    parser.add_argument("--rounds", type=int, default=10)
    parser.add_argument("--min-clients", type=int, default=2)
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--dp-sigma", type=float, default=0.0, help="DP noise scale (0 = no DP)")
    args = parser.parse_args()

    addr = f"0.0.0.0:{args.port}" if args.mode == "server" else f"127.0.0.1:{args.port}"

    if args.mode == "server":
        run_server(num_rounds=args.rounds, min_clients=args.min_clients, server_address=addr)
    else:
        run_client(client_id=args.client_id, server_address=addr, dp_sigma=args.dp_sigma)


if __name__ == "__main__":
    main()
