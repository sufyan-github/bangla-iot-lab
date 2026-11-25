# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions before 1.0
make no promise of compatibility, except that saved circuits are always migrated.

## [Unreleased]

### Changed

- **More room for the circuit**: on a laptop the parts list and the work panel
  are narrow rails that open while the pointer is on them, and can be kept
  open; one button shows the board alone. On a phone the parts are a narrow
  column that opens on a tap.
- **The lab's new look** (the redesign's third stage): numbered steps and
  clearer checks in the lesson panel, and pin names drawn as wire ends, red
  for power, black for ground, yellow for a signal.
- **Home, lessons and glossary rebuilt** (the redesign's second stage): the
  lessons are a numbered path with each part's drawing, progress is a row of
  LEDs, the home page offers the lesson you left off, and the glossary reads
  as dictionary entries.
- **New colours and typefaces** (the first stage of a redesign): the pages
  are a white breadboard in light and a green blackboard in dark, with a
  breadboard's red and blue rails under each title; text is set in Noto Sans
  Bengali, Noto Sans and Noto Sans Mono.
- **A refreshed interface, built for phones first**: a parts drawer with
  labelled compartments and search; one bar in the lab; the board filling a
  phone's screen with the parts in a sheet; grouped side tabs; a home page with
  example pictures; lessons in tracks with progress; instruments with dark
  screens; a grouped logic-sheet toolbar; and the join code in chalk.

### Fixed

- A whole class can now join at once from one school address.
- An expired join code says so; a learner's new key asks first; failed
  teacher actions show why.
- On a shared device, progress waiting to upload can no longer be sent as the
  next learner's.
- Too many requests in a minute is now explained, and no longer looks like
  being signed out.
- A clock inside a block on the logic sheet now ticks.
- Browser tests no longer fail when a busy computer slows the simulation: they
  wait in the lab's own time.
- A logic sheet with a wired hex digit can be saved and opened again (it was
  refused, and came back empty).

### Added

- **The glossary**: 48 technical terms in Bangla and English side by side, with
  a short meaning, other names, and the lessons that use each one. In a lesson,
  a term shows its other-language name, and a tap gives its meaning.
- **The retention job**: removes what the lab no longer needs to keep, by the
  proposed periods, which are settings until they are confirmed. It only
  reports unless told to apply; closed accounts are emptied of personal data.
- **Closing accounts**: anyone can close their own account from My account; a
  parent or guardian can close a learner's own account by a link sent to the
  email that approved it.
- **The lab office in Kumo**: the owner's dashboard is rebuilt with Cloudflare's
  Kumo components (tables, dialogs, badges, a copy box), loaded only for owners.
- **Schools that apply**: a new school waits for the lab owner's approval;
  teachers confirm their email; a school admin can give a teacher a reset link;
  everyone with a password can change it and sign out on every device. The
  teacher's page has tabs for classes, the school and the account.
- **The lab office**: the owner's page for every school and every person:
  suspend, restart and close schools and accounts, make a one-time reset link
  to hand on, and read the latest activity. Owners are made only on the server.
- **Accounts of your own**: anyone can open an account with a confirmed email
  and a password, and reset it by email. Learners under 18 give no email of
  their own: a parent or guardian approves the account from an email. Sign-in
  lasts until the browser closes unless you choose to stay signed in. Class
  learners get their key on a lab pass card they can save.
- **Dark mode**: the lab follows the device's light or dark setting, or the
  student's own choice from a button in the header. The bench and the parts
  keep their real colours.
- **The catalogue linked to the parts master**: each product is suggested for
  a lab part by its name, a person confirms or changes it on a private
  catalogue desk that runs on their own computer, and a report shows each part's
  products and each project's coverage. The data stays private.
- **The UNO catches up**: the OLED, the ST7789 colour display (with I²C and SPI,
  through Wire, SPI and Adafruit's libraries) and the WS2812B LED ring (through
  the lab's own NeoPixel library) now work on the UNO-compatible board.
- **Logic finishing touches**: open a block to change it (every copy follows);
  buses on a block's pins; a gate delay that shows glitches on the timing
  diagram; and a trigger that holds the logic analyser on an edge.
- **Thirty reference circuits**: the solver is checked against ngspice on 30
  steady-state circuits and 3 over time, up from 18.
- **A quiz for every lesson**: all 50 lessons end with questions, marked at
  once with the reason.
- **Lessons on the logic sheet**: the half adder, a binary counter on a hex
  digit, and a majority vote from its K-map, each checked step by step by the
  lab on the sheet itself.
- **Bluetooth Low Energy for the ESP32**: `BLEDevice.h` and its companions in
  the board library, and a BLE phone in the network panel that connects, reads,
  writes and receives notifications. Ready-made program `ble`.
- **HTTPS**: `WiFiClientSecure.h`, so programs written for real HTTPS services
  run against the lab's made-up ones.
- **Data logs as CSV**: from the serial plotter and from the IoT dashboard.
- **Logic sheet, part 3**: names for elements; choosing several with a box,
  and copy, paste, move and remove together; a decoder, counter, register and
  16 × 4 RAM; a Karnaugh map for each lamp; blocks of your own made from part
  of a sheet (sub-circuits); and buses between groups of pins.
- **Learning on your own**: any learner can sign up with a nickname and a
  guardian's permission, follow the lessons, build projects and see their
  progress, and join a class later on the same account.
- **Running a school**: a school's admin removes teachers and hands on the
  admin role; a teacher moves a learner between classes.
- **HTTPClient for the ESP32**: `HTTPClient.h` in the board library and three
  made-up web services in the lab (`echo.lab`, `weather.lab`, `log.lab`); the
  web panel lists the requests a program made. Ready-made program `webclient`.
- **A timing diagram on the logic sheet**: clocks, switches, flip-flop outputs
  and lamps drawn as lines over the last eight seconds, which can be held still.
- **Teacher invitations**: a school's admin makes one-use codes for other
  teachers, sees the school's teachers and withdraws unused codes.
- **Quizzes at the end of lessons**: short questions marked at once, with the
  reason; seven lessons have them. Nothing is sent.
- **A current limit on the bench supply**: past the limit it holds the current
  and lets its voltage fall, and shows CC.
- **A serial plotter**: the serial monitor's numbers drawn as lines.
- **Logic sheet, part 2**: gates with up to four inputs, a multiplexer, a full
  adder, JK and T flip-flops and a hex digit; undo and redo; and the simplest
  Boolean expression for each lamp under the truth table.
- **The logic sheet**: a third view where a circuit is drawn with logic
  symbols (switches, lamps, a clock, the six gates and a D flip-flop) and
  wired port to port, worked out as pure logic, with its truth table. It is
  saved with the project.
- **The logic analyser reads chip legs**: every joined leg of a logic chip or
  clock module gets a row, named as in its datasheet, so a circuit of chips
  with no board can be watched too. Any of them can be an oscilloscope channel.
- **MQTT and an IoT dashboard**: a made-up MQTT broker in the lab shared by the
  boards, `PubSubClient.h` in the ESP32 library, and an IoT panel that shows
  each topic's latest value with a small chart and sends messages. Ready-made
  program `mqtt`.
- **Wi-Fi and the board's own web page**: `WiFi.h` and `WebServer.h` in the
  ESP32 board library, on a made-up network with no real internet, and a
  "Web page" panel that asks the board for its pages and shows them safely
  (no scripts, nothing reaches outside). Ready-made program `webserver`.
- **Classes and accounts**: teachers sign up and make classes for Class 6 to
  12 with join codes; learners join with a code and a nickname only (no
  email, phone or real name) and get a key to sign in elsewhere. Teachers
  manage the roster, set lessons and see class totals of progress. Projects
  can be saved to the cloud and opened on another device.
- **Four logic lessons**, each checked step by step by the lab: AND and OR
  gates, the flip-flop, counting by itself with a seven-segment display, and
  the shift register.
- **74HC595 shift register** (circuit format version 25), with `shiftOut()`
  and `shiftIn()` in the ESP32 board library, so three pins drive eight LEDs.
  Ready-made program `shift`.
- **Bench power supply and function generator**: a supply turned to any voltage
  from 0.1 to 24 V, showing its current, and a generator of square, sine and
  triangle waves from 0.1 to 100 Hz with amplitude and offset.
- **Counters, a decoder and a seven-segment display** (circuit format version
  24): the 74HC393 (two 4-bit counters) joins the 14-pin chips; a new 16-pin
  chip can be the 74HC161 counter (count, load, clear and carry) or the CD4511
  BCD to seven-segment decoder. The seven-segment display, common cathode or
  common anode, stands across the gap and lights each segment like an LED.
  A chip's highest safe supply now depends on its family (6 V for 74HC, 18 V
  for the CD4511).
- **74HC74 flip-flop and a 555 clock module** (circuit format version 23): the
  logic chip list gains the 74HC74, two D flip-flops that take D on the clock's
  rising edge and keep it, with active-LOW clear and preset. The new clock
  module ticks by itself at 0.2 to 20 Hz, set in the inspector, to drive a
  flip-flop's clock pin. The diagram names the flip-flop's pins as in its
  datasheet.
- **Programs in several files**: tabs in the code editor for more `.ino`
  files, headers and `.c`/`.cpp` files, built together for the UNO-compatible
  board and the ESP32. A compile error names the tab it is in.
- **Deep sleep on the ESP32**: `esp_deep_sleep_start()` and its timer and pin
  wake-ups, with `RTC_DATA_ATTR` variables kept and the program starting again
  from `setup()` on waking, as on the chip. Ready-made program `deepsleep`.
- **LoRa radio Ra-02** (circuit format version 22): two ESP32 boards, each with
  a radio on its SPI bus, send and receive short messages through the LoRa
  library 0.8.0 (MIT), built unmodified. Each radio's place along a road sets
  how far apart they are; the signal (RSSI) weakens with distance, and packets
  stop beyond the receiver's sensitivity. 5 V on the radio is shown as damage.
- Lessons can use two boards; the new lesson **LoRa radio** is checked step by
  step by the lab. Ready-made programs `lora-send` and `lora-receive`, and
  hardware test E25.
- **Two boards in one circuit**: two programmable boards, of either kind or one
  of each. Each runs its own program, with its own tab in the code view and its
  own serial monitor. Two ESP32 boards can talk over a serial wire (TX of one
  to RX of the other); a signal wire without a shared GND is flagged.
- Ready-made programs `sender` and `receiver`, and hardware test E24.
- **Breadboards are parts** (circuit format version 21). A circuit starts with
  one half breadboard as before, and up to four can be used, in half (400
  holes), full (830) and mini (170, no power rails) sizes. Each is moved by the
  tab above its corner, with its parts and wires; its size is chosen in the
  inspector; removing it removes what is on it. Two breadboards are joined only
  by a wire. A part slides from one board on to a neighbouring one.
- Saved circuits are upgraded when opened: the old fixed board becomes BB1, in
  the same place, and every hole is named after it ("c10" is now "BB1.c10").
- **WS2812B LED ring** and **1.54-inch ST7789 colour display** (circuit format
  version 20). The ring takes each LED's colour from one data wire and passes
  the rest on through DOUT, so rings chain; the display draws whatever the
  program sends over the ESP32's SPI bus, and goes dark with its backlight off.
- The board library gains an SPI bus, an LED data line (with the core's
  `rgbLedWrite`) and its own `Adafruit_NeoPixel`, with that library's functions
  (the library itself is LGPL, so it is not used).
- Adafruit's ST7735 and ST7789 library 1.12.0 (MIT) and `Adafruit_SPITFT` from
  the GFX library, built unmodified. Their licence is shown in the application.
- A ring on more than 5.3 V is shown as being damaged; on 3.3 V it stays dark.
- Ready-made programs `ring` and `tft`, and two lessons, each checked step by
  step by the lab: **LED ring** (a knob sets how many LEDs light) and **colour
  display** (SPI wiring, and the backlight).
- Hardware tests E22 and E23.
- **HC-05 Bluetooth module with a phone panel**, **DFPlayer Mini MP3 player**
  and **SIM800L GSM module** (circuit format version 19). While the circuit
  runs, the Bluetooth and GSM modules' inspector is a phone: type a message or
  an SMS, and read what the board sends back. The SMS network is the lab's own:
  nothing real is sent.
- The board library's own `DFRobotDFPlayerMini`, with that library's functions
  (the library itself is LGPL, so it is not used).
- A SIM800L on more than 4.4 V is shown as being damaged.
- Ready-made programs `bluetooth`, `mp3` and `sms`, and three lessons, each
  checked step by step by the lab: **Bluetooth light**, **MP3 player** and
  **light by SMS** (AT commands, powered from an 18650 cell).
- Hardware tests E19 to E21.
- **Serial modules on the ESP32** (circuit format version 18). Programs can use
  `Serial1`, `Serial2` and their own `HardwareSerial` ports on any pins. Modules
  send and receive bytes at their baud rate; a line wired TX to TX carries
  nothing, and a wrong baud rate gives nonsense.
- **NEO-6M GPS**, with its position, fix and satellites set in the inspector.
  Programs read it with the lab's own TinyGPSPlus, which has TinyGPSPlus's
  functions (that library is LGPL, so it is not used).
- **PMS5003 particle sensor**, read through the PMS library 1.1.0 (MIT), built
  unmodified. Its licence is shown in the application.
- Ready-made programs `gps` and `air`, and two lessons, each checked step by
  step by the lab: **GPS location** (crossed serial wiring, losing the fix) and
  **dust sensor** (PM2.5 and a warning light).
- Hardware tests E17 and E18.
- **DS18B20 temperature probe over 1-Wire** (circuit format version 17).
  Programs read it through the DallasTemperature library 4.0.6 (MIT), built
  unmodified, over the board library's own `OneWire`, which has the OneWire
  library's functions and exchanges each reset and bit with the simulation.
  The probe follows Maxim's datasheet command by command, including the ROM
  search, so several probes can share one wire; it reads 85 °C until its
  first conversion, and a conversion takes 750 ms at 12 bits. Without a
  pull-up on its DQ line no probe is found, and the lab says why.
- **JSN-SR04T waterproof ultrasonic sensor** (25 cm to 450 cm), **five-channel
  line sensor** and **12 V siren**.
- Ready-made program `thermo`, and two lessons, each checked step by step by
  the lab: **temperature probe** (1-Wire and the pull-up) and **tank level**
  (the waterproof sensor's blind zone).
- Hardware tests E13 to E16.

### Fixed

- An ESP32 program whose global objects set up a pin before `setup()` (as
  OneWire does) stopped before it began, printing nothing: the lab now lets
  that time pass without pausing the program.
- **Two I2C sensors** (circuit format version 16): the BME280 (temperature,
  humidity and air pressure) and the INA219 (current and voltage monitor).
  Each chip is answered register by register as its maker's datasheet gives
  them, and ESP32 programs read them through Adafruit's own libraries, built
  unmodified into the program as on a real board: BME280 2.3.0, INA219 1.2.3,
  BusIO 1.17.4 and the unified sensor library 1.1.15. Their licences are
  shown in the application.
- Ready-made programs `weather` and `monitor`, and two lessons, each checked
  step by step by the lab: **weather station** (I2C and addresses) and
  **current monitor** (current and power of a motor at 9 V and 6 V).
- A warning when a 3.3 V module (the BME280) is given more than 3.6 V.
- The board library has Arduino's `Stream`, and the register helpers that
  BusIO's SPI code uses; SPI itself is still not modelled.
- Hardware tests E11 and E12.
- **Power parts** (circuit format version 15): an 18650 lithium-ion cell, the
  TP4056 charger module with its protection, the LM2596 step-down regulator
  and a 5 V solar panel.
  - The cell's voltage follows how full it is (set on its slider); the lab
    shows the current going in or out and how many hours that would take to
    fill or empty it.
  - The charger charges at 1 A to 4.2 V, with a red light while charging and a
    blue one when full; on a dim panel it charges with what the panel can
    give. Its protection cuts off the output past about 3 A or below 2.4 V.
  - The regulator holds the voltage set on its trimmer and takes less current
    from its input than it gives.
  - The panel gives about 7.2 V open and 1.1 A into a short in full sun,
    falling with the light.
- Warnings for a lithium cell charged with nothing to stop it at 4.2 V, a cell
  emptied below 2.5 V, a charger given more than 8 V, its protection cutting
  off, and a regulator over 40 V in, over 3 A out, or with too little input
  for its setting.
- Two lessons, each checked step by step by the lab: **step-down regulator**
  (5 V from 9 V for a motor) and **solar charging** (a cell charged in sun
  that lights a lamp at night).
- The circuit solver has a current source.
- Hardware tests E7 to E10 for the four power parts.

### Fixed

- A circuit powered only by a cell or a solar panel is no longer told it has
  no battery.
- **Six sensor modules beyond the school kit** (circuit format version 14):
  a 0–25 V voltage sensor, the ACS712 current sensor (5 A, 20 A or 30 A), the
  MQ-7 carbon monoxide sensor, a pH sensor module, a TDS meter and a turbidity
  sensor. Each follows the figures its maker or sellers give, marked as such;
  the ACS712's output follows the current actually flowing through it in the
  circuit, and the TDS meter's output does not change with its supply.
- Warnings for a voltage sensor given more than its 25 V, and a current sensor
  carrying more than its range.
- Two lessons, each checked step by step by the lab: **water quality** (TDS
  and turbidity, and why a formula made for 5 V is wrong on the board's VIN)
  and **measuring power** (voltage, current and power of a motor). Their
  ready-made programs are `water` and `power`.
- Hardware tests E1 to E6 for the six modules.
- **Logic chips drawn with their gates in the diagram view.** A chip is a box
  with a textbook symbol inside for each gate in use (AND, OR, XOR, NOT, and
  NAND and NOR with their small circle), each leg named as in the datasheet
  (1A, 1B, 1Y), so it is clear which legs belong to which gate.
- **ESP32 feasibility study finished on a laptop**, with a recommendation for
  the owner to confirm (D-061): the lab's own board library runs ESP32
  programs, the chip emulator stays beside it as an experiment, and the server
  emulator is not taken up. A recount found 109 of the 113 one-file reference
  sketches build with the lab's library. The phone measurement is still open.
- **Digital logic, first step: 74HC gate chips on the breadboard** (circuit
  format version 13). The 74HC00 (NAND), 02 (NOR), 04 (NOT), 08 (AND), 32 (OR)
  and 86 (XOR), with their standard pinouts. A chip lands across the centre
  gap wherever it is tapped, slides along it, and can be swapped for another
  in the inspector. An input is HIGH above 70 % of the chip's supply and LOW
  below 30 %, keeping its level in between; outputs drive LEDs from the
  chip's own supply. Gates wired into a latch remember.
- Warnings for a floating input of a gate in use, gates that never settle, a
  supply over 6 V, too little supply, and an output asked for more than 25 mA.
- **Truth table**: with switches and LEDs in the circuit, the lab writes the
  table of every switch combination, and says when the circuit remembers so
  that the table depends on order.
- **The kit's relay module** (circuit format version 12): VCC, GND and IN, a
  COM/NO/NC contact, and the H/L jumper that sets whether IN must be HIGH or
  LOW to switch it on. The board pin only drives the optocoupler (about 2 mA);
  the coil's current comes from VIN. It warns when the jumper is on L and IN
  only gets a 3.3 V HIGH, and when the module has too little supply.
- A kit lesson on the relay module, and a ninth project, **automatic
  watering**: a soil sensor and a relay switching a pump on its own battery,
  with two limits so the pump does not chatter.
- **Saved settings on the ESP32** (the Preferences library), in the lab's own
  model of the board. Values are kept by namespace and key with their type, as
  in the chip's flash, and outlast stopping the circuit, uploading a new
  program and reloading the page: they are kept with the project, on the
  device. The board's inspector lists them and can erase them while the
  circuit is stopped. A new kit lesson counts how many times the board has
  started, with its own ready-made program.
- **Eight project lessons**, after the kit lessons: smart street light, rain
  alert, smart dustbin, security alarm, plant monitor, air quality monitor,
  smart parking and an obstacle-avoiding robot. Each joins several kit parts
  with its own ready-made ESP32 program, names the lessons worth taking first,
  and is checked step by step like the kit lessons. The lessons page shows the
  kit lessons and the projects in two sections.
- A lesson check can now require **every** part of a type to pass, as both of
  the robot's motors turning forwards.
- **Kit lessons**: 16 guided lessons, one for each kit part the lab models, in
  Bangla and English, from the first program on the ESP32 to the motor driver.
  - Each lesson starts its own project with the board in place. Each step says
    what to build or do, and lists what the lab is checking. The lab checks
    the student's circuit, program and what the simulation shows, so any
    correct circuit passes, wired anywhere on the breadboard.
  - A lesson's program goes on the board with one button. Progress is kept
    with the project on the device; nothing leaves it.
  - A "Lessons" page lists them in order, with how far the student has got.
  - The lesson text is the project's own and licensed **CC BY 4.0**; the
    programs are Apache-2.0. Nothing is taken from the handbook.
  - Every lesson is completed by an automatic walkthrough against the real
    simulation, so a lesson cannot ask for something the lab does not show.
- Five more ready-made ESP32 programs, for the rain, soil, gas, IR and buzzer
  lessons.
- For the owner only: `scripts/private-lessons.mjs` copies the handbook's
  chapter for each lesson into the git-ignored `private/` folder, and the app
  shows it beside the lesson when built with `BANGLALAB_PRIVATE_LESSONS=1`.
  An ordinary build, and every build in CI, contains none of it.
- **The kit's L298N motor driver**, a module that sits beside the breadboard
  with thirteen terminals (circuit format version 11).
  - Its outputs lose voltage as the real chip's do (about 1.6 V with one of the
    kit's motors), from the chip's datasheet; a motor on a 7.2 V pack gets
    about 5.5 V. Direction from two inputs, stop with both the same, speed by
    PWM on the enable pin once its jumper is taken off.
  - Its 5 V terminal is made from the motor supply by a regulator, and what it
    gives is taken from the battery. The module does nothing on a supply too
    low for it, or without a ground wire to the board, as on a bench.
  - With an enable jumper in place that pin carries 5 V, and the lab warns if
    an ESP32 pin is wired to it.
  - A ready-made program: motor forwards and back.
- **The kit's 7.2 V battery pack**: a new choice of battery voltage, drawn as a
  holder of six AA cells.
- **The ESP32 board's VIN pin can be fed from outside**, as on a robot that
  runs from its battery. The pin now sits behind a diode in the model, with
  the board's own 80 mA or so on it. The lab warns when VIN is fed while the
  board is also on USB, because many boards have no such diode.
- **The kit's OLED display** (0.96 inch, 128 × 64, SSD1306), on the ESP32
  board with the lab's own model of that board. Circuit format version 10.
  - Sketches use Adafruit's real SSD1306 and GFX libraries (BSD), built
    unmodified into the sketch; what they send is received by a model of the
    display's controller. The picture is drawn pixel for pixel on the part, and
    twice the size beside it when the part is selected.
  - The display stays dark with SCL and SDA swapped or without power, forgets
    its picture when power is lost, and on 5 V its pull-up resistors put 5 V
    on the bus pins, which the lab warns about.
  - A ready-made program: text and shapes on the OLED.
  - Not included: the graphics library's extra fonts (some come from GPL font
    files), and the display on the UNO-compatible board or the chip emulator.
- **The I2C bus (`Wire`) in the lab's ESP32 board library**, with the board as
  master. An exchange takes the time it takes on a real bus, and an I2C
  scanner sketch works. The bits on the two wires are not produced, so the
  oscilloscope shows both lines resting HIGH.
- `Print` is now a class of its own in the board library, as on the board, so
  that libraries which print to a display compile.
- **Five more parts of the school kit** (circuit format version 9), each with a
  ready-made ESP32 program where a program is needed:
  - **LDR light sensor module** and **rain sensor module**: a voltage on AO that
    falls with light or water, and a DO pin that goes LOW past the point set on
    the module's trimmer, with the module's indicator light.
  - **MQ-135 gas sensor module**: AO rises as the air gets worse. Its heater
    takes about 150 mA from 5 V, so on an ESP32 it is powered from VIN and its
    AO needs a divider; the lab warns about both mistakes.
  - **HC-SR501 motion sensor**: tap it to start or stop movement. Its output
    stays HIGH for the hold time after the movement, then it ignores movement
    for 2.5 s, as the real one does.
  - **RGB LED module**: three LEDs with one shared leg, each judged for too much
    current on its own; the drawing shows the mixed colour.
  - Ready-made programs: light in the dark, detect movement, mix colours.
  - What each model leaves out is in its part definition. The resistances
    inside the modules are estimates and the behaviour is as sellers report it;
    nothing has been measured on the kit's own parts (hardware tests C11, C12,
    C14, C15, C20).
- **A warning when a module gets too little voltage to work**, for example a 5 V
  motion or ultrasonic sensor wired to the ESP32's 3.3 V pin. Before, such a
  module simply did nothing and the lab did not say why.
- **First parts of the school kit on the ESP32** (with the lab's own model of
  the board):
  - **DHT11** temperature and humidity sensor: a new part with two sliders, its
    one-wire protocol simulated bit by bit, read by Adafruit's real DHT library
    (MIT), which is built unmodified into every sketch. Circuit format version 8.
  - **Servo**, through the lab's own version of the ESP32Servo interface. The
    kit's servo needs 5 V, so it moves when powered from VIN and not from 3V3.
  - **Ultrasonic sensor**: its 5 V echo now reaches a 3.3 V pin through a
    voltage divider, and the pin's level is taken from the solved circuit, so a
    divider that takes the signal down too far gives no reading.
  - Ready-made programs for all three.
- **A warning when a pin is given more voltage than it can stand**, for example
  a 5 V signal wired straight into an ESP32 pin. It says which pin, how much,
  the limit, and to use a divider.
- A board can be stopped at the instant a sensor's reply is due, so sensors that
  answer within microseconds are timed exactly.
- **ESP32 development board in the editor (experimental).** The 30-pin board can
  be added, moved, wired and probed, and is drawn in the diagram view; its pins
  work at 3.3 V with pull-ups, pull-downs and input-only pins, from the pin model.
  Programs run on the lab's own board library, built into a WebAssembly module:
  four ready-made programs (blink, button, fade, knob) work offline, and a
  student's own sketch is compiled by the sandboxed compile worker. The editor
  says that this is a model of the board, what works and what does not, and
  links to a page (`/esp32`) with what has been measured and what has not.
  Nothing has been checked against a real board.
- Groundwork for a second way to run ESP32 programs: `Esp32SimBoard` runs the
  board's real firmware in esp32sim, an emulator of the whole chip, behind the
  same interface as the other boards. `third_party/esp32sim` builds the emulator
  from its pinned source with one file of the lab's added.
- The compile worker builds real ESP32 firmware from a sketch, in its sandbox,
  with Espressif's toolchain and the Arduino core kept in
  `third_party/arduino-esp32` (LGPL-2.1, unmodified, with how to rebuild and
  relink). Tests build firmware, boot it in the emulator and run it against the
  example circuit.
- **A second way to run ESP32 programs, chosen in the Code tab (experimental):**
  the board's real firmware in an emulator of the chip. The emulator (4.5 MB) is
  fetched only when a student chooses it, then kept for offline use. Uploading
  with it needs the server. The editor says when the circuit is running slower
  than real time, which it does for any sketch whose loop never waits. A build
  of the lab made without the emulator simply does not offer the choice.
- The simulation tells a board when the circuit is not deciding a pin's level,
  so a pull-up the program enables reads HIGH in the same instant.
- Circuit format version 7 (adds the ESP32 board). A circuit has one board, of
  either kind.
- The simulation runs any board through one interface, from a table of each
  board's electrical behaviour.
- `packages/catalog`: imports a supplier's export into dated snapshots, keeping
  the original data, validating it and reporting issues; computes project and
  budget totals; word-prefix search; comparison of two snapshots. No catalogue
  data is published.
- `packages/parts`: one JSON definition per real part, with a validated format
  and honesty rules enforced by tests; 64 definitions covering every built part
  and the parts the shortlisted projects still need; a "missing in the
  simulator" report for a parts list.
- Resistor, LED and HC-SR04 now take their breadboard shape from their
  definitions.
- ESP32 feasibility study, in progress: the plan, the reference sketches sorted
  by what they need, a compile baseline, and a prototype board library
  (`spikes/esp32-api`) with its own tests, built natively and as WebAssembly,
  and a speed test page for a browser or a phone. A study prototype, not part of
  the lab; no decision has been made.
- ESP32 development board (30 pins), groundwork only: an electrical model of its
  pins with every number sourced and labelled (`packages/simulation`,
  `docs/engineering/esp32-pin-model.md`), and a drawing of the board with its
  pin positions for two row spacings (`apps/web/src/lab/esp32`). Not yet in the
  editor or the simulation; nothing checked on real hardware.

### Fixed

- The app's main file had grown past the 2 MiB that can be kept for working
  offline, because every ready-made ESP32 program was built into it. Each
  program is now a file of its own, fetched when it is chosen and still kept
  for working offline; the main file went from 2.14 MB to 1.05 MB.
- The diagram view now draws the ESP32 board's supply and ground pins. Before,
  only the UNO-compatible board's were drawn, so a wire to the ESP32's 3V3, VIN
  or GND ended at nothing on the board's side.
- A saved circuit that names a hole the breadboard does not have (a column past
  30, or a gap in a rail) is now refused when it is opened. Before, it was
  accepted and the leg was silently connected to nothing.
- A sketch that keeps a web page in a raw string (`R"HTML( … )HTML"`) no longer
  fails to compile. The JavaScript functions in the page were being mistaken for
  functions of the sketch.

## [0.1.0] - 2026-11-21

First public version. Everything listed is implemented and covered by automated
tests. Nothing has been validated on real hardware.

### Added

- Breadboard editor: placing parts, drag-to-wire and tap-to-wire, bendable wires,
  movable battery and board, undo and redo, placement preview.
- Circuit solver (Modified Nodal Analysis, Newton-Raphson, transient steps for
  capacitors), checked against ngspice 45.2 on 15 DC and 3 transient circuits.
- 20 parts with drawn, shaded visuals and plain-language diagnostics.
- UNO-compatible board emulated with avr8js, running real compiled firmware
  together with the circuit; servo, ultrasonic sensor and character LCD models.
- Sandboxed compile service for sketches, on plain avr-gcc.
- Code editor, serial monitor, oscilloscope and logic traces, two-probe
  voltmeter, hover voltage.
- Diagram view: the breadboard circuit drawn as a schematic, with current flow.
- Bangla and English throughout; offline use; saving on the device with format
  migration (circuit format version 6).
- Apache-2.0 licence, NOTICE, third-party licence list, an in-app licences page,
  and the corresponding source of the LGPL starter firmware.
- A licence check that refuses copyleft in shipped dependencies.

### Known limits

- No ESP32, digital logic, lessons, accounts or upload to a real board.
- One 830-hole breadboard and at most 200 parts per circuit.
- Hover and drag-to-wire need a mouse or pen.
- Not measured on a real phone.
