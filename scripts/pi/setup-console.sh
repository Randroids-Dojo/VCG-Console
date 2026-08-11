#!/usr/bin/env bash
# One-command Raspberry Pi setup for the VCG Console TV appliance.

set -euo pipefail

dry_run=0
full_verify=1
enable_boot=1
reboot_after=0
apt_update=1
repo_root="$(pwd -P)"
console_user="${SUDO_USER:-${USER:-}}"

# Raspberry Pi OS Trixie currently packages Node.js 20, while this repository
# requires Node.js 22 or newer. Keep the product runtime separate from the OS
# runtime and bind its exact path into the systemd service.
node_version="22.23.2"
node_archive="node-v${node_version}-linux-arm64.tar.xz"
node_sha256="fff4078c5def658577f92c88db7db3bc0072924bfb93fe52c1e744a54e94abb8"
node_url="https://nodejs.org/download/release/v${node_version}/${node_archive}"
node_install_root="/opt/vcg/node-v${node_version}-linux-arm64"

usage() {
  cat <<'EOF'
usage: scripts/pi/setup-console.sh [options]

Run this command as the non-root account that will own the TV session. The
script uses sudo only for operating-system packages, /opt/vcg, and systemd.

Options:
  --user USER          non-root account that owns the TV session
  --repo-root PATH     VCG-Console checkout (default: current directory)
  --quick              build and check the runtime boundary without the full test suite
  --no-enable          install units without changing the default boot target
  --skip-apt-update    use the current APT package index
  --reboot             reboot after a successful enabled installation
  --dry-run            validate and print the complete plan without changing the OS
EOF
}

require_value() {
  if [ "$#" -lt 2 ] || [ -z "$2" ]; then
    echo "$1 requires a value" >&2
    exit 2
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --user|--repo-root)
      require_value "$@"
      option="$1"
      value="$2"
      shift 2
      case "${option}" in
        --user) console_user="${value}" ;;
        --repo-root) repo_root="${value}" ;;
      esac
      ;;
    --quick) full_verify=0; shift ;;
    --no-enable) enable_boot=0; shift ;;
    --skip-apt-update) apt_update=0; shift ;;
    --reboot) reboot_after=1; shift ;;
    --dry-run) dry_run=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ ! -f "${repo_root}/package.json" ] || [ ! -d "${repo_root}/scripts/pi/systemd" ]; then
  echo "--repo-root must name a VCG-Console checkout." >&2
  exit 1
fi
repo_root="$(cd "${repo_root}" && pwd -P)"

if [ -z "${console_user}" ] || [ "${console_user}" = "root" ]; then
  echo "Run as the non-root console account, or pass --user with that account." >&2
  exit 1
fi
case "${console_user}" in
  *[!a-zA-Z0-9_.-]*)
    echo "Console user contains unsafe characters: ${console_user}" >&2
    exit 1
    ;;
esac
if [ "${reboot_after}" -eq 1 ] && [ "${enable_boot}" -ne 1 ]; then
  echo "--reboot cannot be combined with --no-enable." >&2
  exit 2
fi

