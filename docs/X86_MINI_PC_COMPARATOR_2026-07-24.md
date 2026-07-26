# Low-power x86 mini-PC comparator — 2026-07-24

Quote snapshot: 2026-07-24 08:56 PDT (`UTC-07:00`)

Currency and market: USD, manufacturer US storefronts

Investigation: I-020

Governing decisions: D-012, D-021, D-036, D-039, D-110, and D-111

## Result

No screened mini PC is ready to replace the selected Raspberry Pi reference or
to purchase for a benchmark.

- The only manufacturer-direct Ryzen candidate that could plausibly fit a
  complete $650 camera-equipped build, GMKtec's NucBox M5 Ultra, exposes a
  $279.99 page price while the selected option says barebone and the same page
  marks every RAM/storage and plug variant sold out or unavailable. Its
  specification table simultaneously says a 512GB SSD and Windows 11 Pro are
  present. That is not an exact purchasable configuration.
- A configured GMKtec NucBox K16 with Radeon 680M reaches $759.98 with the
  shared camera before tax or shipping.
- A configured Minisforum UM870 Slim with Radeon 780M reaches at least $816.99
  with the camera before tax, although the 32GB/512GB option is out of stock.
- A configured GMKtec NucBox K17 with Arc 130V graphics and an NPU reaches
  $729.98 with the camera before tax or shipping.

Vendor CPU, GPU, port, TDP, and acoustic claims do not prove VCG performance.
None of these systems has a project-owned 120 ms camera-to-action result,
whole-game workload trace, wall-power measurement, sound measurement, native
Linux driver report, accountless boot path, update/recovery result, or exact
delivered quote. I-020 remains open.

The current recommendation is unchanged: continue the $0 owned-x86 work, do
not buy a mini PC, and revisit this screen only when one exact available
configuration can be borrowed or quoted without displacing the hardware and
camera evidence gates.

## Comparison basis

The comparator uses the same finished shared-camera placeholder as the
Raspberry Pi BOM: Logitech Brio `960-001105` at $169.99. This holds the intended
UVC 1080p60 capture cost constant; it does not mean the Brio has passed I-177.
Power adapters, enclosures, cooling, and HDMI cables are included only when the
manufacturer's package list says so.

The $650 arithmetic below excludes no required mini-PC part. Shipping and tax
remain unknown because the purchase destination is unresolved. A candidate
that exceeds $650 before shipping and tax fails immediately.

## Direct-listing screen

