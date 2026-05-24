#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Changelog Generator
# Generates changelog from conventional commits
# Usage: ./changelog.sh [--from v1.0.0] [--to v2.0.0] [--output CHANGELOG.md]
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

FROM_TAG=""
TO_TAG="HEAD"
OUTPUT_FILE="CHANGELOG.md"
REPO_URL="https://github.com/anomalyco/privacy-preserving-kyc-vault"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from) FROM_TAG="$2"; shift 2 ;;
    --to) TO_TAG="$2"; shift 2 ;;
    --output) OUTPUT_FILE="$2"; shift 2 ;;
    --help) echo "Usage: $0 [--from v1.0.0] [--to v2.0.0] [--output CHANGELOG.md]"; exit 0 ;;
    *) log_error "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$FROM_TAG" ]]; then
  FROM_TAG=$(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)
  log_info "Using tag range: $FROM_TAG..$TO_TAG"
fi

SCOPE_ORDER=("breaking" "feat" "fix" "security" "perf" "refactor" "docs" "test" "chore" "ci" "style")
SCOPE_LABELS=(
  "Breaking Changes"
  "Features"
  "Bug Fixes"
  "Security Fixes"
  "Performance Improvements"
  "Code Refactoring"
  "Documentation"
  "Tests"
  "Chores"
  "CI/CD"
  "Style"
)

declare -A SECTIONS
for scope in "${SCOPE_ORDER[@]}"; do
  SECTIONS["$scope"]=""
done

log_info "Parsing commits from $FROM_TAG to $TO_TAG..."
COMMITS=$(git log "$FROM_TAG..$TO_TAG" --oneline --pretty=format:"%H|%s|%an|%aI" 2>/dev/null || echo "")

if [[ -z "$COMMITS" ]]; then
  log_warn "No commits found in range $FROM_TAG..$TO_TAG"
  exit 0
fi

BREAKING_COUNT=0
TOTAL_COUNT=0

while IFS='|' read -r hash subject author date; do
  TOTAL_COUNT=$((TOTAL_COUNT + 1))

  if echo "$subject" | grep -qiE '!:|BREAKING CHANGE|breaking'; then
    scope="breaking"
    BREAKING_COUNT=$((BREAKING_COUNT + 1))
  elif echo "$subject" | grep -qiE '^feat(\(.*\))?:' ; then
    scope="feat"
  elif echo "$subject" | grep -qiE '^fix(\(.*\))?:' ; then
    scope="fix"
  elif echo "$subject" | grep -qiE '^security(\(.*\))?:' ; then
    scope="security"
  elif echo "$subject" | grep -qiE '^perf(\(.*\))?:' ; then
    scope="perf"
  elif echo "$subject" | grep -qiE '^refactor(\(.*\))?:' ; then
    scope="refactor"
  elif echo "$subject" | grep -qiE '^docs(\(.*\))?:' ; then
    scope="docs"
  elif echo "$subject" | grep -qiE '^test(\(.*\))?:' ; then
    scope="test"
  elif echo "$subject" | grep -qiE '^ci(\(.*\))?:' ; then
    scope="ci"
  elif echo "$subject" | grep -qiE '^style(\(.*\))?:' ; then
    scope="style"
  else
    scope="chore"
  fi

  SHORT_HASH=$(echo "$hash" | cut -c1-7)
  SCOPE_EXTRACT=$(echo "$subject" | sed -n 's/^[a-z]*\((.*)\):.*/\1/p' || echo "")
  DESCRIPTION=$(echo "$subject" | sed 's/^[a-z]*\(.*\): *//' | sed 's/!//')

  if [[ -n "$SCOPE_EXTRACT" ]]; then
    ENTRY="- **${SCOPE_EXTRACT}**: ${DESCRIPTION} ([${SHORT_HASH}](${REPO_URL}/commit/${hash}))"
  else
    ENTRY="- ${DESCRIPTION} ([${SHORT_HASH}](${REPO_URL}/commit/${hash}))"
  fi

  SECTIONS["$scope"]="${SECTIONS[$scope]}${ENTRY}\n"
done <<< "$COMMITS"

log_info "Generating changelog..."

cat > "$OUTPUT_FILE" << HEADER
# Changelog

## [$TO_TAG] - $(date +%Y-%m-%d)

HEADER

if [[ $BREAKING_COUNT -gt 0 ]]; then
  echo "> ⚠️ This release contains $BREAKING_COUNT breaking change(s)." >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
fi

for i in "${!SCOPE_ORDER[@]}"; do
  scope="${SCOPE_ORDER[$i]}"
  label="${SCOPE_LABELS[$i]}"
  content="${SECTIONS[$scope]}"
  if [[ -n "${content// }" ]]; then
    echo "### $label" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    echo -e "$content" >> "$OUTPUT_FILE"
  fi
done

echo "" >> "$OUTPUT_FILE"
echo "---" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "**Full Changelog**: [$FROM_TAG..$TO_TAG](${REPO_URL}/compare/$FROM_TAG..$TO_TAG)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "*$TOTAL_COUNT commits since $FROM_TAG*" >> "$OUTPUT_FILE"

log_info "Changelog generated: $OUTPUT_FILE ($TOTAL_COUNT commits)"
