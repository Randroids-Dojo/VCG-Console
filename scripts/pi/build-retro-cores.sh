#!/usr/bin/env bash
# Fetches, verifies, and builds the selected libretro cores for this machine.
#
# Per D-185 this repository vendors no emulator code. Every core below is
# recorded only as pinned provenance -- repository, revision, archive URL,
# archive SHA-256, and byte length -- and this script fetches those exact bytes,
# refuses to continue if a digest does not match, builds in a scratch directory,
# and collects the resulting cores plus their licence text.
#
# Licences are not uniform and are recorded in the decision register:
#   fceumm           D-188  GPL-2.0, NTSC filter LGPL-2.1        commercial use permitted
#   snes9x           D-186  non-commercial, personal use only    commercial use forbidden
#   genesis-plus-gx  D-189  may not be sold or used commercially  commercial use forbidden
# Two of the three forbid commercial use. Read docs/DECISIONS.md before
# redistributing anything this script produces.
#
# What this does NOT do: qualify a core. A built core is not evidence of
# playable emulation, audio correctness, controller behaviour, save durability,
# frame pacing, or thermal headroom on any target. Those are physical
# qualification gates, not build results.
#
# usage:
#   scripts/pi/build-retro-cores.sh [--out DIR] [--cross-aarch64] [--only ID]

set -euo pipefail

out_dir=""
cross=0
only=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --out) out_dir="${2:?--out needs a directory}"; shift 2 ;;
    --cross-aarch64) cross=1; shift ;;
    --only) only="${2:?--only needs a core id}"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if [ ! -f package.json ] || [ ! -d native/vcg-host ]; then
  echo "Run this script from the VCG-Console repository root." >&2
  exit 1
fi

out_dir="${out_dir:-$PWD/build/retro-cores}"

# id|repository|revision|archiveSha256|archiveBytes|buildSubdir|makefile|artifact|licenceFile|systemDeps
CORES=(
  "fceumm|https://github.com/libretro/libretro-fceumm|b5e3566515c27dc66c9c20572171673126532e06|1ef34c9ed324f91856d6eca7d923e4f0d33ce85acb4b6a9b62d4a56c46e5ddc1|1111786|.|Makefile.libretro|fceumm_libretro.so|Copying|"
  "snes9x|https://github.com/libretro/snes9x|21a66f3975388e15d5495d52422415f52c040f86|5146b4fbdb7062a3d93d5ced27c72d7c811f7278228353786619c0d591b73634|632260|libretro|Makefile|snes9x_libretro.so|LICENSE|zlib1g-dev"
  "genesis-plus-gx|https://github.com/libretro/Genesis-Plus-GX|ca93fec870378f3bff65931bcd828d5e756cce75|9b00f9b29abb4e9fbe7be01b54e45bb8910935b62810c1d2f4a2b2138237650b|16980812|.|Makefile.libretro|genesis_plus_gx_libretro.so|LICENSE.txt|"
)

uname_s="$(uname -s)"
uname_m="$(uname -m)"
echo "host: ${uname_s} ${uname_m}"
if [ "${uname_s}" != "Linux" ]; then
  echo "This recipe targets Linux; ${uname_s} results do not transfer." >&2
  exit 1
fi

if [ "${cross}" -eq 1 ]; then
  target_label="aarch64 (cross)"
  export CC=aarch64-linux-gnu-gcc CXX=aarch64-linux-gnu-g++ AR=aarch64-linux-gnu-ar
  for tool in "$CC" "$CXX" "$AR"; do
    command -v "$tool" >/dev/null 2>&1 || {
      echo "Missing cross toolchain: $tool. Install gcc-aarch64-linux-gnu and g++-aarch64-linux-gnu." >&2
      exit 1
    }
  done
else
  target_label="native ${uname_m}"
  if [ "${uname_m}" != "aarch64" ]; then
    echo "warning: native build on ${uname_m}; these cores are not Raspberry Pi artifacts." >&2
  fi
fi
echo "target: ${target_label}"

for tool in curl tar make sha256sum; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing prerequisite: $tool" >&2; exit 1; }
done

# Probes the toolchain that will actually build, header and library together.
# Checking a host path instead would pass on a cross build whose target zlib is
# missing, and fail at the link step with `cannot find -lz`.
have_zlib_for_target() {
  local cc="${CC:-cc}" probe status
  command -v "${cc}" >/dev/null 2>&1 || return 1
  probe="$(mktemp "${TMPDIR:-/tmp}/vcg-zlib-probe.XXXXXX.c")"
  printf '#include <zlib.h>\nint main(void){return zlibVersion()==0;}\n' > "${probe}"
  "${cc}" "${probe}" -o "${probe}.bin" -lz >/dev/null 2>&1
  status=$?
  rm -f "${probe}" "${probe}.bin"
  return "${status}"
}

