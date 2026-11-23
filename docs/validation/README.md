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

These tests were written before the simulator had an ESP32. It now has one, as
an experiment, and models of some of the kit's parts; **none of them has been
compared with hardware**. Run the hardware side when a kit is available. What
the simulator assumes for the newest models is listed under the table, so the
person measuring knows what to look for.

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

**What the simulator assumes today, to be checked by C6, C9, C11, C12, C14, C15, C17, C18 and C20.**
Every figure is reported by sellers or estimated (see decisions D-053 to D-055 and D-059); none is
measured.

| Test | The simulator assumes                                                                                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C11  | AO is the LDR against 10 kΩ: about 99 % of the supply in the dark, 9 % in bright light. DO is LOW when it is brighter than the trimmer's setting                                                                                                                                |
| C12  | AO is 98 % of the supply when dry and 30 % when the board is covered in water. DO is LOW when wet                                                                                                                                                                               |
| C14  | Heater 33 Ω (about 150 mA at 5 V). AO from 10 % of the supply in clean air to 80 % in thick smoke, with no warm-up time                                                                                                                                                         |
| C15  | Works from 4.5 V. Output 3.3 V through about 1 kΩ. Holds for the set time after the last movement (3 s at the least), then ignores movement for 2.5 s                                                                                                                           |
| C6   | Address 0x3C. A full picture is 1025 bytes in nine exchanges at 400 kHz, about 26 ms. Pull-ups on SDA and SCL to VCC (4.7 kΩ assumed). About 10 mA whatever is shown. **Please note the order of the four legs**                                                                |
| C9   | IN lights an optocoupler LED through about 1 kΩ; the relay pulls in at 1 mA and lets go below 0.4 mA. The coil is 70 Ω and needs 3.75 V. **Please try the jumper on L with a 3.3 V HIGH: does the relay switch off?**                                                           |
| C17  | With one motor at about 0.2 A the driver loses about 1.6 V; a motor on a 7.2 V pack gets about 5.5 V. The module draws about 43 mA at rest. Its 5 V terminal gives 5 V while the supply is 7 V or more. **Please note whether the kit's board has a diode between USB and VIN** |
| C18  | The pack is 7.2 V with 0.5 Ω inside it, whatever its charge                                                                                                                                                                                                                     |
| C20  | The negative leg is common. Red needs 1.8 V and green and blue 2.8 V at 20 mA. **No resistors on the module: please note whether the kit's module has them**                                                                                                                    |

## Section E: sensor modules outside the kit

Twenty-three modules and power parts modelled for projects beyond the school kit. Each needs the module
itself, a 5 V bench supply or the board's VIN, and a multimeter; E4 to E6 need
water samples (see each row). Every figure the simulator uses is reported by a
maker or seller, or estimated (decisions D-062 to D-068); none is measured.

