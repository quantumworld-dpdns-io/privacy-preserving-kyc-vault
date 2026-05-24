#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SOPS_CONFIG="${ROOT_DIR}/deploy/sops/.sops.yaml"
AGE_KEY_FILE="${AGE_KEY_FILE:-${HOME}/.config/sops/age/keys.txt}"

usage() {
  echo "Usage: $0 <command> [files...]"
  echo ""
  echo "Commands:"
  echo "  encrypt              Encrypt secrets files in-place"
  echo "  decrypt              Decrypt secrets files in-place"
  echo "  encrypt-dir <dir>    Encrypt all secrets in a directory"
  echo "  decrypt-dir <dir>    Decrypt all secrets in a directory"
  echo "  rotate               Re-encrypt all secrets with new keys"
  echo "  show <file>          Decrypt and display a secret file"
  echo "  diff <file1> <file2> Decrypt and diff two secret files"
  echo "  lint                 Validate encrypted files can be decrypted"
  echo "  generate-key         Generate a new age key pair"
  echo ""
  echo "Environment:"
  echo "  AGE_KEY_FILE     Path to age key file (default: ~/.config/sops/age/keys.txt)"
  echo "  SOPS_AGE_KEY     Inline age key (alternative to file)"
  echo "  AWS_PROFILE      AWS profile for KMS operations"
  echo ""
  echo "Examples:"
  echo "  $0 encrypt secrets/production/secrets.yaml"
  echo "  $0 encrypt-dir secrets/production"
  echo "  $0 decrypt secrets/development/database.secret.yaml"
  echo "  $0 rotate"
  echo "  $0 show secrets/production/secrets.yaml"
  exit 1
}

check_deps() {
  if ! command -v sops &>/dev/null; then
    echo "Error: sops is not installed."
    echo "Install: brew install sops  # macOS"
    echo "Or: https://github.com/getsops/sops/releases"
    exit 1
  fi
  if ! command -v age &>/dev/null; then
    echo "Error: age is not installed."
    echo "Install: brew install age  # macOS"
    echo "Or: https://github.com/FiloSottile/age/releases"
    exit 1
  fi
  if ! command -v age-keygen &>/dev/null; then
    echo "Error: age-keygen not found."
    echo "Install: brew install age  # macOS"
    exit 1
  fi
}

generate_key() {
  local key_dir
  key_dir="$(dirname "$AGE_KEY_FILE")"
  mkdir -p "$key_dir"
  if [[ -f "$AGE_KEY_FILE" ]]; then
    echo "Age key already exists at ${AGE_KEY_FILE}"
    echo "Public key: $(cat "$AGE_KEY_FILE" | age-keygen -y 2>/dev/null || echo 'unknown')"
    exit 0
  fi
  age-keygen -o "$AGE_KEY_FILE"
  chmod 600 "$AGE_KEY_FILE"
  echo "Generated age key: ${AGE_KEY_FILE}"
  echo "Public key: $(age-keygen -y "$AGE_KEY_FILE")"
  echo ""
  echo "IMPORTANT: Update deploy/sops/.sops.yaml with the public key above!"
}

find_secrets() {
  local dir="${1:-.}"
  find "$dir" -type f \( -name "*.yaml" -o -name "*.yml" -o -name "*.json" -o -name "*.env" \) \
    ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/vendor/*" | sort
}

encrypt_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "  Skipping ${file} (not found)"
    return
  fi
  if sops -c "$SOPS_CONFIG" --decrypt "$file" &>/dev/null 2>&1; then
    echo "  Skipping ${file} (already encrypted)"
  else
    echo "  Encrypting ${file}..."
    sops -c "$SOPS_CONFIG" --encrypt --in-place "$file"
  fi
}

decrypt_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "  Skipping ${file} (not found)"
    return
  fi
  if ! sops -c "$SOPS_CONFIG" --decrypt "$file" &>/dev/null 2>&1; then
    echo "  Skipping ${file} (not encrypted or already plaintext)"
  else
    echo "  Decrypting ${file}..."
    sops -c "$SOPS_CONFIG" --decrypt "$file" > "$(dirname "$file")/$(basename "$file" .encrypted).decrypted"
  fi
}

show_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Error: File not found: $file"
    exit 1
  fi
  sops -c "$SOPS_CONFIG" --decrypt "$file"
}

diff_files() {
  if [[ $# -ne 2 ]]; then
    echo "Error: diff requires exactly 2 files"
    exit 1
  fi
  local tmp1 tmp2
  tmp1=$(mktemp)
  tmp2=$(mktemp)
  trap 'rm -f "$tmp1" "$tmp2"' EXIT
  sops -c "$SOPS_CONFIG" --decrypt "$1" > "$tmp1"
  sops -c "$SOPS_CONFIG" --decrypt "$2" > "$tmp2"
  diff -u "$tmp1" "$tmp2" || true
}

rotate_key() {
  echo "=== Re-encrypting all secrets ==="
  while IFS= read -r -d '' file; do
    if sops -c "$SOPS_CONFIG" --decrypt "$file" &>/dev/null 2>&1; then
      echo "  Rotating ${file}..."
      sops -c "$SOPS_CONFIG" --rotate --in-place "$file"
    fi
  done < <(find_secrets "$ROOT_DIR/secrets" -print0 2>/dev/null || true)
  echo "Done."
}

lint_check() {
  local errors=0
  echo "=== Validating encrypted secrets ==="
  while IFS= read -r -d '' file; do
    if sops -c "$SOPS_CONFIG" --decrypt "$file" &>/dev/null 2>&1; then
      echo "  OK  ${file}"
    else
      echo "  FAIL ${file}"
      errors=$((errors + 1))
    fi
  done < <(find_secrets "$ROOT_DIR/secrets" -print0 2>/dev/null || true)
  if [[ $errors -gt 0 ]]; then
    echo "Found ${errors} file(s) that failed decryption."
  else
    echo "All valid."
  fi
  return $errors
}

check_deps

case "${1:-help}" in
  encrypt)
    shift
    if [[ $# -eq 0 ]]; then
      echo "Usage: $0 encrypt <file> [file...]"
      exit 1
    fi
    for f in "$@"; do encrypt_file "$f"; done
    ;;
  decrypt)
    shift
    if [[ $# -eq 0 ]]; then
      echo "Usage: $0 decrypt <file> [file...]"
      exit 1
    fi
    for f in "$@"; do decrypt_file "$f"; done
    ;;
  encrypt-dir)
    shift
    local dir="${1:-secrets}"
    echo "Encrypting all secrets in ${dir}..."
    while IFS= read -r -d '' file; do
      encrypt_file "$file"
    done < <(find_secrets "$ROOT_DIR/$dir" -print0 2>/dev/null || true)
    ;;
  decrypt-dir)
    shift
    local dir="${1:-secrets}"
    echo "Decrypting all secrets in ${dir}..."
    while IFS= read -r -d '' file; do
      decrypt_file "$file"
    done < <(find_secrets "$ROOT_DIR/$dir" -print0 2>/dev/null || true)
    ;;
  rotate)
    rotate_key
    ;;
  show)
    shift
    if [[ $# -lt 1 ]]; then
      echo "Usage: $0 show <file>"
      exit 1
    fi
    show_file "$1"
    ;;
  diff)
    shift
    diff_files "$@"
    ;;
  lint)
    lint_check
    ;;
  generate-key)
    generate_key
    ;;
  *)
    usage
    ;;
esac
