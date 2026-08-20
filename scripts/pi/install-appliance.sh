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
console_uid=""
browser_path=""
cage_path=""
host_path=""
node_path=""
bluetoothctl_path=""
cursor_nudge_path=""
retro_requested=0
retro_root=""
retro_install_root=""
retro_library_root=""
retro_content_root=""
retro_channel=""
retro_profile_registry=""
trusted_time_launcher=""
launcher_url="http://127.0.0.1:4173/"

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
  --node PATH          Node.js 22+ executable (auto-detected)
  --bluetoothctl PATH  BlueZ control executable (auto-detected)
  --cursor-nudge PATH  release vcg-cursor-nudge executable (auto-detected)
  --no-enable          install units without changing the default boot target
  --dry-run            render units without changing the operating system
  --output-dir PATH    keep rendered dry-run units in PATH

Retro options. Without any of them the session starts exactly as before, with
no catalog and no library. Supplying any one of them requires --retro-channel
and every named path to exist already.
  --retro-channel NAME       update channel the accepted update root authorizes
  --retro-root PATH          provisioned catalog and trust root
                             (default: HOME/.local/share/vcg)
  --retro-install-root PATH  installed package root
                             (default: RETRO-ROOT/packages)
  --retro-library-root PATH  provisioned retro library root
                             (default: RETRO-ROOT)
  --retro-content-root PATH  content root for packages carrying managed content
  --retro-profile-registry PATH
                             launch profile registry; without it the console
                             browses the catalog and library but launches
                             nothing
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
    --user|--group|--home|--repo-root|--browser|--cage|--host|--node|--bluetoothctl|--cursor-nudge|--output-dir|\
    --retro-root|--retro-install-root|--retro-library-root|--retro-content-root|--retro-channel|\
    --retro-profile-registry)
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
        --node) node_path="${value}" ;;
        --bluetoothctl) bluetoothctl_path="${value}" ;;
        --cursor-nudge) cursor_nudge_path="${value}" ;;
        --output-dir) output_dir="${value}" ;;
        --retro-root) retro_root="${value}"; retro_requested=1 ;;
        --retro-install-root) retro_install_root="${value}"; retro_requested=1 ;;
        --retro-library-root) retro_library_root="${value}"; retro_requested=1 ;;
        --retro-content-root) retro_content_root="${value}"; retro_requested=1 ;;
        --retro-channel) retro_channel="${value}"; retro_requested=1 ;;
        --retro-profile-registry) retro_profile_registry="${value}"; retro_requested=1 ;;
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
cursor_nudge_path="${cursor_nudge_path:-${repo_root}/target/release/vcg-cursor-nudge}"

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
# console_home and console_uid both come from the same passwd record, so
# resolve them from one `getent passwd` call rather than two separate lookups
# (console_uid used to run its own `id -u`). Home may already be set via
# --home; UID has no such flag, so it's always empty here.
#
# The UID matters beyond templating: systemd's %U specifier is documented to
# expand to the unit's configured User=, but was observed live on the Pi 5
# resolving to 0 (root) for PAMName=login's mount-namespace setup phase in
# this systemd version, failing ReadWritePaths=.../run/user/%U with "No such
# file or directory". Resolving the numeric UID here and templating it
# directly sidesteps the specifier entirely.
if [ -z "${console_home}" ] || [ -z "${console_uid:-}" ]; then
  if command -v getent >/dev/null 2>&1 && passwd_record="$(getent passwd "${console_user}")"; then
    [ -n "${console_home}" ] || console_home="$(printf '%s' "${passwd_record}" | cut -d: -f6)"
    [ -n "${console_uid:-}" ] || console_uid="$(printf '%s' "${passwd_record}" | cut -d: -f3)"
  elif [ "${dry_run}" -eq 1 ]; then
    [ -n "${console_home}" ] || console_home="/home/${console_user}"
    [ -n "${console_uid:-}" ] || console_uid="1000"
  else
    echo "Could not determine the home directory or numeric UID; pass --home." >&2
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
if [ -z "${node_path}" ]; then
  node_path="$(find_command_path node || true)"
fi
if [ -z "${bluetoothctl_path}" ]; then
  bluetoothctl_path="$(find_command_path bluetoothctl || true)"
  if [ -z "${bluetoothctl_path}" ] && [ "${dry_run}" -eq 1 ]; then
    bluetoothctl_path="/usr/bin/bluetoothctl"
  fi
fi
if [ -z "${browser_path}" ]; then
  echo "Chromium was not found. Install the Raspberry Pi OS chromium package or pass --browser." >&2
  exit 1
fi
if [ -z "${cage_path}" ]; then
  echo "Cage was not found. Install the Raspberry Pi OS cage package or pass --cage." >&2
  exit 1