| Test | Module                   | Set-up                                                                                           | Record                                                                                                                |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| E1   | 0–25 V voltage sensor    | Bench supply at 3, 6, 9 and 12 V on VCC and GND                                                  | S voltage at each; the two resistors measured out of circuit                                                          |
| E2   | ACS712 current sensor    | 5 V supply; a known load at 0, 0.5, 1 and 2 A through IP+/IP−                                    | OUT at each current; which chip (5, 20 or 30 A) is fitted                                                             |
| E3   | MQ-7 carbon monoxide     | 5 V on the heater, clean air, 10 minutes                                                         | AO every minute; heater current                                                                                       |
| E4   | pH sensor module         | pH 4, 7 and 10 buffer solutions, after setting the offset                                        | Po voltage in each; which pin order the board has                                                                     |
| E5   | TDS meter                | Distilled water, tap water, a salt solution; 3.3 V then 5 V                                      | A voltage in each, on both supplies; a TDS pen's reading                                                              |
| E6   | Turbidity sensor         | Clear water, then water with a little milk, on 5 V and on VIN                                    | A voltage in each, on both supplies                                                                                   |
| E7   | 18650 cell               | A charged, a half and a nearly empty cell; 1 Ω and 10 Ω loads                                    | Resting voltage of each; voltage under each load                                                                      |
| E8   | TP4056 charger           | From 5 V with a half-full cell; then a 0.5 Ω load on OUT                                         | Charge current; cell voltage at the end; whether OUT cuts off                                                         |
| E9   | LM2596 regulator         | 9 V in, set to 5 V; 25 Ω, 10 Ω and 5 Ω loads                                                     | Output voltage and current; input current                                                                             |
| E10  | 5 V solar panel          | Full sun, shade, cloud; open, into 5 Ω, into a short                                             | Voltage and current in each                                                                                           |
| E11  | BME280 module            | 3.3 V supply; a room, then beside a kettle                                                       | Temperature, humidity, pressure against reference instruments; address 0x76 or 0x77                                   |
| E12  | INA219 module            | 9 V through 100 Ω and through a motor                                                            | Current and bus voltage read by the library against a multimeter                                                      |
| E13  | DS18B20 probe            | 3.3 V, 4.7 kΩ pull-up; ice water, room, warm water; then two probes on one wire; then no pull-up | Readings against a thermometer; conversion time; how many probes are found                                            |
| E14  | JSN-SR04T                | 5 V, echo through a 1 kΩ / 2 kΩ divider; a wall at 15, 30, 100 and 400 cm                        | Readings at each distance                                                                                             |
| E15  | Five-channel line sensor | 5 V; black tape on white card under each channel in turn                                         | Each output's voltage over black and over white                                                                       |
| E16  | 12 V siren               | 12 V through a relay; then 6 V; then reversed                                                    | Current; whether it sounds                                                                                            |
| E17  | NEO-6M GPS               | 3.3 V, TX to GPIO16; the `gps` program; indoors, then outdoors for 10 minutes                    | The sentences as sent (a raw capture); time to the first fix; position against a phone                                |
| E18  | PMS5003 particle sensor  | 5 V, TX to GPIO16; the `air` program; a room, then near incense smoke                            | PM1.0, PM2.5, PM10 every second; time between frames; supply current with the fan                                     |
| E19  | HC-05 Bluetooth          | VIN, TXD to GPIO16; the `bluetooth` program; a phone with a Bluetooth terminal app               | Whether 1 and 0 switch the LED; the answers on the phone; supply current paired and unpaired                          |
| E20  | DFPlayer Mini            | VIN, TX to GPIO16, a card with 5 MP3 files and a small speaker; the `mp3` program                | Time from power to "card online"; whether the button moves on; how many "finished" messages per track; supply current |
| E21  | SIM800L                  | An 18650 cell, shared ground, TXD to GPIO16, a SIM card; the `sms` program; a real phone         | Time to register; time to send an SMS; whether ON and OFF work; whether it restarts on a weaker supply                |
| E22  | WS2812B ring (12 LEDs)   | VIN, DIN to GPIO4, a knob on GPIO34; the `ring` program; then a second ring on DOUT; then 3.3 V  | Colours in order; whether a 3.3 V data line works on 5 V; current at full white; whether it lights on 3.3 V           |
| E23  | 1.54″ ST7789 display     | 3.3 V, SCL to GPIO18, SDA to GPIO23, RES GPIO4, DC GPIO2, CS GPIO5; the `tft` program            | Whether the picture is upright and its colours right; with BLK on GND; supply current                                 |

**What the simulator assumes today.**

