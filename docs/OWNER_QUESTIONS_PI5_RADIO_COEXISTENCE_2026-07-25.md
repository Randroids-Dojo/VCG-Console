# Owner questions: Pi Wi-Fi and Bluetooth coexistence

Date: 2026-07-25

Status: non-blocking for plan validation; blocking for I-026 execution

## PRADIO-001: exact radios and regulatory configuration

Which received Pi revision, radio firmware/driver, regulatory domain, access
point, 2.4/5 GHz channels and widths, controller models/transports and antenna/
closed-enclosure geometry form the supported matrix? Freeze them without
retaining MAC, BSSID, SSID, serial or raw descriptor identifiers.

## PRADIO-002: network path and permitted traffic

Which local server/path and bounded payload may establish download, upload,
jitter and loss, and which non-destructive hosted/update activity is permitted?
Define data volume, rate, cost, credentials, cleanup and prohibited payloads.

## PRADIO-003: pre-result gates and instrumentation

What packet loss, RTT/jitter, throughput, controller p95, reconnect,
reassociation, camera/pose drop, pose/game FPS, temperature and wall-power
limits apply? Bind calibrated input stimulus, packet/network clocks, RF survey,
camera exposure clock and uncertainty before results are visible.

## PRADIO-004: radio-fault authority and recovery

Who may inject Wi-Fi/Bluetooth loss, by what mechanism, and which fresh link,
controller epoch, camera stream, tracker instance and game state prove safe
recovery? The plan grants no network, hosted-service or radio-fault authority.
