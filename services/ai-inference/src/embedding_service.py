"""Sentence-transformer embedding generation for credential vectors.

Generates dense vector embeddings for KYC credential text (name, document
numbers, addresses, etc.) that can be used for zero-knowledge comparison
and similarity searches without revealing plaintext.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384


@dataclass
class EmbeddingResult:
    vector: list[float]
    dimension: int
    model_name: str
    inference_ms: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "vector": self.vector,
            "dimension": self.dimension,
            "model_name": self.model_name,
            "inference_ms": self.inference_ms,
        }

    @property
    def numpy(self) -> np.ndarray:
        return np.array(self.vector, dtype=np.float32)


class EmbeddingService:
    """Generate sentence-transformer embeddings for text credentials.

    Supports both single and batch encoding. Vectors are L2-normalised
    so that cosine similarity = dot product.
    """

    def __init__(self, model_name: str = DEFAULT_MODEL) -> None:
        self.model_name = model_name
        self._model: SentenceTransformer | None = None

    def _load_model(self) -> SentenceTransformer:
        if self._model is None:
            logger.info("Loading embedding model: %s", self.model_name)
            t0 = time.perf_counter()
            self._model = SentenceTransformer(self.model_name)
            elapsed = time.perf_counter() - t0
            logger.info("Model loaded in %.2fs (dim=%d)", elapsed, self._model.get_sentence_embedding_dimension())
        return self._model

    @property
    def model(self) -> SentenceTransformer:
        return self._load_model()

    def embed(self, text: str, normalise: bool = True) -> EmbeddingResult:
        """Embed a single text string.

        Args:
            text: Input text to embed.
            normalise: L2-normalise the output vector.

        Returns:
            EmbeddingResult containing the vector and metadata.
        """
        if not text or not text.strip():
            raise ValueError("Cannot embed empty text")

        model = self._load_model()
        t0 = time.perf_counter()
        vec = model.encode(text, normalize_embeddings=normalise, show_progress_bar=False)
        elapsed_ms = (time.perf_counter() - t0) * 1000

        return EmbeddingResult(
            vector=vec.tolist(),
            dimension=model.get_sentence_embedding_dimension(),
            model_name=self.model_name,
            inference_ms=round(elapsed_ms, 2),
        )

    def embed_batch(
        self, texts: list[str], normalise: bool = True, batch_size: int = 32
    ) -> list[EmbeddingResult]:
        """Embed a batch of texts efficiently.

        Args:
            texts: List of input strings.
            normalise: L2-normalise output vectors.
            batch_size: Batch size for encoding.

        Returns:
            List of EmbeddingResults in the same order as input.
        """
        if not texts:
            return []

        model = self._load_model()
        t0 = time.perf_counter()
        vectors = model.encode(
            texts,
            normalize_embeddings=normalise,
            batch_size=batch_size,
            show_progress_bar=False,
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000

        dim = model.get_sentence_embedding_dimension()
        return [
            EmbeddingResult(
                vector=vec.tolist(),
                dimension=dim,
                model_name=self.model_name,
                inference_ms=round(elapsed_ms / len(texts), 2) if texts else 0,
            )
            for vec in vectors
        ]

    def similarity(self, a: str, b: str) -> float:
        """Compute cosine similarity between two text strings."""
        emb_a = self.embed(a).numpy
        emb_b = self.embed(b).numpy
        return float(np.dot(emb_a, emb_b))

    def similarity_matrix(self, texts: list[str]) -> np.ndarray:
        """Compute all-pair cosine similarity matrix."""
        embs = np.array([r.numpy for r in self.embed_batch(texts)])
        return embs @ embs.T


class CredentialEmbedder:
    """Domain-specific embedder that knows how to structure KYC fields."""

    def __init__(self, service: EmbeddingService | None = None) -> None:
        self._service = service or EmbeddingService()
        self._field_sep = " | "

    def embed_credential(self, fields: dict[str, str]) -> dict[str, EmbeddingResult]:
        """Embed each credential field independently, returning a dict keyed by field name."""
        return {key: self._service.embed(val) for key, val in fields.items() if val.strip()}

    def embed_concatenated(self, fields: dict[str, str]) -> EmbeddingResult:
        """Concatenate all fields and embed as a single credential vector."""
        text = self._field_sep.join(f"{k}:{v}" for k, v in fields.items() if v.strip())
        return self._service.embed(text)

    def compare_credentials(
        self, cred_a: dict[str, str], cred_b: dict[str, str]
    ) -> dict[str, float]:
        """Field-wise cosine similarity between two credential dicts."""
        sims: dict[str, float] = {}
        for key in cred_a:
            if key in cred_b and cred_a[key].strip() and cred_b[key].strip():
                sims[key] = self._service.similarity(cred_a[key], cred_b[key])
        return sims
