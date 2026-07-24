# Owner questions from the native-host API tranche

Last updated: 2026-07-23

No owner decision blocks the next safe implementation step. The current channel exposes read-only status, and the conservative default is for the Rust host—not the Svelte launcher—to resolve every trusted package, path, hash, permission, and adapter.

Two choices can wait until the privileged launch path and target-Linux shell are testable:

1. Should the connected native host have a persistent minimal indicator in normal family-mode settings, or remain visible only inside launch details and diagnostics? The current default keeps it out of the primary launcher hierarchy unless a fault needs explanation.
2. Should the production shell retain authenticated loopback HTTP, or should target qualification compare it with a custom webview/native-messaging transport? The current implementation keeps loopback HTTP as the reversible baseline while preserving protocol versioning and per-launch authority.

Neither answer should authorize browser-provided executable paths, shell commands, hashes, writable roots, or unsigned manifests. Those remain host-owned trust decisions regardless of transport.
