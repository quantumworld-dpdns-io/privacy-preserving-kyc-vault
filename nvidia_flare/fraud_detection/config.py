from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal


@dataclass
class FraudDetectionConfig:
    """NVIDIA FLARE app configuration for KYC fraud detection."""

    # Data
    n_features: int = 20
    n_samples_per_client: int = 800
    fraud_ratio: float = 0.12
    n_clients: int = 5

    # Model
    hidden_dims: list[int] = field(default_factory=lambda: [64, 32, 16])
    learning_rate: float = 1e-3
    batch_size: int = 32
    epochs_per_round: int = 3

    # FL
    num_rounds: int = 10
    aggregation_strategy: Literal["fedavg"] = "fedavg"

    # Privacy
    enable_dp: bool = False
    dp_noise_multiplier: float = 1.0
    dp_clipping_norm: float = 1.0

    # Paths
    model_dir: str = "/tmp/nvflare/fraud_detection/models"
    data_dir: str = "/tmp/nvflare/fraud_detection/data"
    app_root: str = "/tmp/nvflare/fraud_detection/app"

    def __post_init__(self) -> None:
        for d in [self.model_dir, self.data_dir, self.app_root]:
            Path(d).mkdir(parents=True, exist_ok=True)

    @classmethod
    def from_env(cls) -> FraudDetectionConfig:
        """Load configuration from environment variables with sensible defaults."""
        return cls(
            n_features=int(os.getenv("FD_N_FEATURES", "20")),
            n_samples_per_client=int(os.getenv("FD_N_SAMPLES", "800")),
            fraud_ratio=float(os.getenv("FD_FRAUD_RATIO", "0.12")),
            n_clients=int(os.getenv("FD_N_CLIENTS", "5")),
            learning_rate=float(os.getenv("FD_LEARNING_RATE", "1e-3")),
            batch_size=int(os.getenv("FD_BATCH_SIZE", "32")),
            epochs_per_round=int(os.getenv("FD_EPOCHS_PER_ROUND", "3")),
            num_rounds=int(os.getenv("FD_NUM_ROUNDS", "10")),
            enable_dp=os.getenv("FD_ENABLE_DP", "false").lower() == "true",
            dp_noise_multiplier=float(os.getenv("FD_DP_NOISE", "1.0")),
            dp_clipping_norm=float(os.getenv("FD_DP_CLIP", "1.0")),
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "n_features": self.n_features,
            "n_samples_per_client": self.n_samples_per_client,
            "fraud_ratio": self.fraud_ratio,
            "n_clients": self.n_clients,
            "learning_rate": self.learning_rate,
            "batch_size": self.batch_size,
            "epochs_per_round": self.epochs_per_round,
            "num_rounds": self.num_rounds,
            "enable_dp": self.enable_dp,
            "dp_noise_multiplier": self.dp_noise_multiplier,
            "dp_clipping_norm": self.dp_clipping_norm,
        }
