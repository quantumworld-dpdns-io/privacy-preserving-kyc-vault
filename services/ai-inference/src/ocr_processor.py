"""OCR pipeline with Tesseract integration for KYC document processing.

Handles image pre-processing (deskew, denoise, threshold) before passing
to Tesseract OCR. Supports multiple languages and returns structured text
with bounding boxes and confidence scores.
"""

from __future__ import annotations

import logging
import re
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import pytesseract
from PIL import Image

logger = logging.getLogger(__name__)


@dataclass
class OCRWord:
    text: str
    confidence: float
    x: int
    y: int
    w: int
    h: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "confidence": self.confidence,
            "bbox": {"x": self.x, "y": self.y, "w": self.w, "h": self.h},
        }


@dataclass
class OCRBlock:
    text: str
    level: str  # block, para, line, word
    confidence: float
    bbox: tuple[int, int, int, int]
    words: list[OCRWord] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "level": self.level,
            "confidence": self.confidence,
            "bbox": dict(zip(["x", "y", "w", "h"], self.bbox)),
            "words": [w.to_dict() for w in self.words],
        }


@dataclass
class OCRResult:
    text: str
    confidence: float
    language: str
    blocks: list[OCRBlock] = field(default_factory=list)
    preprocess_ms: float = 0.0
    ocr_ms: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "confidence": self.confidence,
            "language": self.language,
            "blocks": [b.to_dict() for b in self.blocks],
            "preprocess_ms": self.preprocess_ms,
            "ocr_ms": self.ocr_ms,
        }


# ---------------------------------------------------------------------------
# Image pre-processing helpers
# ---------------------------------------------------------------------------


def deskew(image: np.ndarray) -> np.ndarray:
    """Correct skew in a binary image using minAreaRect."""
    coords = np.column_stack(np.where(image > 0))
    if len(coords) < 10:
        return image
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = 90 + angle
    angle = -angle
    if abs(angle) < 0.5:
        return image
    h, w = image.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(
        image, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )
    return rotated


def preprocess_image(image: np.ndarray) -> np.ndarray:
    """Convert to grayscale, denoise, threshold, and deskew."""
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    denoised = cv2.fastNlMeansDenoising(gray, h=10)

    _, binary = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    binary = deskew(binary)

    scale = max(1.0, 2000.0 / binary.shape[1])
    if scale > 1.0:
        binary = cv2.resize(
            binary, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC
        )

    return binary


def image_to_numpy(image: Image.Image) -> np.ndarray:
    """Convert PIL Image to numpy array (RGB->BGR for OpenCV)."""
    arr = np.array(image)
    if len(arr.shape) == 3 and arr.shape[2] == 3:
        return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    return arr


# ---------------------------------------------------------------------------


