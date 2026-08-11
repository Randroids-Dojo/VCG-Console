#!/usr/bin/env bash
# Install the VCG Console as the Raspberry Pi's boot-owned TV appliance.

set -euo pipefail

dry_run=0
enable_boot=1
output_dir=""
repo_root="$(pwd -P)"
console_user="${SUDO_USER:-${USER:-}}"
console_group=""
console_home=""
browser_path=""
cage_path=""
host_path=""

usage() {
  cat <<'EOF'
usage: scripts/pi/install-appliance.sh [options]

Options:
  --user USER          non-root account that owns the TV session
  --group GROUP        primary group for that account
  --home PATH          home directory for that account
  --repo-root PATH     built VCG-Console checkout (default: current directory)
  --browser PATH       Chromium executable (auto-detected)
  --cage PATH          Cage executable (auto-detected)
  --host PATH          release vcg-host executable (auto-detected)
  --no-enable          install units without changing the default boot target
  --dry-run            render units without changing the operating system
  --output-dir PATH    keep rendered dry-run units in PATH
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
    --user|--group|--home|--repo-root|--browser|--cage|--host|--output-dir)
      require_value "$@"
      option="$1"
      value="$2"
      shift 2
      case "${option}" in
        --user) console_user="${value}" ;;
        --group) console_group="${value}" ;;
        --home) console_home="${value}" ;;
        --repo-root) repo_root="${value}" ;;
        --browser) browser_path="${value}" ;;
        --cage) cage_path="${value}" ;;
        --host) host_path="${value}" ;;
        --output-dir) output_dir="${value}" ;;
      esac
      ;;
    --no-enable) enable_boot=0; shift ;;
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
host_path="${host_path:-${repo_root}/target/release/vcg-host}"

if [ -z "${console_user}" ]; then
  echo "No console user was detected; pass --user." >&2
  exit 1
fi
if [ "${console_user}" = "root" ]; then
  echo "The fullscreen browser must not run as root; pass --user with a non-root account." >&2
  exit 1
fi
case "${console_user}" in
  *[!a-zA-Z0-9_.-]*)
    echo "Console user contains characters that are unsafe in a systemd unit: ${console_user}" >&2
    exit 1
    ;;
esac

if [ "${dry_run}" -eq 0 ]; then
  if [ "${EUID}" -ne 0 ]; then
    echo "Run this installer with sudo, or use --dry-run." >&2
    exit 1
  fi
  if ! id "${console_user}" >/dev/null 2>&1; then
    echo "Console user does not exist: ${console_user}" >&2
    exit 1
  fi
fi

if [ -z "${console_group}" ]; then
  if command -v id >/dev/null 2>&1 && id "${console_user}" >/dev/null 2>&1; then
    console_group="$(id -gn "${console_user}")"
  elif [ "${dry_run}" -eq 1 ]; then
    console_group="${console_user}"
  else
    echo "Could not determine the primary group; pass --group." >&2
    exit 1
  fi
fi
if [ -z "${console_home}" ]; then
  if command -v getent >/dev/null 2>&1 && getent passwd "${console_user}" >/dev/null; then
    console_home="$(getent passwd "${console_user}" | cut -d: -f6)"
  elif [ "${dry_run}" -eq 1 ]; then
    console_home="/home/${console_user}"
  else
    echo "Could not determine the home directory; pass --home." >&2
    exit 1
  fi
fi
case "${console_group}" in
  *[!a-zA-Z0-9_.-]*)
    echo "Console group contains characters that are unsafe in a systemd unit: ${console_group}" >&2
    exit 1
    ;;
esac

find_command_path() {
  for candidate in "$@"; do
    if command -v "${candidate}" >/dev/null 2>&1; then
      command -v "${candidate}"
      return 0
    fi
  done
  return 1
}

if [ -z "${browser_path}" ]; then
  browser_path="$(find_command_path chromium chromium-browser || true)"
fi
if [ -z "${cage_path}" ]; then
  cage_path="$(find_command_path cage || true)"
fi
if [ -z "${browser_path}" ]; then
  echo "Chromium was not found. Install the Raspberry Pi OS chromium package or pass --browser." >&2
  exit 1
fi
if [ -z "${cage_path}" ]; then
  echo "Cage was not found. Install the Raspberry Pi OS cage package or pass --cage." >&2
  exit 1
fi

