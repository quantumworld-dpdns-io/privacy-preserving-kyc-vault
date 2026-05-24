import flwr as fl
from typing import Dict, Optional, Tuple
import numpy as np
from dataclasses import dataclass
from logging import getLogger, INFO

logger = getLogger(__name__)
fl.common.logger.configure(identifier="kyc-fraud-fl", level=INFO)


@dataclass
class FraudDetectionModel:
    input_dim: int = 128
    hidden_dim: int = 64
    output_dim: int = 2

    def get_weights(self) -> np.ndarray:
        return np.random.randn(self.input_dim * self.hidden_dim + self.hidden_dim * self.output_dim).astype(np.float32)

    def set_weights(self, weights: np.ndarray) -> None:
        self.weights = weights

    def evaluate(self, data: np.ndarray, labels: np.ndarray) -> Tuple[float, float]:
        preds = np.random.rand(len(labels))
        accuracy = float(np.mean((preds > 0.5) == (labels > 0.5)))
        loss = float(-np.mean(labels * np.log(preds + 1e-8) + (1 - labels) * np.log(1 - preds + 1e-8)))
        return loss, accuracy


class FlowerClient(fl.client.NumPyClient):
    def __init__(self, cid: str, model: FraudDetectionModel):
        self.cid = cid
        self.model = model
        self.weights = model.get_weights()

    def get_parameters(self, config: Dict) -> np.ndarray:
        return self.weights

    def fit(self, parameters: np.ndarray, config: Dict) -> Tuple[np.ndarray, int, Dict]:
        self.weights = parameters
        noise = np.random.randn(*parameters.shape) * 0.01
        self.weights = parameters + noise
        train_data = np.random.randn(100, self.model.input_dim)
        train_labels = np.random.randint(0, 2, 100).astype(np.float32)
        loss, acc = self.model.evaluate(train_data, train_labels)
        logger.info(f"Client {self.cid}: fit acc={acc:.4f} loss={loss:.4f}")
        return self.weights, len(train_data), {"accuracy": float(acc), "loss": float(loss)}

    def evaluate(self, parameters: np.ndarray, config: Dict) -> Tuple[float, int, Dict]:
        self.weights = parameters
        test_data = np.random.randn(50, self.model.input_dim)
        test_labels = np.random.randint(0, 2, 50).astype(np.float32)
        loss, acc = self.model.evaluate(test_data, test_labels)
        logger.info(f"Client {self.cid}: eval acc={acc:.4f} loss={loss:.4f}")
        return float(loss), len(test_data), {"accuracy": float(acc)}


def fit_config(server_round: int) -> Dict:
    return {
        "server_round": server_round,
        "batch_size": 32,
        "local_epochs": 5,
        "learning_rate": 0.001,
    }


def get_evaluate_fn(model: FraudDetectionModel):
    def evaluate(server_round: int, parameters: np.ndarray, config: Dict) -> Optional[Tuple[float, Dict]]:
        model.set_weights(parameters)
        test_data = np.random.randn(200, model.input_dim)
        test_labels = np.random.randint(0, 2, 200).astype(np.float32)
        loss, acc = model.evaluate(test_data, test_labels)
        logger.info(f"Server round {server_round}: global acc={acc:.4f} loss={loss:.4f}")
        return float(loss), {"accuracy": float(acc)}
    return evaluate


def start_flower_server(num_rounds: int = 10, min_clients: int = 3) -> None:
    model = FraudDetectionModel()
    strategy = fl.server.strategy.FedAvg(
        fraction_fit=1.0,
        fraction_evaluate=1.0,
        min_fit_clients=min_clients,
        min_evaluate_clients=min_clients,
        min_available_clients=min_clients,
        on_fit_config_fn=fit_config,
        evaluate_fn=get_evaluate_fn(model),
        initial_parameters=fl.common.ndarrays_to_parameters([model.get_weights()]),
    )
    fl.server.start_server(
        server_address="0.0.0.0:8080",
        config=fl.server.ServerConfig(num_rounds=num_rounds),
        strategy=strategy,
    )


def start_flower_client(cid: str) -> None:
    model = FraudDetectionModel()
    fl.client.start_numpy_client(
        server_address="localhost:8080",
        client=FlowerClient(cid, model),
    )


def start_simulation(num_clients: int = 5, num_rounds: int = 10) -> None:
    model = FraudDetectionModel()
    strategy = fl.server.strategy.FedAvg(
        fraction_fit=1.0,
        fraction_evaluate=1.0,
        min_fit_clients=num_clients,
        min_evaluate_clients=num_clients,
        min_available_clients=num_clients,
        on_fit_config_fn=fit_config,
        evaluate_fn=get_evaluate_fn(model),
        initial_parameters=fl.common.ndarrays_to_parameters([model.get_weights()]),
    )
    fl.simulation.start_simulation(
        client_fn=lambda cid: FlowerClient(cid, FraudDetectionModel()),
        num_clients=num_clients,
        config=fl.server.ServerConfig(num_rounds=num_rounds),
        strategy=strategy,
    )


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "client":
        start_flower_client(sys.argv[2] if len(sys.argv) > 2 else "client-1")
    else:
        start_simulation(num_clients=5, num_rounds=10)
