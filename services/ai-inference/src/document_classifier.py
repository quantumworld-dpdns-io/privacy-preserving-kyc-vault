"""Document type classifier using a pre-trained transformer model.

Classifies uploaded identity documents into categories:
- ID (national identity card)
- Passport
- License (driver's license)
- Unknown
"""

from __future__ import annotations

import logging
from enum import Enum
from typing import Any

import torch
import torch.nn.functional as F
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification

logger = logging.getLogger(__name__)

MODEL_NAME = "google/vit-base-patch16-224"
ID_LABELS = ["id_card", "passport", "drivers_license", "unknown"]
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


class DocumentType(str, Enum):
    ID = "id_card"
    PASSPORT = "passport"
    LICENSE = "drivers_license"
    UNKNOWN = "unknown"


class DocumentClassifier:
    """Classifies document images into ID / Passport / License categories."""

    def __init__(self, model_name: str = MODEL_NAME) -> None:
        self.model_name = model_name
        self._processor: AutoImageProcessor | None = None
        self._model: AutoModelForImageClassification | None = None
        self._label_map: list[str] = ID_LABELS

    def _load(self) -> None:
        if self._model is not None:
            return
        try:
            logger.info("Loading document classifier model: %s", self.model_name)
            self._processor = AutoImageProcessor.from_pretrained(self.model_name)
            self._model = AutoModelForImageClassification.from_pretrained(
                self.model_name,
                num_labels=len(self._label_map),
                ignore_mismatched_sizes=True,
            ).to(DEVICE)
            self._model.eval()
            logger.info("Document classifier loaded successfully")
        except Exception:
            logger.exception("Failed to load document classifier model")
            raise

    @torch.no_grad()
    def classify(self, image: Image.Image) -> tuple[DocumentType, dict[str, float]]:
        """Classify a document image and return the predicted type with confidence scores.

        Args:
            image: PIL Image of the document.

        Returns:
            Tuple of (predicted DocumentType, dict mapping label -> confidence).
        """
        self._load()

        try:
            inputs = self._processor(images=image, return_tensors="pt").to(DEVICE)
            outputs = self._model(**inputs)
            probs = F.softmax(outputs.logits, dim=-1).squeeze(0)

            scores: dict[str, float] = {}
            for i, label in enumerate(self._label_map):
                scores[label] = round(probs[i].item(), 4)

            predicted_idx = int(probs.argmax().item())
            predicted_label = self._label_map[predicted_idx]
            return DocumentType(predicted_label), scores
        except Exception:
            logger.exception("Error during document classification")
            return DocumentType.UNKNOWN, {l: 0.0 for l in self._label_map}

    def is_document(self, image: Image.Image, threshold: float = 0.5) -> bool:
        """Quick check whether the image is likely a document (not unknown)."""
        doc_type, scores = self.classify(image)
        return doc_type != DocumentType.UNKNOWN or scores.get("unknown", 1.0) < threshold


class EnsembleDocumentClassifier:
    """Runs multiple classifiers and ensembles their predictions for higher accuracy."""

    def __init__(self, classifiers: list[DocumentClassifier] | None = None) -> None:
        self.classifiers = classifiers or [DocumentClassifier()]

    def classify(self, image: Image.Image) -> tuple[DocumentType, dict[str, float]]:
        """Ensemble classify by averaging softmax scores across classifiers."""
        all_scores: dict[str, list[float]] = {}
        for clf in self.classifiers:
            _, scores = clf.classify(image)
            for label, score in scores.items():
                all_scores.setdefault(label, []).append(score)

        averaged: dict[str, float] = {
            label: round(sum(v) / len(v), 4) for label, v in all_scores.items()
        }
        predicted_label = max(averaged, key=averaged.get)  # type: ignore[arg-type]
        return DocumentType(predicted_label), averaged
