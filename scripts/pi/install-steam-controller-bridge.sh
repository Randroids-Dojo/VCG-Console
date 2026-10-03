#!/usr/bin/env bash
# Install a reviewed, prebuilt ARM64 Steam Controller (2026) bridge on the Pi.
# Source: benashby/steam-puck-bridge@fe319f2a53496ab729d8b09aa395c921e402e416 (MIT).
# Usage: sudo bash install-steam-controller-bridge.sh STAGING_DIRECTORY CONSOLE_USER
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Administrator authentication is required.' >&2; exit 1; }
stage=$(realpath "${1:?staging directory required}")
console_user=${2:?console user required}
console_uid=$(id -u "$console_user")
console_home=$(getent passwd "$console_user" | cut -d: -f6)
[[ $(uname -m) == aarch64 && -d "$console_home" ]] || exit 1
id -nG "$console_user" | tr ' ' '\n' | grep -qx input
# Refuse before installing files if this login has no usable user manager.
runuser -u "$console_user" -- env XDG_RUNTIME_DIR="/run/user/$console_uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$console_uid/bus" systemctl --user show-environment >/dev/null
cd "$stage"
# These hashes bind this installer to the source and ARM64 build reviewed for this Pi.
echo '839422660ece24d7f57b106ff918e5670991c7204d33d5828dc86e2a3d8f7a11  steam-puck-bridge' | sha256sum -c -
echo 'bdf8e672820bad414b81707c0db06625252dfdca148fddebe6a5ea8f2aabf68e  steam-puck-bridge.c' | sha256sum -c -
test -f LICENSE
test -f THIRD-PARTY-NOTICES.md
backup=$(mktemp -d /var/backups/vcg-steam-controller.XXXXXX)
unit="$console_home/.config/systemd/user/vcg-steam-controller.service"
rules=/etc/udev/rules.d/60-vcg-steam-controller.rules
for existing in /usr/local/bin/vcg-steam-controller "$rules" "$unit"; do
  if [[ -e "$existing" ]]; then cp --parents -a "$existing" "$backup"; fi
done
install -m755 steam-puck-bridge /usr/local/bin/vcg-steam-controller
install -d /usr/local/share/vcg-steam-controller
install -m644 steam-puck-bridge.c LICENSE THIRD-PARTY-NOTICES.md /usr/local/share/vcg-steam-controller/
cat > "$rules" <<'RULES'
# Valve Steam Controller 2026 only; existing console input group, no world access.
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="28de", ATTRS{idProduct}=="130[2345]", GROUP="input", MODE="0660"
# Bluetooth Triton has no USB idVendor/idProduct attributes.
KERNEL=="hidraw*", SUBSYSTEM=="hidraw", KERNELS=="0005:28DE:1303.*", GROUP="input", MODE="0660"
KERNEL=="uinput", SUBSYSTEM=="misc", GROUP="input", MODE="0660", OPTIONS+="static_node=uinput"
RULES
install -d -o "$console_user" -g "$(id -gn "$console_user")" "$(dirname "$unit")"
cat > "$unit" <<'UNIT'
[Unit]
Description=VCG Steam Controller 2026 gamepad bridge
Documentation=https://github.com/benashby/steam-puck-bridge/tree/fe319f2a53496ab729d8b09aa395c921e402e416
[Service]
ExecStart=/usr/local/bin/vcg-steam-controller
Restart=on-failure
RestartSec=2
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
MemoryDenyWriteExecute=yes
LockPersonality=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
[Install]
WantedBy=default.target
UNIT
chown "$console_user:$(id -gn "$console_user")" "$unit"
udevadm control --reload-rules
udevadm trigger --action=change --subsystem-match=hidraw
udevadm trigger --action=change --subsystem-match=misc --sysname-match=uinput
udevadm settle
runuser -u "$console_user" -- env XDG_RUNTIME_DIR="/run/user/$console_uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$console_uid/bus" systemctl --user daemon-reload
runuser -u "$console_user" -- env XDG_RUNTIME_DIR="/run/user/$console_uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$console_uid/bus" systemctl --user enable vcg-steam-controller.service
runuser -u "$console_user" -- env XDG_RUNTIME_DIR="/run/user/$console_uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$console_uid/bus" systemctl --user restart vcg-steam-controller.service
echo "Controller bridge installed. Previous files preserved at $backup"
