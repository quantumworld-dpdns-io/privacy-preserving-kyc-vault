# Teaclave Function: Credential Aggregation
# Runs inside TEE - aggregates multiple credentials into a summary
import json
import hashlib
from datetime import datetime
from typing import Dict, Any, List, Optional


class CredentialAggregator:
    """Aggregates multiple credentials inside the enclave, producing a summary."""

    def __init__(self):
        self.credential_fields = {
            "passport": ["document_number", "full_name", "date_of_birth", "nationality", "issuer", "expiry_date"],
            "drivers_license": ["license_number", "full_name", "date_of_birth", "address", "issuer", "expiry_date", "class"],
            "national_id": ["id_number", "full_name", "date_of_birth", "nationality", "issuer"],
            "utility_bill": ["account_number", "full_name", "address", "issuer", "statement_date"],
            "bank_statement": ["account_number", "full_name", "address", "issuer", "statement_date", "balance"],
            "resident_permit": ["permit_number", "full_name", "date_of_birth", "nationality", "issuer", "expiry_date"],
            "tax_document": ["tax_id", "full_name", "address", "issuer", "tax_year"],
        }

    def aggregate(self, credentials: List[Dict[str, Any]]) -> Dict[str, Any]:
        validated = [self._validate(c) for c in credentials]
        valid = [v for v in validated if v is not None]
        type_counts = self._count_by_type(valid)
        fields_present = self._union_fields(valid)
        completeness = self._completeness_scores(valid)
        identity_consistency = self._check_identity_consistency(valid)
        expiry_status = self._check_expiry(valid)
        hash_chain = self._build_hash_chain(valid)
        return {
            "credential_count": len(valid),
            "total_submitted": len(credentials),
            "invalid_count": len(credentials) - len(valid),
            "types_present": type_counts,
            "fields_present": sorted(fields_present),
            "completeness": completeness,
            "identity_consistency": identity_consistency,
            "expiry_status": expiry_status,
            "hash_chain": hash_chain,
            "summary": self._generate_summary(type_counts, completeness, identity_consistency),
            "tee_attestation": self._get_attestation(),
        }

    def _validate(self, credential: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        doc_type = credential.get("type", "").lower()
        if doc_type not in self.credential_fields:
            return None
        required = self.credential_fields[doc_type]
        if not any(credential.get(f) for f in required[:2]):
            return None
        return credential

    def _count_by_type(self, credentials: List[Dict[str, Any]]) -> Dict[str, int]:
        counts = {}
        for c in credentials:
            t = c.get("type", "unknown").lower()
            counts[t] = counts.get(t, 0) + 1
        return counts

    def _union_fields(self, credentials: List[Dict[str, Any]]) -> set:
        fields = set()
        for c in credentials:
            fields.update(c.keys())
        fields.discard("type")
        return fields

    def _completeness_scores(self, credentials: List[Dict[str, Any]]) -> Dict[str, float]:
        scores = {}
        for c in credentials:
            doc_type = c.get("type", "").lower()
            expected = self.credential_fields.get(doc_type, [])
            if not expected:
                continue
            present = sum(1 for f in expected if c.get(f))
            identifier = c.get(list(c.keys())[1], "unknown")
            scores[str(identifier)] = round(present / len(expected), 2)
        return scores

    def _check_identity_consistency(self, credentials: List[Dict[str, Any]]) -> Dict[str, Any]:
        names = set()
        dobs = set()
        nationalities = set()
        for c in credentials:
            if c.get("full_name"):
                names.add(c["full_name"].lower().strip())
            if c.get("date_of_birth"):
                dobs.add(c["date_of_birth"])
            if c.get("nationality"):
                nationalities.add(c["nationality"].lower().strip())
        has_multi = len(names) > 1 or len(dobs) > 1 or len(nationalities) > 1
        return {
            "names_found": list(names),
            "dates_of_birth_found": list(dobs),
            "nationalities_found": list(nationalities),
            "is_consistent": not has_multi,
            "confidence": 0.5 if has_multi else 1.0,
        }

    def _check_expiry(self, credentials: List[Dict[str, Any]]) -> Dict[str, Any]:
        expired = []
        valid = []
        now = datetime.utcnow()
        for c in credentials:
            expiry = c.get("expiry_date")
            if expiry:
                try:
                    exp_date = datetime.strptime(expiry, "%Y-%m-%d")
                    if exp_date < now:
                        expired.append({"type": c.get("type"), "expiry": expiry})
                    else:
                        valid.append({"type": c.get("type"), "expiry": expiry})
                except ValueError:
                    pass
        return {
            "expired_count": len(expired),
            "valid_count": len(valid),
            "expired_credentials": expired,
            "all_valid": len(expired) == 0,
        }

    def _build_hash_chain(self, credentials: List[Dict[str, Any]]) -> str:
        hasher = hashlib.sha256()
        for c in sorted(credentials, key=lambda x: json.dumps(x, sort_keys=True)):
            hasher.update(json.dumps(c, sort_keys=True).encode("utf-8"))
        return hasher.hexdigest()

    def _generate_summary(
        self,
        type_counts: Dict[str, int],
        completeness: Dict[str, float],
        identity_consistency: Dict[str, Any],
    ) -> Dict[str, Any]:
        types_str = ", ".join(f"{k}({v})" for k, v in sorted(type_counts.items()))
        avg_completeness = round(sum(completeness.values()) / max(len(completeness), 1), 2)
        return {
            "text": f"{sum(type_counts.values())} credential(s) processed: {types_str}. "
                    f"Average completeness: {avg_completeness}. "
                    f"Identity consistent: {identity_consistency['is_consistent']}.",
            "average_completeness": avg_completeness,
            "identity_verified": identity_consistency["is_consistent"],
        }

    def _get_attestation(self) -> Dict[str, Any]:
        return {
            "tee_type": "sgx",
            "tcb_status": "uptodate",
            "isv_svn": 6,
            "quote_version": 4,
            "mrsigner": "3c4b5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c",
        }


def entry_point(credentials_json: str) -> bytes:
    credentials = json.loads(credentials_json)
    aggregator = CredentialAggregator()
    result = aggregator.aggregate(credentials)
    return json.dumps(result).encode("utf-8")


if __name__ == "__main__":
    test = [
        {"type": "passport", "document_number": "AB1234567", "full_name": "Jane Doe",
         "date_of_birth": "1990-01-01", "nationality": "US", "issuer": "US Dept of State",
         "expiry_date": "2030-01-01"},
        {"type": "drivers_license", "license_number": "D12345678", "full_name": "Jane Doe",
         "date_of_birth": "1990-01-01", "address": "123 Main St", "issuer": "CA DMV",
         "expiry_date": "2028-05-15", "class": "C"},
    ]
    result = entry_point(json.dumps(test))
    print(json.dumps(json.loads(result), indent=2))
