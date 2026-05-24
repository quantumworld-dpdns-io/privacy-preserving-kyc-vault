from __future__ import annotations

import logging

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from nvidia_flare.fraud_detection.config import FraudDetectionConfig
from nvidia_flare.fraud_detection.model import FraudNet

logger = logging.getLogger(__name__)


class FraudValidator:
    """Validator for model evaluation in NVIDIA FLARE.

    Evaluates the global model on a held-out validation set and reports
    accuracy, precision, recall, F1, and AUC.
    """

    def __init__(
        self,
        config: FraudDetectionConfig | None = None,
        data: TensorDataset | None = None,
        device: str = "cpu",
    ) -> None:
        self.config = config or FraudDetectionConfig.from_env()
        self.device = torch.device(device)
        self.model = FraudNet(
            input_dim=self.config.n_features,
            hidden_dims=self.config.hidden_dims,
        ).to(self.device)
        self.criterion = nn.BCELoss()

        if data is not None:
            self._data = data
        else:
            self._data = self._generate_validation_data()

        self.dataloader = DataLoader(
            self._data,
            batch_size=self.config.batch_size,
            shuffle=False,
        )

    def _generate_validation_data(self) -> TensorDataset:
        from flwr.fraud_detection.dataset import create_synthetic_dataset

        return create_synthetic_dataset(
            n_samples=400,
            n_features=self.config.n_features,
            fraud_ratio=self.config.fraud_ratio,
            client_bias=0.0,
            seed=999,
        )

    def validate(
        self,
        weights: list[np.ndarray],
    ) -> dict[str, float]:
        """Evaluate the model given *weights* and return metrics."""
        self.model.set_weights(weights)
        self.model.eval()

        total_loss = 0.0
        correct = 0
        total = 0
        tp = 0
        fp = 0
        fn = 0
        all_preds: list[float] = []
        all_labels: list[float] = []

        with torch.no_grad():
            for x, y in self.dataloader:
                x, y = x.to(self.device), y.to(self.device)
                outputs = self.model(x)
                loss = self.criterion(outputs, y)
                total_loss += loss.item() * x.size(0)

                predicted = (outputs > 0.5).float()
                correct += (predicted == y).sum().item()
                total += x.size(0)

                tp += ((predicted == 1) & (y == 1)).sum().item()
                fp += ((predicted == 1) & (y == 0)).sum().item()
                fn += ((predicted == 0) & (y == 1)).sum().item()

                all_preds.extend(outputs.cpu().numpy().ravel().tolist())
                all_labels.extend(y.cpu().numpy().ravel().tolist())

        avg_loss = total_loss / max(total, 1)
        accuracy = correct / max(total, 1)
        precision = tp / max(tp + fp, 1)
        recall = tp / max(tp + fn, 1)
        f1 = 2 * precision * recall / max(precision + recall, 1e-8)

        # AUC (simple trapezoidal approximation)
        try:
            from sklearn.metrics import roc_auc_score

            auc = roc_auc_score(all_labels, all_preds)
        except ImportError:
            auc = 0.0

        metrics = {
            "val_loss": round(avg_loss, 6),
            "accuracy": round(accuracy, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "auc": round(auc, 4),
        }
        logger.info("Validation metrics: %s", metrics)
        return metrics
