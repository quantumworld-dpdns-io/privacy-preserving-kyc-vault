from __future__ import annotations

import io
import logging
import tarfile
from pathlib import Path
from typing import Literal

import numpy as np
import torch
from torch import Tensor
from torch.utils.data import DataLoader, TensorDataset

logger = logging.getLogger(__name__)

SEED = 42
N_CLIENTS = 5
SAMPLES_PER_CLIENT = 800
FRAUD_RATIO = 0.12  # ~12 % fraud — realistic for KYC

rng = np.random.default_rng(SEED)


def _synthetic_features(n: int, n_features: int = 20) -> np.ndarray:
    """Generate synthetic KYC feature vectors.

    Features represent normalised attributes such as:
      age, income, account tenure, tx frequency, avg tx amount,
      max tx amount, tx velocity, geographic distance, device risk score,
      identity document confidence, PEP flag, sanctions flag, etc.
    """
    features = rng.normal(0, 1, size=(n, n_features)).astype(np.float32)

    feature_names = [
        "age",
        "income",
        "tenure_months",
        "tx_frequency",
        "avg_tx_amount",
        "max_tx_amount",
        "tx_velocity",
        "geo_distance",
        "device_risk",
        "id_confidence",
        "pep_flag",
        "sanctions_flag",
        "num_beneficiaries",
        "num_accounts",
        "credit_score",
        "debt_to_income",
        "tx_country_risk",
        "hours_since_kyc",
        "document_type_score",
        "biometric_match_score",
    ]
    if len(feature_names) == n_features:
        return features, feature_names
    return features


def _inject_fraud_patterns(features: np.ndarray, labels: np.ndarray) -> np.ndarray:
    """Make synthetic fraud cases harder by shifting their feature distribution."""
    fraud_mask = labels == 1
    n_fraud = fraud_mask.sum()
    if n_fraud == 0:
        return features

    fraud_idx = np.where(fraud_mask)[0]
    perturbations = rng.normal(0.6, 0.25, size=(n_fraud, features.shape[1])).astype(
        np.float32
    )
    features[fraud_idx] = np.clip(features[fraud_idx] + perturbations, -3.0, 3.0)
    return features


def create_synthetic_dataset(
    n_samples: int = SAMPLES_PER_CLIENT,
    n_features: int = 20,
    fraud_ratio: float = FRAUD_RATIO,
    client_bias: float = 0.0,
    seed: int | None = None,
) -> TensorDataset:
    """Create a non-IID synthetic KYC dataset for one client.

    Parameters
    ----------
    n_samples : int
        Number of samples for this client.
    n_features : int
        Dimensionality of feature vectors.
    fraud_ratio : float
        Proportion of fraud samples.
    client_bias : float
        Per-client shift applied to features (simulates non-IID data).
    seed : int | None
        RNG seed for reproducibility.
    """
    local_rng = np.random.default_rng(seed)
    n_fraud = max(1, int(n_samples * fraud_ratio))

    labels = np.zeros(n_samples, dtype=np.float32)
    fraud_indices = local_rng.choice(n_samples, n_fraud, replace=False)
    labels[fraud_indices] = 1.0

    features = local_rng.normal(client_bias, 1.0, size=(n_samples, n_features)).astype(
        np.float32
    )
    features = _inject_fraud_patterns(features, labels)

    features_t = torch.from_numpy(features)
    labels_t = torch.from_numpy(labels).unsqueeze(1)
    return TensorDataset(features_t, labels_t)


def create_partitioned_datasets(
    n_clients: int = N_CLIENTS,
    samples_per_client: int = SAMPLES_PER_CLIENT,
    n_features: int = 20,
) -> list[TensorDataset]:
    """Generate non-IID datasets for *n_clients* clients."""
    biases = rng.uniform(-0.5, 0.5, size=n_clients)
    return [
        create_synthetic_dataset(
            n_samples=samples_per_client,
            n_features=n_features,
            client_bias=float(biases[i]),
            seed=SEED + i,
        )
        for i in range(n_clients)
    ]


def create_dataloader(
    dataset: TensorDataset,
    batch_size: int = 32,
    shuffle: bool = True,
) -> DataLoader:
    return DataLoader(dataset, batch_size=batch_size, shuffle=shuffle)


def partition_to_dataloaders(
    datasets: list[TensorDataset], batch_size: int = 32
) -> list[DataLoader]:
    return [create_dataloader(ds, batch_size=batch_size) for ds in datasets]