rust_toolchain="$(sed -n 's/^channel = "\([^"]*\)"$/\1/p' "${repo_root}/rust-toolchain.toml")"
if [ -z "${rust_toolchain}" ]; then
  echo "Could not read the pinned Rust channel from rust-toolchain.toml." >&2
  exit 1
fi
pnpm_version="$(node -p 'require(process.argv[1]).packageManager.replace(/^pnpm@/, "")' "${repo_root}/package.json" 2>/dev/null || true)"
if [ -z "${pnpm_version}" ]; then
  # The dry run and first installation intentionally do not depend on a usable
  # system Node. Extract the simple, reviewed packageManager field with sed.
  pnpm_version="$(sed -n 's/.*"packageManager": "pnpm@\([^"]*\)".*/\1/p' "${repo_root}/package.json")"
fi
if [ -z "${pnpm_version}" ]; then
  echo "Could not read the pinned pnpm version from package.json." >&2
  exit 1
fi
pnpm_archive="pnpm-${pnpm_version}.tgz"
pnpm_url="https://registry.npmjs.org/pnpm/-/${pnpm_archive}"
pnpm_bytes="4491640"
pnpm_sha512="c961d1e0a2d8e354ecaa5166b822516668b7f44cb5bd95122d590dd81922f606f5473b6d23ec4a5be05e7fcd18e8488d47d978bbe981872f1145d06e9a740017"

apt_packages=(
  bluez
  build-essential
  ca-certificates
  cage
  chromium
  curl
  pkg-config
  rustup
  v4l-utils
  xz-utils
)

print_plan() {
  echo "VCG Console Raspberry Pi setup plan"
  echo "  user: ${console_user}"
  echo "  checkout: ${repo_root}"
  echo "  apt packages: ${apt_packages[*]}"
  echo "  Node.js: v${node_version} (${node_sha256})"
  echo "  pnpm: ${pnpm_version} (${pnpm_sha512})"
  echo "  Rust: ${rust_toolchain} with clippy and rustfmt"
  if [ "${full_verify}" -eq 1 ]; then
    echo "  verification: full typecheck and test suite"
  else
    echo "  verification: build and runtime-boundary checks"
  fi
  if [ "${enable_boot}" -eq 1 ]; then
    echo "  boot: vcg-console.target enabled; multi-user.target default"
  else
    echo "  boot: units installed but not enabled"
  fi
}

if [ "${dry_run}" -eq 1 ]; then
  print_plan
  dry_run_group="${console_user}"
  dry_run_home="/home/${console_user}"
  if command -v getent >/dev/null 2>&1 && command -v id >/dev/null 2>&1 && \
    getent passwd "${console_user}" >/dev/null 2>&1; then
    dry_run_group="$(id -gn "${console_user}")"
    dry_run_home="$(getent passwd "${console_user}" | cut -d: -f6)"
  fi
  installer_args=(
    --dry-run
    --user "${console_user}"
    --group "${dry_run_group}"
    --home "${dry_run_home}"
    --repo-root "${repo_root}"
    --node "${node_install_root}/bin/node"
    --browser /usr/bin/chromium
    --cage /usr/bin/cage
    --host "${repo_root}/target/release/vcg-host"
  )
  bash "${repo_root}/scripts/pi/install-appliance.sh" "${installer_args[@]}"
  echo "Dry run complete; no operating-system or repository state was changed."
  exit 0
fi

if [ "${EUID}" -eq 0 ]; then
  echo "Do not run this setup command as root. Run it as ${console_user}; it invokes sudo where required." >&2
  exit 1
fi
if [ "$(id -un)" != "${console_user}" ]; then
  echo "The current account must match --user so build outputs stay owned by the TV-session account." >&2
  exit 1
fi
if [ "$(uname -s)" != "Linux" ] || [ "$(uname -m)" != "aarch64" ]; then
  echo "This setup path requires 64-bit Raspberry Pi Linux (aarch64)." >&2
  exit 1
fi
if [ ! -r /proc/device-tree/model ] || ! tr -d '\0' </proc/device-tree/model | grep -qi 'Raspberry Pi'; then
  echo "This machine does not identify itself as Raspberry Pi hardware." >&2
  exit 1
fi
if [ ! -r /etc/os-release ]; then
  echo "Could not identify Raspberry Pi OS from /etc/os-release." >&2
  exit 1
fi
# shellcheck disable=SC1091
. /etc/os-release
if [ "${VERSION_CODENAME:-}" != "trixie" ]; then
  echo "This setup is pinned to Raspberry Pi OS Trixie; found ${VERSION_CODENAME:-unknown}." >&2
  exit 1
fi
if ! command -v sudo >/dev/null 2>&1 || ! command -v apt-get >/dev/null 2>&1; then
  echo "Raspberry Pi OS sudo and apt-get are required." >&2
  exit 1
fi

print_plan
sudo -v

echo
echo "== Raspberry Pi OS prerequisites =="
if [ "${apt_update}" -eq 1 ]; then
  sudo apt-get update
fi
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y "${apt_packages[@]}"

echo
echo "== pinned Node.js runtime =="
if [ -e "${node_install_root}" ]; then
  if [ ! -x "${node_install_root}/bin/node" ] || \
    [ "$("${node_install_root}/bin/node" --version)" != "v${node_version}" ] || \
    [ "$(stat -c '%U:%G' "${node_install_root}")" != "root:root" ]; then
    echo "Refusing to overwrite unexpected content at ${node_install_root}." >&2
    exit 1
  fi
  echo "verified existing Node.js v${node_version}"
else
  scratch="$(mktemp -d "${TMPDIR:-/tmp}/vcg-node.XXXXXX")"
  cleanup() {
    case "${scratch}" in
      "${TMPDIR:-/tmp}"/vcg-node.*) rm -rf "${scratch}" ;;
    esac
  }
  trap cleanup EXIT
  curl --fail --location --proto '=https' --tlsv1.2 \
    --output "${scratch}/${node_archive}" "${node_url}"
  printf '%s  %s\n' "${node_sha256}" "${scratch}/${node_archive}" | sha256sum --check -
  tar -xJf "${scratch}/${node_archive}" -C "${scratch}"
  if [ "$("${scratch}/node-v${node_version}-linux-arm64/bin/node" --version)" != "v${node_version}" ]; then
    echo "The extracted Node.js runtime did not report the pinned version." >&2
    exit 1
  fi
  sudo install -d -m 0755 /opt/vcg
  node_staging="${node_install_root}.staging"
  expected_node_staging="/opt/vcg/node-v${node_version}-linux-arm64.staging"
  if [ "${node_staging}" != "${expected_node_staging}" ]; then
    echo "Refusing an unsafe Node.js staging path: ${node_staging}" >&2
    exit 1
  fi
  # A prior interrupted copy is never executable product state. Remove only
  # this exact VCG-owned sibling before rebuilding it from the verified archive.
  sudo rm -rf -- "${node_staging}"
  sudo cp -a --no-preserve=ownership \
    "${scratch}/node-v${node_version}-linux-arm64" "${node_staging}"
  sudo mv -T -- "${node_staging}" "${node_install_root}"
  trap - EXIT
  cleanup
  echo "installed Node.js v${node_version} at ${node_install_root}"
fi

node_bin_dir="${node_install_root}/bin"
node_path="${node_bin_dir}/node"
npm_path="${node_bin_dir}/npm"
pnpm_path="${node_bin_dir}/pnpm"
if [ ! -x "${npm_path}" ]; then
  echo "The pinned Node.js archive does not contain npm." >&2
  exit 1
fi
if [ ! -x "${pnpm_path}" ] || [ "$(env PATH="${node_bin_dir}:${PATH}" "${pnpm_path}" --version)" != "${pnpm_version}" ]; then
  pnpm_scratch="$(mktemp -d "${TMPDIR:-/tmp}/vcg-pnpm.XXXXXX")"
  cleanup_pnpm() {
    case "${pnpm_scratch}" in
      "${TMPDIR:-/tmp}"/vcg-pnpm.*) rm -rf "${pnpm_scratch}" ;;
    esac
  }
  trap cleanup_pnpm EXIT
  curl --fail --location --proto '=https' --tlsv1.2 \
    --output "${pnpm_scratch}/${pnpm_archive}" "${pnpm_url}"
  if [ "$(wc -c <"${pnpm_scratch}/${pnpm_archive}")" != "${pnpm_bytes}" ]; then
    echo "The pnpm archive byte length does not match the pinned release." >&2
    exit 1
  fi
  printf '%s  %s\n' "${pnpm_sha512}" "${pnpm_scratch}/${pnpm_archive}" | sha512sum --check -
  sudo env PATH="${node_bin_dir}:${PATH}" \
    "${npm_path}" install --global --ignore-scripts --prefix "${node_install_root}" \
    "${pnpm_scratch}/${pnpm_archive}"
  trap - EXIT
  cleanup_pnpm
fi
if [ "$(env PATH="${node_bin_dir}:${PATH}" "${pnpm_path}" --version)" != "${pnpm_version}" ]; then
  echo "The isolated pnpm runtime does not match ${pnpm_version}." >&2
  exit 1
fi
echo "verified pnpm ${pnpm_version}"

echo
echo "== pinned Rust toolchain =="
rustup set profile minimal
rustup toolchain install "${rust_toolchain}" --component clippy --component rustfmt

echo
echo "== application build and verification =="
bootstrap_args=(--no-install-instructions)
if [ "${full_verify}" -eq 1 ]; then
  bootstrap_args+=(--full-verify)
fi
env PATH="${node_bin_dir}:${PATH}" \
  bash "${repo_root}/scripts/pi/bootstrap.sh" "${bootstrap_args[@]}"

echo
echo "== boot-owned TV appliance =="
browser_path="$(command -v chromium || command -v chromium-browser || true)"
cage_path="$(command -v cage || true)"
installer_args=(
  --user "${console_user}"
  --repo-root "${repo_root}"
  --node "${node_path}"
  --browser "${browser_path}"
  --cage "${cage_path}"
  --host "${repo_root}/target/release/vcg-host"
)
if [ "${enable_boot}" -ne 1 ]; then
  installer_args+=(--no-enable)
fi
sudo env PATH="${node_bin_dir}:${PATH}" \
  bash "${repo_root}/scripts/pi/install-appliance.sh" "${installer_args[@]}"

echo
echo "VCG Console setup completed successfully."
if [ "${enable_boot}" -eq 1 ]; then
  echo "The next boot enters the fullscreen console instead of the desktop."
fi
if [ "${reboot_after}" -eq 1 ]; then
  sudo systemctl reboot
else
  echo "Reboot when ready: sudo systemctl reboot"
fi
