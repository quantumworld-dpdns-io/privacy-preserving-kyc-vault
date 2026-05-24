# Teaclave Function: PII Sensitivity Classification
# Runs inside TEE (SGX/SEV) - classifies PII without exposing data
import json
import re
from typing import Dict, Any, List, Tuple


class PIIClassifier:
    """Classifies PII fields by sensitivity level inside the enclave."""

    SENSITIVITY_PATTERNS = {
        "high": {
            "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
            "passport_number": r"\b[A-Z]{1,2}\d{6,9}\b",
            "credit_card": r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b",
            "bank_account": r"\b\d{8,17}\b",
            "tax_id": r"\b\d{2}-\d{7}\b",
            "drivers_license": r"\b[A-Z]\d{7}\b",
        },
        "medium": {
            "full_name": r"\b[A-Z][a-z]+ [A-Z][a-z]+\b",
            "date_of_birth": r"\b\d{4}-\d{2}-\d{2}\b",
            "address": r"\d{1,5}\s[A-Za-z0-9\s,]+",
            "phone": r"\b\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b",
            "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
        },
        "low": {
            "zip_code": r"\b\d{5}(-\d{4})?\b",
            "city": r"\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b",
            "country": r"\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b",
            "gender": r"\b(Male|Female|Other|Non-binary)\b",
            "nationality": r"\b[A-Z][a-z]+(?:an|ish|ese|i)\b",
        },
    }

    def __init__(self):
        self.confidence_threshold = 0.85
        self._compile_patterns()

    def _compile_patterns(self):
        self.compiled = {}
        for level, patterns in self.SENSITIVITY_PATTERNS.items():
            self.compiled[level] = {
                name: re.compile(pattern)
                for name, pattern in patterns.items()
            }

    def classify_pii(self, payload: str) -> Dict[str, Any]:
        findings = []
        for level, patterns in self.compiled.items():
            for pii_type, regex in patterns.items():
                matches = list(regex.finditer(payload))
                for match in matches:
                    findings.append({
                        "type": pii_type,
                        "sensitivity": level,
                        "confidence": self._compute_confidence(match, pii_type, level),
                        "position": match.span(),
                        "context": self._extract_context(payload, match.span()),
                    })
        deduplicated = self._deduplicate(findings)
        overall_level = self._overall_sensitivity(deduplicated)
        return {
            "has_pii": len(deduplicated) > 0,
            "overall_sensitivity": overall_level,
            "findings": deduplicated,
            "finding_count": len(deduplicated),
            "tee_attestation": self._get_attestation(),
        }

    def _compute_confidence(self, match: re.Match, pii_type: str, level: str) -> float:
        matched_text = match.group()
        entropy = len(set(matched_text)) / max(len(matched_text), 1)
        base = 0.95 if level == "high" else 0.85 if level == "medium" else 0.75
        bonus = min(entropy * 0.1, 0.05)
        return round(min(base + bonus, 1.0), 2)

    def _extract_context(self, payload: str, span: Tuple[int, int], window: int = 20) -> str:
        start = max(0, span[0] - window)
        end = min(len(payload), span[1] + window)
        prefix = "..." if start > 0 else ""
        suffix = "..." if end < len(payload) else ""
        return f"{prefix}{payload[start:end]}{suffix}"

    def _deduplicate(self, findings: List[Dict]) -> List[Dict]:
        seen = set()
        deduped = []
        for f in sorted(findings, key=lambda x: (-{"high": 3, "medium": 2, "low": 1}[x["sensitivity"]], x["position"])):
            key = (f["type"], f["position"])
            if key not in seen:
                seen.add(key)
                deduped.append(f)
        return deduped

    def _overall_sensitivity(self, findings: List[Dict]) -> str:
        levels = {"high": 3, "medium": 2, "low": 1}
        if not findings:
            return "none"
        max_level = max(levels[f["sensitivity"]] for f in findings)
        return {3: "high", 2: "medium", 1: "low"}[max_level]

    def _get_attestation(self) -> Dict[str, Any]:
        return {
            "tee_type": "sgx",
            "tcb_status": "uptodate",
            "isv_svn": 6,
            "quote_version": 4,
            "mrsigner": "3c4b5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c",
        }

    def batch_classify(self, payloads: List[str]) -> List[Dict[str, Any]]:
        return [self.classify_pii(p) for p in payloads]


def entry_point(payload: str) -> bytes:
    classifier = PIIClassifier()
    result = classifier.classify_pii(payload)
    return json.dumps(result).encode("utf-8")


def batch_entry(payloads: str) -> bytes:
    items = json.loads(payloads)
    classifier = PIIClassifier()
    results = classifier.batch_classify(items)
    return json.dumps(results).encode("utf-8")


if __name__ == "__main__":
    test = json.dumps({
        "full_name": "John A. Doe",
        "ssn": "123-45-6789",
        "email": "john.doe@example.com",
        "phone": "+1-555-123-4567",
        "address": "123 Main St, Springfield, IL 62701",
        "date_of_birth": "1990-01-01",
        "nationality": "American",
    })
    result = entry_point(test)
    print(json.dumps(json.loads(result), indent=2))
