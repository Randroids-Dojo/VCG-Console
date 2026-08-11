#!/usr/bin/env bash
# Raspberry Pi day-one bring-up for the VCG console desk prototype.
#
# This script installs pinned dependencies, prepares the pinned local assets,
# builds the console app, and proves that the server you will actually use
# applies the browser boundary the camera path depends on.
#
# It does not qualify the Raspberry Pi 5, the AI HAT+, a camera, a controller,
# a room, a thermal envelope, or any latency budget. Nothing here uses the
# Hailo accelerator: the Motion contract has no honest Hailo frame source yet,
# so pose inference runs on the CPU in the browser.
#
# usage: scripts/pi/bootstrap.sh [--full-verify] [--skip-native] [--no-install-instructions]

set -euo pipefail

full_verify=0
skip_native=0
install_instructions=1
# The port is fixed at 4173 on purpose: the bridge and hostile-fixture content
# security policies name that exact origin, so a console served anywhere else is
# not the console this script is meant to verify.
port=4173

while [ "$#" -gt 0 ]; do
  case "$1" in
    --full-verify) full_verify=1 ;;
    --skip-native) skip_native=1 ;;
    --no-install-instructions) install_instructions=0 ;;
    *)
      echo "unknown option: $1" >&2
      exit 2
      ;;
  esac
  shift
done

if [ ! -f package.json ] || [ ! -d apps/console-lab ]; then
  echo "Run this script from the VCG-Console repository root." >&2
  exit 1
fi

uname_s="$(uname -s)"
uname_m="$(uname -m)"
echo "host: ${uname_s} ${uname_m}"
if [ "${uname_s}" != "Linux" ]; then
  echo "warning: this bring-up path targets Linux; ${uname_s} results do not transfer." >&2
fi
if [ "${uname_m}" != "aarch64" ]; then
  echo "warning: expected aarch64; ${uname_m} results are not Raspberry Pi evidence." >&2
fi

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing prerequisite: $1. $2" >&2
    exit 1
  }
}

require_command node "Install Node.js 22 or newer, then rerun."
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "${node_major}" -lt 22 ]; then
  echo "Node.js 22 or newer is required; found $(node --version)." >&2
  exit 1
fi

expected_pnpm="$(node -p 'require("./package.json").packageManager.replace(/^pnpm@/, "")')"
if command -v pnpm >/dev/null 2>&1 && [ "$(pnpm --version)" = "${expected_pnpm}" ]; then
  pnpm_run() { pnpm "$@"; }
elif command -v corepack >/dev/null 2>&1; then
  pnpm_run() { corepack pnpm "$@"; }
elif command -v pnpm >/dev/null 2>&1; then
  installed_pnpm="$(pnpm --version)"
  echo "warning: pnpm ${installed_pnpm} differs from the pinned pnpm ${expected_pnpm}; using pnpm dlx." >&2
  pnpm_run() { pnpm dlx "pnpm@${expected_pnpm}" "$@"; }
else
  echo "Missing prerequisite: pnpm. Enable Corepack or install pnpm@${expected_pnpm}, then rerun." >&2
  exit 1
fi

echo
echo "== dependencies and pinned assets =="
# prepare:assets fetches the pinned pose model and typeface by exact SHA-256.
# Run this while the Pi still has network access; the built app then serves
# both from disk.
CI=true pnpm_run install --frozen-lockfile
pnpm_run prepare:assets
pnpm_run prepare:catalog
pnpm_run prepare:schemas

if [ "${full_verify}" -eq 1 ]; then
  echo
  echo "== full verification =="
  pnpm_run typecheck
  pnpm_run test
fi

echo
echo "== build =="
pnpm_run build

if [ "${skip_native}" -eq 0 ]; then
  echo
  echo "== native host =="
  if command -v cargo >/dev/null 2>&1; then
    cargo build --release -p vcg-host
    cargo run -q --release -p vcg-host -- doctor
  else
    echo "warning: cargo is absent; skipping the Rust host. Install the toolchain in rust-toolchain.toml to launch retro titles." >&2
  fi
fi

echo
echo "== browser boundary =="
# A plain static file server answers the same URLs with the same bytes and no
# boundary headers, which silently disables cross-origin isolation and the
# camera permission policy. Prove the real server before trusting a session.
scratch="$(mktemp -d "${TMPDIR:-/tmp}/vcg-bringup.XXXXXX")"
preview_log="${scratch}/preview.log"

# `serve` is the same command the operator is told to run below, so this proves
# the server they will actually use.
pnpm_run serve >"${preview_log}" 2>&1 &
preview_pid=$!
cleanup() {
  kill "${preview_pid}" 2>/dev/null || true
  wait "${preview_pid}" 2>/dev/null || true
  case "${scratch}" in
    "${TMPDIR:-/tmp}"/vcg-bringup.*) rm -rf "${scratch}" ;;
  esac
}
trap cleanup EXIT

listening=0
for _ in $(seq 1 60); do
  # A bash builtin, so readiness polling costs no process per attempt.
  if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
    listening=1
    break
  fi
  sleep 0.5
done
if [ "${listening}" -ne 1 ]; then
  echo "The preview server never accepted a connection on port ${port}." >&2
  cat "${preview_log}" >&2 || true
  exit 1
fi

# One run, so a real boundary failure is reported instead of retried.
if ! pnpm_run verify:console-headers; then
  echo "The console server did not serve the required browser boundary. Do not run a camera session against it." >&2
  exit 1
fi

echo
echo "== observed hardware (recorded, not qualified) =="
if ls /dev/video* >/dev/null 2>&1; then
  for device in /dev/video*; do
    echo "video device: ${device}"
  done
  if command -v v4l2-ctl >/dev/null 2>&1; then
    v4l2-ctl --list-devices || true
  else
    echo "note: install v4l-utils to record exact camera modes."
  fi
else
  echo "no /dev/video* device is present; the camera path cannot be exercised."
fi
browser=""
for candidate in chromium chromium-browser; do
  if command -v "${candidate}" >/dev/null 2>&1; then
    browser="${candidate}"
    break
  fi
done
if [ -n "${browser}" ]; then
  echo "browser: $("${browser}" --version 2>/dev/null || echo "${browser}")"
else
  echo "no chromium binary was found; install one before the camera session." >&2
fi

if [ "${install_instructions}" -eq 1 ]; then
  echo
  echo "bring-up steps completed. Install appliance boot ownership next:"
  echo "  sudo scripts/pi/install-appliance.sh --user \"${SUDO_USER:-${USER:-vcg}}\""
  echo "  sudo systemctl reboot"
  echo
  echo "After reboot the console owns tty1 and opens fullscreen without a desktop."
  echo "Use docs/PI_APPLIANCE_BOOT.md for setup, diagnosis, and recovery."
fi
if [ "${skip_native}" -eq 1 ]; then
  echo "warning: --skip-native omitted the release host required by the appliance installer." >&2
fi
echo
echo "Nothing above is a qualification result. Record the exact image, kernel,"
echo "browser, camera, mode, and observed frame rate before claiming any."
