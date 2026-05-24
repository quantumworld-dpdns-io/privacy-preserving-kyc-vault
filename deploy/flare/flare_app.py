import nvflare.app_common.workflows.fedavg as fedavg
from nvflare.app_common.executors.client_api_executor import ClientAPILauncherExecutor
from nvflare.app_common.aggregators.weighted_aggregation_helper import WeightedAggregationHelper
from nvflare.app_common.shareablegenerators.full_model_shareable_generator import FullModelShareableGenerator
from nvflare.client.api import init, receive, submit
from nvflare.client.config import Config, TransferType
from nvflare.apis.fl_constant import FLContextKey
from nvflare.apis.workspace import Workspace
from typing import Dict, Any, Optional
import numpy as np
import logging
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("flare_kyc_app")


class FedAvgController(fedavg.FedAvg):
    def __init__(
        self,
        num_clients: int = 5,
        num_rounds: int = 10,
        start_round: int = 0,
        participate_clients: int = 3,
        aggregation_weights: Optional[Dict[str, float]] = None,
    ):
        super().__init__(
            min_clients=participate_clients,
            num_rounds=num_rounds,
            start_round=start_round,
            aggregation_weights=aggregation_weights or {},
        )
        self.num_clients = num_clients
        self.aggregator = WeightedAggregationHelper()

    def run(self) -> None:
        logger.info(f"Starting FedAvg with {self.num_clients} clients for {self.num_rounds} rounds")
        self.aggregator.reset()
        for round_num in range(self.start_round, self.start_round + self.num_rounds):
            global_weights = self._get_initial_weights()
            client_updates = []
            for client_id in range(1, self.min_clients + 1):
                update = self._train_client(client_id, global_weights)
                client_updates.append(update)
            aggregated = self._aggregate(client_updates)
            self._distribute_model(aggregated, round_num)
            logger.info(f"Round {round_num + 1}/{self.num_rounds + self.start_round} complete")

    def _get_initial_weights(self) -> Dict[str, np.ndarray]:
        return {
            "layer_1": np.random.randn(128, 64).astype(np.float32),
            "layer_2": np.random.randn(64, 2).astype(np.float32),
            "bias_1": np.zeros(64, dtype=np.float32),
            "bias_2": np.zeros(2, dtype=np.float32),
        }

    def _train_client(self, client_id: int, weights: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        trained = {}
        for k, v in weights.items():
            noise = np.random.randn(*v.shape).astype(np.float32) * 0.01
            trained[k] = v + noise
        return trained

    def _aggregate(self, updates: list) -> Dict[str, np.ndarray]:
        aggregated = {}
        keys = updates[0].keys()
        for k in keys:
            stacked = np.stack([u[k] for u in updates])
            aggregated[k] = np.mean(stacked, axis=0)
        return aggregated

    def _distribute_model(self, weights: Dict[str, np.ndarray], round_num: int) -> None:
        logger.info(f"Distributing global model round {round_num}")


class FraudDetectionExecutor(ClientAPILauncherExecutor):
    def __init__(self, model_path: str = "/models/fraud_detection", **kwargs):
        super().__init__(**kwargs)
        self.model_path = model_path
        self.model_weights: Dict[str, np.ndarray] = {}

    def execute(self, task_name: str, shareable: Dict[str, Any], ctx: dict) -> Dict[str, Any]:
        logger.info(f"Executing task: {task_name}")
        if task_name == "train":
            return self._train(shareable)
        elif task_name == "evaluate":
            return self._evaluate(shareable)
        return {"error": f"Unknown task: {task_name}"}

    def _train(self, shareable: Dict[str, Any]) -> Dict[str, Any]:
        weights = shareable.get("model_weights", {})
        local_data = self._load_local_data()
        trained = {}
        for k, v in weights.items():
            trained[k] = np.array(v) + np.random.randn(*np.array(v).shape).astype(np.float32) * 0.01
        metrics = {"accuracy": float(np.random.uniform(0.85, 0.98)), "loss": float(np.random.uniform(0.02, 0.15))}
        self.model_weights = trained
        return {"model_weights": {k: v.tolist() for k, v in trained.items()}, "metrics": metrics}

    def _evaluate(self, shareable: Dict[str, Any]) -> Dict[str, Any]:
        weights = shareable.get("model_weights", {})
        if not weights:
            weights = self.model_weights
        metrics = {"accuracy": float(np.random.uniform(0.88, 0.99)), "loss": float(np.random.uniform(0.01, 0.10))}
        return {"metrics": metrics}

    def _load_local_data(self) -> np.ndarray:
        return np.random.randn(100, 128)


def main():
    init(Config(transfer_type=TransferType.DIFF))
    model = {"weights": None}
    for round_num in range(10):
        logger.info(f"FLARE client round {round_num + 1}")
        input_model = receive()
        if input_model:
            model["weights"] = input_model.params
        local_update = {
            "layer_1": np.random.randn(128, 64).astype(np.float32),
            "layer_2": np.random.randn(64, 2).astype(np.float32),
        }
        metrics = {"accuracy": float(np.random.uniform(0.9, 0.99))}
        submit(params=local_update, metrics=metrics)
    logger.info("FLARE training complete")


if __name__ == "__main__":
    main()
