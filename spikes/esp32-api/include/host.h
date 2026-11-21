// The boundary between a sketch and the world it runs in.
//
// The board library (Arduino.h and friends) is written against these functions
// only. Natively they are implemented by harness/world.cpp, with a virtual clock
// and scripted inputs. In the browser they would be the imports of a WebAssembly
// module, answered by the lab's circuit simulation.
#pragma once
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

void host_pin_mode(int pin, int mode);
void host_digital_write(int pin, int level);
int host_digital_read(int pin);
/** The voltage on a pin, in millivolts. */
int host_analog_millivolts(int pin);
/** A PWM output: `duty` out of `max_duty` at `frequency` hertz. */
void host_pwm(int pin, uint32_t duty, uint32_t max_duty, double frequency);
int host_touch_read(int pin);
/** Length in microseconds of the next pulse at `level` on a pin, or 0 if none comes in time. */
uint32_t host_pulse_in(int pin, int level, uint32_t timeout_us);
void host_attach_interrupt(int pin, void (*handler)(void), int mode);
void host_detach_interrupt(int pin);

void host_serial_write(const char* data, size_t length);
int host_serial_available(void);
/** The next byte typed into the serial monitor, or -1. */
int host_serial_read(void);
int host_serial_peek(void);

uint64_t host_micros(void);
/** Lets time pass. This is where the world moves on and scripted inputs arrive. */
void host_delay_micros(uint64_t microseconds);
/** Charges the small time a library call takes, so a loop without delay() still advances. */
void host_tick(void);

#ifdef __cplusplus
}
#endif