fi
if [ -z "${node_path}" ]; then
  echo "Node.js was not found. Run scripts/pi/setup-console.sh or pass --node." >&2
  exit 1
fi
if [ -z "${bluetoothctl_path}" ]; then
  echo "Bluetooth support is missing. Install the Raspberry Pi OS bluez package or pass --bluetoothctl." >&2
  exit 1
fi
node_bin_dir="$(dirname "${node_path}")"

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
validate_absolute_path "Node.js" "${node_path}"
validate_absolute_path "Node.js directory" "${node_bin_dir}"
validate_absolute_path "bluetoothctl" "${bluetoothctl_path}"
validate_absolute_path "cursor-nudge" "${cursor_nudge_path}"

# The launcher invocation is composed here rather than templated argument by
# argument, because the catalog, update trust, and retro library are optional
# and because the trusted-time snapshot has to be resolved at start. With no
# --retro- option this is byte for byte the metadata-only command this
# installer has always rendered.
launcher_command="${host_path} launcher --browser ${browser_path}"
launcher_command="${launcher_command} --bluetoothctl ${bluetoothctl_path}"
launcher_command="${launcher_command} --cursor-nudge ${cursor_nudge_path}"
launcher_command="${launcher_command} --profile-dir /var/lib/vcg-console/browser-profile"
launcher_command="${launcher_command} --url ${launcher_url}"

require_retro_directory() {
  retro_path_name="$1"
  retro_path_value="$2"
  validate_absolute_path "retro ${retro_path_name}" "${retro_path_value}"
  if [ ! -d "${retro_path_value}" ]; then
    echo "Retro ${retro_path_name} is not a directory: ${retro_path_value}" >&2
    echo "Provision it with vcg-retro-provision, or install without the --retro- options." >&2
    exit 1
  fi
}

require_retro_file() {
  retro_path_name="$1"
  retro_path_value="$2"
  validate_absolute_path "retro ${retro_path_name}" "${retro_path_value}"
  if [ ! -f "${retro_path_value}" ]; then
    echo "Retro ${retro_path_name} is not a file: ${retro_path_value}" >&2
    echo "Provision it with vcg-retro-provision, or install without the --retro- options." >&2
    exit 1
  fi
}

if [ "${retro_requested}" -eq 1 ]; then
  if [ -z "${retro_channel}" ]; then
    echo "Retro configuration requires --retro-channel." >&2
    exit 1
  fi
  case "${retro_channel}" in
    *[!a-zA-Z0-9_.-]*)
      echo "Retro channel contains characters that are unsafe in a systemd unit: ${retro_channel}" >&2
      exit 1
      ;;
  esac

  retro_root="${retro_root:-${console_home}/.local/share/vcg}"
  retro_install_root="${retro_install_root:-${retro_root}/packages}"
  retro_library_root="${retro_library_root:-${retro_root}}"
  trusted_time_launcher="${repo_root}/scripts/pi/start-launcher-with-trusted-time.sh"

  # Saves, states, and the replay journal go inside the unit's own
  # RuntimeDirectory and StateDirectory, which ProtectSystem=strict already
  # leaves writable, so configuring retro adds no writable path to the sandbox
  # and the provisioned root stays read-only to the running session.
  retro_runtime_root="/run/vcg-console/retro"
  retro_data_root="/var/lib/vcg-console/data/retro"
  retro_replay_root="/var/lib/vcg-console/data/launch-replay"

  require_retro_directory "root" "${retro_root}"
  require_retro_file "catalog" "${retro_root}/installed-catalog.json"
  require_retro_file "catalog signature" "${retro_root}/installed-catalog.sig"
  require_retro_directory "install root" "${retro_install_root}"
  require_retro_directory "accepted root store" "${retro_root}/trust/accepted-roots"
  require_retro_file "root anchor set" "${retro_root}/trust/anchors.json"
  require_retro_file "protected state" "${retro_root}/trust/protected-state.json"
  require_retro_directory "library root" "${retro_library_root}"
  require_retro_directory "library generation store" "${retro_library_root}/retro/libraries"
  require_retro_file "library import lock" \
    "${retro_library_root}/staging/retro-imports/retro-import.lock"

  launcher_command="${trusted_time_launcher} ${launcher_command}"
  launcher_command="${launcher_command} --catalog ${retro_root}/installed-catalog.json"
  launcher_command="${launcher_command} --catalog-signature ${retro_root}/installed-catalog.sig"
  launcher_command="${launcher_command} --install-root ${retro_install_root}"
  launcher_command="${launcher_command} --update-root-store ${retro_root}/trust/accepted-roots"
  launcher_command="${launcher_command} --update-root-anchors ${retro_root}/trust/anchors.json"
  launcher_command="${launcher_command} --update-root-protected-state ${retro_root}/trust/protected-state.json"
  launcher_command="${launcher_command} --update-channel ${retro_channel}"
  launcher_command="${launcher_command} --runtime-root ${retro_runtime_root}"
  launcher_command="${launcher_command} --data-root ${retro_data_root}"
  if [ -n "${retro_content_root}" ]; then
    require_retro_directory "content root" "${retro_content_root}"
    launcher_command="${launcher_command} --content-root ${retro_content_root}"
  fi
  # A launch profile source is what makes the catalog and the library
  # launchable; the launcher then requires the durable replay journal too.
  if [ -n "${retro_profile_registry}" ]; then
    validate_absolute_path "retro profile registry" "${retro_profile_registry}"
    if [ ! -f "${retro_profile_registry}" ]; then
      echo "Retro profile registry is not a file: ${retro_profile_registry}" >&2
      echo "Write the registry documented in docs/PROFILE_REGISTRY.md, or install without --retro-profile-registry." >&2
      exit 1
    fi
    launcher_command="${launcher_command} --profile-registry ${retro_profile_registry}"
    launcher_command="${launcher_command} --launch-replay-root ${retro_replay_root}"
  fi
  launcher_command="${launcher_command} --retro-library-root ${retro_library_root}"
