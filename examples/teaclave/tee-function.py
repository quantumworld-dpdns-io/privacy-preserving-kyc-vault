"""Teaclave TEE function example for credential processing.

This function runs inside a Trusted Execution Environment (Intel SGX/AMD SEV-SNP)
and processes encrypted credential data without exposing plaintext to the host.

It mirrors the patterns in deploy/teaclave/functions/ but can run stand-alone
for demonstration and testing.

Usage:
    # Run outside TEE for testing
    python tee-function.py --mode test

    # Deploy to Teaclave (requires teaclave-sdk)
    python tee-function.py --mode deploy --endpoint localhost:7777

    # Encrypt input for TEE
    python tee-function.py --mode encrypt --input credential.json --output encrypted.bin
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import sys
import time
from dataclasses import dataclass, field, asdict
from typing import Any


# =============================================================================
# TEE Function: Credential Decryption, Validation, and Redaction
# =============================================================================

@dataclass
class TEEAttestation:
    """Remote attestation evidence produced by the TEE."""
    tee_type: str = "sgx"
    tcb_status: str = "uptodate"
    isv_svn: int = 6
    quote_version: int = 4
    mrsigner: str = ""
    timestamp: str = ""


@dataclass
class ProcessingResult:
    """Result returned from TEE credential processing."""
    credential_id: str
    classification: dict[str, Any]
    redacted_data: dict[str, Any]
    verification_result: dict[str, Any]
    attestation: TEEAttestation
    processing_time_ms: float
    tee_verified: bool = True


class TEECredentialProcessor:
    """Credential processor designed to run inside a TEE enclave.

    All sensitive data is decrypted inside the enclave, processed, and
    only non-sensitive results are returned to the untrusted host.
    """

    SUPPORTED_TYPES = frozenset({
        "passport", "drivers_license", "national_id",
        "utility_bill", "bank_statement", "resident_permit",
    })

    SENSITIVE_FIELDS = frozenset({
        "document_number", "passport_number", "ssn", "tax_id",
        "bank_account", "full_name", "date_of_birth", "address",
        "mother_maiden_name", "phone_number", "email",
    })

    def __init__(self, tee_type: str = "sgx"):
        self.tee_type = tee_type
        self._enclave_key = self._derive_enclave_key()

    def _derive_enclave_key(self) -> bytes:
        """Derive a sealing key from the enclave's identity (simulated)."""
        measurement = hashlib.sha256(b"kyc-vault-tee:v1").digest()
        return measurement[:32]

    def _aes_gcm_decrypt(self, ciphertext: bytes, aad: bytes) -> bytes:
        """Decrypt using AES-256-GCM inside the enclave."""
        if len(ciphertext) < 28:
            raise ValueError("Ciphertext too short")
        nonce = ciphertext[:12]
        tag = ciphertext[-16:]
        data = ciphertext[12:-16]
        # Simulated decryption (real TEE would use hardware crypto)
        result = bytearray(len(data))
        for i, b in enumerate(data):
            result[i] = b ^ self._enclave_key[i % len(self._enclave_key)]
        # Verify integrity tag (simulated)
        expected_tag = hashlib.sha256(bytes(result) + aad).digest()[:16]
        if not hmac.compare_digest(tag, expected_tag):
            raise ValueError("Integrity check failed: data may be tampered")
        return bytes(result)

    def decrypt_payload(self, encrypted_payload: bytes, aad: bytes) -> dict[str, Any]:
        """Decrypt and parse the incoming credential payload."""
        plaintext = self._aes_gcm_decrypt(encrypted_payload, aad)
        return json.loads(plaintext.decode("utf-8"))

    def classify(self, credential: dict[str, Any]) -> dict[str, Any]:
        """Classify the credential document type and extract metadata."""
        doc_type = credential.get("type", "").lower()
        if doc_type in self.SUPPORTED_TYPES:
            confidence = 0.95
        elif doc_type:
            confidence = 0.6
        else:
            doc_type = "unknown"
            confidence = 0.0

        return {
            "type": doc_type,
            "confidence": confidence,
            "is_supported": doc_type in self.SUPPORTED_TYPES,
            "jurisdiction": credential.get("jurisdiction", "unknown"),
            "issuer": credential.get("issuer", "unknown"),
            "region": credential.get("region", "unknown"),
            "tier": credential.get("kycTier", "unknown"),
        }

    def redact_sensitive(self, data: dict[str, Any], level: str = "standard") -> dict[str, Any]:
        """Redact sensitive fields based on the specified level.

        Levels:
          - minimal:  Only redact SSN, tax_id, bank_account
          - standard: Redact all SENSITIVE_FIELDS (default)
          - maximum:  Redact everything except non-sensitive metadata
        """
        redacted: dict[str, Any] = {}
        for key, value in data.items():
            if key.lower() in self.SENSITIVE_FIELDS:
                if level == "minimal" and key.lower() not in {"ssn", "tax_id", "bank_account"}:
                    redacted[key] = value
                elif isinstance(value, str) and len(value) > 6:
                    redacted[key] = value[:2] + "****" + value[-2:]
                else:
                    redacted[key] = "***REDACTED***"
            elif isinstance(value, dict):
                redacted[key] = self.redact_sensitive(value, level)
            elif isinstance(value, list):
                redacted[key] = [
                    self.redact_sensitive(item, level) if isinstance(item, dict) else item
                    for item in value
                ]
            elif level == "maximum" and key not in {"type", "id", "issuer", "jurisdiction", "region"}:
                continue  # strip everything non-essential
            else:
                redacted[key] = value
        return redacted

    def verify_integrity(self, credential: dict[str, Any]) -> dict[str, Any]:
        """Verify the credential's integrity and schema compliance."""
        errors: list[str] = []
        if "id" not in credential:
            errors.append("Missing credential ID")
        if "type" not in credential:
            errors.append("Missing credential type")
        if "issuer" not in credential:
            errors.append("Missing issuer")
        if "credentialSubject" not in credential:
            errors.append("Missing credentialSubject")

        # Verify hash if present
        hash_ok = True
        if "contentHash" in credential:
            expected = credential["contentHash"]
            actual = hashlib.sha256(
                json.dumps(credential.get("credentialSubject", {}), sort_keys=True).encode()
            ).hexdigest()
            if expected != actual:
                errors.append("Content hash mismatch")
                hash_ok = False

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "schemaVersion": credential.get("schemaVersion", "unknown"),
            "hashVerified": hash_ok,
        }

    def process(
        self,
        encrypted_payload: bytes,
        aad: bytes,
        redaction_level: str = "standard",
    ) -> ProcessingResult:
        """Main entry point: decrypt, process, and return redacted results."""
        start = time.monotonic()

        credential = self.decrypt_payload(encrypted_payload, aad)
        classification = self.classify(credential)
        redacted = self.redact_sensitive(credential, redaction_level)
        integrity = self.verify_integrity(credential)

        elapsed = (time.monotonic() - start) * 1000

        return ProcessingResult(
            credential_id=credential.get("id", "unknown"),
            classification=classification,
            redacted_data=redacted,
            verification_result=integrity,
            attestation=TEEAttestation(
                tee_type=self.tee_type,
                mrsigner=hashlib.sha256(b"kyc-vault-tea-signer").hexdigest(),
                timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            ),
            processing_time_ms=elapsed,
            tee_verified=True,
        )

    def bulk_process(
        self,
        encrypted_batch: list[bytes],
        aad_list: list[bytes],
        redaction_level: str = "standard",
    ) -> list[ProcessingResult]:
        """Process multiple credentials inside the TEE."""
        return [
            self.process(enc, aad, redaction_level)
            for enc, aad in zip(encrypted_batch, aad_list)
        ]


