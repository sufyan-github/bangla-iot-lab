// A world for running a sketch on a desk computer: a virtual clock, pins that
// remember what was done to them, and inputs that arrive from a script.
//
// Time is virtual. delay(1000) takes no real time; it moves the clock on by a
// second, and anything the script says happens in that second happens. A run is
// therefore exact and repeatable, and a five-second sketch runs in an instant.
//
// The script (file named by ESP32_SCRIPT), one event per line, times in ms:
//   <ms> d <pin> <0|1>      a digital input changes
//   <ms> a <pin> <mV>       an analog input changes
//   <ms> pulse <pin> <us>   the length of the pulse pulseIn() will see on a pin
//   <ms> touch <pin> <n>    the value touchRead() returns
//   <ms> s <text>           a line typed into the serial monitor
//
// Output: serial text on standard output; pin events on standard error as
//   D <us> <pin> <level>   M <us> <pin> <mode>   W <us> <pin> <duty> <max> <hz>
// The run ends when the clock reaches ESP32_RUN_MS (default 3000).
#include <cinttypes>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <string>
#include <vector>

#include "Arduino.h"

namespace {
const int PINS = 40;
uint64_t now_us = 0;
uint64_t limit_us = 3000ull * 1000;
/** Time charged for one library call, so a loop that never waits still moves on. */
const uint64_t CALL_COST_US = 2;

int mode_of[PINS];
int output_level[PINS];
int input_level[PINS]; // -1: nothing drives it
int millivolts[PINS];
uint32_t pulse_us[PINS];
int touch_value[PINS];
void (*handler[PINS])(void);
int handler_mode[PINS];
std::deque<int> typed;

struct Event {
  uint64_t at_us;
  char kind;
  int pin;
  long value;
  std::string text;
};
std::vector<Event> script;
size_t next_event = 0;

int level_seen(int pin) {
  if (pin < 0 || pin >= PINS) return 0;
  if (mode_of[pin] == OUTPUT || mode_of[pin] == OUTPUT_OPEN_DRAIN) return output_level[pin];
  if (input_level[pin] >= 0) return input_level[pin];
  // Nothing connected: a pull-up reads HIGH, anything else reads LOW.
  return mode_of[pin] == INPUT_PULLUP ? 1 : 0;
}

void apply(const Event& event) {
  if (event.kind == 's') {
    for (char c : event.text) typed.push_back((unsigned char)c);
    typed.push_back('\n');
    return;
  }
  if (event.pin < 0 || event.pin >= PINS) return;
  if (event.kind == 'a') millivolts[event.pin] = (int)event.value;
  if (event.kind == 'p') pulse_us[event.pin] = (uint32_t)event.value;
  if (event.kind == 't') touch_value[event.pin] = (int)event.value;
  if (event.kind == 'd') {
    int before = level_seen(event.pin);
    input_level[event.pin] = event.value ? 1 : 0;
    int after = level_seen(event.pin);
    if (handler[event.pin] && before != after) {
      int edge = after ? RISING : FALLING;
      if (handler_mode[event.pin] == CHANGE || handler_mode[event.pin] == edge) handler[event.pin]();
    }
  }
}

void finish() {
  fflush(stdout);
  fflush(stderr);
  std::_Exit(0);
}

void advance(uint64_t microseconds) {
  uint64_t target = microseconds > limit_us ? limit_us : now_us + microseconds;
  if (target > limit_us) target = limit_us;
  while (next_event < script.size() && script[next_event].at_us <= target) {
    now_us = script[next_event].at_us > now_us ? script[next_event].at_us : now_us;
    apply(script[next_event++]);
  }
  now_us = target;
  if (now_us >= limit_us) finish();
}

void load_script(const char* path) {
  FILE* file = fopen(path, "r");
  if (!file) return;
  char line[512];
  while (fgets(line, sizeof line, file)) {
    double ms = 0;
    char kind[16] = "";
    int consumed = 0;
    if (sscanf(line, "%lf %15s %n", &ms, kind, &consumed) < 2) continue;
    Event event{(uint64_t)(ms * 1000), kind[0], -1, 0, ""};
    if (kind[0] == 's') {
      event.text = line + consumed;
      while (!event.text.empty() && (event.text.back() == '\n' || event.text.back() == '\r')) event.text.pop_back();
    } else if (sscanf(line + consumed, "%d %ld", &event.pin, &event.value) < 2) {
      continue;
    }
    script.push_back(event);
  }
  fclose(file);
}
} // namespace

