"""Python script to compile and prove Noir circuits for the KYC Vault.

Demonstrates how to:
  1. Define a Noir circuit for age verification
  2. Compile it using nargo
  3. Generate a witness
  4. Create a proof
  5. Verify the proof

Prerequisites:
    - nargo (Noir compiler): https://noir-lang.org/docs/getting_started/installation
    - bb (Barretenberg backend) or plonk (honk backend)

Usage:
    python noir_prove.py --compile --prove --verify
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


CIRCUIT_SRC = """\
// Age Verification Circuit
// Proves that age >= minimum_age without revealing exact age
// Public inputs: min_age, age_hash
// Private inputs: age, salt

fn main(min_age: u64, age_hash: Field, age: u64, salt: Field) {
    // Constrain that the hash matches
    let computed_hash = std::hash::pedersen([age as Field, salt]);
    assert(computed_hash[0] == age_hash);

    // Constrain that age >= min_age
    assert(age >= min_age);

    // Constrain some upper bound to prevent overflow abuse
    assert(age < 150);
}

// Test helper
#[test]
fn test_age_verification() {
    let age: u64 = 25;
    let min_age: u64 = 21;
    let salt: Field = 12345;
    let hash = std::hash::pedersen([age as Field, salt]);
    main(min_age, hash[0], age, salt);
}
"""


NARGO_TOML = """\
[package]
name = "kyc_age_verification"
version = "0.1.0"
description = "KYC Age Verification Circuit"
authors = ["KYC Vault"]

[dependencies]
noir_stdlib = { git = "https://github.com/noir-lang/noir", tag = "v0.34.0" }
"""


PROVER_TOML = """\
backend = "barretenberg"
proof_system = "ultra_honk"
input_aggregation = false
"""


def run_nargo(args: list[str], cwd: Path) -> subprocess.CompletedProcess:
    """Run a nargo command and return the result."""
    cmd = ["nargo", *args]
    print(f"  Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  STDERR: {result.stderr}", file=sys.stderr)
        result.check_returncode()
    return result


class NoirProject:
    """Manages a Noir circuit project."""

    def __init__(self, project_dir: Path, circuit_name: str = "kyc_age_verification"):
        self.project_dir = project_dir
        self.circuit_name = circuit_name
        self.src_dir = project_dir / "src"

    def create(self) -> Path:
        """Create a new Noir project structure."""
        print(f"\n[1] Creating Noir project at {self.project_dir}")

        self.src_dir.mkdir(parents=True, exist_ok=True)
        (self.project_dir / "Nargo.toml").write_text(NARGO_TOML)
        (self.src_dir / "main.nr").write_text(CIRCUIT_SRC)
        (self.project_dir / "Prover.toml").write_text(PROVER_TOML)

        print("    Project structure created.")
        return self.project_dir

    def compile(self) -> Path:
        """Compile the circuit with nargo."""
        print(f"\n[2] Compiling circuit '{self.circuit_name}'...")
        run_nargo(["compile"], self.project_dir)
        artifact_path = self.project_dir / "target" / f"{self.circuit_name}.json"
        if artifact_path.exists():
            print(f"    Compiled artifact: {artifact_path}")
        return artifact_path

    def prove(self, public_inputs: dict, private_inputs: dict) -> Path:
        """Generate a witness and prove using Barretenberg."""
        print(f"\n[3] Generating proof with nargo prove...")

        # Write Prover.toml with witness inputs
        toml_lines = []
        for k, v in {**public_inputs, **private_inputs}.items():
            if isinstance(v, str):
                toml_lines.append(f"{k} = \"{v}\"")
            else:
                toml_lines.append(f"{k} = \"{v}\"")
        (self.project_dir / "Prover.toml").write_text("\n".join(toml_lines) + "\n")

        run_nargo(["prove"], self.project_dir)

        proof_path = self.project_dir / "proofs" / f"{self.circuit_name}.proof"
        if proof_path.exists():
            print(f"    Proof written to: {proof_path}")
        return proof_path

    def verify(self) -> bool:
        """Verify the proof using nargo verify."""
        print(f"\n[4] Verifying proof...")
        run_nargo(["verify"], self.project_dir)
        print("    ✅ Proof verified successfully!")
        return True

    def generate_solidity_verifier(self) -> Path | None:
        """Generate a Solidity verifier contract (optional)."""
        print(f"\n[5] Generating Solidity verifier...")
        try:
            run_nargo(["codegen-verifier"], self.project_dir)
            contract_path = self.project_dir / "contract" / f"{self.circuit_name}.sol"
            if contract_path.exists():
                print(f"    Solidity verifier: {contract_path}")
            return contract_path
        except Exception as e:
            print(f"    Skipping Solidity verifier: {e}")
            return None


def main():
    parser = argparse.ArgumentParser(description="Noir ZKP Circuit Demo for KYC Vault")
    parser.add_argument("--compile", action="store_true", help="Compile the circuit")
    parser.add_argument("--prove", action="store_true", help="Generate a proof")
    parser.add_argument("--verify", action="store_true", help="Verify the proof")
    parser.add_argument("--project-dir", type=Path, default=None, help="Noir project directory")
    args = parser.parse_args()

    if not args.compile and not args.prove and not args.verify:
        args.compile = args.prove = args.verify = True

    project_dir = args.project_dir or Path(tempfile.mkdtemp(prefix="kyc_noir_"))
    print(f"Using project directory: {project_dir}")
    print(f"Circuit: Age Verification (prove age >= minimum without revealing age)")

    project = NoirProject(project_dir)

    if args.compile:
        project.create()
        project.compile()

    if args.prove:
        public_inputs = {
            "min_age": "21",
            "age_hash": "0x2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b",
        }
        private_inputs = {
            "age": "25",
            "salt": "12345",
        }
        project.prove(public_inputs, private_inputs)

    if args.verify:
        project.verify()

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
