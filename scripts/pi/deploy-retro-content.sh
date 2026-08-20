#!/usr/bin/env bash
# Transfers a staged retro-content payload to a target and re-verifies every
# digest there.
#
# The payload comes from `scripts/pi/stage-retro-content.mjs`, which hashes each
# ROM on the workstation. This script copies those exact bytes and then makes
# the target recompute every SHA-256 itself, so a transfer that corrupts,
# truncates, or substitutes a file fails here rather than at launch.
#
# Per D-185 no content is vendored by this repository. The payload lives outside
# the checkout and is never committed.
#
# What this does NOT do: it does not install a signed package, write a native
# installed-library generation, or make a title launchable. It places verified
# bytes in a content root. See docs/RETRO_CONTENT_DEPLOYMENT.md.
#
# usage:
#   scripts/pi/deploy-retro-content.sh --payload DIR --target HOST
#     [--remote-root PATH] [--delete] [--dry-run]

# Every remote path in this script is deliberately expanded on the client, from
# a base the target itself resolved once below. That is the intent, not an
# oversight, so the "expands on the client side" note is silenced file-wide.
# shellcheck disable=SC2029

set -euo pipefail

payload=""
target=""
# Single-quoted on purpose: this default is expanded by the target's shell, not
# this one, so the deploying workstation never needs the remote home directory.
# shellcheck disable=SC2016
remote_root='$HOME/vcg-content'
delete=0
dry_run=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --payload) payload="${2:?--payload needs a directory}"; shift 2 ;;
    --target) target="${2:?--target needs an ssh host}"; shift 2 ;;
    --remote-root) remote_root="${2:?--remote-root needs a path}"; shift 2 ;;
    --delete) delete=1; shift ;;
    --dry-run) dry_run=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

[ -n "${payload}" ] || { echo "--payload is required" >&2; exit 2; }
[ -n "${target}" ] || { echo "--target is required" >&2; exit 2; }

for required in "objects" "staged-content.json" "SHA256SUMS"; do
  [ -e "${payload}/${required}" ] || {
    echo "payload is missing ${required}: ${payload}" >&2
    echo "Run scripts/pi/stage-retro-content.mjs first." >&2
    exit 1
  }
done

command -v ssh >/dev/null 2>&1 || { echo "Missing prerequisite: ssh" >&2; exit 1; }

# rsync is preferred for its resumable, incremental transfer, but a Git Bash
# workstation has no rsync at all. Streaming a tar over the existing ssh
# connection needs nothing extra and moves the same bytes; only the incremental
# and --delete behaviours are lost.
if command -v rsync >/dev/null 2>&1; then
  transport="rsync"
else
  transport="tar-over-ssh"
  if [ "${delete}" -eq 1 ]; then
    echo "--delete requires rsync, which is not installed." >&2
    exit 1
  fi
fi

system="$(sed -n 's/.*"systemId": *"\([a-z0-9.-]*\)".*/\1/p' "${payload}/staged-content.json" | head -1)"
[ -n "${system}" ] || { echo "payload manifest has no systemId" >&2; exit 1; }

object_count="$(find "${payload}/objects" -type f | wc -l | tr -d ' ')"
digest_count="$(grep -c '' "${payload}/SHA256SUMS")"
if [ "${object_count}" != "${digest_count}" ]; then
  echo "payload is inconsistent: ${object_count} objects, ${digest_count} digests" >&2
  exit 1
fi

# The remote root is expanded by the target's shell, so `$HOME` works without
# this script needing to know the remote account's home directory.
remote_base="$(ssh "${target}" "printf '%s' \"${remote_root}\"")"
remote_dir="${remote_base}/${system}"

echo "system:    ${system}"
echo "payload:   ${payload} (${object_count} objects)"
echo "target:    ${target}:${remote_dir}"
echo "transport: ${transport}"

if [ "${dry_run}" -eq 1 ]; then
  echo
  echo "dry run only; nothing was written and nothing was verified."
  exit 0
fi

ssh "${target}" "mkdir -p '${remote_dir}'"

if [ "${transport}" = "rsync" ]; then
  rsync_flags=(-a --human-readable --info=progress2)
  [ "${delete}" -eq 1 ] && rsync_flags+=(--delete)
  rsync "${rsync_flags[@]}" \
    "${payload}/objects" "${payload}/staged-content.json" "${payload}/SHA256SUMS" \
    "${target}:${remote_dir}/"
else
  tar -cf - -C "${payload}" objects staged-content.json SHA256SUMS \
    | ssh "${target}" "tar -xf - -C '${remote_dir}'"
fi

echo
echo "verifying every digest on the target"
# `sha256sum -c` reads the same relative paths the staging tool wrote, so this
# is the target recomputing the hashes, not a copy of the workstation's answer.
verification="$(ssh "${target}" "cd '${remote_dir}' && sha256sum -c --quiet SHA256SUMS 2>&1; echo \"exit:\$?\"")"
status="${verification##*exit:}"
failures="$(printf '%s' "${verification}" | grep -v '^exit:' || true)"

if [ "${status}" != "0" ]; then
  echo "DIGEST VERIFICATION FAILED on ${target}:" >&2
  printf '%s\n' "${failures}" | head -20 >&2
  exit 1
fi

remote_bytes="$(ssh "${target}" "du -sh '${remote_dir}' | cut -f1")"
echo "verified ${object_count} objects (${remote_bytes}) at ${target}:${remote_dir}"
echo
echo "Verified bytes are not a qualified install. Nothing here proves a core"
echo "loads a title, that saves persist, or that any of it is playable."
