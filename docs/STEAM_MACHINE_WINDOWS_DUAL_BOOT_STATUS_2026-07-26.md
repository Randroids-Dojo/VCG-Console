# Steam Machine Windows and dual-boot status

Date: 2026-07-26

Status: I-174 official-source record complete for this date; supported SteamOS
dual boot remains unavailable. No driver archive was downloaded, Windows was
not installed, and no hardware, driver, recovery, or Windows qualification was
performed.

## Current answer

Valve's official
[Steam Hardware Windows Resources](https://help.steampowered.com/en/faqs/view/6121-ECCD-D643-BAA8)
page currently establishes all of the following:

- Steam Machine is a PC and may install other applications and operating
  systems.
- Valve publishes Steam Machine links for graphics, Wi-Fi, Bluetooth, and SD
  card reader Windows drivers.
- The resources are provided as-is; Valve does not offer support for Windows on
  Steam hardware.
- Installing Windows currently requires wiping Steam hardware, and SteamOS
  dual boot is not currently available.
- Steam Machine is hardware-capable of dual boot, but the supported SteamOS
  installer with a dual-boot wizard is not ready. Valve says it will ship with
  SteamOS once complete.
- Steam Machine's documented boot-menu entry is to power off and then tap
  Escape during boot.
- Windows setup needs wired Internet before the published Wi-Fi driver can be
  installed.

The exact disposition is therefore:

```text
hardware capable:                         yes
other operating systems installable:      yes
Steam Machine Windows driver links:       four categories
supported SteamOS dual boot available:    no
supported SteamOS dual-boot wizard ready: no
current Windows install preserves SteamOS:no
I-175 physical validation may begin:      no
```

Hardware capability is not supported-flow readiness. The preordered unit
remains SteamOS-primary under D-040 and optional under D-119. Windows remains a
future compatibility/diagnostic fallback after Valve publishes the supported
flow or separate destructive-test authority is granted.

## Captured official pages

The machine-readable record is
`benchmarks/steam-machine-dual-boot/steam-machine-windows-dual-boot-status-v1.json`.
It stores the official URLs, access date, HTTP 200 status, and SHA-256 of the
decoded response after CRLF-to-LF and UTF-8 normalization:

| Source | Normalized bytes | SHA-256 |
| --- | ---: | --- |
| Valve Windows Resources | 34,958 | `a9451badafbe3363078dca9c6794e39e097c5fdbc1566591d1ef799be8795905` |
| [Valve SteamOS Installation and Repair](https://help.steampowered.com/en/faqs/view/65B4-2AA3-5F37-4227) | 34,816 | `f36756d63e9c21d51c11128f95dc249ba44f341b9276420ebbca97261215d1af` |

The response hashes identify this observation; they do not make the live page
immutable. Q-095 stays open and the Windows-resources page remains the monitor
target.

## Driver-link observation

The four exact Valve-linked archives returned HTTP 200 to HEAD requests on
2026-07-26:

| Driver | Published installation direction | HEAD size | Last-Modified |
| --- | --- | ---: | --- |
| Graphics | run `Setup.exe` | 1,044,430,080 bytes | 2026-07-06 18:28:53 GMT |
| Wi-Fi | install `qcwlan64.inf` | 4,597,665 bytes | 2026-07-06 18:28:54 GMT |
| Bluetooth | install `BtFilter.inf` | 420,921 bytes | 2026-07-06 18:28:28 GMT |
| SD card reader | run `Setup.exe` | 17,883,390 bytes | 2026-07-06 18:28:54 GMT |

HEAD reachability is deliberately narrow evidence. The archives were not
downloaded, hashed, signature-checked, unpacked, scanned, installed, or mapped
to an inventoried device set. Link presence therefore does not prove binary
integrity, publisher identity, version, device coverage, audio support, update
survival, controller support, camera support, or a complete Windows driver
inventory.

## Recovery boundary

Valve's SteamOS installation and repair documentation distinguishes repair from
reimage and warns that reimage removes user information, games, applications,
and operating systems. Recovery availability does not make a destructive
Windows install safe and does not prove that a future dual-boot partition or
bootloader would survive repair.

No recovery media, target inventory, partition map, boot-entry inventory,
backup, restore rehearsal, or data-disposition protocol exists in this record.
Those remain I-175 prerequisites after the supported wizard ships.

## What I-174 closes—and does not close

I-174 requested a dated official record covering other-OS capability, published
drivers, dual-boot capability, and supported installer status. This record
provides those facts with an honest currently-unavailable result.

It does not close:

- Q-095, because the supported wizard is still not ready;
- I-175, which requires physical supported-flow validation on the exact unit;
- I-176, which requires an identical SteamOS/Windows VCG comparison;
- exact Windows version, licensing, account, Secure Boot, TPM, driver coverage,
  camera, controller, sleep/resume, performance, update, recovery, or data-
  sharing questions; or
- permission to download or execute drivers, install Windows, change
  partitions/boot entries, repair/reimage, operate the target, publish physical
  evidence, or change a product tier.

## Verification

Run:

```text
pnpm validate:steam-machine-dual-boot-status
```

The validator pins the two official observations, four exact driver links and
HEAD records, current unavailable status, D-040/D-119/Q-095 disposition,
recovery limitations, denied authority, privacy boundary, and absence of any
physical result or tier change.
