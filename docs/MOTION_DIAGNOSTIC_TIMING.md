# Motion diagnostic timing boundaries

The console lab displays timing for diagnosis, not camera-to-action
qualification. Its label is derived from each Motion frame's
`capabilities.timestampQuality` value so unlike boundaries are not collapsed
into a generic pipeline number.

| Timestamp quality | Displayed boundary | What the number includes | What it does not prove |
| --- | --- | --- | --- |
| `camera-exposure` | `EXPOSURE TO FRAME P95` | Declared camera exposure time through Motion frame publication | Recognized-action receipt at the game API, clock qualification, or the 120 ms product gate |
| `capture-arrival` | `ARRIVAL TO FRAME P95` | Browser capture arrival through Motion frame publication | Camera exposure, capture transport, or exposure-to-action latency |
| `replay` | `REPLAY TO FRAME P95` | Replay source time through Motion frame publication | Live-camera latency or exposure-to-action latency |

The accumulator keeps at most 600 valid samples. A timestamp-quality change
starts a fresh source-timing window rather than mixing incomparable
boundaries. Inference duration remains a separate diagnostic.

Negative source-to-publication or inference durations are excluded and
reported as invalid timestamp-order samples. The UI displays `-- MS` when no
valid sample exists; it does not turn missing or invalid evidence into a
zero-duration result.

The qualification boundary remains the one fixed by D-110 and
`PROTOTYPE_SUCCESS_CRITERIA.md`: trustworthy camera exposure through
recognized-action receipt at the game API under representative concurrent
load, with the full distribution published. The console-lab number is not a
substitute for that campaign even when the producer declares
`camera-exposure`.

There are no new owner choices in this tranche. The behavior follows the
existing product decision and defaults to the narrower, observable claim.