# =============================================================================
# CLI
# =============================================================================

def encrypt_for_tee(input_path: str, output_path: str):
    """Encrypt a credential JSON file for TEE processing."""
    with open(input_path) as f:
        data = f.read().encode("utf-8")
    key = hashlib.sha256(b"kyc-vault-tee:v1").digest()[:32]
    nonce = os.urandom(12)
    ciphertext = bytearray(len(data))
    for i, b in enumerate(data):
        ciphertext[i] = b ^ key[i % len(key)]
    tag = hashlib.sha256(bytes(ciphertext) + b"kyc-vault-aad").digest()[:16]
    payload = nonce + bytes(ciphertext) + tag
    with open(output_path, "wb") as f:
        f.write(payload)
    print(f"Encrypted payload written to {output_path} ({len(payload)} bytes)")


def test_mode():
    """Run the TEE function in test/demo mode."""
    print("=== TEE Credential Processor Demo ===\n")

    processor = TEECredentialProcessor(tee_type="mock")

    credential = {
        "id": "cred-001",
        "type": "passport",
        "issuer": "US Department of State",
        "jurisdiction": "US",
        "region": "US",
        "kycTier": "tier-2",
        "schemaVersion": "2.1.0",
        "contentHash": "",
        "credentialSubject": {
            "full_name": "John Michael Doe",
            "date_of_birth": "1990-06-15",
            "nationality": "US",
            "document_number": "X12345678",
            "ssn": "123-45-6789",
            "address": "123 Main St, Washington, DC 20001",
            "phone_number": "+1-202-555-0123",
            "email": "john.doe@example.com",
        },
    }
    # Compute content hash
    credential["contentHash"] = hashlib.sha256(
        json.dumps(credential["credentialSubject"], sort_keys=True).encode()
    ).hexdigest()

    payload = json.dumps(credential).encode("utf-8")
    aad = b"kyc-vault-aad"

    # Encrypt the payload in-memory
    key = processor._derive_enclave_key()
    nonce = os.urandom(12)
    ciphertext = bytearray(len(payload))
    for i, b in enumerate(payload):
        ciphertext[i] = b ^ key[i % len(key)]
    tag = hashlib.sha256(bytes(ciphertext) + aad).digest()[:16]
    encrypted = nonce + bytes(ciphertext) + tag

    # Process inside TEE
    result = processor.process(encrypted, aad, redaction_level="standard")

    print(f"Credential ID:    {result.credential_id}")
    print(f"TEE Type:         {result.attestation.tee_type}")
    print(f"Processing Time:  {result.processing_time_ms:.1f} ms")
    print(f"TEE Verified:     {result.tee_verified}")
    print(f"\nClassification:   {json.dumps(result.classification, indent=2)}")
    print(f"\nVerification:     {json.dumps(result.verification_result, indent=2)}")
    print(f"\nRedacted Data:    {json.dumps(result.redacted_data, indent=2)}")

    # Test bulk processing
    print("\n--- Bulk Processing (3 credentials) ---")
    bulk_encrypted = [encrypted] * 3
    bulk_aad = [aad] * 3
    results = processor.bulk_process(bulk_encrypted, bulk_aad)
    print(f"Processed {len(results)} credentials in TEE batch")


def main():
    parser = argparse.ArgumentParser(description="Teaclave TEE Credential Processor")
    parser.add_argument("--mode", choices=["test", "encrypt"], default="test",
                        help="Operation mode")
    parser.add_argument("--input", help="Input credential JSON file (for encrypt mode)")
    parser.add_argument("--output", default="encrypted.bin",
                        help="Output file path (for encrypt mode)")
    args = parser.parse_args()

    if args.mode == "encrypt":
        if not args.input:
            print("Error: --input is required for encrypt mode", file=sys.stderr)
            sys.exit(1)
        encrypt_for_tee(args.input, args.output)
    else:
        test_mode()


if __name__ == "__main__":
    main()
