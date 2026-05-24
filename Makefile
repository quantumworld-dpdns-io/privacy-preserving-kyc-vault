.PHONY: all build test lint clean dev deps docker-up docker-down help
.DEFAULT_GOAL := help

NODE_CMD ?= pnpm
CARGO_CMD ?= cargo
PY_CMD ?= uv

all: build test lint           ## Run build, test, and lint

build: build-ts build-rust build-py  ## Build all projects

build-ts:                      ## Build TypeScript packages
	$(NODE_CMD) run build

build-rust:                    ## Build Rust crates
	$(CARGO_CMD) build --release --workspace

build-py:                      ## Build Python packages
	$(PY_CMD) build

test: test-ts test-rust test-py ## Run all tests

test-ts:                       ## Run TypeScript tests
	$(NODE_CMD) test

test-rust:                     ## Run Rust tests
	$(CARGO_CMD) test --workspace

test-py:                       ## Run Python tests
	$(PY_CMD) run pytest

lint: lint-ts lint-rust lint-py ## Run all linters

lint-ts:                       ## Lint TypeScript
	$(NODE_CMD) run lint

lint-rust:                     ## Lint Rust
	$(CARGO_CMD) clippy --workspace -- -D warnings
	$(CARGO_CMD) fmt --check

lint-py:                       ## Lint Python
	$(PY_CMD) run ruff check .
	$(PY_CMD) run mypy .

clean: clean-ts clean-rust clean-py  ## Clean all build artifacts

clean-ts:
	rm -rf dist/ node_modules/
	$(NODE_CMD) run clean

clean-rust:
	$(CARGO_CMD) clean

clean-py:
	rm -rf .venv/ __pycache__/

dev:                           ## Start development environment
	docker-compose up -d postgres redis minio
	$(NODE_CMD) run dev

docker-up:                     ## Start all Docker services
	docker-compose up -d

docker-down:                   ## Stop all Docker services
	docker-compose down

setup:                         ## Initial project setup
	$(NODE_CMD) install
	$(PY_CMD) sync
	cp -n .env.example .env || true

help:                          ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
