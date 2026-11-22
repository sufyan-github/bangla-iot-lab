# Decision log

Newest last. Each entry: the decision, why, and what would change it.

## D-001 — Node.js 22 LTS now, Node 26 later

The brief names Node 26 LTS. The development machine has Node 22.23 and nothing
in Phase 0 needs a newer runtime. `engines` is `>=22.18`. **Revisit** when
production hosting is chosen; moving up should be a version bump only.

## D-002 — TypeScript 6.0, not 7.0

`typescript@latest` is 7.0, but `typescript-eslint` 8.73 supports only `<6.1`.
Linting matters more than the newest compiler, so TypeScript is pinned to `~6.0`.
**Revisit** when typescript-eslint supports 7.

## D-003 — Internal packages are consumed as TypeScript source

Packages export `./src/index.ts`; Vite, Vitest and tsx compile them on the fly.
No per-package build, no stale `dist`. Consequence: all packages share one set
of compiler options, so `noUncheckedIndexedAccess` is off everywhere (the
numeric kernels index typed arrays constantly). **Revisit** if a package is ever published.

## D-004 — Create packages when they have content

The brief suggests `ui`, `lesson-engine`, `content-schema` and `config`
packages. They would be empty in Phase 0, so they are not created yet. The
circuit document model lives in `shared`. **Revisit** in Phase 2 (lessons) and
when a second app needs shared UI components.

## D-005 — Custom dense MNA solver; ngspice as reference only

A TypeScript solver runs in the browser, offline, in microseconds, and its
intermediate values can be explained to students. ngspice (WebAssembly build,
42 MB) is used only in development to generate golden results. **Revisit** the
dense solver if circuits exceed a few hundred nodes.

## D-006 — Wires are 10 mΩ resistors, not merged nodes

Costs a few extra unknowns; gives the current in every wire, which drives the
flow animation and later the ammeter. Error versus ideal wires is below 0.01 %
for school circuits.

## D-007 — Batteries have 0.5 Ω internal resistance

Makes a short circuit a solvable, explainable event instead of a singular
matrix, and lets the terminal voltage sag realistically. The hand-calculated
LED current differs by about 0.2 %. **Revisit** with per-chemistry values in Phase 1.

## D-008 — Floating sub-circuits are grounded at one node

The first implementation added a tiny conductance from every node to ground.
That made an unconnected LED read about 0.68 V — a number invented by the
solver. It was replaced by anchoring each isolated group of nodes once, which
changes no current and gives the physical answer (0 V). Recorded because the
first approach passed every test until the readings were checked by hand.

## D-009 — Editing rules are pure functions over an immutable document

Every edit returns a new document or an error code. The UI cannot construct an
invalid circuit, drags are computed from the document at drag start, and the
rules are tested without a browser. Enables undo/redo later with no redesign.

## D-010 — Compile worker: bubblewrap per job, container in production

Each build runs in its own namespace with no network, no `/home`, no `/etc`, a
read-only toolchain and a clean environment. Tests confirm `#include
"/etc/passwd"` and `.incbin` read nothing. In a container (where nested
namespaces are usually unavailable) the container is the boundary and must be
started read-only, without capabilities and without secrets. The worker refuses
to start if the configured sandbox does not work. **Revisit**: add CPU and
memory limits per job (cgroups or `prlimit`) before public exposure.

## D-011 — Phase 0 compiles plain avr-libc C, not Arduino sketches

ArduinoCore-avr is not installed locally and adding it (core build, `setup` /
`loop` wrapper, library handling) is Phase 1 scope. The proof of concept shows
the whole path — source → sandbox → HEX → emulator — with plain C.

## D-012 — Local storage is the source of truth until accounts exist

Projects live in IndexedDB (Dexie). There is no project API yet because there
is no authentication, and an unauthenticated write API would be a liability.
`project_versions` is designed for append-only sync in Phase 2.

## D-013 — Unit symbols stay international; digits follow the language

"২১.৮ mA", not "২১.৮ মিলিঅ্যাম্পিয়ার": symbols match what is printed on real
meters and parts. **Revisit** after teacher feedback in the pilot.

