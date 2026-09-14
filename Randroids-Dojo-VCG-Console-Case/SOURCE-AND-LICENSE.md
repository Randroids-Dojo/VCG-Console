# Source and license

## Original enclosure

- Design: **Pi 5 AI Case** by WrenchWorks3D
- Official listing: https://makerworld.com/en/models/1876242-pi-5-ai-case
- Listing description: snap-together Raspberry Pi 5 enclosure designed around the Hailo-8 AI HAT
- Current license shown by the official listing: Creative Commons Zero / Public Domain (CC0)
- License reference: https://creativecommons.org/publicdomain/zero/1.0/

The MakerWorld update dated 2026-01-30 says the license was changed to Public Domain and CAD files were uploaded. The file dialog lists `Pi 5 Ai.stp`, but the anonymous download session labels that CAD file closed-source/unavailable and then requires an account. The editable STEP could therefore not be downloaded without creating or using a MakerWorld account.

The preserved original is the official WrenchWorks3D print-profile 3MF downloaded from MakerWorld:

- `Source/Original/WrenchWorks3D-Pi-5-AI-Case-Original.3mf`
- SHA-256: `A2034E3A17823A7FBB460F96349D8554EFC17A57A0AB9F70B75931A0724384F4`

The editable FreeCAD document was rebuilt from the official mesh geometry rather than from a substitute case. Original dimensions and functional features remain unchanged outside the branding area.

## Hardware compatibility evidence

The official Raspberry Pi documentation describes AI HAT+ as a Raspberry Pi 5 accessory using Hailo-8L or Hailo-8 accelerators. The WrenchWorks3D listing explicitly identifies Raspberry Pi 5 and a Hailo-8 AI HAT, matching the official 26 TOPS AI HAT+ configuration.

Official hardware documentation: https://www.raspberrypi.com/documentation/accessories/ai-hat-plus.html

## Logo source

The owner-supplied Randroid's Dojo artwork used for the trace is:

- Source filename: `randroids-dojo-raspberry-pi.png`
- Original dimensions: 5120 x 1440 pixels

The original raster stays outside this repository; the derived crop, mask, and FDM-safe vector trace are preserved under `Source/Working/Logo-Trace/`. No SVG/vector or transparent high-resolution logo asset was found. The insert outline traces the cream/gold wordmark in the supplied artwork; it does not use an invented font or redrawn logo. Small disconnected wordmark regions are joined with 0.8 mm print-carrier bridges so the insert remains a single printable part. The manufactured insert was ordered in red PETG.
