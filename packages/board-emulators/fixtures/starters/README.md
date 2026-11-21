# Starter programs

Each `.ino` here is a program written for this project (Apache-2.0). Each `.hex`
is that program compiled for an UNO-compatible board (ATmega328P), so the lab can
run it without a compile server.

The `.hex` files contain compiled LGPL-2.1-or-later code from the Arduino AVR
core and, for `servo.hex` and `lcd.hex`, the Servo and LiquidCrystal libraries.
Their corresponding source is in [`third_party/arduino-avr/`](../../../../third_party/arduino-avr/README.md),
with instructions for rebuilding and relinking. See also [`NOTICE`](../../../../NOTICE).