## D-014 — The unauthenticated compile endpoint is localhost-only

Rate limiting alone is not enough protection for a public CPU-heavy endpoint.
Until Phase 2 adds accounts and per-school quotas, the API binds to 127.0.0.1
and must not be deployed.

## D-015 — Playwright pinned to 1.65.0

Matches the Chromium build already cached on the development machine. Any
later version works after `playwright install chromium`.

## D-016 — Processor and circuit take turns in 1 ms slices

The processor runs for 1 ms of simulated time; its pin changes are then
replayed against the circuit in order, with exact timestamps, and the resulting
voltages are fed back to its inputs. Outputs are therefore exact in time (PWM
duty and frequency are measured correctly), while a program reading a pin it
also drives sees the result up to 1 ms late. **Revisit** if a lesson needs
tight output-to-input loops (for example a software-timed ultrasonic echo).

## D-017 — Steady circuits are solved once per pin state

Without capacitors nothing changes between pin events, so the solution for each
combination of pin levels is cached. A blinking or PWM circuit costs a handful
of solves regardless of run time. With capacitors the cache is bypassed and the
circuit is stepped at 0.1 ms with backward Euler (first-order, never rings).
**Revisit** with adaptive steps or the trapezoidal method if accuracy on fast
time constants matters for a lesson.

## D-018 — Readings are averages over the frame; damage uses the peak

A meter and the eye average a fast signal, so displayed voltage, current and
LED brightness are time-weighted averages over each 33 ms frame. Over-current
and burn-out use the worst instant. The oscilloscope shows the unaveraged signal.

## D-019 — ArduinoCore-avr is fetched at a pinned commit, not vendored

The core is LGPL-2.1. A script fetches release 1.8.8, verifies the commit hash
and refuses anything else; the directory is git-ignored. The worker compiles it
once per toolchain into a static library at start-up.

## D-020 — Programs live beside the circuit document, not inside it

A project record holds `circuit` and `programs` (source, last uploaded firmware,
and the source that firmware came from). Typing code does not touch the circuit,
"code has changed since upload" is a simple comparison, and stored firmware lets
a board circuit run offline. The shape leaves room for Blockly: a program can
later carry its block workspace and say which form is the master copy.

## D-021 — Circuit schema version 2, with migration on read

Version 2 adds the UNO, push button, potentiometer and capacitor. Version 1
documents are upgraded when read (`migrateCircuit`), in storage and anywhere
else a document enters the app; a test opens a version 1 project.

## D-022 — The stand-alone Arduino test page was removed

It was the Phase 0 proof that firmware runs. The board is now a part in the
lab, which makes the separate page redundant.

## D-023 — Function prototypes are generated by a simple scanner

Arduino lets a function be used before it is defined. The worker adds
prototypes with a small scanner that understands comments, strings, macros and
brace depth, rather than running a full C++ parser. It handles ordinary
functions; templates and function-pointer return types must be declared by
hand. **Revisit** if real sketches trip it.

## D-024 — Parts with a loose end are removed from the equations

Found while adding the relay: an LED whose resistor led to an open contact made
the solver iterate forever for one particular LED model. A loose node is held
only by picoampere leakage next to ordinary resistances; the equations are then
so ill-conditioned that round-off noise exceeds the convergence tolerance. The
solver now peels dangling resistors and diodes away before solving (they carry
no current, so the loose end simply follows the connected end), and accepts an
iteration that has stalled below 1 mV for six rounds. Recorded because every
test passed until a specific parameter value hit it. **Revisit** the wire model
(D-006) if leakage-held nodes ever need better than about 1 % voltage accuracy.

## D-025 — Three-pin sensor modules are voltage dividers

Temperature, soil-moisture and IR modules are modelled as a 10 kΩ divider from
supply to ground with the output at the tap. Output is exact at 5 V, falls to
zero when the module is unpowered, and needs no new solver device. The cost: the
temperature sensor's output scales with supply, which the real part's does not.

## D-026 — The relay remembers its position

