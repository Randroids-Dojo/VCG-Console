//! Synthesizes a single, net-zero-displacement pointer motion event through
//! a throwaway `/dev/uinput` virtual device, once, so `cage` can hide its
//! default Wayland cursor even when no physical pointing device is ever
//! attached.
//!
//! Why this exists as its own crate: the VCG Console appliance has no
//! physical pointing device. Under Wayland, the compositor (`cage`) owns
//! cursor rendering until a client explicitly claims it via a
//! `wl_pointer.set_cursor` request -- which Chromium only issues in
//! response to a real pointer motion/enter event. The console's own CSS
//! (`cursor: none`) already tells Chromium to hide the cursor the instant
//! that happens, but with zero physical input devices that motion event
//! never occurs, so cage's own default arrow sits on screen forever.
//! Confirmed live on a Pi 5: plugging in a real mouse and moving it once
//! makes the cursor hide correctly and permanently (nothing left to
//! generate further motion and bring it back). This binary performs
//! exactly that first nudge synthetically, so the fix doesn't depend on a
//! mouse ever being attached.
//!
//! `vcg-host` (the appliance's process-orchestration and trust boundary)
//! forbids unsafe code workspace-wide -- see the comment on
//! `unsafe_code = "allow"` in this crate's `Cargo.toml`. Doing this with
//! only safe Rust isn't possible (uinput is raw ioctls and a raw
//! `struct input_event` byte layout), so it lives here instead, as a tiny,
//! single-purpose helper `vcg-host` spawns as a subprocess.

use std::process::ExitCode;

fn main() -> ExitCode {
    #[cfg(target_os = "linux")]
    {
        linux::run()
    }
    #[cfg(not(target_os = "linux"))]
    {
        eprintln!("vcg-cursor-nudge: /dev/uinput is Linux-only; nothing to do on this platform");
        ExitCode::FAILURE
    }
}

#[cfg(target_os = "linux")]
mod linux {
    //! The ioctl request numbers and struct layouts below were not
    //! hand-derived from the `_IOW`/`_IO` encoding rules -- they were
    //! probed directly from `<linux/uinput.h>`/`<linux/input.h>` on the
    //! actual aarch64 Raspberry Pi OS trixie target (kernel 6.18, LP64 ABI)
    //! this installer supports, and are fixed, kernel-defined constants,
    //! not something that varies at runtime on that target.

    use std::env;
    use std::fs::{File, OpenOptions};
    use std::io::{self, Write};
    use std::os::unix::io::AsRawFd;
    use std::path::Path;
    use std::process::ExitCode;
    use std::thread;
    use std::time::Duration;

    const UI_DEV_CREATE: libc::c_ulong = 0x5501;
    const UI_DEV_DESTROY: libc::c_ulong = 0x5502;
    const UI_DEV_SETUP: libc::c_ulong = 0x405c_5503;
    const UI_SET_EVBIT: libc::c_ulong = 0x4004_5564;
    const UI_SET_RELBIT: libc::c_ulong = 0x4004_5566;

    const EV_SYN: u16 = 0x00;
    const EV_REL: u16 = 0x02;
    const REL_X: u16 = 0x00;
    const SYN_REPORT: u16 = 0x00;
    const BUS_VIRTUAL: u16 = 0x06;

    const UINPUT_MAX_NAME_SIZE: usize = 80;
    const DEVICE_NAME: &[u8] = b"vcg-console-cursor-nudge";
    const DEFAULT_UINPUT_PATH: &str = "/dev/uinput";

    // The kernel needs a moment to register the device, and the
    // compositor's libinput backend needs to enumerate it via udev, before
    // a motion event on it means anything.
    const DEVICE_SETTLE_DELAY: Duration = Duration::from_millis(200);

    /// Mirrors `struct input_id` from `<linux/input.h>`.
    #[repr(C)]
    struct InputId {
        bustype: u16,
        vendor: u16,
        product: u16,
        version: u16,
    }

    /// Mirrors `struct uinput_setup` from `<linux/uinput.h>`.
    #[repr(C)]
    struct UinputSetup {
        id: InputId,
        name: [libc::c_char; UINPUT_MAX_NAME_SIZE],
        ff_effects_max: u32,
    }

    /// Mirrors `struct input_event` from `<linux/input.h>` on a 64-bit
    /// (LP64) target: a `struct timeval` (two 8-byte fields) followed by
    /// `type`/`code`/`value`.
    #[repr(C)]
    struct InputEvent {
        tv_sec: i64,
        tv_usec: i64,
        kind: u16,
        code: u16,
        value: i32,
    }

    impl InputEvent {
        const fn new(kind: u16, code: u16, value: i32) -> Self {
            Self {
                tv_sec: 0,
                tv_usec: 0,
                kind,
                code,
                value,
            }
        }

