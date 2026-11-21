# Hardware testing: checklist, equipment and procedures

**Status on 21 November 2026: no test has been run.** Every part model in the lab
is "not yet checked on real hardware". This document is the plan for changing
that. It makes no claim about results.

A part model is called **validated** only when a record for it exists in
[`records/`](records/) with real measurements, a date, the name of the person who
measured, and a photo. Until then the application and the documentation say "not
yet checked on real hardware".

## How to use this document

1. Pick a test from the tables below. Do them in order within a section; later
   tests assume earlier ones passed.
2. Gather the equipment and parts listed for it.
3. Follow the procedure. Write down what the instrument shows, not what you
   expected.
4. Build the same circuit in the lab application, with the same values, and
   write down what it shows.
5. Copy [`records/TEMPLATE.md`](records/TEMPLATE.md) to
   `records/<test id>-<date>.md`, fill it in, add the photo, and open a pull
   request.
6. If the two disagree by more than the tolerance, **that is a useful result**.
   Record it as a failure. Do not adjust the measurement.

## Safety

- Low voltage only. Nothing in this plan uses mains electricity. Relay and
  solid-state relay tests switch a low-voltage LED load, never a mains load.
- Set the bench supply's current limit before connecting it: 100 mA for signal
  tests, 500 mA for motor and servo tests, unless the procedure says otherwise.
- Disconnect power before changing wiring.
- Lithium cells: use only a holder and a protected charger; never short or
  puncture a cell; stop if a cell is warm.
- The MQ-135 heater gets hot. Do not touch the mesh while it is powered.
- An ESP32 pin must never see more than 3.6 V. Check every 5 V signal with the
  multimeter before connecting it to the board.
- Wear eye protection when soldering. A teacher or lab coordinator is present for
  every session with students.

## Equipment

| Instrument                           | Used for                                            | Check before use                                            |
| ------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------- |
| Digital multimeter (two if possible) | Voltages, currents, resistance, continuity          | Battery level; read a fresh 1.5 V cell and a known resistor |
| Oscilloscope, 1 MHz or better        | PWM, servo pulses, buzzer, RC charging, echo pulses | Probe compensation on the built-in square wave              |
| Logic analyser, 8 channels, 24 MHz   | DHT11 frames, I2C, serial, WS2812 timing            | Capture the board's own serial output and decode it         |
| Bench supply with current limit      | Powering circuits safely; battery-sag and brown-out | Verify its voltage reading against the multimeter           |
| Thermometer and a ruler or tape      | DHT11 comparison; ultrasonic distance               | —                                                           |
| Computer with the lab application    | The simulated side of every test                    | Note the application version or commit                      |
| Camera or phone                      | A photo for every record                            | —                                                           |

Parts: one complete school kit (board, breadboard, jumper wires, sensors,
display, buzzer, LEDs, buttons, resistors, servo, relay module, motor driver, two
motors, battery pack) and one UNO-compatible board with a USB cable.

Write the serial number or a label of each instrument in the record, so a
doubtful reading can be traced to one instrument.

## Tolerances

These are **proposed** and need the lab coordinator's agreement before the first
record is accepted. A tolerance is a statement about how exact the simulator
claims to be, so it is set before measuring, not after.

| Quantity                         | Proposed tolerance                    |
| -------------------------------- | ------------------------------------- |
| DC voltage                       | ±5 % or ±0.05 V, whichever is larger  |
| DC current                       | ±10 % or ±0.5 mA, whichever is larger |
| Resistance                       | The part's own tolerance band         |
| Pulse width, period, frequency   | ±5 %                                  |
| Protocol timing (bit lengths)    | Inside the part's datasheet limits    |
| Sensor reading                   | The sensor's datasheet accuracy       |
| Behaviour (lights, moves, beeps) | Same as the simulator, yes or no      |

## Section A: basic circuits (multimeter)

These check the circuit solver. They need no board and can start at once.

