# Raspberry Pi USB 3 SSD Fallback Screen

Quote snapshot: 2026-07-24 09:19 PDT

Status: no purchase-ready fallback selected; two exact integrated portable SSD
candidates screened, no cart or order opened, and no physical compatibility or
durability result exists.

Authority: D-047, D-048, D-049, D-089, D-109, D-111, I-021, I-022, I-111
through I-114, I-162, I-202, I-203, Q-086, Q-196, Q-199, Q-200, Q-201,
Q-202, and
[`MICROSD_QUALIFICATION_PROTOCOL_2026-07-24.md`](MICROSD_QUALIFICATION_PROTOCOL_2026-07-24.md).

## Outcome

Keep qualified 256GB high-endurance microSD as the selected baseline. If one
of its pre-registered durability, performance, full-disk, update,
power-interruption, corruption, or recovery gates fails, test an exact USB 3
SSD assembly under I-021 without weakening any storage invariant.

The first desk-integration lead is the Kingston XS1000 1TB black
`SXS1000/1000G`, because it is a current integrated drive with a short
manufacturer-included USB-C-device-to-USB-A-host cable, avoiding a separately
selected NVMe/SATA bridge and enclosure. It is not purchase-ready: the
authorized B&H page observed in this snapshot says “No Longer Available” and
shows no price.

The Samsung T7 Shield 1TB black `MU-PE1T0S/AM` is available with an exact
retail identity and both USB cable types, but its observed $287.99 item price
cannot satisfy D-111. Replacing the quoted $69.99 microSD with that SSD raises
the existing $576.23 merchandise subtotal to $794.23 before tax, shipping, or
a console mount.

No candidate has published enough Pi-specific peak-power, USB-boot,
UAS/firmware, sustained-write, power-cut, disconnect, recovery, or mounting
evidence to qualify on paper.

## Why integrated portable SSDs come first

An integrated portable SSD contains its flash, controller, USB bridge, thermal
path, and enclosure under one manufacturer part number. That reduces—but does
not eliminate—the substitution surface compared with independently combining:

- one M.2 or 2.5-inch SSD;
- one USB bridge chipset and firmware;
- one enclosure and thermal pad;
- one cable; and
- one mounting scheme.

The integrated approach still needs exact received-unit identity, firmware,
USB descriptors, cable identity, power, thermals, retention, and failure
qualification. It is not assumed safer merely because fewer retail lines are
visible.

## Pi 5 host boundary