scratch="$(mktemp -d "${TMPDIR:-/tmp}/vcg-retro-build.XXXXXX")"
cleanup() {
  case "${scratch}" in
    "${TMPDIR:-/tmp}"/vcg-retro-build.*) rm -rf "${scratch}" ;;
  esac
}
trap cleanup EXIT

mkdir -p "${out_dir}"
notices="${out_dir}/THIRD_PARTY_NOTICES.txt"
: > "${notices}"
built=0
skipped=0

for entry in "${CORES[@]}"; do
  IFS='|' read -r id repo rev sha bytes subdir makefile artifact licence deps <<<"${entry}"
  [ -n "${only}" ] && [ "${only}" != "${id}" ] && continue

  echo
  echo "== ${id} =="

  # Dispatch on the declared dependency rather than assuming it is zlib: the
  # field is generic, so a future core declaring something else must not be
  # silently checked for the wrong library.
  dep_ok=1
  case "${deps}" in
    "") ;;
    zlib1g-dev) have_zlib_for_target || dep_ok=0 ;;
    *)
      echo "  SKIP: this recipe has no probe for the declared dependency '${deps}'." >&2
      echo "        Add one rather than letting the build fail at its link step." >&2
      skipped=$((skipped + 1))
      continue
      ;;
  esac

  if [ "${dep_ok}" -eq 0 ]; then
    # A missing development library is a declared dependency, not a build
    # defect: snes9x compiles -DUNZIP_SUPPORT, bundles no zlib, and links -lz.
    #
    # This is probed by compiling and linking against the active toolchain
    # rather than by looking for /usr/include/zlib.h. The host header can be
    # present while the aarch64 target library is absent, which fails much
    # later and far less clearly, at the link step.
    if [ "${cross}" -eq 1 ]; then
      echo "  SKIP: ${deps} is not available for the aarch64 target."
      echo "        Cross builds need the arm64 zlib: dpkg --add-architecture arm64,"
      echo "        then install zlib1g-dev:arm64. A native build on the Pi needs"
      echo "        only zlib1g-dev."
    else
      echo "  SKIP: needs ${deps}. Install it and rerun."
    fi
    skipped=$((skipped + 1))
    continue
  fi

  archive="${scratch}/${id}.tar.gz"
  echo "  fetching pinned revision ${rev}"
  curl -fsSL "${repo}/archive/${rev}.tar.gz" -o "${archive}"

  actual_sha="$(sha256sum "${archive}" | cut -d' ' -f1)"
  actual_bytes="$(stat -c%s "${archive}")"
  if [ "${actual_sha}" != "${sha}" ] || [ "${actual_bytes}" != "${bytes}" ]; then
    echo "  REFUSING TO BUILD: pinned archive digest does not match." >&2
    echo "    expected ${sha} (${bytes} bytes)" >&2
    echo "    actual   ${actual_sha} (${actual_bytes} bytes)" >&2
    exit 1
  fi
  echo "  digest verified"

  mkdir -p "${scratch}/${id}"
  tar -xzf "${archive}" -C "${scratch}/${id}" --strip-components=1

  source_root="${scratch}/${id}"
  ( cd "${source_root}/${subdir}" && make -f "${makefile}" platform=unix -j"$(nproc)" ) \
    > "${scratch}/${id}.build.log" 2>&1 || {
      echo "  BUILD FAILED; last 15 lines:" >&2
      tail -15 "${scratch}/${id}.build.log" >&2
      exit 1
    }

  found="$(find "${source_root}" -name "${artifact}" -print -quit)"
  [ -n "${found}" ] || { echo "  built but ${artifact} not found" >&2; exit 1; }
  cp "${found}" "${out_dir}/${artifact}"
  echo "  $(cd "${out_dir}" && sha256sum "${artifact}")"
  file "${out_dir}/${artifact}" | sed 's/^/  /'

  {
    echo "==============================================================================="
    echo "${id} -- ${repo}"
    echo "pinned revision: ${rev}"
    echo "source archive SHA-256: ${sha}"
    echo "==============================================================================="
    echo
    cat "${source_root}/${licence}"
    echo
  } >> "${notices}"
  built=$((built + 1))
done

echo
echo "built ${built} core(s), skipped ${skipped}, into ${out_dir}"
echo "third-party licence text: ${notices}"
echo
echo "No core here is qualified. A built core is not evidence of playable"
echo "emulation, audio, controller behaviour, save durability, frame pacing, or"
echo "thermal headroom. Two of the three forbid commercial use; see D-186 and"
echo "D-189 in docs/DECISIONS.md before redistributing anything."
