#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

WAT2WASM="${WAT2WASM:-wat2wasm}"
WASM_PACK="${WASM_PACK:-wasm-pack}"
CARGO="${CARGO:-cargo}"
WASI_TARGET="wasm32-wasip1"

WAT_MODULES=(
  "credential-verify"
  "did-resolve"
  "age-proof"
)

SPIN_MODULES=(
  "kyc-verify"
  "did-resolve"
)

# ── Colors ──────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

check_deps() {
  local missing=0

  if ! command -v "$WAT2WASM" &>/dev/null; then
    error "$WAT2WASM not found. Install wabt: brew install wabt"
    missing=1
  fi

  if ! command -v "$WASM_PACK" &>/dev/null; then
    warn "$WASM_PACK not found. Rust Wasm modules will use cargo directly."
  fi

  if ! command -v "$CARGO" &>/dev/null; then
    error "cargo not found. Install Rust: https://rustup.rs"
    missing=1
  fi

  if ! rustup target list --installed 2>/dev/null | grep -q "$WASI_TARGET"; then
    warn "WASI target '$WASI_TARGET' not installed. Running: rustup target add $WASI_TARGET"
    rustup target add "$WASI_TARGET"
  fi

  if [ "$missing" -ne 0 ]; then
    exit 1
  fi
}

build_wat_modules() {
  info "Building WAT modules..."
  mkdir -p "$SCRIPT_DIR/target"

  for mod in "${WAT_MODULES[@]}"; do
    local wat_file="$SCRIPT_DIR/${mod}.wat"
    local wasm_file="$SCRIPT_DIR/target/${mod}.wasm"

    if [ ! -f "$wat_file" ]; then
      warn "Skipping '$mod': $wat_file not found"
      continue
    fi

    info "  Compiling ${mod}.wat -> ${wasm_file}"
    $WAT2WASM "$wat_file" -o "$wasm_file" --enable-all

    local size
    size=$(wc -c < "$wasm_file")
    info "    -> ${wasm_file} (${size} bytes)"
  done
}

build_spin_modules() {
  info "Building Spin (Rust WASI) modules..."

  for mod in "${SPIN_MODULES[@]}"; do
    local spin_dir="$PROJECT_DIR/spin/${mod}"
    local target_dir="$PROJECT_DIR/target/wasm32-wasip1/release"
    local crate_name="${mod//-/_}"
    local wasm_file="${target_dir}/${crate_name}.wasm"

    if [ ! -f "$spin_dir/Cargo.toml" ]; then
      warn "Skipping Spin module '$mod': $spin_dir/Cargo.toml not found"
      continue
    fi

    info "  Building '${mod}' with cargo (target: $WASI_TARGET)..."
    $CARGO build \
      --manifest-path "$spin_dir/Cargo.toml" \
      --target "$WASI_TARGET" \
      --release

    if [ -f "$wasm_file" ]; then
      mkdir -p "$SCRIPT_DIR/target"
      cp "$wasm_file" "$SCRIPT_DIR/target/"
      local size
      size=$(wc -c < "$wasm_file")
      info "    -> ${wasm_file} (${size} bytes)"
    else
      error "    Expected wasm at ${wasm_file}, not found"
    fi
  done
}

build_wasm_pack_modules() {
  if ! command -v "$WASM_PACK" &>/dev/null; then
    warn "wasm-pack not available, skipping wasm-pack builds"
    return
  fi

  info "Building wasm-pack modules..."
  for dir in "$SCRIPT_DIR"/*/; do
    if [ -f "${dir}wasm-pack.toml" ] || [ -f "${dir}Cargo.toml" ]; then
      local name
      name=$(basename "$dir")
      info "  Building '${name}' with wasm-pack..."
      (cd "$dir" && $WASM_PACK build --target web --out-dir "$SCRIPT_DIR/target/${name}")
    fi
  done
}

generate_checksums() {
  info "Generating SHA-256 checksums..."
  local checksum_file="$SCRIPT_DIR/target/checksums.txt"

  > "$checksum_file"
  for wasm in "$SCRIPT_DIR/target/"*.wasm; do
    if [ -f "$wasm" ]; then
      local name
      name=$(basename "$wasm")
      local hash
      hash=$(shasum -a 256 "$wasm" | cut -d' ' -f1)
      echo "${name}  ${hash}" >> "$checksum_file"
      info "  ${name}: ${hash}"
    fi
  done
}

clean() {
  info "Cleaning build artifacts..."
  rm -rf "$SCRIPT_DIR/target"

  for mod in "${SPIN_MODULES[@]}"; do
    local spin_dir="$PROJECT_DIR/spin/${mod}"
    if [ -f "$spin_dir/Cargo.toml" ]; then
      $CARGO clean --manifest-path "$spin_dir/Cargo.toml" 2>/dev/null || true
    fi
  done

  info "Clean complete"
}

usage() {
  echo "Usage: $0 [OPTIONS]"
  echo "Build all WebAssembly modules for KYC Vault"
  echo ""
  echo "Options:"
  echo "  --clean       Remove all build artifacts"
  echo "  --wat-only    Build only WAT modules"
  echo "  --spin-only   Build only Spin/Rust modules"
  echo "  --skip-wasm-pack  Skip wasm-pack builds"
  echo "  --release     Build in release mode (default)"
  echo "  --debug       Build in debug mode"
  echo "  -h, --help    Show this help message"
}

main() {
  local build_wat=true
  local build_spin=true
  local build_wasi=true
  local do_clean=false
  local profile="release"

  while [ $# -gt 0 ]; do
    case "$1" in
      --clean) do_clean=true ;;
      --wat-only) build_spin=false; build_wasi=false ;;
      --spin-only) build_wat=false; build_wasi=false ;;
      --skip-wasm-pack) build_wasi=false ;;
      --release) profile="release" ;;
      --debug) profile="debug" ;;
      -h|--help) usage; exit 0 ;;
      *) error "Unknown option: $1"; usage; exit 1 ;;
    esac
    shift
  done

  if $do_clean; then
    clean
    exit 0
  fi

  check_deps

  mkdir -p "$SCRIPT_DIR/target"

  $build_wat && build_wat_modules
  $build_spin && build_spin_modules
  $build_wasi && build_wasm_pack_modules

  generate_checksums

  info ""
  info "Build complete. Artifacts in: $SCRIPT_DIR/target/"
  ls -lh "$SCRIPT_DIR/target/"*.wasm 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}'
}

main "$@"
