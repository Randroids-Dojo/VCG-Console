#!/usr/bin/env bash
# Resolve the trusted-time snapshot the launcher's catalog configuration
# requires, then become the launcher. A systemd ExecStart= line cannot compute
# a value, so the appliance session runs this wrapper the way it already runs
# wait-for-console.sh from ExecStartPre=.
#
# When retro options are configured, the wrapper first pre-flights them with
# `vcg-host launcher --dry-run`, which verifies the signed catalog, every
# installed package artifact, the update trust material, and the retro library
# without mutating any of it. A deterministic failure there -- a substituted
# core, a moved trust file, an expired accepted root, pending root recovery --
# would otherwise fail the session at every start, and the session unit sets
# Restart=always with no start limit, so the television would show a
# three-second restart loop instead of the console. Falling back to the
# metadata-only flag set keeps the shell reachable with the retro lane
# disabled, and the pre-flight's own failure text goes to the journal so the
# downgrade is diagnosable with journalctl.

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <vcg-host-path> <launcher-argument>..." >&2
  exit 2
fi

host="$1"
shift

# This is the system clock, read once at start. It is not a protected time
# adapter and this wrapper does not make it one: a snapshot handed to the CLI
# cannot prove where it came from, which is the caveat the installed-catalog
# contract already records for --trusted-unix-seconds. A clock outside the
# accepted update root's validity window fails the pre-flight, which now
# disables the retro lane for the boot instead of failing the session closed.
trusted_unix_seconds="$(date +%s)"
case "${trusted_unix_seconds}" in
  ""|*[!0-9]*)
    echo "The system clock did not report whole seconds: ${trusted_unix_seconds}" >&2
    exit 1
    ;;
esac

# Split the rendered command into the flags that survive a fallback and the
# ones that do not. The dropped set is exactly the launcher's catalog option
# group (native/vcg-host/src/main.rs, parse_launcher_catalog_option): any one
# of them makes the launcher load the catalog, so a partial removal fails
# closed instead of starting metadata-only. --trusted-unix-seconds is in that
# group and is appended below rather than passed through, so the fallback
# never appends it. The value-taking options that survive are matched too, so
# a value that happens to spell a catalog option is not mistaken for one.
retro_configured=0
metadata_only=()
pending=""
for argument in "$@"; do
  case "${pending}" in
    keep)
      metadata_only+=("${argument}")
      pending=""
      continue
      ;;
    drop)
      pending=""
      continue
      ;;
  esac
  case "${argument}" in
    --browser|--bluetoothctl|--cursor-nudge|--profile-dir|--url)
      metadata_only+=("${argument}")
      pending="keep"
      ;;
    --catalog|--catalog-signature|--package-store-root|--package-protected-state|\
    --install-root|--content-root|--runtime-root|--data-root|--launch-replay-root|\
    --retro-library-root|--profile-registry|--profile-id|--watchdog-game-id|\
    --update-root-store|--update-root-anchors|--update-root-protected-state|\
    --update-channel|--trusted-unix-seconds)
      retro_configured=1
      pending="drop"
      ;;
    *)
      metadata_only+=("${argument}")
      ;;
  esac
done

# A command with no retro options never runs the pre-flight and never prints
# anything, so a metadata-only console starts exactly as it did before.
if [ "${retro_configured}" -eq 1 ]; then
  preflight_command=("${host}" "$@" --dry-run --trusted-unix-seconds "${trusted_unix_seconds}")
  if ! preflight_output="$("${preflight_command[@]}" 2>&1)"; then
    echo "Retro pre-flight failed; the retro lane is disabled for this boot:" >&2
    printf '%s\n' "${preflight_output}" >&2
    echo "Repair the material with vcg-retro-provision and reboot, or reinstall without the --retro- options." >&2
    exec "${host}" "${metadata_only[@]}"
  fi
fi

# exec in both paths, so systemd supervises the launcher itself rather than
# this wrapper.
exec "${host}" "$@" --trusted-unix-seconds "${trusted_unix_seconds}"
