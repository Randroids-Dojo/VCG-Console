# Console operating modes

Status: fail-closed launcher policy, controller-operable desk prototype, and
native paired-workstation/session admission primitives implemented; privileged
authentication, encrypted transport, target key protection, listener, and
deployment remain native-service work.

## Purpose

The console separates player identity from administrative authority:

- a guest or local profile chooses where local progress belongs;
- family mode is the boot and reboot default;
- admin mode permits a bounded console-management flow only after local
  confirmation; and
- developer mode is a visibly exceptional, temporary state that additionally
  requires its own local confirmation before a future paired transport may be
  used.

Selecting, naming, or recreating a profile never grants admin or developer
authority. Hosted-game identity also grants no console authority.

## State contract

```text
boot / reboot / lock / identity change
                 |
                 v
            FAMILY MODE
                 |
       request admin access
                 v
       CONFIRM ADMIN (30 s)
          |             |
    cancel/expire     local confirm
          |             v
          +------> ADMIN MODE
                         |
              request developer mode
                         v
              CONFIRM DEVELOPER (30 s)
                   |             |
             cancel/expire     local confirm
                   |             v
                   +------> DEVELOPER MODE
                                  |
                         end developer mode
                                  v
                              ADMIN MODE
```

Every confirmation is a distinct one-shot step. An expired or cancelled step
grants nothing. Reboot, explicit lock, and identity change clear pending state
and return to family mode. Ending developer mode returns to admin mode, while
Lock returns directly to family mode.

The pure `ConsoleOperatingModeController` exposes three derived policy facts:

| Mode | Manage console | Begin workstation pairing | Use developer transport |
|---|---:|---:|---:|
| Family | No | No | No |
| Admin | Yes | No | No |
| Developer | Yes | Yes | Yes |

These facts are admission inputs, not proof that a transport exists. The
native host now has a separately tested strict protected-state workstation
registry, signed volatile session challenge, and closed developer-operation
capability. The current repository still has no pairing listener, encrypted
channel, platform key store, or deployment endpoint.

## Launcher prototype

The Developer settings panel replaces the prior unrestricted switch with:

1. an explicit family-mode status;
2. a first confirmation to preview admin mode;
3. a second confirmation with unsigned-code disclosure;
4. persistent visible developer-mode styling while active; and
5. End developer mode and Lock to family mode actions.

All actions are ordinary focusable buttons and use the launcher's existing
keyboard/controller navigation path. Each state transition moves focus to its
first safe action; controller Back cancels a pending confirmation without
leaving Settings. The panel truthfully says that the desk browser has no
administrator credential or native pairing service. It cannot open a listener,
pair a workstation, or deploy a build.

## Native authority required

The browser model is not a security boundary. Production must place these
operations behind a privileged native coordinator:

- authenticate or otherwise authorize the local administrator using the
  owner-selected credential/recovery policy;
- accept the confirmation only from the reserved local input path, not game or
  page script;
- bind confirmation to one operation and short monotonic deadline;
- create and protect console/workstation keys;
- open a listener only in visibly active developer mode;
- require authenticated encryption and console confirmation for pairing;
- scope deployment authority to the active paired session;
- log bounded redacted pairing, deployment, revocation, and failure events;
- close the listener and revoke active session capabilities on exit, reboot,
  service restart, profile change, or family lock; and
- keep unsigned developer packages in a distinct namespace and UI surface.

No browser flag, local storage value, query parameter, profile field, or
hosted-game response may enable the native transport.

The native admission primitive does not consume this browser state. Its
constructor is intentionally the future privileged adapter boundary and must
be reached only after authenticated reserved local input. See
`DEVELOPER_LAN_TRUST_AND_SESSION.md`.

Non-privileged accessibility preferences remain available in family mode and
before profile selection. Their bounded local prototype document changes only
shell presentation and cue preview; it cannot grant management/developer
authority, and posture/remap values are not yet connected to games or native
input.

## Automated evidence

Six unit tests cover:

- family-mode boot and reboot default;
- two distinct confirmations before developer authority;
- confirmation expiry;
- cancel, developer exit, and family lock;
- guest/local-profile non-authority and identity-change revocation; and
- malformed time and impossible-transition rejection.

One real-Chrome launcher flow enters Settings with family mode active, confirms
admin and developer states separately, verifies that pairing is unavailable,
then revokes elevation on profile change. A second synthetic standard-gamepad
flow uses only Select and Back after entering the panel: it cancels and retries
both confirmation stages, verifies transition focus, and reaches visible
developer mode.

## Remaining qualification

I-115 remains incomplete. Closure still requires the decisions in
`OWNER_QUESTIONS_CONSOLE_MODES_2026-07-24.md`, a privileged implementation,
native reserved-input evidence, controller-only cold-boot and recovery tests,
actual paired-LAN abuse tests under I-102, persistence/reboot policy tests,
family/admin settings review, accessibility review, and proof that hostile
browser/game code cannot synthesize confirmation or retain authority.