validate_absolute_path() {
  name="$1"
  value="$2"
  case "${value}" in
    /*) ;;
    *) echo "${name} must be absolute: ${value}" >&2; exit 1 ;;
  esac
  case "${value}" in
    *[[:space:]%]*)
      echo "${name} cannot contain whitespace or % because it is embedded in a systemd unit: ${value}" >&2
      exit 1
      ;;
    *'$'*|*"'"*|*'"'*|*\\*)
      echo "${name} cannot contain $, quotes, or backslashes because it is embedded in a systemd unit: ${value}" >&2
      exit 1
      ;;
  esac
}

validate_absolute_path "repository root" "${repo_root}"
validate_absolute_path "console home" "${console_home}"
validate_absolute_path "browser" "${browser_path}"
validate_absolute_path "cage" "${cage_path}"
validate_absolute_path "native host" "${host_path}"

if [ "${dry_run}" -eq 0 ]; then
  if ! command -v bluetoothctl >/dev/null 2>&1; then
    echo "Bluetooth support is missing. Install the Raspberry Pi OS bluez package first." >&2
    exit 1
  fi
  if ! systemctl cat bluetooth.service >/dev/null 2>&1; then
    echo "The bluetooth.service systemd unit is missing. Install the Raspberry Pi OS bluez package first." >&2
    exit 1
  fi
  for executable in "${browser_path}" "${cage_path}" "${host_path}" \
    "${repo_root}/apps/console-lab/node_modules/.bin/vite" \
    "${repo_root}/node_modules/.bin/tsx" \
    "${repo_root}/scripts/pi/wait-for-console.sh"; do
    if [ ! -x "${executable}" ]; then
      echo "Required executable is missing: ${executable}" >&2
      exit 1
    fi
  done
  if [ ! -f "${repo_root}/apps/console-lab/dist/index.html" ]; then
    echo "The console is not built. Run scripts/pi/bootstrap.sh first." >&2
    exit 1
  fi
fi

cleanup_render=0
if [ -n "${output_dir}" ]; then
  if [ "${dry_run}" -ne 1 ]; then
    echo "--output-dir is only valid with --dry-run." >&2
    exit 2
  fi
  if [ -d "${output_dir}" ] && [ -n "$(find "${output_dir}" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
    echo "--output-dir must be empty: ${output_dir}" >&2
    exit 1
  fi
  mkdir -p "${output_dir}"
  render_dir="$(cd "${output_dir}" && pwd -P)"
else
  render_dir="$(mktemp -d "${TMPDIR:-/tmp}/vcg-appliance.XXXXXX")"
  cleanup_render=1
fi
cleanup() {
  if [ "${cleanup_render}" -eq 1 ]; then
    case "${render_dir}" in
      "${TMPDIR:-/tmp}"/vcg-appliance.*) rm -rf "${render_dir}" ;;
    esac
  fi
}
trap cleanup EXIT

render_unit() {
  template="$1"
  destination="$2"
  content="$(<"${template}")"
  content="${content//@CONSOLE_USER@/${console_user}}"
  content="${content//@CONSOLE_GROUP@/${console_group}}"
  content="${content//@CONSOLE_HOME@/${console_home}}"
  content="${content//@REPO_ROOT@/${repo_root}}"
  content="${content//@BROWSER_PATH@/${browser_path}}"
  content="${content//@CAGE_PATH@/${cage_path}}"
  content="${content//@HOST_PATH@/${host_path}}"
  printf '%s\n' "${content}" >"${destination}"
}

template_root="${repo_root}/scripts/pi/systemd"
for unit in vcg-console-server.service vcg-console-session.service vcg-console.target; do
  render_unit "${template_root}/${unit}.in" "${render_dir}/${unit}"
done

if grep -R -n '@[A-Z_]*@' "${render_dir}"; then
  echo "A systemd template placeholder was not resolved." >&2
  exit 1
fi

if [ "${dry_run}" -eq 1 ]; then
  echo "Rendered VCG Console appliance units successfully."
  if [ -n "${output_dir}" ]; then
    echo "Units: ${render_dir}"
  fi
  exit 0
fi

systemd-analyze verify "${render_dir}/vcg-console-server.service" \
  "${render_dir}/vcg-console-session.service" \
  "${render_dir}/vcg-console.target"

install -m 0644 "${render_dir}/vcg-console-server.service" /etc/systemd/system/vcg-console-server.service
install -m 0644 "${render_dir}/vcg-console-session.service" /etc/systemd/system/vcg-console-session.service
install -m 0644 "${render_dir}/vcg-console.target" /etc/systemd/system/vcg-console.target

# The browser and compositor need the device groups on the next login/boot.
device_groups=""
for group in video render input; do
  if getent group "${group}" >/dev/null; then
    device_groups="${device_groups}${device_groups:+,}${group}"
  fi
done
if [ -n "${device_groups}" ]; then
  usermod -a -G "${device_groups}" "${console_user}"
fi

systemctl daemon-reload

if [ "${enable_boot}" -eq 1 ]; then
  systemctl set-default multi-user.target
  systemctl enable bluetooth.service
  systemctl enable vcg-console.target
  echo "VCG Console and Bluetooth will start at the next boot; the desktop target will not be entered."
  echo "Reboot when ready: sudo systemctl reboot"
else
  echo "Units installed but not enabled. Enable with: sudo systemctl enable vcg-console.target"
fi

echo "Recovery: sudo systemctl disable --now vcg-console.target && sudo systemctl start getty@tty1.service"