The contact closes at 50 mA of coil current and opens below 15 mA. The settled
solve repeats until contacts and coil currents agree (at most four rounds, so a
relay wired to interrupt itself cannot loop forever), and a running session
carries each relay's position from one solve to the next.

## D-027 — The motor is a resistor

25 Ω winding resistance, no back-EMF or inertia. This gets right the fact that
matters for teaching — a pin cannot drive a motor, a transistor can — and
overstates the running current. **Revisit** when a lesson needs speed control
or measured motor current.

## D-028 — Circuit schema version 3

Adds ten part types. Any older version is upgraded on read; versions only ever
add part types, so the upgrade is a change of number.

## D-029 — Arduino libraries are built into the core archive

Servo 1.3.0 and LiquidCrystal 1.0.7 are fetched at pinned commits by the same
script as the core, compiled once with it, and placed in the same static
archive. Every sketch gets their include paths and the linker takes only what
it uses, so no include scanning or per-sketch library build is needed. **Revisit**
when a library with a large footprint or conflicting symbols is added.

## D-030 — Parts that work by timing are modelled beside the circuit, not in it

A servo reads pulse widths, an ultrasonic sensor answers a trigger with an echo,
an LCD takes data clocked on its E pin. None of that is visible to a circuit
solver that exchanges values with the processor once a millisecond. These parts
are handed every pin change with its exact time. A sensor's reply is scheduled
as a board input at an exact time, and the processor is run up to precisely that
moment before it is delivered. With an ultrasonic sensor present the exchange
interval drops to 0.25 ms, shorter than the sensor's 0.46 ms response delay, so
a reply can never be due before it is known. Each part is found by following
wires and board strips from its signal legs to a board pin, so it must be wired
directly, not through another part. Electrically these parts are only a supply
load (and the echo line a 5 V source), and they do nothing unless their supply
is above 4 V.

## D-031 — The LCD has its real sixteen pins but forgiving behaviour

The part matches the physical module pin for pin so that wiring practice
transfers, but contrast, backlight and the RW pin are not enforced. A lesson or
the tutor should say that RW goes to ground and V0 needs a contrast voltage.

## D-032 — Circuit schema version 4

Adds the servo, ultrasonic sensor and LCD. Older versions are upgraded on read.

## D-033 — Pico: go, on rp2040js with the official MicroPython firmware

A time-boxed trial ([pico-trial.md](pico-trial.md)) found that rp2040js 1.4.2
runs MicroPython v1.29.0 correctly, with exact timing, once one emulator fault is
worked around: its USB serial port never lets the processor sleep. With the fix
a waiting program costs almost nothing; a program that computes continuously
runs at 0.1 to 0.3 times real time on a laptop. Integration may proceed for the
plain Pico, after a speed measurement on a real low-end phone. rp2040js is
pinned to an exact version because the fix touches one of its private fields.

## D-034 — Circuit schema version 5: batteries and the board can be moved

A battery and the UNO may carry `at`, their top-left corner in hole pitches from
the breadboard's origin. Pitches rather than screen units, so the saved circuit
does not depend on how the editor draws it. The field is optional: a part that
was never moved is laid out in its usual place, and version 4 documents open
unchanged. The breadboard itself stays fixed; everything else is placed relative
to it. Whether a place is free (clear of the breadboard and of other parts) is
decided by the editor's geometry, which knows the drawn sizes; the shared
package only validates the numbers.

## D-035 — The canvas works out taps and drags itself, from pointer position

Holes, terminals and sockets no longer have their own click handlers. The
canvas reads every press, finds the nearest endpoint, and decides between a
tap, a wire being pulled out and a drag. This allows three things the old
per-hole handlers could not do: one hover mark for every endpoint in every
tool, press-drag-release wiring alongside tap-tap, and pulling a wire from a
free hole with the select tool. A press that travels less than 10 screen pixels
is a tap whatever happens to the page meanwhile. This rule exists because
starting a wire changes the hint text, which on a narrow screen moved the board
under a stationary pointer and finished the wire on the wrong hole. Touch keeps
tap-tap wiring only, so a finger dragged across the board still scrolls it.

## D-036 — Carried parts follow the hand; the circuit changes hole by hole

