#!/usr/bin/env bash
# Fetches, verifies, and builds the pinned RetroArch frontend for this machine.
#
# Per D-185 this repository vendors no frontend code. RetroArch is recorded only
# as pinned provenance and fetched from its official source-only release, whose
# digest is checked before anything is built.
#
# Version 1.22.2 is not a new choice: it is the frontend version already declared
# by catalog/retro-2048.vcg-game.json. RetroArch publishes no Linux or aarch64
# binary asset for this release -- the only artifact is the source-only tarball --
# so building from pinned source is the sole option for the Raspberry Pi and also
# the one most consistent with D-185.
#
# RetroArch is GPL-3.0-only. Unlike two of the three selected cores it carries no
# field-of-use restriction, but it does carry a reciprocal source obligation for
# anything redistributed.
#
# What this does NOT do: qualify the frontend. A built binary is not evidence of
# working video, audio, input, compositor behaviour, or frame pacing on any
# target.
#
# usage:
#   scripts/pi/build-retro-frontend.sh [--out DIR] [--jobs N]

set -euo pipefail

RA_VERSION="1.22.2"
RA_URL="https://github.com/libretro/RetroArch/releases/download/v${RA_VERSION}/retroarch-sourceonly-${RA_VERSION}.tar.xz"
RA_SHA256="2a8b1713f7f4d2b53bad3e2297e48d78f5666098cf00d583d3e08f3c213f8aa6"
RA_BYTES="13564476"

# Discovered empirically by building this exact release, not copied from a wiki.
# The build reached its link step and failed only on libx11-xcb-dev, so that
# package is required and not optional.
#
# The Wayland packages are required, not optional. configure only enables
# Wayland when wayland-egl, wayland-cursor, wayland-protocols, and
# wayland-scanner are all present, and it disables it silently otherwise. The
# appliance session runs under Cage, so a frontend that fell back to the SDL
# context path would present through a second, unintended stack.
BUILD_DEPS="pkg-config libsdl2-dev libasound2-dev libx11-xcb-dev zlib1g-dev libwayland-dev wayland-protocols"

# The GPU development headers differ by target and only one is needed. A
# Raspberry Pi provides GLES; an x86-64 desktop provides desktop GL. Requiring
# the desktop package by name would refuse to run on the very target this recipe
# exists for.
BUILD_DEPS_GPU_ANY_OF="libgl1-mesa-dev libgles2-mesa-dev"

# A deliberately small console profile. Qt is a desktop UI this appliance never
# shows, and the glslang and Vulkan tool stacks pull in a large dependency set
# for shader features the Pi profile does not use.
#
# Wayland is deliberately NOT disabled. Raspberry Pi OS defaults to a Wayland
# session, so forcing it off could leave the frontend unable to present in the
# operator's actual session. Its development packages are required above rather
# than left to detection, because silent detection produced a build whose
# Wayland support depended on which unrelated packages happened to be installed.
CONFIGURE_FLAGS=(
  --disable-qt
  --disable-cg
  --disable-discord
  --disable-cheevos
  --disable-vulkan
  --enable-sdl2
  --enable-alsa
)

out_dir=""
jobs="$(nproc)"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --out) out_dir="${2:?--out needs a directory}"; shift 2 ;;
    --jobs) jobs="${2:?--jobs needs a count}"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if [ ! -f package.json ] || [ ! -d native/vcg-host ]; then
  echo "Run this script from the VCG-Console repository root." >&2
  exit 1
fi
out_dir="${out_dir:-$PWD/build/retro-frontend}"

uname_s="$(uname -s)"; uname_m="$(uname -m)"
echo "host: ${uname_s} ${uname_m}"
[ "${uname_s}" = "Linux" ] || { echo "This recipe targets Linux." >&2; exit 1; }
if [ "${uname_m}" != "aarch64" ]; then
  echo "warning: ${uname_m} build; this is not a Raspberry Pi artifact." >&2
fi

for tool in curl tar make sha256sum cc; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing prerequisite: $tool" >&2; exit 1; }
done

installed() {
  dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q "install ok installed"
}

