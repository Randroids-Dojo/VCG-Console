# Historical source editions

`legacy-measured-source-snapshot-v1.json` preserves the exact normalized source
bytes named by the listed browser/process reports and historical payload
scorecard. Each byte sequence was
recovered from the recorded Git commit and verified against the report's existing
SHA-256 before archival. Retrieval from that commit does not claim the experiments
ran on that commit or on the retrieval date.

The reports retain their original dates, environments, measurements and source
identities. Their current validators check the archived bytes and still enforce
the original acceptance rules. A change to today's validator or browser tooling
therefore does not relabel an old observation as a fresh run. Future measurements
need a new evidence edition and actual execution; these snapshots are data, never
executed tooling.

The Python performance reports similarly bind to `../pose-backends/2026-07-24-source/`.
Current launcher captures use the actual environment and recorded data baseline
described in `../../docs/DEVELOPMENT.md`.
