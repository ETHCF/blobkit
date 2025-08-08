#!/usr/bin/env bash
set -euo pipefail

# Secret scan with strict but noise-free rules
# Excludes docs, tests, deployments, vendored libs, build outputs, and known dev scripts

ROOT_DIR="${1:-.}"

# Known safe patterns to ignore (well-known Anvil keys, constants, event topics)
IGNORE_PATTERNS=(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
  "0xc9f761cef4b498085beaa83472253ad1dbcaa175c7e97bd6893d9da4b6ab0868"
  "0x9bb5b9fff77191c79356e2cc9fbdb082cd52c3d60643ca121716890337f818e7"
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
)

is_ignored_file() {
  local f="$1"
  [[ "$f" == *"/node_modules/"* ]] && return 0
  [[ "$f" == *"/.git/"* ]] && return 0
  [[ "$f" == *"/packages/contracts/lib/"* ]] && return 0
  [[ "$f" == *"/deployments/"* ]] && return 0
  [[ "$f" == *"/coverage/"* ]] && return 0
  [[ "$f" == *"/dist/"* ]] && return 0
  [[ "$f" == *"/build/"* ]] && return 0
  [[ "$f" == *"/artifacts/"* ]] && return 0
  [[ "$f" == *"/test/"* ]] && return 0
  [[ "$f" == *"/__tests__/"* ]] && return 0
  [[ "$f" == *"/__integration__/"* ]] && return 0
  [[ "$f" == *".md" ]] && return 0
  [[ "$f" == *".mdx" ]] && return 0
  [[ "$f" == *"openapi.yaml"* ]] && return 0
  [[ "$f" == *"scripts/dev.sh"* ]] && return 0
  return 1
}

matches_ignored_pattern() {
  local line="$1"
  for pat in "${IGNORE_PATTERNS[@]}"; do
    if grep -qi "$pat" <<<"$line"; then
      return 0
    fi
  done
  # Common code tokens around topics/constants
  if grep -qiE "(^|\s)(const\s+topics\s*=|topics\s*=)" <<<"$line"; then
    return 0
  fi
  return 1
}

violations=()

while IFS= read -r -d '' file; do
  if is_ignored_file "$file"; then
    continue
  fi
  while IFS= read -r line; do
    if grep -qE "0x[0-9a-fA-F]{64}" <<<"$line"; then
      if ! matches_ignored_pattern "$line"; then
        violations+=("$file:$line")
      fi
    fi
  done <"$file"
done < <(find "$ROOT_DIR" -type f -print0)

if ((${#violations[@]} > 0)); then
  echo "Potential private keys found in the following lines:" >&2
  for v in "${violations[@]}"; do
    echo "$v" >&2
  done
  exit 1
fi

echo "No hardcoded private keys detected."

