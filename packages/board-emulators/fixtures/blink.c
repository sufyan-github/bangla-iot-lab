/*
 * Test firmware for the UNO emulator: prints "blink\n" at 9600 baud, then
 * toggles the on-board LED (pin 13 = PB5) every 500 ms.
 * Plain avr-libc on purpose, so the fixture does not depend on the Arduino core.
 * Rebuild with `pnpm fixtures:firmware`.
 */
#include <avr/io.h>
#include <util/delay.h>

static void serial_write(char c) {
  while (!(UCSR0A & (1 << UDRE0))) {
  }
  UDR0 = c;
}

int main(void) {
  UBRR0 = F_CPU / 16 / 9600 - 1;
  UCSR0B = 1 << TXEN0;
  for (const char *p = "blink\n"; *p; p++) serial_write(*p);

  DDRB |= 1 << DDB5;
  for (;;) {
    PORTB ^= 1 << PORTB5;
    _delay_ms(500);
  }
}