        fn as_bytes(&self) -> &[u8] {
            // SAFETY: `InputEvent` is `#[repr(C)]` with no padding on this
            // target (verified by the size assertions in `tests`), so
            // reading it as a byte slice for exactly `size_of::<Self>()`
            // bytes is well-defined.
            unsafe {
                std::slice::from_raw_parts(
                    std::ptr::from_ref(self).cast::<u8>(),
                    std::mem::size_of::<Self>(),
                )
            }
        }
    }

    fn checked_ioctl(file: &File, request: libc::c_ulong, arg: libc::c_ulong) -> io::Result<()> {
        // SAFETY: `file` stays open and valid for the duration of this
        // call, and `request`/`arg` are the fixed uinput ioctl encodings
        // documented above and verified against this target's own kernel
        // headers.
        let result = unsafe { libc::ioctl(file.as_raw_fd(), request, arg) };
        if result < 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    }

    /// Creates a throwaway virtual relative-pointer device at
    /// `uinput_path`, emits one net-zero-displacement motion (+1 then -1
    /// on the X axis), and tears the device back down.
    fn nudge_pointer_once(uinput_path: &Path) -> io::Result<()> {
        let mut file = OpenOptions::new().write(true).open(uinput_path)?;

        checked_ioctl(&file, UI_SET_EVBIT, libc::c_ulong::from(EV_REL))?;
        checked_ioctl(&file, UI_SET_RELBIT, libc::c_ulong::from(REL_X))?;

        let mut setup = UinputSetup {
            id: InputId {
                bustype: BUS_VIRTUAL,
                vendor: 0,
                product: 0,
                version: 1,
            },
            name: [0; UINPUT_MAX_NAME_SIZE],
            ff_effects_max: 0,
        };
        for (slot, byte) in setup.name.iter_mut().zip(DEVICE_NAME) {
            // `libc::c_char` is signed on x86_64 but unsigned on aarch64, so
            // this cast's wrap-around is architecture-dependent -- but
            // DEVICE_NAME is a hardcoded ASCII literal (always < 0x80), so
            // it never actually wraps on either target.
            #[allow(clippy::cast_possible_wrap)]
            let signed_or_unsigned = *byte as libc::c_char;
            *slot = signed_or_unsigned;
        }
        // SAFETY: `setup` is `#[repr(C)]` and matches `struct
        // uinput_setup`'s layout on this target exactly (verified in
        // `tests`); UI_DEV_SETUP copies it in and does not write back
        // through the pointer.
        let setup_arg = std::ptr::addr_of!(setup) as libc::c_ulong;
        checked_ioctl(&file, UI_DEV_SETUP, setup_arg)?;
        checked_ioctl(&file, UI_DEV_CREATE, 0)?;

        // Regardless of what happens next, try to tear the device down so
        // a failed nudge never leaves a stray virtual input device behind.
        let result = (|| -> io::Result<()> {
            thread::sleep(DEVICE_SETTLE_DELAY);
            file.write_all(InputEvent::new(EV_REL, REL_X, 1).as_bytes())?;
            file.write_all(InputEvent::new(EV_SYN, SYN_REPORT, 0).as_bytes())?;
            file.write_all(InputEvent::new(EV_REL, REL_X, -1).as_bytes())?;
            file.write_all(InputEvent::new(EV_SYN, SYN_REPORT, 0).as_bytes())
        })();
        let destroy_result = checked_ioctl(&file, UI_DEV_DESTROY, 0);
        result.and(destroy_result)
    }

    pub fn run() -> ExitCode {
        let uinput_path = env::args_os()
            .nth(1)
            .map_or_else(|| DEFAULT_UINPUT_PATH.into(), std::path::PathBuf::from);
        match nudge_pointer_once(&uinput_path) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("vcg-cursor-nudge: {error} ({})", uinput_path.display());
                ExitCode::FAILURE
            }
        }
    }

    #[cfg(test)]
    mod tests {
        use super::{InputEvent, InputId, UinputSetup};

        // These sizes are the ABI contract this module relies on -- they
        // were probed live from a real aarch64 target's kernel headers
        // (see the module doc comment) and must match
        // `<linux/uinput.h>`'s structs exactly for the raw ioctl/write
        // calls above to be sound. LP64 Linux (x86_64 and aarch64 alike)
        // lays these out identically, so this holds on ordinary CI
        // runners even though the console itself only ever runs on
        // aarch64.
        #[test]
        fn struct_layouts_match_the_kernel_abi() {
            assert_eq!(std::mem::size_of::<InputId>(), 8);
            assert_eq!(std::mem::size_of::<UinputSetup>(), 92);
            assert_eq!(std::mem::size_of::<InputEvent>(), 24);
        }
    }
}