While a part, a leg or a wire end is dragged it is drawn at the pointer, and
rings mark the holes it will drop into. The circuit document still changes only
when the nearest valid holes change, so a running simulation reacts during the
drag and an invalid position is never stored. Batteries and the board have no
holes to snap to and move continuously, sliding along an obstacle instead of
stopping dead.

## D-037 — Undo keeps whole circuits, and programs follow their boards

The history is a list of earlier circuit documents (up to 100), not a list of
inverse operations: documents are immutable and small, so keeping them is
cheaper and safer than writing an inverse for every edit. One user action is one
step: a whole drag, and a slider's stream of changes within 0.7 s. Undo does not
roll back program text, which has its own undo in the editor. Each step does
remember the programs the boards had, so a board that undo brings back gets its
program again and a running circuit reloads it. The history is not saved with
the project; it starts empty each time a circuit is opened.

## D-038 — Circuit schema version 6: wires may be routed through bend points

A wire may carry up to eight `bends`, stored like part positions in hole
pitches. Bends are only how the wire is drawn; the simulator ignores them. A
wire without bends still hangs slack between its ends. Right-angle-only wires on
the breadboard were considered and rejected by the owner in favour of jumper
wires that can be bent, as real ones are.

## D-039 — The schematic is a generated view, not a second editor

The owner chose a diagram drawn from the breadboard circuit over a separate
schematic editor. The breadboard stays the single source of truth, so there is
one saved format and nothing to keep in step. The diagram is laid out by a
simple rule that is always correct rather than clever: symbols in one row,
ordered outward from the supply; supply rails above, ground rails below, every
other net on a horizontal track under the row; legs reach their net by a
vertical drop; two series parts that end up side by side are joined directly.
A plain loop therefore looks like the textbook drawing, while a busy circuit
looks like a bus diagram with many tracks. A layout that folds branches the way
a person would draw them is a known next step, not attempted here. Modules and
the board are labelled boxes showing only the legs in use. The layout is pure
data (`lab/diagram/layout.ts`) and tested without a browser.

## D-040 — Parts are drawn, not photographed

"Real-looking" parts are SVG drawings with shared shading (a round body, a dome,
brushed metal, board gloss), metal legs and cast shadows. Photographs were not
used: they would need licensed images for twenty parts, add megabytes to an
offline-first download, and could not show state (a lit LED, a turned knob, a
closed relay) without a second image per state.

## D-041 — Board circuits are drawn as a tree from the board, with supply and ground symbols

Supersedes the layout part of D-039 for circuits that contain a board; circuits
without one keep the row-between-rails layout, which suits a battery loop.

The board stands on the left and each pin in use leads off to the right through
the parts wired to it, branching where a net has several legs. Supply and ground
are not wired across the page: each leg on them ends in its own symbol. That one
change removes most of the wiring that made busy diagrams unreadable, and it is
how such circuits are drawn by hand and in Proteus. A module wired to several
pins is entered on parallel lines, and the board's pins are listed in the order
that makes those lines straight rather than in numerical order. Two parts in
parallel are closed with a short wire.

The drawing is a tree, so a connection that would close a loop in it (a part
whose far leg returns to another board pin, for example) is not routed. Both
ends get a flag with the same name, the board pin's name where there is one.
This is always electrically correct and standard schematic practice; routing
such wires is left for when it proves to matter. Parts the board does not lead
to, batteries above all, are drawn on their own underneath.

Every layout is checked by one property test (`expectSound` in
`layout.test.ts`) on several circuits: wires are horizontal or vertical, every
leg of a net is joined by wire or by a shared terminal, wires of different nets
never run along each other, no wire crosses a symbol, and symbols do not overlap.

## D-042 — The simulator reports node voltages and per-leg currents

Two things the solver always knew are now part of every result: the voltage at
each net, keyed by net name, and the current into each part through each of its
legs. Leg currents are worked out from the solver's devices, not by reasoning
from part readings: a part's devices are found by name, and a device's current
is added at whichever of its nodes a leg sits on. So a potentiometer's wiper or
a transistor's emitter is right without a special case, and a part's legs always
add up to zero. Both are averaged over a frame like every other reading.