| ID  | Test                   | Circuit                                               | Measure                                                   | Compare with           |
| --- | ---------------------- | ----------------------------------------------------- | --------------------------------------------------------- | ---------------------- |
| A1  | LED and resistor       | 9 V battery, 330 Ω, red LED in series                 | Battery voltage; voltage across LED and resistor; current | Meter panel values     |
| A2  | LED colours            | A1 with green, yellow, then a 220 Ω resistor          | LED forward voltage and current for each                  | Meter panel values     |
| A3  | Voltage divider        | Supply 5.00 V across 1 kΩ and 2 kΩ in series          | Voltage at the middle point                               | Probe reading          |
| A4  | Divider under load     | A3 with 10 kΩ from the middle point to ground         | Voltage at the middle point                               | Probe reading          |
| A5  | Series and parallel    | Two and three resistors from the kit, both ways       | Total resistance (power off); current at 5 V              | Meter panel values     |
| A6  | Potentiometer          | 5 V across the track; wiper at ¼, ½, ¾                | Wiper voltage                                             | Probe reading          |
| A7  | Diode drop             | 5 V, 1 kΩ, one silicon diode                          | Voltage across the diode; current                         | Meter panel values     |
| A8  | Reversed LED           | A1 with the LED reversed                              | Current (expect none); LED stays dark                     | "LED reversed" message |
| A9  | Capacitor charging     | 5 V, 10 kΩ, 100 µF; oscilloscope across the capacitor | Time to reach 63 % of the supply                          | Oscilloscope trace     |
| A10 | Transistor as a switch | NPN, 1 kΩ base resistor, LED and 330 Ω as the load    | Collector voltage and LED current, base high and low      | Meter panel values     |

**Procedure for every Section A test**

1. Measure each resistor with the multimeter, power off, and write the real
   values down. Enter those real values in the application, not the printed ones.
2. Measure the supply voltage with nothing connected, then with the circuit
   connected.
3. Measure voltages with the black probe on the supply's negative terminal unless
   the table says "across".
4. To measure current, break the loop and put the multimeter in series on its mA
   range. Then remove it and restore the wire.
5. Repeat each reading three times and record all three.

## Section B: UNO-compatible board

| ID  | Test                | Set-up                                               | Measure                                                  | Compare with                       |
| --- | ------------------- | ---------------------------------------------------- | -------------------------------------------------------- | ---------------------------------- |
| B1  | Pin levels          | Blink on pin 13 with 220 Ω and an LED                | Pin voltage high and low, with and without the LED       | Probe reading on the pin           |
| B2  | Blink timing        | The Blink starter program                            | On time and off time on the oscilloscope                 | Logic trace                        |
| B3  | PWM                 | The Fade starter program on pin 9                    | Frequency; duty cycle at three brightness steps          | Oscilloscope trace                 |
| B4  | Button with pull-up | The Button starter program                           | Pin voltage released and pressed; bounce time            | Probe reading                      |
| B5  | Analog input        | Potentiometer wiper to A0, the Knob starter program  | Wiper voltage against the printed number, at 5 positions | Serial monitor                     |
| B6  | Servo pulses        | The Servo starter program                            | Pulse width at 0°, 90°, 180°; period; horn angle         | Oscilloscope trace; arm angle      |
| B7  | Ultrasonic sensor   | The Distance starter program; flat target on a ruler | Echo pulse width and printed distance at 10, 30, 100 cm  | Serial monitor                     |
| B8  | Character display   | The LCD starter program                              | Text shown; contrast voltage                             | Display in the lab                 |
| B9  | Pin overload        | LED on a pin with no resistor, for 2 seconds only    | Current (read quickly)                                   | "pin overcurrent" message          |
| B10 | Supply current      | Board alone, then with servo moving                  | Current from the 5 V supply                              | Board's reading in the meter panel |

**Procedure notes**

- Upload the same program text to the real board that the simulator runs. Record
  the program's name and the commit it came from.