| Candidate | Exact listed configuration | Direct price | With $169.99 camera | Pre-tax position versus $650 | Screening result |
|---|---|---:|---:|---:|---|
| [GMKtec NucBox M5 Ultra](https://www.gmktec.com/products/gmktec-nucbox-m5-ultra-amd-ryzen-7-7730u-mini-pc) | Page selection says barebone; model `NucBox M5 Ultra`, Ryzen 7 7730U, Radeon 8-CU iGPU, two DDR4 SO-DIMMs, two M.2 slots | $279.99 displayed | Not computable as a complete build | At most $200.02 remains for RAM, storage, all shipping, and all tax | **Budget lead only; quote invalid.** All variants are shown unavailable, and the page conflicts about included 512GB storage and Windows. |
| [GMKtec NucBox K16](https://www.gmktec.com/products/gmktec-k16-mini-pc-amd-ryzen-7-7735hs) | `NucBox K16`, Ryzen 7 7735HS, Radeon 680M, fixed 32GB LPDDR5-6400, 512GB SSD | $589.99 displayed | $759.98 | $109.98 over before shipping/tax | **Fails cap.** Page also marks listed variants unavailable. |
| [Minisforum UM870 Slim](https://store.minisforum.com/products/minisforum-um870-slim-mini-pc) | `UM870 Slim`, Ryzen 7 8745H, Radeon 780M, 32GB DDR5, 512GB SSD | $647.00; out of stock | $816.99 | $166.99 over before tax | **Fails cap and unavailable.** Manufacturer page displays free shipping but no destination tax. |
| [Minisforum UM870 Slim](https://store.minisforum.com/products/minisforum-um870-slim-mini-pc) | Same system, 32GB DDR5, 1TB SSD | $711.00 displayed | $880.99 | $230.99 over before tax | **Fails cap.** A larger SSD does not justify testing before the cheaper configuration. |
| [GMKtec NucBox K17](https://www.gmktec.com/products/gmktec-k17-mini-pc-intel-core-ultra-5-226v) | `NucBox K17`, Core Ultra 5 226V, Arc 130V, Intel AI Boost NPU, fixed 16GB LPDDR5X, 512GB SSD | $559.99 displayed | $729.98 | $79.98 over before shipping/tax | **Fails cap.** Page marks variants unavailable; NPU runtime and pose-model support are unproven. |

The M5 Ultra's displayed page arithmetic is deliberately not presented as a
complete BOM:

```text
650.00 cap
- 279.99 ambiguous barebone page price
- 169.99 shared camera
= 200.02 maximum for exact RAM + storage + shipping + tax
```

It would need an exact in-stock US variant, exact included RAM and SSD
manufacturer parts, and a destination-specific delivered quote. Treating the
page's generic “512GB pre-installed” specification as proof of contents would
repeat the revision ambiguity D-021 exists to prevent.

## Hardware capability screen

| Candidate | Vendor-stated compute boundary | Included interfaces/package | VCG-relevant concern |
|---|---|---|---|
| M5 Ultra | Ryzen 7 7730U, 8C/16T; 8-CU Radeon at up to 2GHz | Four USB-A, USB-C, HDMI 2.0, DP 1.4, dual 2.5GbE, Wi-Fi 6E, Bluetooth 5.2; power adapter, VESA bracket, HDMI cable | Lowest quoted compute cost but oldest GPU tier here, no stated NPU, contradictory configured contents, and no Linux or workload evidence. |
| K16 | Ryzen 7 7735HS, 8C/16T; Radeon 680M; 32GB fixed LPDDR5 | Manufacturer package list includes the power adapter and HDMI cable; no VESA mount is listed | More GPU headroom than M5, but fixed memory and price fail the cap before testing. |
| UM870 Slim | Ryzen 7 8745H, 8C/16T, up to 65W; Radeon 780M | USB4, two USB 3.2, two USB 2.0, HDMI 2.1, DP 1.4, 2.5GbE, Wi-Fi 6E, Bluetooth 5.2; adapter/cable, mount, HDMI cable | Modern RDNA 3 graphics and replaceable memory/storage, but configured variants fail the complete cap. Barebone economics require a separate exact RAM/SSD quote. |
| K17 | Core Ultra 5 226V, 8C/8T; Arc 130V; NPU; stated 20/25/35W CPU modes | USB4, four additional USB ports, two HDMI 2.1, 2.5GbE, Wi-Fi 6E, Bluetooth 5.2; 100W adapter, HDMI cable, VESA mount | Lowest stated CPU power envelope and an NPU, but 16GB is fixed, the complete price fails, and no supported VCG inference path is established. |

Manufacturer acoustics are screening claims only. Minisforum advertises the
UM870 Slim below 35dB in performance mode; the page does not provide the VCG
room, distance, ambient floor, meter, firmware, fan curve, or simultaneous
tracking/game workload needed to compare with D-108's 35dBA-at-1m gate.
GMKtec describes quiet cooling without publishing a comparable measured
condition for the screened models.

## Why specifications cannot select the mini PC

I-020 requires a whole-system result. CPU generation, iGPU name, NPU TOPS, and
vendor TDP do not answer:

- whether the exact camera enumerates at 1920×1080 and 60 FPS through the
  target native Linux stack;
- whether MediaPipe, ONNX Runtime, OpenVINO, Vulkan/ncnn, or another maintained
  backend supports the exact CPU/GPU/NPU without proprietary or update-fragile
  installation;
- camera-exposure-to-game-action p50/p95/p99 under a representative game;
- one-hour pose FPS, game FPS/frame pacing, drops, memory, swap, temperature,
  clocks, and recovery;
- idle and simultaneous-load wall watts at the included power adapter;
- dBA at one metre with ambient floor and tonal/vibration observations;
- Bluetooth/USB controller discovery, Home/Back ownership, hot-plug, and
  suspend/resume;
- accountless boot-to-VCG, updates, rollback, blank-drive recovery, and driver
  reinstallation;
- exact RAM, SSD, Wi-Fi, firmware, board revision, and power-adapter identity.

The current vendor pages also demonstrate why a checkout snapshot is necessary:
page-level prices can remain visible while the corresponding option is marked
unavailable, and generic specifications can describe a configured SKU while
the selector says barebone.

## Qualification protocol

Do not purchase all candidates. Borrow one exact unit, use a return-authorized
evaluation unit, or select one separately authorized candidate only after its
delivered quote is valid. Record:

1. Chassis label, board/BIOS/EC, CPU/GPU/NPU, RAM module, SSD/NVMe identity,
   Wi-Fi/Bluetooth module, Ethernet controller, USB controllers, and power
   adapter.
2. A pinned ordinary x86-64 Linux image, kernel/Mesa/firmware versions, Secure
   Boot state, installer/recovery media, and cold rebuild.
3. The same camera mode, room/replay input, tracker model, Motion API,
   obstacle sample, and compatibility games used by the Pi and owned-x86 lanes.
4. Exposure-to-action p50/p95/p99, false actions, dropped frames, pose/game
   FPS, frame pacing, CPU/GPU/NPU/RAM/swap, temperatures, clocks, and throttling.
5. Wall watts at off/idle/launcher/capture/tracking/game/simultaneous peak,
   energy for a standardized session, and power behavior after suspend/resume.
6. A-weighted sound at one metre, ambient floor, tonal character, vibration,
   fan oscillation, and the exact fan/performance mode.
7. Camera/controller hot-plug, network loss, tracker/game crash, sleep/wake,
   update interruption, full disk, sudden power loss, rollback, and recovery.
8. Complete same-day item, shipping, tax, return, warranty, and delivered-cost
   evidence with the common camera and any missing cable/mount.

Pass requires the 120 ms p95 action gate, representative game behavior,
qualified drivers/recovery, acceptable power/noise, and a complete delivered
value argument. A sub-$650 price without those results does not displace the Pi
reference; a measured mini PC above $650 requires a deliberate budget/tier
decision rather than silently redefining D-111.

## Requote trigger

Re-screen when any of the following occurs:

- the M5 Ultra or a comparable 16GB/512GB Ryzen system has an exact in-stock US
  configuration and unambiguous contents;
- a complete modern Radeon 680M/780M or supported-NPU system plus the common
  camera can fit the delivered ceiling;
- an exact candidate becomes borrowable without purchase;
- Pi delivered cost exceeds $650;
- owned-x86 measurements identify a CPU/GPU/inference floor that rules a
  candidate in or out before purchase.

Until then, this document is a procurement screen, not benchmark evidence or a
hardware selection.