class OCRProcessor:
    """OCR pipeline using Tesseract with pre-processing support."""

    def __init__(self, lang: str = "eng+fra", tesseract_cmd: str | None = None) -> None:
        self.lang = lang
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    def _run_tesseract(self, image: np.ndarray) -> dict[str, Any]:
        """Run Tesseract and parse the detailed output."""
        data = pytesseract.image_to_data(
            image,
            lang=self.lang,
            output_type=pytesseract.Output.DICT,
            config="--psm 4 --oem 3",
        )
        return data  # type: ignore[no-any-return]

    @staticmethod
    def _build_blocks(data: dict[str, Any]) -> list[OCRBlock]:
        blocks: list[OCRBlock] = []
        current_block: OCRBlock | None = None
        current_para: OCRBlock | None = None

        n = len(data["text"])
        for i in range(n):
            text = data["text"][i].strip()
            conf = int(data["conf"][i])
            if conf < 0:
                continue

            block_num = data["block_num"][i]
            par_num = data["par_num"][i]
            line_num = data["line_num"][i]

            x, y, w, h = (
                data["left"][i],
                data["top"][i],
                data["width"][i],
                data["height"][i],
            )

            word = OCRWord(text=text, confidence=conf, x=x, y=y, w=w, h=h)

            if current_block is None or current_block.bbox[0] != block_num:
                current_block = OCRBlock(
                    text="",
                    level="block",
                    confidence=conf,
                    bbox=(block_num, 0, 0, 0),
                    words=[],
                )
                blocks.append(current_block)
                current_para = None

            blocks.append(
                OCRBlock(
                    text=text,
                    level="word",
                    confidence=conf,
                    bbox=(x, y, w, h),
                    words=[word],
                )
            )

        return blocks

    @staticmethod
    def _extract_full_text(data: dict[str, Any]) -> str:
        lines: list[str] = []
        current_line = ""
        n = len(data["text"])
        for i in range(n):
            text = data["text"][i].strip()
            if not text:
                if current_line:
                    lines.append(current_line)
                    current_line = ""
                continue
            if current_line:
                current_line += " "
            current_line += text
        if current_line:
            lines.append(current_line)
        return "\n".join(lines)

    def run(self, image: Image.Image) -> OCRResult:
        """Run the full OCR pipeline on a PIL image.

        Args:
            image: Input PIL Image.

        Returns:
            OCRResult with extracted text, blocks, and confidence.
        """
        import time

        t0 = time.perf_counter()

        np_img = image_to_numpy(image)
        processed = preprocess_image(np_img)
        preprocess_ms = (time.perf_counter() - t0) * 1000

        t1 = time.perf_counter()
        data = self._run_tesseract(processed)
        ocr_ms = (time.perf_counter() - t1) * 1000

        text = self._extract_full_text(data)
        confidences = [float(c) for c in data["conf"] if int(c) >= 0]
        avg_conf = round(sum(confidences) / len(confidences), 2) if confidences else 0.0

        blocks = self._build_blocks(data)

        return OCRResult(
            text=text,
            confidence=avg_conf,
            language=self.lang,
            blocks=blocks,
            preprocess_ms=round(preprocess_ms, 2),
            ocr_ms=round(ocr_ms, 2),
        )

    def run_raw(self, image: Image.Image, preprocess: bool = True) -> str:
        """Convenience: return extracted plain text."""
        if preprocess:
            np_img = image_to_numpy(image)
            processed = preprocess_image(np_img)
            image = Image.fromarray(processed)
        return pytesseract.image_to_string(image, lang=self.lang)


class MRZParser:
    """Parse Machine Readable Zone (MRZ) lines from OCR output."""

    MRZ_RE = re.compile(
        r"([A-Z0-9<]{2,3})"
        r"([A-Z<]+)"
        r"<<"
        r"([A-Z<]+)"
    )

    @staticmethod
    def find_mrz(text: str) -> list[str]:
        """Extract lines that look like MRZ (2x44 chars for TD3 passports)."""
        lines = text.strip().splitlines()
        mrz_lines: list[str] = []
        for line in lines:
            clean = line.replace(" ", "").strip()
            if len(clean) in (30, 36, 44) and clean.isupper() or "<" in clean:
                mrz_lines.append(clean)
        return mrz_lines

    @staticmethod
    def parse_passport_mrz(lines: list[str]) -> dict[str, str] | None:
        """Basic TD3 passport MRZ parser."""
        if len(lines) < 2:
            return None
        line1, line2 = lines[0], lines[1]
        try:
            doc_type = line1[:2]
            issuing_state = line1[2:5]
            surname = line1[5:44].split("<<")[0].replace("<", " ").strip()
            given_names = ""
            if "<<" in line1[5:]:
                given_names = line1[5:44].split("<<", 1)[1].replace("<", " ").strip()
            passport_number = line2[:9].replace("<", "")
            nationality = line2[10:13]
            dob = line2[13:19]
            sex = line2[20]
            expiry = line2[21:27]
            return {
                "document_type": doc_type,
                "issuing_state": issuing_state,
                "surname": surname,
                "given_names": given_names,
                "passport_number": passport_number,
                "nationality": nationality,
                "date_of_birth": dob,
                "sex": sex,
                "expiry_date": expiry,
            }
        except Exception:
            logger.exception("MRZ parsing failed")
            return None