[Raspberry Pi documentation](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#usb-mass-storage-boot)
states that Pi 4 and newer flagship devices can boot USB mass storage through
the EEPROM bootloader when `BOOT_ORDER` permits it. It also warns that a
device may work in bootloader mass-storage mode but fail when Linux selects
USB Attached SCSI (UAS), so both phases require testing.

The same documentation states:

- Pi 5 provides 1.6A total to downstream USB peripherals when it detects a
  5V/5A supply;
- otherwise it limits downstream USB power to 600mA;
- the USB budget is shared with the fan header; and
- high-current SSDs may fail if power is insufficient.

The selected Raspberry Pi 27W supply is intended to negotiate 5V/5A, but that
does not prove the complete AI HAT+, camera, controller receivers, fan/cooler,
and SSD assembly has adequate steady-state and transient margin. Do not enable
an override that asserts an unavailable current budget. Record negotiated
power state and measure the exact assembled load.

USB qualification must use a Pi USB 3 Type-A port. The Pi USB-C receptacle
remains the power input and is not the storage connection in this design.

## Candidate screen

| Field | Kingston XS1000 | Samsung T7 Shield |
|---|---|---|
| Exact 1TB part | `SXS1000/1000G` (black) | `MU-PE1T0S/AM` (black) |
| Manufacturer status | Current product page; firmware download notice present | Current product page |
| Interface | USB 3.2 Gen 2 | USB 3.2 Gen 2, 10 Gb/s |
| Published maximum | 1,050 MB/s read; 1,000 MB/s write | 1,050 MB/s read; 1,000 MB/s write |
| Published NAND/controller detail | “3D” NAND; controller not identified | PCIe NVMe technology; controller not identified |
| Included Pi-host cable | 12-inch USB-C drive to USB-A host cable | USB-C cable plus USB-C-to-USB-A cable; observed source does not state length |
| Enclosure | Metal and plastic, 69.54 x 32.58 x 13.5 mm, 28.7 g | Rubberized, IP65, 88.9 x 58.4 x 12.7 mm, 98 g |
| Published OS boundary | Linux 4.4+, subject to host compatibility | Broad computer/mobile/console compatibility; no Pi qualification |
| Warranty statement | Five years or reported “SSD Life Remaining,” whichever limits it | Three-year limited warranty |
| Health/firmware fact | Kingston page directs users to current SSD Manager firmware; datasheet references SSD Life Remaining | Samsung Magician management support |
| Exact observed seller | [B&H authorized listing](https://www.bhphotovideo.com/c/product/1791588-REG/kingston_sxs1000_1000g_1tb_xs1000_external_usb.html) | [B&H authorized listing](https://www.bhphotovideo.com/c/product/1691588-REG/samsung_mu_pe1t0s_am_1tb_t7_shield_portable.html) |
| Availability/price at snapshot | No Longer Available; no price | In stock; $287.99; free next-day shipping shown |
| Current screen result | Best physical/cable lead, but unquotable and unavailable from screened seller | Exact and available, but D-111 cap failure |

Primary technical sources:

- [Kingston XS1000 product page](https://www.kingston.com/en/external-ssd/xs1000-external-solid-state-drive)
- [Kingston XS1000 datasheet](https://www.kingston.com/datasheets/SXS1000_us.pdf)
- [Samsung T7 Shield product page](https://www.samsung.com/us/memory-storage/portable-ssd/portable-ssd-t7-shield-usb-3-2-1tb-black-sku-mu-pe1t0s-am/)
- [Raspberry Pi 5 USB power-delivery note](https://pip-assets.raspberrypi.com/categories/685-app-notes-guides-whitepapers/documents/RP-009856-WP-1-USB%20Power%20delivery%20on%20Raspberry%20Pi%205.pdf)

Published transfer maxima are internal/vendor measurements and far exceed
likely application needs. They do not establish small synchronous-write
latency, sustained dirty-drive behavior, filesystem recovery, or power-loss
durability.

## Cost boundary

The quote-date Pi reference merchandise subtotal is $576.23 and includes the
$69.99 SanDisk microSD. Removing that card leaves:

```text
$576.23 - $69.99 = $506.24
```

For an SSD fallback, the complete delivered predicate becomes:

```text
$506.24
+ exact SSD
+ exact mount/retention hardware
+ any replacement cable or powered hub
+ all shipping
+ all tax
<= $650.00
```

Therefore the absolute item-price ceiling before every other incremental cost
is:

```text
$650.00 - $506.24 = $143.76
```

That is not a target price; shipping, tax, and mounting require the SSD to cost
less than $143.76.

For the observed Samsung candidate:

```text
$506.24 + $287.99 = $794.23 merchandise
$794.23 - $650.00 = $144.23 over cap
```

The Samsung result fails before mounting, tax, or shipping. The B&H optional
camera-oriented MagSafe/cold-shoe holder is neither included in this arithmetic
nor accepted as a console mount.

The Kingston result has no price, so no cost conclusion is possible. A future
fresh authorized quote passes the arithmetic screen only when:

```text
SSD + mount + replacement cable/hub + shipping + tax <= $143.76
```

No SSD purchase may use a used/open-box price as the repeatable reference
build.

## Exact receipt and firmware record

Before writing a candidate, retain:

- seller, receipt, manufacturer part, UPC if published, package photographs,
  device-label photographs, and manufacturing/batch facts;
- USB vendor/product IDs, device revision, serial exposed by the USB bridge,
  negotiated speed, UAS/BOT driver, and complete identity across cold boots;
- shipped cable markings, connector orientation, length, and continuity;
- firmware version before and after any update plus updater/tool version;
- usable capacity in bytes, logical/physical sector reports, discard support,
  write-cache and flush behavior, SMART/health attributes if exposed, and
  temperature sensors;
- Pi board revision, EEPROM/bootloader configuration and version, kernel,
  firmware, power supply, fan, USB topology, AI HAT+, camera, receivers, and
  complete image digest; and
- exact mechanical mount/strain-relief revision.

Run the manufacturer firmware check before qualification. If the update tool
requires another operating system, record that lifecycle burden. A firmware
change after qualification invalidates inherited results until the affected
matrix is rerun.

## Partition and boot treatment

The SSD fallback retains the same logical contract:

```text
firmware/boot | system A | system B | writable data with recovery reserve
```

The candidate must boot with no microSD inserted. Keeping a hidden boot card
would create a second failure domain, change recovery and field replacement,
and fail to prove USB mass-storage boot.

Freeze and record:

- EEPROM `BOOT_ORDER` and every relevant USB/current setting;
- partition table, alignment, identifiers, exact sizes, filesystems, and mount
  flags;
- read-only enforcement for the active system slot;
- signed-image write/read-back path;
- rollback behavior when the SSD is missing, slow, corrupt, or replaced; and
- service/recovery behavior with multiple USB storage devices attached.

Do not preserve the SSD's factory exFAT layout. Write and verify the exact
signed whole-device image through the D-049 recovery path.

## Power and USB transport gates

Instrument the exact assembly and require:

- successful 5V/5A supply recognition without unsafe current override;
- device enumeration in the EEPROM bootloader and production kernel;
- exact USB 3 negotiated speed with the final cable and enclosure routing;
- UAS mode operation, plus an explicit BOT comparison if UAS faults;
- no reset, disconnect, controller error, undervoltage, or boot-order drift
  across cold boot, restart, sustained writes, camera/AI load, and all USB
  receivers;
- measured idle, boot/inrush, maximum concurrent, and power-cut/reconnect
  current at the relevant rails;
- margin under the shared 1.6A downstream budget and complete 27W supply
  envelope;
- connector retention and strain relief under representative handling;
- EMI/noise and camera/controller behavior with the exact cable routing; and
- explicit rejection rather than silent filesystem damage after disconnect.

If an integrated SSD needs a powered hub, do not add one silently. A hub adds
its own supply, bridge, cable, boot compatibility, power sequencing, volume,
thermal, cost, and sudden-disconnect surfaces and requires a new complete BOM
branch.

## Comparative qualification

I-021 compares the exact SSD against the exact failed microSD gate, then runs
the full common contract. At minimum:

| Area | Required evidence |
|---|---|
| Trigger | Exact valid microSD failure and why SSD architecture could address it |
| Boot | Cold/warm boot distribution, bootloader enumeration, correct slot, missing/late drive, and 100-cycle baseline |
| Performance | Final workload latency, sustained writes, dirty/full behavior, synchronous writes, image/update time, and concurrent AI/camera activity |
| Writes/endurance | Application and block writes, observable amplification, exposed health/wear drift, service projection, firmware and thermal behavior |
| Update | Complete signed A/B and package promotion/rollback with exact protected state |
| Capacity | Final quotas, logs, caches, staging, recovery reserve, warning/full-disk behavior, and no use of extra 1TB capacity to relax policy silently |
| Power loss | The complete frozen I-202 plan/result contract, regenerated for the SSD environment |
| Disconnect | Cable removal and intermittent contact at every boot/read/write/update/save/profile/retro/log/recovery phase |
| Corruption | Partition, slot, filesystem, metadata, data, controller-error, and wrong/old/cloned-drive injection |
| Recovery | Windows/macOS/Linux writer where supported, exact target selection, full read-back, offline first boot, and permanent loss disclosure |
| Mechanics | Exact mount, retention, vibration/handling, connector cycles, cable bend/strain, enclosure temperature, service replacement |
| Power | Measured full assembly, negotiated current, inrush/peak/steady state, fan-header sharing, brownout/reconnect, and no unsafe override |
| Cost | Fresh authorized delivered quote including mount/cable/hub if any, with the same D-111 predicate |

An SSD passes only if it fixes the triggering microSD failure and passes every
common storage gate. Faster sequential throughput cannot compensate for
committed corruption, boot incompatibility, power instability, disconnect
risk, recovery failure, or a budget violation.

## Mandatory rejection and escalation

Reject the exact SSD assembly if:

- it cannot cold boot without a microSD;
- bootloader mass-storage and Linux UAS behavior disagree unrecoverably;
- it exceeds or destabilizes the measured USB/power envelope;
- a final cable/mount cannot prevent ordinary household disconnect or strain;
- any valid power-cut/disconnect trial corrupts committed state;
- protected and writable authority can diverge permissively;
- blank/replacement-device recovery is ambiguous or leaks/restores user data;
- health/wear/firmware cannot be managed over the selected service horizon;
- its complete delivered quote exceeds $650; or
- passing would require weakening the microSD storage contract.

If every reasonable bus-powered integrated candidate fails only because of
power, cable, or delivered cost, present a superseding hardware-tier decision.
Do not silently add a hub, secondary supply, internal battery, or more
expensive reference tier.

## No-purchase gate

Do not buy either screened candidate until:

1. a valid microSD result actually triggers I-021 or the owner separately
   authorizes a lab-only comparative sample;
2. the candidate is current, new, exact-part, and available from an approved
   seller;
3. a fresh price plus every mount/cable/hub/shipping/tax line can satisfy the
   applicable lab or D-111 budget;
4. exact cable, mechanical, firmware, Linux/UAS, USB-boot, and health facts are
   reviewable;
5. the complete Pi assembly and isolated power/disconnect harness are ready;
6. the signed image/recovery and authoritative state oracles are executable;
7. the companion owner questions are resolved; and
8. purchase permission is explicit.

## Screen limitations

No candidate was purchased, opened, inventoried, connected, benchmarked,
mounted, firmware-checked, imaged, booted, filled, disconnected, corrupted, or
power-cut. Manufacturer compatibility and speed statements are not Pi evidence.
B&H availability and prices can change and require a fresh quote.

The screen does not qualify a powered hub, NVMe/SATA bridge, enclosure, cable,
mount, adhesive, printed bracket, filesystem, or bootloader setting. It does
not change D-089: SSD loss, destructive reflash, factory reset, or console
replacement still permanently destroys console-managed local saves and
profiles.

Purchase nothing from this screen.
