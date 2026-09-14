#!/usr/bin/env bash
# Wait for the exact header-correct local console boundary before Cage starts.

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <repository-root>" >&2
  exit 2
fi

repo_root="$1"
verify="$(command -v node)"
verify_script="${repo_root}/build/console-runtime/verify-console-headers.js"

for _ in $(seq 1 60); do
  if "${verify}" "${verify_script}" >/dev/null 2>&1; then
    exit 0
  fi
  sleep 0.5
done

echo "VCG Console server did not become ready with its required browser boundary." >&2
exec "${verify}" "${verify_script}"