## D-043 — The multimeter is two probes, and measures voltage only

The probe tool places a red and a black probe on any hole, terminal or socket;
the meter shows red minus black. With only the red probe down, black counts as
resting on ground, so a single tap already gives a useful reading. A probe on a
net nothing is joined to reads "nothing connected", not zero, because a floating
point has no voltage and a real meter there shows noise. Probes are not saved
with the circuit and are not undo steps: measuring changes nothing.

Current is not measured with the probes. A real meter measures current in
series, which means breaking the circuit; the lab already shows every part's
current directly, so that lesson is left for when it is asked for.

## D-044 — Current flow in the diagram follows the drawn wires

Each drawn net is a tree of wire pieces. The current in a piece is what the legs
on one side of it put into the net, so a branch visibly splits the flow and the
numbers add up. Dashes also run through two-leg parts and up through a battery,
so the eye follows one path from the source round and back. Currents under
5 µA are not drawn, which keeps input pins quiet. Flow is not drawn through
modules, the board or a transistor, whose inside paths the diagram does not show.

## D-045 — The ESP32 pin model is built from Espressif's documents, and its analog input is their calibration curve run backwards

The ESP32 development board's pins are modelled from Espressif's datasheets and
source code alone, each number labelled as read from a document, reported, or
our estimate ([engineering record](../engineering/esp32-pin-model.md)). Two
choices had real alternatives.

The analog input could have been an ideal converter (count = V / 3.3 × 4095).
It is not, because that is the mistake students make with the real board: the
real converter reads 0 below about 0.14 V, about 176 counts low through the
middle, and reaches full scale near 3.13 V. Espressif publishes the curve from
count to millivolts in its calibration code, so the model inverts that curve.
The cost is that the model is a nominal chip: real chips differ, and none has
been measured.

A digital input between the two datasheet thresholds keeps its last level, as
the UNO-compatible board's pins already do. The datasheet gives no hysteresis
figure, so any single switching voltage would have been invented.

## D-046 — Both ways of running ESP32 programs are offered in the editor, as experiments

The ESP32 feasibility study was to compare three ways of running ESP32 programs
and then choose one. On 22 November 2026, with its measurements on a laptop done
and nothing yet measured on a phone, the owner asked for the ESP32 to be put in
the editor with both browser options, switchable: the lab's own board library
(option C) and an emulator of the whole chip (option A, esp32sim). Both are
labelled experimental in the editor, with what each gets wrong.

The first is built. It was chosen to go first because it runs offline, its
modules are tens of kilobytes, and its worst case is several times faster than a
real board on a laptop; its cost is that it is our model of the board, and the
study has already found four places where the model was wrong. The second is
not built yet: it needs the whole ESP32 toolchain on the compile server for
every sketch, and a third of the reference sketches ran five times slower than
a real board in its native build.

The study's own decision (step 6) is still open, and still waits for a
measurement on a real low-cost phone.

## D-047 — A sketch is made pausable, not run in a worker that blocks

