//! Additions for বাংলা IoT ল্যাব (https://github.com/sufyan-github/bangla-iot-lab).
//!
//! The emulator's core can already record pin edges, report a pin's programmed
//! state and its PWM, and take a pin level or a voltage from outside (the
//! native command line uses these). Its browser build does not offer them to
//! the page. A circuit simulator needs exactly these, so this file exports
//! them. It adds no behaviour of its own. MIT, like the emulator.
//!
//! Copied into `wasm/src/` and named in `wasm/src/lib.rs` by the lab's build
//! script (third_party/esp32sim/build.sh).
use super::Emu;
use esp_periph::AnalogSource;

/// Start or stop recording pin edges: outputs as they reach the board, inputs as they are set.
///
/// # Safety
/// `e` must point to a live emulator to which the caller has exclusive access.
#[no_mangle]
pub unsafe extern "C" fn lab_gpio_observe(e: *mut Emu, on: u32) {
    // SAFETY: The caller provides exclusive access to a live emulator.
    let e = unsafe { &mut *e };
    e.m.bus().observe_gpio(on != 0);
}

/// Writes the pin edges recorded since the last call into `out`, 16 bytes each:
/// the cycle count as an f64, the pin as a u32 and the level as a u32, little
/// endian. Returns how many were recorded; only the first `max` are written.
///
/// # Safety
/// `e` must point to a live emulator to which the caller has exclusive access,
/// and `out` must be writable for `max * 16` bytes.
#[no_mangle]
pub unsafe extern "C" fn lab_gpio_events(e: *mut Emu, out: *mut u8, max: usize) -> usize {
    // SAFETY: The caller provides exclusive access to a live emulator.
    let e = unsafe { &mut *e };
    let events = e.m.bus().take_gpio_events();
    for (index, (cycle, pin, level)) in events.iter().take(max).enumerate() {
        let mut record = [0u8; 16];
        record[0..8].copy_from_slice(&(*cycle as f64).to_le_bytes());
        record[8..12].copy_from_slice(&u32::from(*pin).to_le_bytes());
        record[12..16].copy_from_slice(&u32::from(*level).to_le_bytes());
        // SAFETY: The caller provides `max * 16` writable bytes and `index < max`.
        unsafe { std::ptr::copy_nonoverlapping(record.as_ptr(), out.add(index * 16), 16) };
    }
    events.len()
}

/// A pin's programmed state: bit 0 the output latch, bit 1 output enabled,
/// bit 2 pull-up, bit 3 pull-down. `u32::MAX` for a pin the chip does not have.
///
/// # Safety
/// `e` must point to a live emulator to which the caller has exclusive access.
#[no_mangle]
pub unsafe extern "C" fn lab_gpio_state(e: *mut Emu, pin: u32) -> u32 {
    // SAFETY: The caller provides exclusive access to a live emulator.
    let e = unsafe { &mut *e };
    match e.m.bus().gpio_state(pin as u8) {
        Some(state) => {
            u32::from(state.output)
                | u32::from(state.output_enable) << 1
                | u32::from(state.pull_up) << 2
                | u32::from(state.pull_down) << 3
        }
        None => u32::MAX,
    }
}

/// Drives a pin from outside to a level.
///
/// # Safety
/// `e` must point to a live emulator to which the caller has exclusive access.
#[no_mangle]
pub unsafe extern "C" fn lab_gpio_set(e: *mut Emu, pin: u32, level: u32) {
    // SAFETY: The caller provides exclusive access to a live emulator.
    let e = unsafe { &mut *e };
    e.m.bus().gpio_set_input(pin as u8, level != 0);
}

/// Stops driving a pin from outside, so its own pull resistors decide its level again.
///
/// # Safety
/// `e` must point to a live emulator to which the caller has exclusive access.
#[no_mangle]
pub unsafe extern "C" fn lab_gpio_release(e: *mut Emu, pin: u32) {
    // SAFETY: The caller provides exclusive access to a live emulator.
    let e = unsafe { &mut *e };
    e.m.bus().gpio_release_input(pin as u8);
}

/// Puts a steady voltage on an analog pin.
///
/// # Safety
/// `e` must point to a live emulator to which the caller has exclusive access.
#[no_mangle]
pub unsafe extern "C" fn lab_adc_volts(e: *mut Emu, pin: u32, volts: f32) {
    // SAFETY: The caller provides exclusive access to a live emulator.
    let e = unsafe { &mut *e };
    e.m.bus().analog_set(pin as u8, AnalogSource::Const(volts));
}

/// The frequency in hertz of the PWM a pin puts out, or 0 when it puts out none.
///
/// # Safety
/// `e` must point to a live emulator to which the caller has exclusive access.
#[no_mangle]
pub unsafe extern "C" fn lab_pwm_hz(e: *mut Emu, pin: u32) -> f64 {
    // SAFETY: The caller provides exclusive access to a live emulator.
    let e = unsafe { &mut *e };
    e.m.bus().pwm_output(pin as u8).map_or(0.0, |(hz, _)| hz)
}

/// The share of the time a pin's PWM is HIGH, from 0 to 65535, or `u32::MAX` when it puts out none.
///
/// # Safety
/// `e` must point to a live emulator to which the caller has exclusive access.
#[no_mangle]
pub unsafe extern "C" fn lab_pwm_duty(e: *mut Emu, pin: u32) -> u32 {
    // SAFETY: The caller provides exclusive access to a live emulator.
    let e = unsafe { &mut *e };
    e.m.bus().pwm_output(pin as u8).map_or(u32::MAX, |(_, duty)| duty)
}

/// Reads a 32-bit register of the chip, as the firmware would. The lab reads
/// the pull-resistor bits of the low-power pads this way: the emulator keeps
/// them, but its pin state above reports only the ordinary pads' pulls. Returns
/// zero for an address that cannot be read.
///
/// # Safety
/// `e` must point to a live emulator to which the caller has exclusive access.
#[no_mangle]
pub unsafe extern "C" fn lab_read32(e: *mut Emu, address: u32) -> u32 {
    // SAFETY: The caller provides exclusive access to a live emulator.
    let e = unsafe { &mut *e };
    // A register the chip does not have reads as zero here.
    e.m.bus().read32(address).unwrap_or(0)
}