- Oscilloscope tests: 1× or 10× probe as marked, ground clip on the board's GND,
  trigger on the rising edge. Save or photograph the screen with the time base
  visible.
- B9 is a deliberate fault. Keep it under 2 seconds and do it once.

## Section C: ESP32 board and the school kit

These tests are written now so the lab can prepare, but **the simulator has no
ESP32 yet**. Run the hardware side when a kit is available; the comparison is
filled in when each model exists.

| ID  | Test                    | Set-up                                                | Measure                                                                    |
| --- | ----------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| C1  | Pin levels              | LED and 220 Ω on a GPIO                               | Pin voltage high and low; LED current                                      |
| C2  | Analog input curve      | Bench supply through 10 kΩ to an ADC1 pin             | Printed reading at 0.1 V steps from 0 to 3.2 V                             |
| C3  | Input thresholds        | Slowly raise and lower the voltage on a digital input | Voltage at which the reading changes, both directions                      |
| C4  | PWM                     | LED fade on a GPIO                                    | Frequency and duty cycle                                                   |
| C5  | DHT11                   | Logic analyser on the data line                       | Start signal, bit lengths, the 40-bit frame; reading against a thermometer |
| C6  | OLED display            | Logic analyser on SDA and SCL                         | Address, clock rate, one full screen update                                |
| C7  | Servo                   | Signal on the kit's servo pin, power from VIN         | Pulse widths; supply dip when the horn starts                              |
| C8  | Ultrasonic with divider | 1 kΩ and 2 kΩ divider on the echo line                | Echo voltage after the divider; pulse width at 10, 30, 100 cm              |
| C9  | Relay module            | Jumper on H, then on L; low-voltage LED as the load   | Trigger voltage and current; coil current; click on and off                |
| C10 | Buzzer module           | Driven straight from a GPIO                           | Pin current; sound on and off                                              |
| C11 | LDR module              | Covered, room light, torch                            | AO voltage; DO state; the trimmer's switching point                        |
| C12 | Rain sensor             | Dry, one drop, wet board                              | AO voltage; DO state                                                       |
| C13 | Soil moisture sensor    | In air, dry soil, wet soil, water                     | AO voltage                                                                 |
| C14 | Gas sensor warm-up      | From cold, every 30 seconds for 10 minutes            | AO voltage after its divider; heater current                               |
| C15 | Motion sensor           | Walk past at 1 m and 3 m                              | Output voltage; hold time; time before it can trigger again                |
| C16 | IR obstacle sensor      | White card, then black card, moved closer             | Distance at which the output changes                                       |
| C17 | Motor driver            | One motor, 7.2 V pack, 25 %, 50 %, 100 % speed        | Motor voltage and current; voltage lost in the driver                      |
| C18 | Battery pack under load | Both motors stalled for 1 second, then free           | Pack voltage before, during, after                                         |
| C19 | Board current           | Idle, Wi-Fi connected, Wi-Fi sending                  | Supply current; lowest supply voltage during a send                        |
| C20 | RGB LED module          | Each colour at full, then mixed                       | Current per colour; which pin is common                                    |

## Section D: systems (later)

Solar charging over a day, LoRa range and airtime, GSM peak current, and
multi-board timing are tested when those models are built. They need outdoor
time and a second board, so plan them separately.

## Record format

One file per test run in `records/`, named `<test id>-<yyyy-mm-dd>.md`, from
[`records/TEMPLATE.md`](records/TEMPLATE.md). A record is accepted when it has:

- the test id, date, place and the name of who measured;
- the instruments used, with their labels;
- the real values of the parts used;
- every reading, including repeats;
- what the simulator showed for the same values, and the application's version;
- the difference, and pass or fail against the tolerance;
- a photo of the set-up.

## Progress

| Section | Tests | Run | Passed | Failed |
| ------- | ----- | --- | ------ | ------ |
| A       | 10    | 0   | 0      | 0      |
| B       | 10    | 0   | 0      | 0      |
| C       | 20    | 0   | 0      | 0      |