A sketch's `loop()` never returns and its `delay()` must let time pass, while
the simulation runs a board a millisecond at a time and must stay able to take a
button press. The sketch module is therefore rewritten after compiling so that
it can be stopped inside a call that lets time pass and carried on later
(binaryen's asyncify). The alternative was to run the sketch in a worker that
blocks, and to pass inputs through shared memory; that needs every page of the
site to be served with headers that isolate it, changes how the lab is hosted,
and would have made a run depend on real time. The chosen way keeps a run exact
and repeatable, lets the tests drive a sketch without a clock, and costs about a
quarter more module size.

One consequence is shared with the UNO: the board is shown the circuit once a
millisecond, so a sketch reads an input up to a millisecond late.

## D-048 — A circuit has one board, of either kind

The UNO-compatible board and the ESP32 share the limit of one board per
circuit. Two boards at 5 V and 3.3 V on one breadboard is a real and useful
circuit (it needs a level shifter), but the ground reference, the program
panel and the saved programs all assume one. Lifting the limit is separate work.

## D-049 — The chip emulator is built from its source, with one file added, and none of it is kept here

esp32sim is MIT, so the lab could copy it in. It does not: `third_party/esp32sim`
holds a script that fetches one release, checks it is the commit the script was
written for, adds one file and builds it. The file (`lab.rs`) exports pin, PWM,
analog and register access that the emulator's core already has but its browser
build does not offer. Keeping the addition that small means a new release of
the emulator can be taken by changing two lines, and the addition can be
offered back to its authors.

The alternative was to use the emulator's own page protocol, which has no way
to learn what an output pin is doing, or to download the module its authors
publish, which cannot be checked against a source.

The built module is not committed either. It is 4.5 MB, and the app does not
use it yet.

## D-050 — The engine is chosen per program, and the chip emulator is fetched only when chosen

A student chooses in the Code tab how an ESP32 program is run. The choice is
kept with the program, and a built program says by its own form which engine it
is for, so a program built for one engine is never handed to the other: after
changing the engine the editor asks for an upload.

The emulator and the chip's start-up code are 5.4 MB. They are not part of what
the app stores at install; the simulation fetches them the first time a program
needs them and the browser keeps them after that. A student who never chooses
the emulator never downloads it. A build of the lab made without the emulator
does not offer the choice at all.

Ready-made programs are shipped built for the lab's own model only. Shipping
them as real firmware as well would put Espressif's Arduino core, which is LGPL,
into the app itself; for now such firmware comes only from the server, which
builds it from the source in `third_party/arduino-esp32`.

A program that the emulator cannot run in real time is not dropped or frozen:
the simulation gives itself less to do each tick, the circuit runs in slow
motion, and the editor says at what share of a real board's speed.

## D-051 — Where a real library is permissively licensed, the lab builds that library, not its own copy of it

The DHT11 is read with Adafruit's DHT library, which is MIT. The lab keeps that
library, unmodified, in `third_party/adafruit-dht` and builds it into every
ESP32 sketch made for its own model of the board. The sensor is simulated at
the level the library works at: the pulses on its data wire.

The alternative was to write a `DHT.h` of our own that asks the simulated
sensor for its values directly. That is less work and hides the protocol, but
it is one more piece of the lab's own model that can be wrong in ways nobody
notices; the ESP32 study found four such faults in the board library by running
real firmware. With the real library, what a student's sketch does between
`dht.readTemperature()` and the wire is the code they will run on the board.

The ESP32Servo library is LGPL, so for the servo the lab has its own version of
that library's interface, written from its documented behaviour.

## D-052 — A sensor's signal reaches a board pin through the circuit, not past it

A 5 V sensor on a 3.3 V board needs a voltage divider, and the kit has the
resistors for it. The ultrasonic sensor's echo is therefore found through a
resistor as well as through a wire, and the level the pin sees is taken from the
solved circuit at the instant the echo changes. A correct divider works, a
divider that takes the signal down too far gives no reading, and the sensor
wired straight to the pin still works but raises a warning that the pin is
getting 5 V. The earlier model handed the level to the pin directly, which made
the wrong circuit the only one that worked.

## D-053 — The kit's sensor modules are modelled from what sellers report, and where versions differ the lab takes the choice that is safe on every version

The LDR, rain, MQ-135 and HC-SR501 modules and the RGB LED module are generic
parts made by many factories, with no single datasheet and no schematic that
comes with the kit. What the lab models is therefore labelled by how it is known:

| What                                                            | How it is known                                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| LDR and rain modules: AO falls with light or water; DO LOW then | REPORTED by sellers' pages and tutorials                                                                    |
| MQ-135: heater about 33 Ω at 5 V                                | REPORTED: 33 Ω ± 5 % (Hanwei datasheet), 30 Ω ± 3 Ω (Winsen manual)                                         |
| HC-SR501: 4.5 V to 20 V supply, 3.3 V output, 2.5 s blocking    | REPORTED by sellers' datasheets; one gives 8 s blocking                                                     |
| HC-SR501: hold time                                             | REPORTED, and the sources disagree: from 0.3 s, 3 s or 5 s up to 200 s or 300 s. The lab offers 3 s to 60 s |
| RGB LED: red 1.8 V, green and blue 2.8 V; common negative leg   | REPORTED by one maker (Joy-IT, KY-016)                                                                      |
| Every resistance inside the modules; how far AO moves           | ESTIMATE                                                                                                    |

None of it is measured. Hardware tests C11, C12, C14, C15 and C20 measure
exactly these things on the kit's own parts, and the models change to whatever
those tests find.

Two choices follow a rule: **where versions of a part differ, model the one
that makes a student's circuit safe on all of them.**

- Some RGB LED modules carry a resistor for each colour and some carry none.
  The lab models none, so it asks for a resistor on each colour. A circuit
  built that way works with both versions; the other choice would teach a
  circuit that overdrives the version without resistors.
- A 5 V module's output is shown at 5 V, and the lab warns when it reaches an
  ESP32 pin, even where the module's own pull-up resistor would in practice
  limit the current to a harmless amount.

The lab also now says when a module is wired to less voltage than it works on
(D-052 covered too much voltage; this is too little). A motion sensor on 3.3 V
and an ultrasonic sensor on 3.3 V used to do nothing without a word.

Sources read on 22 November 2026:
[HC-SR501 datasheet copy](https://courses.ece.cornell.edu/ece5990/ECE5725_Spring2020_Projects/May_15_Demo/Smart%20Lock/W_pp445_yl656/datasheet/31227sc.pdf),
[SunFounder's HC-SR501 page](https://docs.sunfounder.com/projects/umsk/en/latest/01_components_basic/12-component_pir_motion.html),
[Winsen's MQ-135 manual](https://www.winsen-sensor.com/manual/mq135.html),
[Hanwei MQ-135 datasheet copy](https://datasheetq.com/pdf-view/MQ-135-HANWEI.pdf),
[a rain sensor guide](https://randomnerdtutorials.com/?p=22600),
[an LDR module description](https://openhw-studio.fossee.in/docs/components/openhw-ldr-module.html),
[Joy-IT's KY-016 page](https://sensorkit.joy-it.net/en/sensors/ky-016).

## D-054 — I2C is modelled as whole exchanges, and the display is driven by the real libraries

The kit's OLED display talks over I2C. Two choices were made.

**The bus carries whole exchanges, not bits.** The board library's `Wire`
hands the simulation one message at a time: the address, the bytes written and
how many to read back. The simulation finds the part whose SDA and SCL legs are
wired to the pins the sketch uses, checks it has power, and gives it the bytes.
Wiring mistakes behave as on a bench (swapped wires, no power, wrong pins: no
answer), an exchange takes the time its bits would take at the bus speed, and a
scanner sketch works.

The alternative was to produce every clock and data edge on the two pins. A
full picture is about nine thousand clock pulses, which the simulation would
replay against the circuit one edge at a time. That cost buys one thing, the
waveform on the logic analyser, and it can be added later behind the same
interface without changing a part's model. Until then the instruments show
both lines resting HIGH, and the part says so.

**The display is driven by Adafruit's own libraries**, following D-051:
Adafruit_SSD1306 and Adafruit_GFX are BSD-licensed and are built unmodified
into the sketch, so the lab models the chip (SSD1306: its picture memory,
address windows and switching on) and not a drawing library. What a sketch
draws in the lab is what the same sketch draws on the bench, including the
library's start-up picture.

Left out on purpose: the GFX library's `Fonts` folder. Several of those fonts
are made from GNU FreeFont, which is GPL, and the project ships no GPL
material. A sketch that includes one of them does not compile, and the error
says which file is missing.

To make these libraries compile, the board library gained a `Print` class,
`Wire.h`, an `SPI.h` that is declared and does nothing (the lab has no SPI
parts), and the three macros the ESP32's own build defines. Sketches are now
built without run-time type information, as on the board; with it, every
sketch carried about 25 kB of the standard library's error printing.

Not done: the display on the UNO-compatible board (it needs the same work on
that board's I2C hardware and its compiler), and on the chip emulator, which
has no `Wire` library yet.