| Test | The simulator assumes                                                                                                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1   | S is exactly a fifth of the input (30 kΩ and 7.5 kΩ)                                                                                                                        |
| E2   | OUT is half the supply with no current and moves 185, 100 or 66 mV per ampere at 5 V, both scaled with the supply. About 10 mA of supply current                            |
| E3   | Heater 31 Ω (about 160 mA at 5 V), held at 5 V with no 5 V / 1.4 V cycle. AO from 10 % of the supply in clean air to 80 %, with no warm-up                                  |
| E4   | AO 2.5 V at pH 7 on 5 V, 0.18 V higher per pH unit more acid, scaled with the supply                                                                                        |
| E5   | A follows DFRobot's formula at 25 °C and does not change with the supply (3.0 V to 5.5 V)                                                                                   |
| E6   | A is about 4.2 V in clear water at 5 V and follows the curve users report from DFRobot's chart, scaled with the supply. **Please note how far A moves between 5 V and VIN** |
| E7   | Resting 3.0 V empty, 3.74 V half full, 4.2 V full, with 50 mΩ inside                                                                                                        |
| E8   | 1 A until the cell reaches 4.2 V, then 4.2 V held; input current equal to the charge current; OUT cut off past about 3 A                                                    |
| E9   | Output holds its setting while the input is 1.2 V higher; input takes the output's power at 80 % plus 5 mA                                                                  |
| E10  | 7.2 V open and 1.1 A into a short in full sun; current in proportion to the light                                                                                           |
| E11  | Chip id 0x60 and trimming read back; temperature, humidity and pressure follow a reference thermometer, hygrometer and barometer to within the datasheet's accuracy         |
| E12  | Shunt voltage, bus voltage and current at 0, 100 and 500 mA through a 0.1 Ω shunt; the library's readings against a multimeter                                              |
| E13  | Reads 85 °C before its first conversion; a conversion takes up to 750 ms at 12 bits; two probes on one wire are both found; nothing is found without the pull-up            |
| E14  | Readings from 25 cm to 450 cm; closer than 25 cm it reads about 25 cm                                                                                                       |
| E15  | Each output HIGH over black and LOW over white                                                                                                                              |
| E16  | About 300 mA at 12 V; sounds from about 6 V; silent the wrong way round                                                                                                     |
| E17  | RMC, VTG, GGA, GSA and GLL once a second at 9600 baud; without a fix, empty position fields; about 30 mA at 3.3 V                                                           |
| E18  | A 32-byte frame about once a second at 9600 baud; PM1.0 about 0.7 and PM10 about 1.3 times PM2.5; about 100 mA                                                              |
| E19  | 9600 baud in data mode; each phone line arrives with a newline; nothing passes unpaired; about 40 mA                                                                        |
| E20  | "Card online" about 1 s after power; one "finished" message per track; about 25 mA without a speaker                                                                        |
| E21  | Registered about 3 s after power; an SMS takes about 3 s; works from 3.4 V to 4.4 V with no restarts                                                                        |
| E22  | Green, red, blue order; any 3.3 V data line accepted; about 1 mA an LED dark and 20 mA a colour at full; dark below 3.5 V. **Please note whether it lights on 3.3 V**       |
| E23  | Rotation 0 upright with the pins along the top; colours right only with inversion on; dark with BLK on GND; about 30 mA at 3.3 V                                            |

## Section D: systems (later)

Solar charging over a day, LoRa range and airtime, GSM peak current, and
multi-board timing are tested when those models are built. They need outdoor
time and a second board, so plan them separately.

## Section P: phone speed (for the ESP32 study)

This is not a test of a circuit. It measures how fast a real phone runs sketches
built the way one option of the [ESP32 study](../decisions/esp32-study.md) would
run them. The study cannot be decided without it.

| No. | Test             | Set-up                                                                                                      | Record                                                                       | Pass when                                                                                       |
| --- | ---------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| P1  | Low-cost phone   | The cheapest Android phone a student in the pilot is likely to use, in Chrome, on charge, other apps closed | Phone model, Android and Chrome versions; the text the page gives at the end | Every row says "correct", and the slowest sketch runs at least 5 times faster than a real board |
| P2  | Same phone, warm | P1 run three times in a row without a pause                                                                 | The slowest figure of the three runs                                         | Still at least 5 times faster                                                                   |
| P3  | A second phone   | Any other phone the team has, the older the better                                                          | As P1                                                                        | As P1                                                                                           |

The factor of 5 is a proposed limit, not an agreed one: it leaves room for the
circuit solver and the drawing, which this page does not include.

**Procedure.** On a computer on the same Wi-Fi network as the phone, with the
project and the tools in the prototype's
[README](../../spikes/esp32-api/README.md) installed:

```bash
node scripts/esp32-study/bench.mjs --work /tmp/esp32-bench --serve 8080 --lan
```

Open the address it prints in the phone's browser. Wait for "Done". Copy the
text from the box at the bottom into the record. Stop the command with Ctrl+C;
while it runs, the page can be opened by anyone on that network.

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
| E       | 16    | 0   | 0      | 0      |
| P       | 3     | 0   | 0      | 0      |
