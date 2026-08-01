#!/usr/bin/env bash
set -euo pipefail

if [[ -r "$HOME/.cargo/env" ]]; then
  # shellcheck disable=SC1091 -- rustup installs this per-user environment file.
  source "$HOME/.cargo/env"
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
fuzz_root="$repo_root/native/vcg-host/fuzz"
seed_root="$fuzz_root/seeds/native_parser_boundaries"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/vcg-native-parser-fuzz.XXXXXX")"
corpus="$scratch/corpus"
artifacts="$scratch/artifacts"

cleanup() {
  case "$scratch" in
    "${TMPDIR:-/tmp}"/vcg-native-parser-fuzz.*) rm -rf -- "$scratch" ;;
    *) printf 'refusing to remove unexpected fuzz scratch path: %s\n' "$scratch" >&2 ;;
  esac
}
trap cleanup EXIT

mkdir -p -- "$corpus" "$artifacts" "$scratch/target"
shopt -s nullglob
seeds=("$seed_root"/*)
if ((${#seeds[@]} == 0)); then
  printf 'native parser fuzz corpus has no tracked seeds\n' >&2
  exit 1
fi
for seed in "${seeds[@]}"; do
  cp -- "$seed" "$corpus/$(basename "$seed")"
done
for boundary_size in 1025 4097 16385 32769; do
  printf -v boundary_bytes '%*s' "$boundary_size" ''
  printf '%s' "$boundary_bytes" >"$corpus/oversize-$boundary_size.txt"
done

cd "$fuzz_root"
cargo +nightly-2026-07-26 fuzz run \
  --target-dir "$scratch/target" \
  native_parser_boundaries \
  "$corpus" \
  -- \
  -seed=826428071 \
  -runs=20000 \
  -max_len=65536 \
  -timeout=2 \
  -print_final_stats=1 \
  -verbosity=0 \
  "-artifact_prefix=$artifacts/"