fi

if [ "${dry_run}" -eq 0 ]; then
  if ! systemctl cat bluetooth.service >/dev/null 2>&1; then
    echo "The bluetooth.service systemd unit is missing. Install the Raspberry Pi OS bluez package first." >&2
    exit 1
  fi
  for executable in "${browser_path}" "${cage_path}" "${host_path}" "${node_path}" "${bluetoothctl_path}" \
    "${cursor_nudge_path}" \
    "${repo_root}/apps/console-lab/node_modules/.bin/vite" \
    "${repo_root}/node_modules/.bin/tsx" \
    "${repo_root}/scripts/pi/wait-for-console.sh"; do
    if [ ! -x "${executable}" ]; then
      echo "Required executable is missing: ${executable}" >&2
      exit 1
    fi
  done
  if [ "${retro_requested}" -eq 1 ] && [ ! -x "${trusted_time_launcher}" ]; then
    echo "Required executable is missing: ${trusted_time_launcher}" >&2
    exit 1
  fi
  node_major="$("${node_path}" -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  case "${node_major}" in
    ""|*[!0-9]*)
      echo "Node.js 22 or newer is required; the selected executable returned an invalid version." >&2
      exit 1
      ;;
  esac
  if [ "${node_major}" -lt 22 ]; then
    echo "Node.js 22 or newer is required; found $("${node_path}" --version)." >&2
    exit 1
  fi
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
  content="${content//@CONSOLE_UID@/${console_uid}}"
  content="${content//@REPO_ROOT@/${repo_root}}"
  content="${content//@CAGE_PATH@/${cage_path}}"
  content="${content//@NODE_BIN_DIR@/${node_bin_dir}}"
  content="${content//@LAUNCHER_COMMAND@/${launcher_command}}"
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

if [ "${retro_requested}" -eq 1 ]; then
  echo "Catalog and trust root: ${retro_root}"
  echo "Retro library root: ${retro_library_root}"
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
for group in video render input bluetooth; do
  if getent group "${group}" >/dev/null; then
    device_groups="${device_groups}${device_groups:+,}${group}"
  fi
done
if [ -n "${device_groups}" ]; then
  usermod -a -G "${device_groups}" "${console_user}"
fi

# The Cage session has no pointer, so Chromium's camera permission prompt can
# never be answered and getUserMedia stays pending forever ("Waiting for
# camera permission"). This managed policy pre-grants video capture to the
# exact launcher origin and keeps audio capture disabled at the browser
# boundary (D-046). Both Debian policy directories are covered because the
# browser may be packaged as chromium or chromium-browser; a policy directory
# for an absent package is inert.
for policy_dir in /etc/chromium/policies/managed /etc/chromium-browser/policies/managed; do
  install -D -m 0644 "${repo_root}/scripts/pi/chromium-policies/vcg-console.json" \
    "${policy_dir}/vcg-console.json"
done

# vcg-cursor-nudge's one-shot synthetic pointer nudge
# (native/vcg-cursor-nudge/src/main.rs) needs write access to /dev/uinput and
# the uinput module loaded. Reload udev's rules before loading the module so
# the module's own "add" uevent is judged against the new rule, not a stale
# cached one.
install -m 0644 "${repo_root}/scripts/pi/udev/99-vcg-console-uinput.rules" /etc/udev/rules.d/99-vcg-console-uinput.rules
install -m 0644 "${repo_root}/scripts/pi/modules-load.d/vcg-console-uinput.conf" /etc/modules-load.d/vcg-console-uinput.conf
udevadm control --reload-rules
modprobe uinput
udevadm trigger --name-match=uinput || true

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
