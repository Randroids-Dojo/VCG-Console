# Linux RetroPad profiles

These udev mappings cover the Steam Controller bridge's virtual Xbox 360 pad
and the Pi's Sony PS3 controller. The numeric button/axis mappings follow the
corresponding libretro profiles:

- https://github.com/libretro/retroarch-joypad-autoconfig/blob/master/udev/Microsoft%20X-Box%20360%20pad.cfg
- https://github.com/libretro/retroarch-joypad-autoconfig/blob/master/udev/Sony-PlayStation3-DualShock3-Controller-USB.cfg

The host writes these profiles into each private runtime directory. It omits
RetroArch menu bindings because the host owns Select+Start exit. The Steam
bridge is preferred for player one by device name, with fallback to another
controller when absent. Left analog input also drives the digital pad.