if command -v dpkg-query >/dev/null 2>&1; then
  missing=""
  for dep in ${BUILD_DEPS}; do
    installed "${dep}" || missing="${missing} ${dep}"
  done

  gpu_ok=0
  for dep in ${BUILD_DEPS_GPU_ANY_OF}; do
    installed "${dep}" && gpu_ok=1
  done

  if [ -n "${missing}" ] || [ "${gpu_ok}" -eq 0 ]; then
    echo "Missing build dependencies." >&2
    [ -n "${missing}" ] && echo "  required:${missing}" >&2
    if [ "${gpu_ok}" -eq 0 ]; then
      echo "  GPU headers: one of ${BUILD_DEPS_GPU_ANY_OF}" >&2
      echo "    Raspberry Pi OS provides GLES: libgles2-mesa-dev" >&2
      echo "    x86-64 desktops provide desktop GL: libgl1-mesa-dev" >&2
    fi
    exit 1
  fi
else
  # Not a dpkg system. Let configure be the authority rather than guessing at
  # another package manager's names.
  echo "note: dpkg-query absent; skipping the dependency precheck." >&2
fi

scratch="$(mktemp -d "${TMPDIR:-/tmp}/vcg-retro-frontend.XXXXXX")"
cleanup() {
  case "${scratch}" in
    "${TMPDIR:-/tmp}"/vcg-retro-frontend.*) rm -rf "${scratch}" ;;
  esac
}
trap cleanup EXIT

echo
echo "== RetroArch ${RA_VERSION} =="
archive="${scratch}/retroarch.tar.xz"
echo "  fetching the official source-only release"
curl -fsSL "${RA_URL}" -o "${archive}"

actual_sha="$(sha256sum "${archive}" | cut -d' ' -f1)"
actual_bytes="$(stat -c%s "${archive}")"
if [ "${actual_sha}" != "${RA_SHA256}" ] || [ "${actual_bytes}" != "${RA_BYTES}" ]; then
  echo "  REFUSING TO BUILD: pinned archive digest does not match." >&2
  echo "    expected ${RA_SHA256} (${RA_BYTES} bytes)" >&2
  echo "    actual   ${actual_sha} (${actual_bytes} bytes)" >&2
  exit 1
fi
echo "  digest verified"

tar -xJf "${archive}" -C "${scratch}"
source_root="$(find "${scratch}" -maxdepth 1 -mindepth 1 -type d -name 'retroarch-*' | head -1)"
[ -n "${source_root}" ] || { echo "  unexpected archive layout" >&2; exit 1; }

echo "  configuring the console profile"
( cd "${source_root}" && ./configure "${CONFIGURE_FLAGS[@]}" ) \
  > "${scratch}/configure.log" 2>&1 || {
    echo "  CONFIGURE FAILED; last 20 lines:" >&2
    tail -20 "${scratch}/configure.log" >&2
    exit 1
  }

# configure disables Wayland silently when a dependency is missing, and the
# appliance session runs under Cage. Requiring the packages above is not
# sufficient on its own: check what configure actually decided, so a frontend
# that would fall back to another context driver fails here instead of at boot.
if ! grep -q '^HAVE_WAYLAND = 1$' "${source_root}/config.mk"; then
  echo "  CONFIGURE DISABLED WAYLAND." >&2
  echo "  The appliance session presents through Cage, so this build is wrong." >&2
  echo "  Install ${BUILD_DEPS} and rerun." >&2
  exit 1
fi

echo "  building with ${jobs} job(s)"
( cd "${source_root}" && make -j"${jobs}" ) > "${scratch}/make.log" 2>&1 || {
    echo "  BUILD FAILED; last 20 lines:" >&2
    tail -20 "${scratch}/make.log" >&2
    exit 1
  }

[ -x "${source_root}/retroarch" ] || { echo "  built but no retroarch binary" >&2; exit 1; }

mkdir -p "${out_dir}"
cp "${source_root}/retroarch" "${out_dir}/retroarch"
{
  echo "==============================================================================="
  echo "RetroArch ${RA_VERSION} -- https://github.com/libretro/RetroArch"
  echo "source archive SHA-256: ${RA_SHA256}"
  echo "==============================================================================="
  echo
  cat "${source_root}/COPYING"
} > "${out_dir}/THIRD_PARTY_NOTICES.txt"

echo "  $(cd "${out_dir}" && sha256sum retroarch)"
file "${out_dir}/retroarch" | sed 's/^/  /'
"${out_dir}/retroarch" --version 2>&1 | head -2 | sed 's/^/  /'

echo
echo "frontend written to ${out_dir}"
echo
echo "This frontend is not qualified. A built binary is not evidence of working"
echo "video, audio, input, compositor behaviour, or frame pacing on any target."