extern "C" {
void host_pin_mode(int pin, int mode) {
  if (pin < 0 || pin >= PINS) return;
  mode_of[pin] = mode;
  fprintf(stderr, "M %" PRIu64 " %d %d\n", now_us, pin, mode);
}
void host_digital_write(int pin, int level) {
  if (pin < 0 || pin >= PINS) return;
  if (output_level[pin] != level) fprintf(stderr, "D %" PRIu64 " %d %d\n", now_us, pin, level);
  output_level[pin] = level;
}
int host_digital_read(int pin) { return level_seen(pin); }
// This test world has an ideal converter: linear from 0 to 3.3 V, whatever the attenuation.
static int clamped_millivolts(int pin) {
  int value = pin >= 0 && pin < PINS ? millivolts[pin] : 0;
  return value < 0 ? 0 : value > 3300 ? 3300 : value;
}
int host_analog_read(int pin, int, int bits) {
  return (int)((uint64_t)clamped_millivolts(pin) * ((1u << bits) - 1) / 3300);
}
int host_analog_read_millivolts(int pin, int) { return clamped_millivolts(pin); }
void host_pwm(int pin, uint32_t duty, uint32_t max_duty, double frequency) {
  fprintf(stderr, "W %" PRIu64 " %d %u %u %.0f\n", now_us, pin, duty, max_duty, frequency);
}
int host_touch_read(int pin) { return pin >= 0 && pin < PINS ? touch_value[pin] : 0; }
uint32_t host_pulse_in(int pin, int, uint32_t timeout_us) {
  uint32_t pulse = pin >= 0 && pin < PINS ? pulse_us[pin] : 0;
  if (pulse == 0 || pulse > timeout_us) {
    advance(timeout_us);
    return 0;
  }
  advance((uint64_t)pulse + 500); // the wait for the pulse to start, then the pulse
  return pulse;
}
void host_attach_interrupt(int pin, void (*function)(void), int mode) {
  if (pin < 0 || pin >= PINS) return;
  handler[pin] = function;
  handler_mode[pin] = mode;
}
void host_detach_interrupt(int pin) {
  if (pin >= 0 && pin < PINS) handler[pin] = nullptr;
}
void host_serial_write(const char* data, size_t length) { fwrite(data, 1, length, stdout); }
int host_serial_available(void) { return (int)typed.size(); }
int host_serial_read(void) {
  if (typed.empty()) return -1;
  int c = typed.front();
  typed.pop_front();
  return c;
}
int host_serial_peek(void) { return typed.empty() ? -1 : typed.front(); }
// Saved settings last as long as the run.
static std::string settings;
size_t host_settings_load(char* buffer, size_t capacity) {
  if (buffer) memcpy(buffer, settings.data(), std::min(capacity, settings.size()));
  return settings.size();
}
void host_settings_save(const char* data, size_t length) { settings.assign(data, length); }
// No I2C device is on the desk-computer world's bus.
int host_i2c_transfer(int, int, int, const uint8_t*, size_t, uint8_t*, size_t) { return 2; }
// No serial modules here: nothing arrives on a UART.
void host_uart_begin(int, uint32_t, int, int) {}
void host_uart_write(int, const uint8_t*, size_t) {}
int host_uart_available(int) { return 0; }
int host_uart_read(int) { return -1; }
int host_uart_peek(int) { return -1; }
// No SPI devices or LED strips here: transfers read back zeros, and LED data goes nowhere.
void host_spi_transfer(int, int, int, const uint8_t*, uint8_t* in, size_t length) {
  if (in) memset(in, 0, length);
}
void host_led_strip(int, const uint8_t*, size_t, int) {}
// No 1-Wire devices here: no presence pulse, and the line reads HIGH.
int host_onewire(int, int op, int) { return op == 2 ? 1 : 0; }
// The desk-computer world has no second boot: deep sleep ends the run.
void host_deep_sleep(int64_t, int, int, const void*, size_t) {
  fflush(stdout);
  exit(0);
}
int host_wakeup_cause(void) { return 0; }
uint64_t host_micros(void) { return now_us; }
void host_delay_micros(uint64_t microseconds) { advance(microseconds); }
void host_tick(void) { advance(CALL_COST_US); }
}

int main() {
  for (int pin = 0; pin < PINS; pin++) {
    input_level[pin] = -1;
    millivolts[pin] = 1650; // mid-scale until the script says otherwise
    touch_value[pin] = 60;
  }
  if (const char* run = getenv("ESP32_RUN_MS")) limit_us = strtoull(run, nullptr, 10) * 1000;
  if (const char* path = getenv("ESP32_SCRIPT")) load_script(path);
  setup();
  for (;;) {
    loop();
    host_tick();
  }
}
