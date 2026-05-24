# Privacy-Preserving KYC Vault — Just Command Runner
set positional-options := false

# Default task
default: help

# List all available commands
help:
  @just --list --unsorted

# === Build ===

# Build all projects
build: build-ts build-rust build-py

# Build TypeScript packages
build-ts:
  pnpm build

# Build Rust crates
build-rust:
  cargo build --release --workspace

# Build Python packages
build-py:
  uv build

# === Test ===

# Run all tests
test: test-ts test-rust test-py

# Run TypeScript tests
test-ts:
  pnpm test

# Run Rust tests
test-rust:
  cargo test --workspace

# Run Python tests
test-py:
  uv run pytest

# === Lint ===

# Run all linters
lint: lint-ts lint-rust lint-py

lint-ts:
  pnpm lint

lint-rust:
  cargo clippy --workspace -- -D warnings
  cargo fmt --check

lint-py:
  uv run ruff check .
  uv run mypy .

# === Clean ===

clean:
  rm -rf dist/ node_modules/ .venv/ target/
  pnpm clean
  cargo clean

# === Setup ===

setup:
  pnpm install
  uv sync
  cp -n .env.example .env

# === Docker ===

# Start dev services
dev-up:
  docker compose up -d postgres redis minio weaviate

# Stop all services
down:
  docker compose down

# === Git ===

# Quick commit
commit +MESSAGE="chore: incremental update":
  git add -A
  git commit -m MESSAGE --no-verify
