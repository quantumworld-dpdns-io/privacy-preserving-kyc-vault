from __future__ import annotations

import logging
from typing import Callable

import flwr as fl
from flwr.common import Metrics
from flwr.server import ServerConfig
from flwr.server.strategy import FedAvg

from flwr.fraud_detection.model import FraudDetectionModel

logger = logging.getLogger(__name__)


def weighted_average(metrics: list[tuple[int, Metrics]]) -> Metrics:
    """Aggregate evaluation metrics weighted by number of samples per client."""
    accuracies = [num_examples * m["accuracy"] for num_examples, m in metrics]
    losses = [num_examples * m["loss"] if "loss" in m else 0.0 for num_examples, m in metrics]
    examples = [num_examples for num_examples, _ in metrics]
    total = sum(examples)
    if total == 0:
        return {"accuracy": 0.0, "loss": 0.0}
    return {
        "accuracy": sum(accuracies) / total,
        "loss": sum(losses) / total,
    }


def configure_server(
    model: FraudDetectionModel,
    min_fit_clients: int = 2,
    min_evaluate_clients: int = 2,
    min_available_clients: int = 2,
    num_rounds: int = 10,
    fraction_fit: float = 1.0,
    fraction_evaluate: float = 1.0,
    server_device: str = "cpu",
) -> tuple[fl.server.Server, ServerConfig]:
    """Build and return a Flower server with FedAvg strategy."""
    initial_parameters = fl.common.ndarrays_to_parameters(model.get_weights())

    strategy = FedAvg(
        fraction_fit=fraction_fit,
        fraction_evaluate=fraction_evaluate,
        min_fit_clients=min_fit_clients,
        min_evaluate_clients=min_evaluate_clients,
        min_available_clients=min_available_clients,
        initial_parameters=initial_parameters,
        evaluate_metrics_aggregation_fn=weighted_average,
    )

    config = ServerConfig(num_rounds=num_rounds)
    server = fl.server.start_server(
        server_address="0.0.0.0:8080",
        config=config,
        strategy=strategy,
        grpc_max_message_length=256_000_000,
    )
    return server, config


def run_server(
    input_dim: int = 20,
    num_rounds: int = 10,
    min_fit_clients: int = 2,
    min_available_clients: int = 2,
    server_address: str = "0.0.0.0:8080",
    server_device: str = "cpu",
) -> fl.server.Server:
    """Start the Flower server and block until training completes."""
    model = FraudDetectionModel(input_dim=input_dim)
    model.to(server_device)
    initial_parameters = fl.common.ndarrays_to_parameters(model.get_weights())

    strategy = FedAvg(
        fraction_fit=1.0,
        fraction_evaluate=1.0,
        min_fit_clients=min_fit_clients,
        min_evaluate_clients=min_available_clients,
        min_available_clients=min_available_clients,
        initial_parameters=initial_parameters,
        evaluate_metrics_aggregation_fn=weighted_average,
    )

    config = ServerConfig(num_rounds=num_rounds)

    history = fl.server.start_server(
        server_address=server_address,
        config=config,
        strategy=strategy,
        grpc_max_message_length=256_000_000,
    )
    logger.info("Federated learning finished. History:\n%s", history)
    return history  # type: ignore[return-value]
