//! Canonical console input independent of any controller library.

use std::error::Error;

/// A shell action that privileged input adapters can publish.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ShellAction {
    Up,
    Down,
    Left,
    Right,
    Select,
    Back,
    Home,
    Pause,
}

/// One semantic action from a session-local input device.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InputEvent {
    pub device_id: String,
    pub action: ShellAction,
    pub pressed: bool,
}

/// Source of privileged shell input.
///
/// The future SDL3 adapter implements this trait. SDL handles and binding-specific
/// types must remain behind the adapter so they cannot leak into shell contracts.
pub trait InputSource {
    /// Returns all currently pending semantic input events.
    ///
    /// # Errors
    ///
    /// Returns an adapter-specific error when the underlying input system cannot be polled.
    fn poll(&mut self) -> Result<Vec<InputEvent>, Box<dyn Error + Send + Sync>>;
}

#[cfg(test)]
mod tests {
    use super::{InputEvent, ShellAction};

    #[test]
    fn home_and_back_are_distinct_privileged_actions() {
        let home = InputEvent {
            device_id: "controller-1".to_owned(),
            action: ShellAction::Home,
            pressed: true,
        };
        let back = InputEvent {
            action: ShellAction::Back,
            ..home.clone()
        };

        assert_ne!(home, back);
    }
}
