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

## D-055 — The motor driver is a module beside the breadboard, modelled by what its outputs lose

The L298N module has screw terminals and a row of pins; it cannot be pushed
into a breadboard. It is therefore a part that sits beside the breadboard and
takes wires at its terminals, as the battery and the boards do. This is the
first such part that is neither a supply nor a board.

**What is modelled, and how it is known.**

| What                                                                                                  | How it is known                                                             |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| An output loses 1.35 V on the supply side and 1.2 V on the ground side at 1 A; 2.0 V and 1.7 V at 2 A | REPORTED: typical figures in the chip's datasheet (STMicroelectronics L298) |
| An input is HIGH above 2.3 V and LOW below 1.5 V, so a 3.3 V pin drives it                            | REPORTED: the same datasheet                                                |
| A regulator makes 5 V from the motor supply; both enable pins are jumpered to 5 V as sold             | REPORTED by sellers' descriptions of the module                             |
| The regulator needs the supply 2 V above its output; the module draws about 43 mA at rest             | ESTIMATE (the datasheet's typical supply currents; a typical regulator)     |
| The motor: 25 Ω                                                                                       | The lab's generic motor. A TT motor is REPORTED to take about 150 mA free   |

Each output is a junction and a small resistance, fitted to the two datasheet
points, and can only give current (when HIGH) or only take it (when LOW). The
loss in the driver is the thing students most often do not expect ("why does
my 6 V motor run slowly on 7.2 V?"), so it is modelled and not idealised.

**The 5 V terminal takes its current from the battery.** A fixed 5 V source
would have been simpler and wrong: a board powered from that terminal would
cost the battery nothing. The regulator is modelled as a pass transistor, so
the battery's current includes what the 5 V terminal gives.

**Feeding the ESP32 board's VIN.** A robot's board runs from the driver's 5 V
terminal through VIN. In the lab the board is always on USB as well. Official
boards have a diode between USB and VIN, which makes that harmless; many
clones do not, and feeding VIN with USB plugged in can push current back into
the computer. Following D-053 (model what is safe on every version), the lab
models the diode, so the circuit works, and warns whenever VIN is fed from
outside, telling the student to unplug USB on a real board.

VIN used to be a fixed 4.65 V source. It is now USB's 5 V behind a diode with
the board's own current (about 80 mA, from the chip's datasheet range plus an
estimate for the rest of the board) on the pin's side, which gives the same
4.65 V with nothing connected.

**The battery pack** is the lab's battery at 7.2 V. It does not run down, and a
freshly charged pack's 8.4 V is not shown; the part says so.

Not modelled: heat and thermal shut-down, the spike when a motor is switched
off, a motor's speed, load and stall current. Hardware tests C17 and C18
measure the driver's loss and the pack under load.

Sources read on 22 November 2026:
[a copy of the L298 datasheet](https://www.ece.nus.edu.sg/ee3032/html/Common/L298datasheet.pdf),
[SunFounder's L298N module page](https://docs.sunfounder.com/projects/sf-components/en/latest/component_l298n_module.html),
[a TT motor page](https://docs.sunfounder.com/projects/3in1-kit-r4/en/latest/components/component_tt_motor.html),
[a discussion of the DevKitC's diode](https://forum.micropython.org/viewtopic.php?p=51413).

## D-056 — The kit lessons are the project's own, under CC BY 4.0, and are checked by what the lab shows

**Content.** The lessons are written for the lab, in Bangla and English, one
for each kit part the lab models, in the order the handbook takes the kit. No
text, picture or program comes from the handbook: its ownership and licence
are not confirmed, and the owner's condition is that unlicensed material stays
private. At the owner's request ("Both"), the handbook's chapter for each
lesson can be shown beside the lesson for comparison, but only from the
git-ignored `private/` folder and only in a build made with
`BANGLALAB_PRIVATE_LESSONS=1`. A browser test checks that an ordinary build
shows none of it, and a unit test that the module is empty unless asked for.
The map from lessons to handbook chapters is kept in `private/` as well.

**Licence.** The owner chose CC BY 4.0 for the lesson text (22 November 2026):
schools and teachers may copy, translate and adapt it, with credit. The lesson
files are in `packages/lessons/content/`, with a note saying so; the code that
runs them and the ESP32 programs they use stay Apache-2.0.

**Checks.** A step lists what must be true, as data: a part is present, two
places are joined (directly, or through one resistor of a given range), a
setting has a value, the lesson's program is on the board, the circuit runs,
nothing is being damaged; and things that happened while it ran: a part's
reading, text in the serial monitor, a warning the lab gave. A place is named
the way a lesson talks about it ("the LED's +", "D2", "GND"), not by
breadboard hole, so any correct circuit passes wherever it is built. Things
that happen count once they have been seen on the step; the circuit counts
only as it is now.

**Proof.** Every lesson has a walkthrough in `packages/lessons/src/lessons.test.ts`:
a circuit that does what the lesson asks, and what the student changes on each
step. The test runs it against the real simulation and the shipped program and
requires every step to complete within nine simulated seconds. A lesson that
asks for something the lab cannot show, or a program whose output no longer
matches what a lesson looks for, fails it.

Not done: the relay module has no lesson, because the lab's relay is a bare
relay and the kit's is a module with its own transistor; lessons for the
handbook's projects; mapping to the NCTB curriculum; and anything a teacher
sees. Progress is kept on the device only, as there are no accounts yet.

## D-057 — Project lessons are what the lab can show today, built from the kit lessons

Eight projects follow the 16 kit lessons. Each joins parts the student has met
in a kit lesson, names those lessons as worth taking first, and has its own
ready-made ESP32 program written for the lab (Apache-2.0). The text is the
project's own and CC BY 4.0, as for the kit lessons (D-056); the project themes
are common school projects, and nothing is taken from the handbook.

Chosen because every part of each can be simulated now: street light (LDR,
motion sensor, LED), rain alert (rain sensor, servo, buzzer), dustbin
(ultrasonic, servo, buzzer), security alarm (motion sensor, button, buzzer,
LED, OLED), plant monitor (soil, DHT11, OLED, RGB LED), air quality (MQ-135
with a divider, OLED, RGB LED, buzzer), parking (IR, ultrasonic, servo, OLED)
and an obstacle-avoiding robot (motor driver, two motors, battery, ultrasonic).

Left out for now, and why:

- Anything that needs Wi-Fi (a web dashboard, sending data): the lab has no
  Wi-Fi.
- Automatic watering: it needs the relay module and a pump, and the lab's
  relay is a bare relay, not the kit's module.

As for the kit lessons, each project has a walkthrough that completes it
against the real simulation; breaking a robot motor's wiring or giving the air
quality step too little gas makes its walkthrough fail.

## D-058 — Saved settings are kept with the project, and survive what flash survives

The ESP32's Preferences library keeps values in flash, where they survive the
board being switched off and a new program being uploaded (an upload from the
Arduino tools does not erase that part of flash unless asked to). The lab
does the same: each board's saved settings are kept with the project on the
device, passed to the board when the circuit starts, and kept across uploads,
stopping and reloading. Undo does not touch them, as undoing a wiring change
on a bench does not change the board's flash.

The library is the lab's own, written from the documented interface, like its
`ESP32Servo.h`; the Arduino core's Preferences is LGPL and is not used. It keeps
each value's type as NVS does, so a value read as the wrong type gives the
default. As the real library does, `putBool` stores one byte, and `putFloat`
and `putDouble` store byte blocks. Keys and namespaces are limited to 15
characters and strings to 4000 bytes, the NVS limits.

Not modelled: how long a write takes, flash wear, and running out of space
(`freeEntries()` assumes room for 500 values, an ESTIMATE). Erasing is offered
in the board's inspector only while the circuit is stopped. Saved settings
work with the lab's own model of the board; the chip emulator has no
Preferences library yet.

## D-059 — The relay module is modelled at its optocoupler, and its uncertain case is said plainly

The kit's relay module was a bare relay standing in. It is now the module:
the board pin lights an optocoupler's LED through about 1 kΩ, the module's
transistor drives a 5 V coil from VCC, and a jumper chooses whether IN HIGH or
IN LOW switches it on. The contact joins COM to NO when on and COM to NC when
off.

REPORTED: the coil (70 Ω, pulls in at 75 % of 5 V) from the relay maker's
figures for this kind of relay; the optocoupler and the H/L jumper from
sellers. ESTIMATE: the LED's resistor and the LED currents at which the relay
pulls in (1 mA) and lets go (0.4 mA).

With the jumper on L, a 3.3 V board's HIGH leaves the LED about 0.5 mA. Users
report that some modules then cannot be switched off from an ESP32 and some
can; the lab's model lets go. Rather than claim either, the lab warns whenever
a LOW-trigger module's IN only gets a 3.3 V HIGH and says to use H. Hardware
test C9 measures the kit's module.

The lesson and the watering project switch only battery circuits, and say
never to switch mains in a school lab.

## D-060 — Digital logic starts with real chips on the breadboard

The owner chose (22 November 2026) to build logic circuits with real chips
first and a symbol canvas later, starting with the gate chips and a truth
table. A school lab teaches logic with 74-series chips, LEDs and switches,
and the lab already has those parts, the board and the instruments, so the
chips go where students will meet them.

**Model.** Each chip is solved with the rest of the circuit. Its inputs take
almost nothing; its outputs are its own supply or ground through about 50 Ω,
so what an output gives is taken from the chip's supply. REPORTED, from the
74HC family's datasheets: a 2 V to 6 V supply, thresholds at 30 % and 70 % of
it, about 4 mA within a few tenths of a volt of the rail, and 25 mA at most.
ESTIMATE: the 50 Ω, which reproduces those figures. Between the thresholds an
input keeps the level it had, which is what makes gates wired into a latch
remember. Gates are re-solved until they settle; a circuit that never settles
(a NOT gate on its own output) is reported rather than left to flicker. The
gates answer at once: propagation delay is not modelled.

**Mistakes the lab names:** an input of a gate in use connected to nothing
(a real chip reads it unpredictably; the lab reads LOW and says so), a supply
over 6 V, too little supply, and an output overloaded.

**Truth table.** The table is made by the same simulation: each combination of
the circuit's switches in turn, reading its LEDs. It is made twice, in both
orders; when the two differ the circuit remembers, and the table says so.

**In the diagram** a chip is a box with a textbook symbol for each gate in
use drawn inside it, its inputs and output named as in the datasheet (1A, 1B,
1Y) to match the legs on the box's edge, as a datasheet's logic diagram draws
it. The wires inside the chip, from each leg to its gate, are not drawn: the
legs sit where the circuit's wires leave them, and lines to the gates would
cross. Drawing each gate as a separate symbol in the circuit is for the symbol
canvas.

**Not yet:** flip-flop, counter and decoder chips; a chip cannot be turned
round, so putting one in upside down (a real mistake) cannot be shown yet; and
the symbol canvas.

## D-061 — Recommended: ESP32 programs run on the lab's own board library, with the chip emulator kept beside it

**Proposed on 22 November 2026; waits for the owner's confirmation.** Step 6 of
the [ESP32 feasibility study](esp32-study.md) scored its three options on the
same criteria. The recommendation:

- **The lab's own board library (option C)** is how the lab runs ESP32
  programs. On a laptop its worst case is over 50 times faster than a real
  board; a program is tens of kilobytes; the ready-made programs and lessons run
  with no network; and 109 of the 113 one-file reference sketches build with
  it. Its cost is that the board is our model, labelled as such in the editor.
- **The chip emulator (option A)** stays in the editor as an experiment, as a
  check against the real board software. It is not the default: a third of the
  reference sketches run five times slower than a real board even on a laptop,
  every program needs the full toolchain on a server, and it adds 5.4 MB.
- **QEMU on a server (option B)** is not taken up: it cannot run offline, and
  as published it cannot show a pin without changes to a GPL program.

**What could change it:** the speed of option C on a real low-cost phone, which
has not been measured. If the worst-case test sketch runs slower than a real
board there, the recommendation is to be revisited.

## D-062 — Sensor modules beyond the kit follow their makers' figures, and say where each comes from

Stage 1 of the component plan adds six analog modules: the 0–25 V voltage
sensor, the ACS712 current sensor, the MQ-7, a pH module, a TDS meter and a
turbidity sensor. Each figure the model uses is labelled in the code and in the
part's definition by where it comes from (checked on 22 November 2026):

- **From the maker's own documents (REPORTED):** the ACS712's 1.2 mΩ current
  path, 4.5–5.5 V supply and 185/100/66 mV per ampere at 5 V, ratiometric
  (Allegro); the MQ-7's 31 Ω heater and its 5 V / 1.4 V heating cycle
  (Hanwei); the TDS meter's 3.3–5.5 V supply, 0–2.3 V output and the formula in
  its sample code (DFRobot); the turbidity sensor's 5 V supply, 0–4.5 V output,
  about 4.1 V in clean water and falling as the water clouds (DFRobot).
- **From sellers and users (REPORTED, weaker):** the voltage sensor's 30 kΩ and
  7.5 kΩ divider; the pH module's 2.5 V at pH 7 and about 0.18 V per pH unit;
  the turbidity curve in NTU, which DFRobot publishes only as a picture and
  users have fitted as NTU = −1120.4 V² + 5742.3 V − 4352.9.
- **ESTIMATE:** output and supply resistances; that the pH and turbidity
  outputs scale with the supply; that the TDS output does not.

DFRobot's TDS sample code is under the LGPL. The lab uses the formula in it, a
fact about the meter, and none of the code.

**The circuit decides two of the outputs.** The ACS712's output depends on the
current through it, and the TDS meter's on whether it has a supply. Both are
worked out from the solved circuit and solved again until they agree, as the
motor driver and logic chips already are (`sensing` in the circuit state).
The current path does not feel what the output does, so this settles in one
extra round.

**What is left out, and said in each part's notes:** the MQ-7's heating cycle
(the lab holds 5 V, as most modules sold do), warm-up times, temperature
effects, the pH probe's calibration and ageing, the TDS meter's alternating
drive, the turbidity module's digital output, the ACS712's offset error and
noise. The TDS meter is allowed to work from 3.0 V rather than its stated
3.3 V, so a 3.3 V rail that sags slightly under load still powers it.

**A lesson makes the supply visible.** On the ESP32 the turbidity sensor runs
from VIN, about 4.6 V in the lab's model, and the maker's 5 V curve then reads
clean water as about 1500 NTU. The water lesson's program remembers the
sensor's voltage in clean water when it starts and compares with that, and the
lesson says why. The power lesson's program measures the ACS712's zero-current
output at start and scales its sensitivity with it, for the same reason.

Six hardware tests, E1 to E6, are written for these modules; none is run.

## D-063 — Power parts: a cell set by hand, a linear charger, and a regulator by its power

Stage 2 of the component plan adds the 18650 cell, the TP4056 charger module,
the LM2596 step-down regulator and a 5 V solar panel. Where each figure comes
from (checked on 23 November 2026):

- **REPORTED by makers:** the TP4056's 4.2 V (±1.5 %), 1200 V / R_PROG (1 A with
  the module's 1.2 kΩ), 130 mA below 2.9 V, end of charge at a tenth, and 4.0 to
  8.0 V input; the DW01A's 2.4 V cut-off and 3.0 V release; the LM2596's 40 V
  input, 3 A, 1.23 V reference, 73 % at 12 V to 3 V and 3 A, and a 1.16 V to
  1.5 V switch drop; cell datasheets' 4.2 V charge, 2.5 V cut-off and 35 to
  100 mΩ; DFRobot's 7.2 V open-circuit voltage for a 5 V 1 A panel.
- **ESTIMATE:** the cell's voltage against how full it is (the usual shape, not
  one maker's curve), 50 mΩ inside it; the panel's 1.1 A light current and its
  cells' figures; the regulator's 80 % efficiency, 1.2 V drop and 5 mA; the
  protection's 3 A limit; the charger's least pass resistance.

**How full the cell is, is set by hand and does not change while the circuit
runs.** Charging an 18650 takes hours; the lab shows the current and the time it
would take instead of running that long. Running real time down would make the
lab slow to use and its tests slow, and would hide nothing the current does
not already show.

**The charger is modelled as what it is: a linear charger.** Its pass
transistor is a resistance that the solver sets, round by round, to give the
charge current; once the cell reaches 4.2 V it holds 4.2 V and draws what that
takes from its input. When the input cannot supply the charge current (a dim
panel) the resistance reaches its least value and the cell takes what the
input gives, at an input just above the cell's voltage, as on the real module.
Once started it keeps charging while its input stays above the cell (the
datasheet's undervoltage and sleep thresholds are not modelled separately).
It shows a full cell when the current falls below a tenth, but keeps holding
4.2 V rather than switching off and restarting.

**The regulator is modelled by its power,** not its switching: its output
holds the set voltage while its input is at least 1.2 V higher, and its input
is a load that takes the power the output gives at 80 %, plus 5 mA of its own.
There is no ripple.

**The panel** is a light current beside a diode string fitted to its open-circuit
voltage, which needed a current source in the circuit solver; the solver now
has one, with its SPICE form.

**A lithium cell charged by anything but a charger is warned about**, even
before its voltage passes 4.25 V: nothing would stop it at 4.2 V. Which charger
looks after a cell is found from the wires, since the solver treats wires as
resistors.

Four hardware tests, E7 to E10, are written for these parts; none is run.

## D-064 — I2C sensors are their chips' registers, read by the real libraries

Stage 3 adds the BME280 and the INA219. Each is modelled as its chip's
registers on the I2C bus, answered as the maker's datasheet gives them; the
program reads them through Adafruit's own libraries, built unmodified into
every ESP32 program as D-051 says, as on a real board. Their licences were
read at the release tags used (22–23 November 2026): BME280 library 2.3.0 and
INA219 library 1.2.3 are BSD 3-clause, BusIO 1.17.4 is MIT, the unified sensor
library 1.1.15 is Apache-2.0 (its header is Copyright 2008 The Android Open
Source Project, updated by Adafruit). All four are shown on the licences page
and in NOTICE.

**The BME280** answers with chip id 0x60 and a set of factory trimming values.
Each real chip has its own; the lab's are example values, the same for every
sensor. When the program reads, the lab writes the raw readings that Bosch's
formulas, as the library implements them, turn back into the values on the
sliders: run backwards by searching, with the library's own integer
arithmetic. A test reads them back through those formulas: temperature exact,
pressure within 0.0005 hPa, humidity within 0.006 %. It is the four-pin 3.3 V
module with no regulator: above 3.6 V the lab warns, and its pull-ups would
then put 5 V on the board's pins, which the lab also reports.

**The INA219** follows TI's datasheet (REPORTED): shunt voltage in 10 µV
steps, bus voltage in 4 mV steps, current = shunt × calibration / 4096, power =
current × bus / 5000, and nothing in the current and power registers until
the program writes a calibration. It reads the voltages from the solved
circuit at the moment of the exchange, with the 0.1 Ω shunt that Adafruit's
module and library assume.

**What was needed in the board library.** BusIO's SPI code writes pins
through their output registers, as it may on a real ESP32; the lab has no SPI
(D-054), so `SPI.h` now gives those register helpers pointing at a register
nothing reads, and hand-driven SPI goes nowhere like the rest. BusIO's
register class prints to a `Stream`, which the board library now has, with the
serial port as one. That makes every program about 200 bytes larger; the
ready-made programs were rebuilt. Programs that do not use BusIO do not carry
its code.

**Not modelled:** measuring time, noise, filtering and self-heating; the
INA219's averaging and its address pads; SPI.

Hardware tests E11 and E12 are written; none is run.

## D-065 — 1-Wire is modelled as resets and bits, under the real DallasTemperature library

The DS18B20 needs the 1-Wire bus. The OneWire library for Arduino (MIT-style
licence, Jim Studt and others) drives the pin through the ESP32's GPIO
registers, which the lab's board library does not have. So, as I2C was done
(D-054), the board library has its own `OneWire` with the same functions,
written for the lab: each reset and each bit is one exchange with the
simulation (`host_onewire`), and the time the step takes on a real bus is
charged. The ROM search follows Maxim's published algorithm. No code of the
OneWire library is used.

The DallasTemperature library (release 4.0.6, MIT, Copyright 2024 Miles
Burton) is built unmodified on top of it. Releases up to 3.9.1 were LGPL 2.1 or
later; 4.0.6 is MIT at its tag, checked on 23 November 2026, and only 4.0.6 is
used.

**The probe** follows Maxim's datasheet (rev. 050102), read from a copy of the
datasheet: family code 28h; the ROM commands (Search F0h, Read 33h, Match
55h, Skip CCh, Alarm Search ECh) and function commands (Convert T 44h, Read
and Write Scratchpad BEh and 4Eh, Copy 48h, Recall B8h, Read Power Supply
B4h); the scratchpad's layout and its fixed bytes FFh, 0Ch and 10h; the
configuration byte and its 9 to 12 bits; the longest conversion times; the
CRC (X^8 + X^5 + X^4 + 1); +85 °C until the first conversion; read slots that
give 0 during a conversion and 1 after it. The temperature encoding is tested
against every row of the datasheet's table 2. The line is wired-AND, so
several probes share it as on a real bus, and the library's search finds each.
ESTIMATE: alarm limits of 75 °C and 70 °C on a new probe (users' readings; the
datasheet leaves them to the factory), its supply current.

**The pull-up is required.** A probe answers only when its DQ line rises to at
least half its supply with the board's pin released, so a missing 4.7 kΩ
pull-up means no probe is found, and the lab says why. Parasite power is not
modelled.

**A fault found on the way.** An ESP32 program whose global objects set up a
pin before `setup()` (OneWire's constructor does) stopped before it began: the
time that took was treated as a pause, before the program could be paused. The
simulated board now lets such time pass without pausing, as it already did
inside interrupt handlers. Programs without such objects are unchanged.

**The other three parts of stage 4.** The JSN-SR04T shares the HC-SR04's
timing and answers only between 25 cm and 450 cm (sellers' figures for
version 2.0); the lesson that uses it teaches its blind zone. The line sensor's
outputs are HIGH over black, as sellers describe the common board (some are
the other way round). The siren is a 40 Ω load that sounds from about 6 V the
right way round: estimates.

Hardware tests E13 to E16 are written; none is run.

## D-066 — Serial modules exchange bytes at their baud rate; the GPS library is the lab's own

Stage 5 needs the ESP32's second and third UARTs. The board library now has
`Serial1` and `Serial2` (and `HardwareSerial` objects of a program's own), with
`begin(baud, config, rx, tx)` as in Espressif's core. When a program leaves the
pins out, the defaults are those of core 3.3.12 for the classic ESP32: Serial1
RX 26 / TX 27, Serial2 RX 4 / TX 25 (VERIFIED, read from the core's source).
The ready-made programs name GPIO16 and GPIO17, the pins printed RX2 and TX2 on
the board, as most tutorials do. Each port keeps a 256-byte receive buffer, the
core's default (VERIFIED); bytes beyond it are lost, as on the chip.

**Bytes, not messages.** A module sends bytes one at a time, each taking ten
bit-times at its baud rate (a start bit, eight data bits, a stop bit). The
board receives them when its clock reaches the time each would arrive, and
writes go to whatever module listens on the port's TX pin. The line must be
crossed (the module's TX to the board's RX): wired TX to TX, nothing arrives,
and the GPS program says so. When the board's baud rate differs from the
module's, other bytes arrive than were sent. That is not modelled bit by bit:
each byte becomes some other byte, which is enough for a program to see
nonsense. The serial code made every ESP32 program about 570 to 780 bytes
larger, including those that do not use it.

**The NEO-6M GPS** sends RMC, VTG, GGA, GSA and GLL once a second at 9600 baud,
as u-blox reports for the NEO-6's defaults (REPORTED). The position, the fix and
the number of satellites are set in the inspector; without a fix the position
fields are empty and at most three satellites are reported. The date starts at
23 November 2026, 06:00 UTC, because the lab has no clock of its own: an
example, not a real time. Configuration messages (UBX) are ignored.

**The GPS library is the lab's own.** TinyGPSPlus, which most GPS tutorials
use, is LGPL 2.1, and the client takes no LGPL code. So the board library has
its own `TinyGPSPlus` with the same functions (location, date, time, speed,
course, altitude, satellites, HDOP, `encode`, `distanceBetween`, `courseTo`,
`cardinal`, the counters), written for the lab from the NMEA sentence format,
not from TinyGPSPlus's code. It reads RMC and GGA from any talker and checks
each sentence's checksum. Like TinyGPSPlus, a position stays valid once it
has been seen; the ready-made program also checks its age, so it notices when
the fix is lost.

**The PMS5003** sends 32-byte frames: 42h 4Dh, a length of 28, thirteen words
and their sum, at 9600 baud (REPORTED by the PMS library, which follows
Plantower's protocol). Programs read it with the PMS library (release 1.1.0,
MIT, by Mariusz Kacki), built unmodified. Its commands for passive mode, a
single reading and sleep are answered. ESTIMATE: a frame every second in active
mode (Plantower gives 200 ms to 2.3 s); PM1.0 at 0.7 and PM10 at 1.3 times
PM2.5, and particle counts in proportion.

**Supply.** Both modules' TX lines are 3.3 V signals (REPORTED by u-blox and
Plantower), so they connect straight to the ESP32. ESTIMATE: the GPS draws
about 30 mA at 3.3 V and the particle sensor about 100 mA with its fan running.

Hardware tests E17 and E18 are written; none is run.

## D-067 — A phone panel for Bluetooth and SMS; the MP3 library is the lab's own

The second half of stage 5 puts three more modules on the serial line of D-066.
Two of them talk to a person as well as to the board, so the lab gives them a
**phone panel**: the module's inspector shows the conversation, and while the
circuit runs the student types into it. Text typed there reaches the module at
that moment and the board as fast as the serial line carries it. The
conversation is not saved with the circuit.

**HC-05 Bluetooth.** In data mode at 9600 baud, as it leaves the factory
(REPORTED by sellers). A phone already paired is the lab's own panel; each line
typed there is sent with a newline, as most Bluetooth terminal apps do. With
the phone disconnected nothing passes either way. AT command mode, its
settings and the EN and STATE legs are not modelled. The board works on 3.6 V to
6 V (REPORTED by sellers), so the lessons power it from VIN.

**DFPlayer Mini.** Messages are ten bytes as DFRobot's manual gives them, with
the manual's checksum, tested against the manual's own example. The player
answers play, next, previous, pause, resume, stop, volume, loop and the queries
for state, volume, equaliser, file count and track; it says when its card is
online and when a track has finished. The lab's card holds the number of tracks
set in the inspector, each 8 seconds long (the lab's choice), and nothing is
heard. ESTIMATE: it reads its card in about a second, and starts at volume 25.
The real module is reported to send "finished" twice; the lab sends it once.

**The MP3 library is the lab's own.** DFRobotDFPlayerMini is LGPL, and the
client takes no LGPL code. So the board library has its own
`DFRobotDFPlayerMini` with the same class, functions and constant names
(written from DFRobot's published examples and the manual's message format,
not from the library's code). Sketches written for it build unchanged.

**SIM800L.** The network is the lab's own: no SIM card and no real message is
ever sent. SMS go to and come from the lab's phone panel, whose number
(+8801000000000) is not a real one. The module learns its baud rate from the
first "AT", as SIMCom describes (REPORTED). It answers a set of AT commands in
text mode (AT, ATE, ATI, CSQ, CREG, CPIN, COPS, CMGF, CSCS, CNMI, CMGS, CMGR,
CMGD, CMGDA) and ERROR to anything else; an SMS needs text mode first, as on the
real module. ESTIMATE: it finds the network about 3 seconds after power-up, and
sending an SMS takes about 3 seconds. Text uses the GSM alphabet, so Bangla
letters arrive as "?": the lesson says so. When it has no signal, it never
registers, and a message from the phone is shown as not delivered.

**Its supply.** SIMCom gives 3.4 V to 4.4 V (REPORTED), so 5 V is shown as
damage, with advice to use an 18650 cell or a regulator, and the ESP32's 3.3 V
is too little for it to start. Its 2 A peaks while transmitting are not
modelled, so the restarts a weak supply causes on a real module do not happen
here; the lesson mentions them. Its TX line is a 2.8 V signal (REPORTED).

**A detail found on the way.** A program that ends the AT+CMGS line with a
carriage return and a line feed (as `println` does) had the line feed at the
start of its SMS. The lab now treats that line feed as part of the command
line.

Hardware tests E19 to E21 are written; none is run.

## D-068 — Colour on the ESP32: a WS2812B ring and an ST7789 display over SPI

Stage 6 adds two parts that show colour, and the two ways of reaching them that
the board library lacked: an LED data line and the SPI bus.

**The board library gains an SPI bus.** `SPIClass` hands whole exchanges to the
world (`host_spi_transfer`): the bytes going out and the bytes coming back. The
devices that take part are chosen there from the levels of their chip-select
pins at that moment, as on the wires. The library charges the time the bytes
take at the bus's frequency. The bus's own pins are the core's (VSPI: SCK 18,
MISO 19, MOSI 23, SS 5), checked against the vendored core's variant file.
Not modelled: the data mode, the chip's own hardware chip-select, and software
SPI (pins moved by hand), which would cost millions of pin changes for one
picture.

**An LED data line.** `host_led_strip` carries the colour bytes a program sends
down a WS2812 data line, at 800 or 400 kbit/s; the library charges their time,
and waits the 300 µs reset gap before the next frame. The core's own
`rgbLedWrite` uses it too.

**The NeoPixel library is the lab's own.** Adafruit's NeoPixel library is under
the LGPL (VERIFIED: GitHub reports LGPL-3.0 for the repository), and the client
takes no LGPL code. The board library has its own `Adafruit_NeoPixel`, written
from the public documentation of its programming interface, with the same
class, functions and NEO_ constants (whose values are the lab's own). Two
differences a program may notice are listed in its header: colours are kept as
set and scaled only when sent, and `ColorHSV`, `gamma8` and `sine8` are worked
out from their documented meaning rather than copied tables.

**The display library is Adafruit's own.** Adafruit's ST7735 and ST7789 library
1.12.0 is MIT (VERIFIED: stated in each source file; the repository has no
separate licence file), and it builds on `Adafruit_SPITFT` from the GFX library
the lab already ships (BSD). Both are copied unmodified into `third_party`, so a
student's sketch runs the same drawing code as on a board.

**The WS2812B ring.** Each LED keeps the first three bytes it receives, in the
order green, red, blue, and passes the rest on; what is left leaves by DOUT for
the next ring, so rings chain. From WorldSemi's datasheet (REPORTED): a supply
of 3.5 V to 5.3 V, so the lab shows it dark on 3.3 V and as damage above 5.3 V.
Its 3.3 V data input on a 5 V supply is below the datasheet's 0.7 × VDD but is
accepted, as it usually is in practice; the part says so. The current the lit
LEDs draw is shown as an ESTIMATE from Adafruit's guide (about 20 mA a colour at
full, 60 mA for white), but the circuit sees a fixed load of about 1 mA an LED
(ESTIMATE): a load that changed with every frame would need a fresh solution of
the circuit each time. Rings of 8, 12, 16 and 24 LEDs, the sizes sold.

**The ST7789 display.** The 1.54-inch 240 × 240 module in its eight-pin form
(GND, VCC, SCL, SDA, RES, DC, CS, BLK). The chip's commands for drawing are
modelled from Sitronix's ST7789V datasheet: reset, sleep, display on and off,
inversion, the drawing window, memory write and continue, the memory access
setting (MX, MY, MV, BGR) and 16- and 18-bit colour. The memory is 240 × 320 and
the panel shows the first 240 rows; the way up the picture appears is chosen so
that rotation 0 of Adafruit's library is upright, which also makes its other
rotations and offsets land correctly. Like the real IPS panels (REPORTED), it
shows colours inverted until the program turns inversion on. A CS or RES leg
left unconnected is taken as HIGH, BLK left unconnected leaves the backlight on,
and a leg tied to the board's GND is LOW. The picture travels to the page as RGB
565, only when it has changed. ESTIMATE: about 30 mA, mostly the backlight.

**Not done.** The UNO-compatible board and the chip emulator cannot drive either
part yet: for the UNO that would mean decoding WS2812 timing and SPI from the
emulated chip's pins.

Hardware tests E22 and E23 are written; none is run.

## D-069 — The breadboard is a part: several per circuit, in three sizes

Until now every circuit had one half-size breadboard, fixed in place, and a
hole was named by its row and column alone ("c10"). The owner asked for
breadboards that are added, moved and removed like any other part, with the
designer otherwise unchanged. Decided with the owner on 24 November 2026: half
(400 holes), full (830) and mini (170, no power rails) sizes; parts still sit in
breadboard holes, not loose on the work surface; a new circuit starts with one
half board; and one programmable board per circuit for now (several boards, for
LoRa, is the next change).

**Each hole names its breadboard.** A hole is "BB1.c10": the breadboard's id, a
dot and the hole, the same "part.pin" form board sockets already use
("ESP1.d4"). Breadboard ids are always "BB" and a number, so a hole can never
be mistaken for a socket. Strips are named after their breadboard too, so
"BB1.c10" and "BB2.c10" are never joined unless a wire joins them. The
electrical solution needs nothing else: breadboards are left out of it, and
the strips follow from the names.

**One grid for all breadboards.** A breadboard sits at whole hole pitches, so
the holes of every board lie on one grid. A part dragged off the edge of one
board drops into the next if they are close; but all of a part's legs must sit
on one board, as a part's legs cannot reach across the gap between two real
boards. At most four breadboards, to keep the work surface usable on a phone.

**Editing.** A breadboard is picked up by a tab above its corner, so its holes
stay free for parts and wires; the parts and wires in it go with it. Its size
can be changed in the inspector, except to a size that would leave a leg or wire
end in a hole the board no longer has, or that would run into something.
Removing it says how many parts and wires are on it, and removes them too. The
work surface grows to the right and down to hold what is placed.

**Old circuits.** Version 21 of the circuit format renames every hole. A circuit
saved before it is opened with its one board as BB1, at the old fixed place,
and "c10" read as "BB1.c10", so it looks and works exactly as before. Lessons
name parts and board pins, never holes, so none needed changing.

**Simplified.** Power rails are joined along their whole length; some real
full-size boards split them in the middle (noted in the part definition).

## D-070 — Two programmable boards in one circuit, and serial between ESP32 boards

Decided with the owner on 24 November 2026: a circuit may hold **two**
programmable boards, of either kind or one of each, and two ESP32 boards can
talk over a serial wire. Two is enough for a sender and a receiver (and for
LoRa, which comes next) and keeps two programs running smoothly on a school
phone. Serial between UNO-compatible boards is left for later.

**Each board runs its own program** on the session's one clock, as before for a
single board: the session already kept its running boards by id, and every
module already knew which board it was wired to. Each board keeps its own
program, upload, serial monitor and saved settings. The code view shows a tab
for each board when there are two; choosing a board on the canvas also chooses
its tab. With one board nothing changes, so lessons and older projects are as
they were. A second board is put beside the first, on the same level.

**Grounds.** The solver measures everything against the first board's GND. A
second board not joined to it is solved against its own GND (or a separate
battery against its own negative), so a meter held on that board reads as it
would on the bench. Board pins are always read against their own board's GND.
When a pin of one board is wired to a pin of the other but their GNDs are not
joined, the lab warns (`no-common-ground`): on real boards such a signal works
by chance or not at all.

**Serial between boards.** Bytes a board writes on a UART's TX pin reach the
other board's UART whose RX pin is on the same wire, one byte time after
another at the sender's baud rate (as bytes from a module do). At a different
baud rate they arrive garbled; TX wired to TX carries nothing. Editing the
wiring empties a line of the bytes still on their way. Not modelled: the line's
voltage levels (both ESP32 boards use 3.3 V), and serial between an ESP32 and an
UNO-compatible board, whose 5 V TX would need a level shifter.

**The diagram** draws the first board's tree with the second board as a part in
it, joined by its wires.

Ready-made programs `sender` and `receiver`; hardware test E24 is written, not
run.

## D-071 — LoRa between two boards: the Ra-02's SX1278, the air, and a distance slider

Stage 7, decided with the owner on 24 November 2026: the LoRa library by
Sandeep Mistry, a distance slider, and point to point only (no LoRaWAN,
gateway or network server).

**The library is used as it is.** The LoRa library 0.8.0 is MIT (VERIFIED:
GitHub reports MIT for the repository, and its LICENSE says Copyright 2016
Sandeep Mistry). It is copied unmodified into `third_party/lora`. It needed two
small things from the board library, both added as the Arduino cores have them:
the `B…` binary constants (generated, not copied) and `Stream::setTimeout`.

**The chip is modelled register by register**, from Semtech's SX1276/77/78/79
datasheet: the LoRa-mode registers with their reset values, the version (0x12),
the FIFO and its pointers, sleep, standby, transmit and the two receive modes,
frequency, spreading factor, bandwidth, coding rate, header mode, CRC,
preamble, sync word, power (PA_BOOST and the +20 dBm DAC), the interrupt flags
and DIO0 (RxDone or TxDone). The SPI bus gains a reply path for it: bytes the
radio clocks out on MISO reach the board only along a MISO wire. NSS frames
each exchange, as on the chip: tied LOW, the radio cannot be talked to.

**The air.** A packet takes its time on air from the datasheet's formula
(tested against a hand calculation: 10 bytes at SF7, 125 kHz, 4/5 is
41.216 ms). A listening radio hears it when both are on the same frequency
(within a quarter of the bandwidth, ESTIMATE), spreading factor, bandwidth,
sync word and header mode, and its signal is above the receiver's sensitivity:
the noise floor for the bandwidth with a 6 dB noise figure, plus the lowest SNR
each spreading factor decodes (REPORTED, datasheet). Two packets at once are
both lost. A single receive waits until a packet arrives instead of timing out.

**Distance.** Each radio has a place along a road, in kilometres; two radios
are as far apart as their places differ. The signal falls with distance by a
log-distance model with exponent 3.3 (ESTIMATE, between open country and a
town, radios near the ground) from 17 dBm, so SF7 reaches about 3 km and SF12
about 8 km. Real range depends on antennas, height, buildings and weather; the
part says so.

**Supply.** 1.8 V to 3.7 V (REPORTED, Ai-Thinker's Ra-02 datasheet); 5 V is
shown as damage. The circuit sees the receiving current (about 12 mA); the
larger current while sending is not modelled.

**Lessons with two boards.** A lesson may now set up two ESP32 boards, name a
pin or a serial monitor of the second (`unit: 2`), and put a second program on
it (`program2`). One-board lessons are unchanged. The new lesson `lora-radio`
is walked through by the lab.

**Not checked.** The rules for using 433 MHz in Bangladesh: the part and the
lesson ask the student to check them before using a real module outdoors.

Ready-made programs `lora-send` and `lora-receive`; hardware test E25 is
written, not run.

## D-072 — Deep sleep on the ESP32, with RTC_DATA_ATTR

The first of the ESP32 gaps the study counted (E1): two reference sketches log
a reading, then sleep. The lab's board library now has `esp_sleep_enable_timer_wakeup`,
`esp_sleep_enable_ext0_wakeup`, `esp_deep_sleep_start`, `esp_deep_sleep`,
`ESP.deepSleep`, `esp_sleep_get_wakeup_cause` and `esp_light_sleep_start`, as
the ESP32 core offers them to every sketch.

**How it works.** A variable marked `RTC_DATA_ATTR` is placed in a section of
its own, whose bounds the linker marks. Going into deep sleep, the program
hands the board those bytes and stops; the board lets go of every pin. When the
timer runs out, or the ext0 pin reaches its level, the board starts a fresh
copy of the program, as after a reset, puts the RTC bytes back, and runs it
from `setup()`. `esp_sleep_get_wakeup_cause()` then says the timer (4) or the
pin (2); at power-on it says 0. Light sleep simply waits for the timer, keeping
everything.

**Not modelled.** ext1 and touch wake-ups, the ULP co-processor, the RTC pins'
own pull resistors while asleep, and the very small current the chip draws
asleep. `ESP.restart()` still ends the run, as before.

Ready-made program `deepsleep`; a test checks three boots, the wake-up cause,
an RTC variable counting and an ordinary one starting again each time, and the
LED let go while asleep.

## D-073 — Programs in several files, as tabs

The second ESP32 gap of the study (E2): 28 reference sketches are split into
several files, as the Arduino IDE allows. A program can now have up to 16 more
files beside its main one, each a tab in the code editor:

- more `.ino` tabs, joined after the main file in name order, as the Arduino
  IDE does, with prototypes for every function in any of them;
- headers (`.h`, `.hpp`), written beside the sketch for `#include "…"`;
- `.c` and `.cpp` files, each compiled on its own and linked in.

This works for the UNO-compatible board and for both ways of running an ESP32
program. File names are plain (letters, digits and `_`, then the extension);
names that would leave the build folder, the main file's own name and two
files of one name are refused by the compile server, and all the files
together are held to the size one program may have. A compile error says which
tab it is in, at that tab's own line. The files are saved with the project; a
change to any of them shows that the program needs uploading again.

Ready-made programs stay single files.

## D-074 — Chips that remember: the 74HC74 flip-flop, and a 555 clock module

The first of the logic segments (L1). The lab had six gate chips, each worked
out from its inputs alone. A flip-flop also depends on what it held a moment
ago and on the clock's edge, so every chip now has one model
(`packages/shared/src/logic.ts`): given its input levels now, its input levels
a moment ago, and what it remembers, it gives its output levels and what it
remembers next. A gate chip remembers nothing; the six gate chips are unchanged.

**74HC74.** Two D flip-flops with preset and clear, both active LOW, as the
datasheet's function table gives: on the clock's rising edge (an input LOW a
moment ago and HIGH now) Q takes D; CLR LOW forces Q LOW, PRE LOW forces it
HIGH, both LOW make Q and Q̄ both HIGH. At power-on Q is LOW. The chip fits the
same 14-pin shape as the gate chips, so it is picked from the same list. The
diagram draws it as a box with its pins named (1CLK, 1D, 1Q …), not as gates.

**Settling.** The solver repeats until the chips' outputs stop changing. For a
chip that remembers, that is not enough: the outputs can agree while the inputs
it read are stale, and the next edge is then missed. It now also waits for
those inputs to settle, and the session keeps a solution apart by the chip's
memory and the inputs it last read.

**555 clock module** (circuit format version 23). OUT is HIGH and LOW for equal
halves of each period, at 0.2 to 20 Hz set in the inspector; HIGH is joined to
the supply and LOW to ground through 100 Ω (ESTIMATE). It needs at least 4.5 V,
as the NE555's datasheet gives. The session steps it like the motion sensor:
simulated time stops at each change of OUT, so a fast clock is never skipped.

**Not modelled.** Propagation delay, set-up and hold times (a D that changes
exactly at the edge is taken at its new level), and the real module's uneven
HIGH and LOW times.

Tests: the flip-flop divides a button's presses by two and stays cleared while
CLR is LOW; the clock module ticks at 1 Hz and the flip-flop halves it. A
browser test picks the chip and sets the clock's frequency.

## D-075 — Counters, a seven-segment decoder and a display

The second logic segment (L2), built on the chip model of D-074.

**Chips.** The 74HC393 (two 4-bit counters that count on the clock's falling
edge, with an active-HIGH reset) fits the 14-pin shape and joins that list. The
74HC161 counter and the CD4511 decoder have 16 pins, so they are a part type of
their own (`logic16`), placed across the gap the same way: pins 1 to 8 in row f,
16 to 9 in row e. All three follow their datasheets' function tables:

- **74HC161**: MR̅ LOW clears at once; on the clock's rising edge PE̅ LOW loads
  D0 to D3, otherwise it counts when CEP and CET are both HIGH; TC is HIGH when
  CET is HIGH and the count is 15.
- **CD4511**: LT̅ LOW lights every segment, BL̅ LOW none; LE HIGH keeps the
  number held when it went HIGH; 10 to 15 light nothing; 6 has no top bar and
  9 no bottom bar, as its datasheet draws them.

Each chip model now carries its supply range: 2 to 6 V for the 74HC family, 3
to 18 V for the CD4511 (REPORTED, from the datasheets). A chip below its lowest
is unpowered; above its highest the lab says it is being damaged. The message
no longer assumes a 74HC chip.

**Display.** A single-digit 0.56 inch display: eight red LEDs (the lab's red
LED model) sharing one leg, common cathode or common anode as chosen in the
inspector. Its rows of legs are 0.6 inch apart, so it stands across the gap in
rows d and h, in the common 10-pin order (bottom e, d, COM, c, DP; top g, f,
COM, a, b). The two COM legs are joined inside. Each segment is judged like an
LED, so too much current shows as damage.

**Not modelled.** The CD4511's real HIGH, which is a little below its supply
(its outputs are modelled like the 74HC chips'), propagation delays, and
multiplexed displays (several digits sharing segment lines).

Tests: each counter counts on the right edge, wraps, resets and (for the
74HC161) loads and carries; the decoder lights the datasheet's segments for
every code and obeys LT̅ and BL̅; the display lights the segment fed, in either
kind, and stays dark when wired for the other kind; both new parts land where
they should. Two browser tests place them.

## D-076 — The 74HC595 shift register, and shiftOut() on the ESP32

The third logic segment (L3). The 74HC595 joins the 16-pin chips (circuit
format version 25), following its datasheet's function table: on SHCP's rising
edge the bits move up and DS comes in at Q0; MR̅ LOW clears the shift register
at once; on STCP's rising edge the storage register takes the shift register;
OE̅ HIGH lets Q0 to Q7 go; Q7S gives bit 7 to feed a second chip. With both
clocks joined, the storage register gets the bits from before the shift.

**shiftOut() and shiftIn() on the ESP32.** The lab's own board library gains
both, written from the Arduino reference's description (each bit on the data
pin, then a clock pulse; MSBFIRST starts with bit 7). The ESP32 core's own
version is LGPL and is not used. On the UNO the Arduino core's real
`shiftOut()` already runs. Each library call costs 2 µs of simulated time, so
every clock edge reaches the circuit as its own moment and none is lost.

**Power-on.** A chip that powers up with its clock already HIGH sees no rising
edge until the clock has gone LOW and HIGH again, as on a real chip.

Ready-made program `shift` (a running light on eight LEDs, from three pins).
Tests: by hand, three SHCP pulses with DS HIGH show nothing until STCP, then
0b111, and a LOW shifts in at Q0; on the ESP32 the program lights Q0 to Q7 in
turn, 300 ms each, and starts again.

## D-077 — Four logic lessons

The fourth logic segment (L4): lessons 44 to 47, written for the lab (CC BY 4.0
like the other lessons) and each walked through against the real simulation.

1. **Logic gates: AND and OR.** A 74HC08 with two switches, each with a 10 kΩ
   pull-down, and an LED on the output; then the chip swapped for a 74HC32
   without moving a wire, and the truth-table tool.
2. **The flip-flop.** A 74HC74 with Q̅ wired to D and a button on the clock:
   one press lights the LED, the next puts it out. The text says that a real
   button bounces and the lab's does not.
3. **Counting by itself** (a project). A 555 clock module, a 74HC393, a
   CD4511 and a common-cathode display on a full breadboard, powered from the
   board's VIN, with no program; at 5 Hz the display goes dark for 10 to 15.
4. **The shift register.** A 74HC595 on three ESP32 pins with the ready-made
   program `shift`.

The board only gives power in the first three. The lesson format did not need
to change: a lesson still starts with the ESP32 board, which is the supply.

**Not checked.** That the lessons read well to students; that is for the team's
classroom trials, like the other lessons.

## D-078 — The logic analyser reads chip legs

The fifth logic segment (L5). The logic analyser showed only the board's wired
pins, so a circuit of chips with no board, such as a counter driven by a clock
module, showed nothing. A probe can now be on any leg of a part on the
breadboard (`pin:U1.p5`): the session records the voltage of the net that leg
is in, measured from ground, at every change, like the other probes.

The panel gives a row to every leg of a logic chip or clock module that is
joined to something (a wire or another part's leg in its strip), apart from
supply and ground, up to 16 rows, named as in the datasheet ("U1 1CLK"). Above
2.5 V counts as HIGH, as for the board pins. Any of these legs can also be one
of the oscilloscope's two channels.

**Not done.** A threshold that follows each chip's own supply (a chip on 3.3 V
is read against 2.5 V too), and triggering.

## D-079 — The logic sheet: a symbol canvas

The last logic segment (L6), the symbol canvas that D-060 put off. Each project
now has a **logic sheet**, a third view beside the breadboard and the diagram,
where a circuit is drawn with logic symbols instead of chips: switches, lamps,
a clock (0.2 to 10 Hz), the six gates and a D flip-flop. Wires go from an
output to an input; an input takes one wire, an output any number, its own
element's inputs among them (a flip-flop's Q̅ back to its D).

**Pure logic.** The sheet has no voltages, as a textbook draws logic: each
port is HIGH or LOW. The gates answer at once; an input joined to nothing is
read as LOW and shown with a red dot; a loop that never settles is reported.
Flip-flops change on their clock's rising edge, compared with the level they
saw last; one flip-flop may clock another (a ripple counter), so edges are
taken in passes until nothing more changes. At power-on a flip-flop waits for
its clock to be LOW before it takes an edge. The sheet runs whenever it is
open, stopping at every clock change so that no edge is lost between frames.

**Saved with the project** (`sheet` in the project record); a sheet the lab
could not reopen is refused when saving and ignored when opening. The truth
table works on a sheet with 1 to 4 switches and no clock or flip-flop.

**Not done.** Undo for the sheet, more elements (counters, multiplexers,
labelled inputs), copy and paste, and lessons that use it. The breadboard and
the sheet are separate circuits: the sheet does not draw the breadboard's
chips as symbols.

## D-082 — The logic sheet, part 2

Gates on the sheet take 2, 3 or 4 inputs (wires to inputs a gate no longer has
go with them). New elements: a 2-to-1 multiplexer (Y is A while SEL is LOW, B
while HIGH), a full adder (S and the carry of A + B + Cin), JK and T flip-flops
(on the clock's rising edge: J sets, K clears, both turn over; T turns over),
and a hex digit that shows its four inputs. Undo and redo on the sheet (up to
100 steps). Under the truth table, each lamp's simplest sum of products, with
the switches called A to D: the prime implicants by Quine–McCluskey, then the
smallest cover found by trying every set of them, which is exact for up to four
inputs. A bar over a letter means NOT.

## D-080 — Wi-Fi and the board's own web page

The owner chose (24 November 2026) the board's own web page, with no real
internet (E3). The lab's ESP32 library gains `WiFi.h` and `WebServer.h`,
written for the lab from the Arduino ESP32 core's documented API (the core's
own code is LGPL and is not used):

- `WiFi.begin()` joins any network after 1.5 s (ESTIMATE) and gives the board
  192.168.1.50 on the lab's made-up network; `WiFi.softAP()` starts the
  board's own access point at 192.168.4.1. `status()`, `localIP()`,
  `softAPIP()`, `RSSI()` (−55 dBm, ESTIMATE) and `disconnect()` are there.
- `WebServer`: `on()` with or without a method, `onNotFound()`, `begin()`,
  `handleClient()`, `send()`, `sendHeader()`, and the request's `uri()`,
  `method()`, `arg()`, `hasArg()`, `args()` and `argName()`, with the query
  decoded as a browser encodes it.

**The browser panel.** A "Web page" tab beside the others, when there is an
ESP32. A request goes to the board's program, which answers it in
`handleClient()`; up to four may wait. The panel says why a board cannot be
reached (not on Wi-Fi yet, no server started, requests piling up because
`handleClient()` is not called) and when the program sent no answer. A redirect
to the board's own path is followed once.

**Safety.** The page is shown in a sandboxed frame with no scripts, and a
content policy that lets nothing in it reach any address: a student's page
could name any site, and a lab for children must not send their requests
anywhere. Links and GET forms on the page are read without running anything
and offered as buttons beneath it.

**Not modelled.** Real networks, scanning, other boards' Wi-Fi, HTTPS, the
internet, POST bodies, and the time a request takes on air.

Ready-made program `webserver`: an LED switched from the board's page.

## D-083 — MQTT and an IoT dashboard

The second IoT segment, on the Wi-Fi of D-080. The lab has one made-up MQTT
broker per circuit, shared by every board and a new **IoT** dashboard panel;
there is still no real internet, and any server name reaches it. The lab's
ESP32 library gains `PubSubClient.h`, written for the lab from the documented
API of Nick O'Leary's PubSubClient (MIT): the real library needs a TCP socket,
which the lab does not model. `setServer`, `setCallback`, `connect`,
`connected`, `state`, `publish` (with retain), `subscribe`, `unsubscribe` and
`loop` are there, and a `WiFiClient` to hand it.

The broker matches `+` and `#` as MQTT does, keeps the last retained message on
each topic (an empty one clears it), refuses wildcards in a published topic,
and keeps topics to 256 characters and payloads to 4 KB. Messages arrive at
once and in order; up to 64 may wait for a board's `loop()`. QoS, persistent
sessions, last will and authentication are not modelled. Leaving Wi-Fi ends a
board's connection.

The dashboard lists every topic with its latest value, who sent it, and a small
chart of its recent numbers, and sends messages (optionally retained) with
quick "on" and "off" buttons. Ready-made program `mqtt`: the knob's reading to
`lab/knob` every two seconds, and the LED from `lab/led`.

## D-081 — Accounts, classes, cloud projects and class progress

The owner asked (24 November 2026) for classes and accounts next. Built on the
Phase 0 schema and its rules (pseudonymous learners, nothing hard-deleted).

**Teachers** sign up with an email, a password (at least 10 characters) and
their school's name; they become its teacher and school admin. Passwords are
hashed with scrypt (N = 2^15, r = 8, p = 1) from Node's own crypto. A session
is a random 32-byte token in an HttpOnly, SameSite=Lax cookie (Secure over
HTTPS), kept 30 days; the database keeps only its SHA-256. Sign-in answers the
same, and takes as long, for a wrong email as for a wrong password. Sign-up,
sign-in, joining and key sign-in are limited to 10 a minute per address. A
request that changes anything is refused when the browser says it comes from
another site.

**Classes** (Class 6 to 12) are made only after the teacher confirms that the
school has permission for its learners to use the lab. A join code (8
characters from 31 that cannot be confused) is shown once, kept as a hash,
and works for 14 days; the teacher can renew it or close the class.

**Learners** join with the code and a nickname (2 to 24 letters or digits, any
script), and nothing else: no email, phone or real name. They get a sign-in
key (12 characters, about 59 bits) for other devices, shown once and kept as a
hash. Joining records the school's consent for that learner (scope
`platform_use`, granted by the school, recorded by the teacher, policy
version `platform-use-2026-11`). A teacher sees the nicknames, can give a new
key (the old one and the learner's sessions stop working) and can remove a
learner (a learner in no other class can no longer sign in).

**Cloud projects.** A signed-in person saves a project from its card; each save
adds a version (append-only), with the circuit, the programs' source and the
logic sheet, not the compiled firmware. Projects in the cloud but not on the
device can be opened there. Up to 200 projects, 1 MB each.

**Lessons and progress.** A teacher sets lessons for a class, with a date if
they like. The lab queues a learner's finished steps and lessons on the device
and sends them when online; each event has its own id, so a resend is kept
once. The teacher sees, for each lesson, how many of the class started and
finished it: totals only, never one learner's record. A teacher trying a
lesson leaves no progress.

**Needs the owner's and a lawyer's confirmation before real schools use it:**
the consent wording and process, the retention periods in database.md, and
whether a school's confirmation is enough for learners under 18 under the
PDPO. **Not done:** password reset by email, school admins adding teachers,
moving a learner between classes, the retention job, and deployment.

## D-084 — A bench power supply and a function generator

Two bench instruments beside the breadboard, as variants of the battery part
(its `source` is `supply` or `generator`), so they wire, move and draw in the
diagram as a DC source does. Older circuits are unchanged.

- **Power supply:** any voltage from 0.1 to 24 V in 0.1 V steps, turned by a
  slider; its display shows the voltage set and the current drawn. **Not
  modelled:** a current limit (a real bench supply would lower its voltage).
- **Function generator:** a square, sine or triangle wave from 0.1 to 100 Hz,
  with a peak amplitude up to 12 V and an offset of −12 to 12 V, through a 50 Ω
  output as bench generators have. The session stops at each half period of a
  square wave and 32 times a period for the others, so the oscilloscope draws
  them; a sine is therefore drawn in 32 straight steps. New ones start as a
  0 to 5 V square wave at 1 Hz.

## D-085 — A refreshed interface, built for phones first

The owner asked (24 November 2026) for the interface to be reviewed screen by
screen and improved. The workbench look stays (a green cutting mat, quiet
paper, amber for what is being acted on, Anek Bangla); the changes are about
layout and consistency.

- **Rules.** One amber action a screen; green and red only for states. A type
  scale of 1.2 from 16 px, nothing below 13 px, for Bangla's vowel signs.
  Corners grow with size (control, card, sheet). One style for every slider,
  choice chip, button and field, so the panels match. The variable font's
  width axis was left out: it would add about 290 KB for phones to download.
- **Lab.** One bar for the way back, the name, the view and Run. The 61 parts
  are in a **drawer of labelled compartments** (boards, basics, outputs,
  displays, sensors, measuring, logic, power, communication) with search,
  beside the board on a wide screen. The side tabs are Circuit, Code,
  Instruments and Network (the web page and IoT). The hint is a small note
  low on the board.
- **Phones.** The app's header steps aside in the lab; the board fills the
  first screen, with the tools and the view over it and the parts in a sheet
  that closes once one is picked; the panels follow below. The header has a
  menu, a বাং/EN switch and an account chip.
- **Pages.** Home keeps one main action and shows three examples as pictures
  of their circuits. Lessons are in tracks with progress, with a card for the
  lesson last worked on. Instruments look like instruments (a dark screen, a
  green trace). The logic sheet's toolbar is grouped, with gate symbols. A
  class's join code is written in chalk on a slate, to copy onto the board.

Not done: a dark mode, and measuring the lab on a low-end Android phone.

## D-086 — A serial plotter, a current limit, quizzes, invitations, a timing diagram and HTTP

Built on 24 November 2026, one piece at a time, after the owner asked for the
remaining pieces to be built one by one. Block coding was left out at the
owner's word.

- **Serial plotter.** The serial monitor can show its numbers as lines
  instead of text, as the Arduino IDE's plotter does: numbers on a line,
  split by spaces, commas or tabs, or written `name:value`. Up to six lines
  and the last 200 points.
- **Current limit on the bench supply.** D-084 left this out; it is now
  modelled. The supply has a limit from 10 mA to 3 A (1 A for a new one).
  When the circuit would draw more, the supply holds the current at the limit
  and its voltage falls, as a real bench supply does, and its display shows
  **CC**. Checked: 5 V into 100 Ω with a 20 mA limit gives about 2 V.
- **Quizzes.** A lesson may end with up to five questions of two to four
  choices, each with the reason for its answer. Answers are marked at once,
  on the device only; nothing is sent or kept. Seven lessons have two
  questions each, written for this project.
- **Teacher invitations.** The teacher who signs a school up is its admin.
  The admin makes an invitation code (three groups of four, shown once and
  kept only as a hash, working once for seven days), sees the school's
  teachers and withdraws codes not yet used. A new teacher signs up with the
  code instead of naming a school; a teacher already signed in joins with it.
  A teacher in two schools chooses the school for a new class. Nothing is
  emailed: the admin passes the code on in person. Every invitation, its
  use and its withdrawal are in the audit log. **Not done:** removing a
  teacher from a school, and passing the admin role on.
- **Timing diagram.** The logic sheet can draw its clocks, switches, the
  flip-flops' Q and its lamps as lines over the last eight seconds. Levels
  are noted at every clock change, not once a frame, so no edge is missed at
  10 Hz. It can be held still to read.
- **HTTP requests from a program.** The ESP32 board library gains
  `HTTPClient.h`, written for the lab from the documented API (the ESP32
  Arduino core's own is LGPL, so none of its code is used). The lab has no
  real internet, so three **made-up services** answer: `echo.lab` sends the
  request back; `weather.lab/now?city=…` makes up a city's temperature and
  humidity, drifting over a minute, and marks it `"madeUp": true`; `log.lab`
  keeps up to 50 lines a program posts and gives the last 20 back. Any other
  address finds nobody (connection refused). A request takes 40 ms of lab
  time. Headers are accepted but not used. The web panel lists each request
  a board's program made and its status. A new ready-made program,
  `webclient`, uses all of this.

## D-087 — Learners on their own, and running a school

The owner asked (24 November 2026) that the lab not be only for schools: any
student should be able to sign up, follow the lessons as a guide on their
own and build their own projects. Built with the rest of the accounts work.

- **Learners on their own.** A learner signs up with a **nickname** and a
  tick that a **parent or guardian knows and agrees**. Nothing else is asked:
  no email, phone, real name, age or school. The guardian's permission is
  recorded as a consent record with no school (policy version
  `self-learner-2026-11`); the database allows a record without a school only
  when a guardian gave it. The learner gets a sign-in key like a class
  learner's.
- **The key is the only way back in.** With no email kept there is nothing to
  recover a lost key with, and the page says so. A learner can make a new key
  while signed in (the old one and other devices stop working). If they join a
  class, their teacher can also give them a new key.
- **One account.** A learner signed in who joins a class does so on the same
  account, keeping their key and progress. Taken out of a class, a learner on
  their own account keeps it; a learner who came only through a class is
  signed out, as before.
- **Their page** shows their progress in each lesson, links to the lessons and
  to building a project, their classes, joining a class and a new key. Their
  progress and projects are kept as any learner's are (D-081).
- **Running a school.** The admin removes a teacher (their classes pass to the
  admin, so none is left without a teacher) or hands the admin role to another
  teacher, who must already teach there. A teacher who has left a school no
  longer manages its classes. A teacher moves a learner to another of their
  classes in the same school, under the same nickname.
- **Sign-in rate limit.** Still 10 tries a minute per address on each sign-up,
  sign-in and code route, now a setting (`SIGN_INS_PER_MINUTE`) so the browser
  tests, which sign up afresh on two screen sizes at once, can allow more.

**Needs the owner's and a lawyer's confirmation (with B3 of the remaining
work):** whether a guardian's tick on the learner's own device is enough
permission under the PDPO, and whether an age or school year should be asked.
**Not done:** password reset by email, the retention job, and a way for a
guardian to see or close a learner's account.

## D-088 — The logic sheet, part 3: names, several at once, larger blocks, K-maps, blocks of your own and buses

Built on 24 November 2026 at the owner's request, in segments, each tested
before the next.

- **A fix first.** The sheet's wire format allowed only letters in a port's
  name, so a wired hex digit (ports D0 to D3) made the whole sheet invalid:
  saving was refused and the sheet came back empty on reopening. Port names
  may now end in a number; a test keeps it so.
- **Names.** A switch, lamp, clock or block can be named (up to 12
  characters); the name is used on the sheet, in the truth table, its
  expressions and the timing diagram.
- **Several at once.** A box dragged over empty space chooses what it touches;
  Shift or Ctrl adds or takes away. Chosen elements move, copy (with the wires
  between them), paste (with new ids, a little further on) and are removed
  together. Keys: Delete, Ctrl+C, Ctrl+V, Ctrl+A, Escape; Copy and Paste are
  buttons too, for phones. What was copied can be pasted into another project.
- **Larger blocks.** Elements may now be bigger than 3 × 3. New: a 2-to-4
  **decoder**; a 4-bit **counter** (counts rising clock edges, CLR taken at the
  edge, CO HIGH at 15); a 4-bit **register**; a **RAM** of 16 words of 4 bits
  (reads at once, writes on a rising edge while WE is HIGH). A counter's and a
  register's bits are lines on the timing diagram. Sheets with counters,
  registers or RAM have no truth table.
- **K-maps.** For two to four switches, each lamp's truth table is also shown
  as a Karnaugh map in Gray-code order, each group of the simplest sum marked
  by a coloured bar; choosing a group outlines its cells.
- **Blocks of your own (sub-circuits).** Chosen elements can be made into a
  block: its switches (top to bottom) are its inputs and its lamps its
  outputs, by their names. The original circuit stays. Blocks are placed from
  a "Your blocks" group, may be made with earlier blocks (a full adder from
  two half adders, tested), are saved with the sheet, and travel with copies
  into other projects. A sheet with blocks is worked out by taking them apart
  (inside names "U1_G1"); a block's ports show the levels of what drives them.
  A block can be forgotten when nothing uses it. **Not done:** opening a block
  to change it (a new block is made instead).
- **Buses.** Counters, registers, RAM, decoders and hex digits have a bar
  beside each group of pins. Two matching bars are joined by a bus: one wire
  per bit underneath, drawn as one thick line with its width and value. Only
  groups of the same width, outputs to inputs. **Not done:** buses on blocks'
  own pins, splitting a bus, and keeping bus labels clear of elements.

## D-089 — IoT, part 3: data logs, HTTPS and Bluetooth Low Energy

Built on 24 November 2026 at the owner's request, in segments, each tested.

- **Data logs.** The serial plotter downloads every line the monitor still
  holds as a CSV (one column per value); the IoT dashboard keeps the run's MQTT
  messages (the last 5000) and downloads them as a CSV of time, sender, topic
  and payload. Files are made in the browser; nothing leaves the device. A
  byte-order mark lets spreadsheets read Bangla.
- **HTTPS.** `WiFiClientSecure.h`, written for the lab from the documented
  API. With no real network there is nothing to encrypt: certificate calls are
  accepted and kept nowhere, so a program written for a real HTTPS service runs
  against the lab's made-up services. Tested by compiling and running such a
  sketch in the sandbox.
- **Bluetooth Low Energy.** `BLEDevice.h` and its companions, written for the
  lab from the documented API of the ESP32 core's BLE library, following core
  3.x (`getValue()` gives a `String`). The board is a GATT server: services,
  characteristics (read, write, write without reply, notify, indicate),
  server and characteristic callbacks, advertising. The lab's **phone** is the
  only client, in a "BLE phone" view of the network panel: it connects to a
  board that advertises (which then stops advertising, as on a real board),
  reads values, writes text, and receives notifications. Callbacks run when the
  program waits (`delay`) or between turns of `loop()`, as the radio task would
  interrupt it. Deep sleep turns the radio off. New starter `ble`.
- **Not done, on purpose:** one board's program calling another board's web
  page. A program waiting for another board's answer would need the boards to
  pause for one another, a deep change to how they take turns, for little gain:
  boards already talk to each other through MQTT. **Not modelled:** scanning
  for other devices, the board as a BLE client, pairing and security, more than
  one phone, and the phone switching notifications on (it receives them as soon
  as it connects).

## D-090 — A quiz for every lesson, and lessons on the logic sheet

Built on 24 November 2026, after IoT part 3, as the next segment of the
remaining work.

- **Quizzes for every lesson.** The 40 lessons without one get two questions
  each, in Bangla and English, written for this project from what each lesson
  teaches (its pins, values and reasons). All 50 lessons now end with a quiz;
  the right answer's place is spread across the choices. They are marked on
  the device and nothing is sent, as in D-086.
- **Lessons on the logic sheet.** A lesson may be marked `sheet`: it opens on
  the sheet, sits in the logic track and needs no breadboard part. Five checks
  look at the sheet: an element kind is there (`sheet-part`), a wire runs from
  one kind's port to another's (`sheet-wired`), the truth table has a lamp
  column such as `0110` (`sheet-column`), a block was made (`sheet-block`), and
  a hex digit, counter, register or lamp showed a number while it ran
  (`sheet-value`, counted once seen). A sheet check in a lesson not on the
  sheet, or naming an element that does not exist, is refused when lessons are
  loaded.
- **Three new lessons**, written for this project: the half adder (made into a
  block), a binary counter on a hex digit joined by a bus (with the timing
  diagram), and a majority vote designed from its Karnaugh map. Each has a
  walkthrough that edits the sheet and runs it over time, so the lab proves the
  lesson can be finished, as for every other lesson.
- **Corrected:** the relay module already had a lesson; the "Not done" note in
  D-056 is out of date on that point.

## D-091 — Thirty reference circuits, and tests that wait in lab time

Built on 24 November 2026 as the "simulator accuracy" segment.

- **Reference circuits.** The DC solver is checked against ngspice 45.2 on 30
  circuits, up from 15, plus the 3 over time: an R-2R ladder DAC, a current
  divider, batteries in parallel, a cell being charged, a T attenuator, a
  balanced bridge, a ten-resistor chain, a two-source mesh, a bridge
  rectifier, diode OR and AND gates, an LED on a current source, a solar cell
  on a load, a transistor LED driver from a 3.3 V pin, and a Darlington pair.
  The answers come from ngspice in WebAssembly (`eecircuit-engine`, MIT),
  which the project already used; nothing new was installed. Four answers were
  also checked by hand (the ladder gives 5 × 11/16 = 3.4375 V; the bridge's
  midpoints are both 4 V; the divider and the mesh match their formulas). The
  existing 15 answer files came out unchanged. Every node in the new circuits
  has a real current path, so no answer rests on leakage, where simulators
  rightly differ. The regeneration script now reads ngspice's result names in
  either case.
- **Tests in lab time.** The lab shows its simulated time to tests in a hidden
  element; a helper retries an assertion until it passes or the lab has run a
  given time, with three minutes of real time as a hard limit. Nine tests that
  waited on the wall clock for the simulation now use it. Compile waits keep
  wall-clock limits.
- **Not done:** measuring the editor with 200 parts and the lab on a low-end
  Android phone; that needs the phone.

## D-092 — Logic finishing touches: blocks to open, buses on blocks, a gate delay, a trigger

Built on 24 November 2026, closing the gaps D-088 left.

- **Buses on a block's pins.** A block with two or more inputs has one bar for
  all of them, in order, and likewise for its outputs; a bus joins them to any
  group of the same width.
- **Opening a block.** A placed block can be opened: the sheet shows its
  inside, worked out live, to test and change. Changes go back into the block
  and reach every copy, on the sheet and inside later blocks; its switches and
  lamps stay its pins, so copies take the new number of pins and wires to pins
  that are gone are removed. Undo covers it. A block must keep a switch and a
  lamp.
- **Gate delay.** The sheet may give every gate a delay of 10, 20 or 50 ms
  (none by default), kept with the sheet. With one, the sheet moves a delay at a
  time, each element answering what its inputs were a step before, so changes
  ripple and the timing diagram shows glitches (A AND NOT A pulses for one delay
  when A rises; tested). Each clock change still gets a step. Truth tables and
  lessons still settle at once. **Fixed along the way:** a clock inside a block
  did not tick, as the sheet only looked for clocks placed on it directly.
- **Analyser trigger.** An analyser row and an edge, armed: when the edge comes
  the picture holds with it a fifth of the way across, marked, while recording
  goes on.
- **Not modelled:** different delays for different gates, and set-up and hold
  times for flip-flops.

## D-093 — The UNO catches up: I²C, SPI, the displays and the LED ring

Built on 24 November 2026. Until now the kit's OLED, the colour display and the
LED ring worked only on the ESP32.

- **I²C and SPI on the UNO.** avr8js's TWI and SPI hardware are joined to the
  same device handlers as the ESP32's, on A4/A5 and D13/D11/D12. Wire and SPI
  come from the pinned ArduinoCore-avr 1.8.8; Adafruit's GFX, SSD1306, ST7735/
  ST7789, BusIO, unified sensor, BME280 and INA219 (all BSD, MIT or Apache-2.0)
  from the copies already in `third_party`. Tested end to end: a compiled sketch
  lights the OLED part and draws on the colour display through the circuit.
- **LED ring.** Adafruit's NeoPixel library is LGPL, so the UNO gets the lab's
  own (Apache-2.0), with the same interface as the lab's ESP32 version. It sends
  the bits from counted-cycle assembly, with interrupts off, as a real board
  must; the times were measured in the emulator (0.38 and 0.81 µs HIGH at
  800 kHz, 0.5 and 1.19 µs at 400 kHz). The board reads the colours back from
  each pulse's length (see the architecture note). **Chosen over** a host call
  like the ESP32's: the UNO has no host, and a sketch built here should run the
  same on a real board. **Fixed along the way:** a first version in plain C let
  the compiler put its tests inside the HIGH time, making a 0 about 0.75 µs,
  which a real ring would read as a 1.
- **Licences.** Wire and SPI are part of the core release already used; their
  source is now copied into `third_party/arduino-avr` beside the core's and
  checked against the pinned fetch, and the licences page says that programs
  built for the UNO include them. The compile worker's container now copies
  every third-party library, not only the DHT library.
- **Not checked:** whether a display or ring module takes the UNO's 5 V
  signals, and any of it on a real board.

## D-094 — Linking the catalogue to the parts master, and a private catalogue desk

Built on 24 November 2026.

- **Where the links live.** Product numbers, names and prices are the store's
  data, so the links between products and lab parts, and a person's decisions
  on them, are kept in `data/private/`, never in the repository. The code, its
  tests (on made-up products) and the parts' generic keywords are public.
- **Suggest, then decide.** Keywords suggest a part; a person confirms, moves
  the product to another part (with a variant if it is one), or says it is no
  lab part. Decisions are kept by product number, outside any snapshot, so a new
  export keeps them; ones that no longer fit are reported. **Chosen over**
  typing the links by hand (4,511 products) or trusting the keywords alone
  (a keyword cannot tell a part from a tool or kit
  that names it).
- **Project coverage** goes through a line's product link first and its words
  second, so a decision corrects the "missing in the simulator" figures too.
- **The desk** is a local page served by Node's own HTTP server, with no new
  dependency, for the owner's computer only (127.0.0.1, host check, a token for
  changes, nothing loaded from elsewhere). It is not part of the web app, so no
  store data can reach a build or a deployment.
- **Keyword fixes from the first run:** whole words only; longer keywords in any
  order; part numbers with maker and package letters; a keyword for the 1.54"
  ST7789 module as stores name it.
- **Not done:** decisions themselves (the owner's call, product by product), and
  showing catalogue prices to students, which needs the store's written
  permission first.

## D-095 — Dark mode

Built on 24 November 2026.

- **Follows the device, or the student's choice.** By default the lab uses the
  phone's or computer's light or dark setting. A button in the header steps
  through "as on this device", dark and light; a choice is remembered on that
  device only (local storage), so no account data is involved.
- **The bench keeps its daylight colours.** The page, panels, text and lines
  go dark; the green mat, the breadboard and the parts on it, the meter's LCD
  and the instruments' screens look as they do in light mode, since they are
  things on the bench, and their colours carry meaning (wire colours, LED
  colours, resistor bands).
- **Colours by role.** Some colours served two roles, so they were split, with
  the light-mode values unchanged (light mode looks exactly as before):
  `chalk` (light text on the dark green mat, header and screens), `graphite`
  (dark text on amber), and `accent` (the mat's green as text, lines and focus
  on the page, which brightens in dark mode while the mat stays dark). Text on
  the ink-coloured strips (a toast, a button) inverts with the theme; the
  serial monitor stays a dark terminal in both.
- **Also themed:** the code editor, with its own highlighting colours (CodeMirror's
  defaults are made for white), the K-map group colours, and the schematic's
  ink.
- **Not done:** a separate dark design for the mat and the parts; contrast not
  measured on a real phone screen outdoors.

## D-096 — Accounts of one's own, with proper sign-in

Decided by the owner on 24 November 2026; first part built the same day.

**The decision.** The lab serves two kinds of use, both with proper sign-in, and
the owner controls both: schools with labs (admins, teachers, class learners),
and people on their own, with no school. The owner's choices:

- People on their own sign in with an email and a password, the email
  confirmed by a link, and reset a forgotten password by email.
- Under 18: the learner never gives an email or phone number. They choose a
  sign-in name, a nickname and a password, and name a parent's or guardian's
  email. The guardian approves the account from a link (that approval is the
  consent, recorded with policy `individual-learner-2026-11`) and receives
  its password resets.
- Sessions end when the browser closes unless "keep me signed in on this
  device" (30 days) is ticked, for shared school computers and family phones.
- Later steps: an owner's control panel (approve, suspend, reset, close); new
  schools apply and work once the owner approves; teachers reset by email or
  with a code from their school's admin; class learners keep a key, shown as
  a lab pass card that can be saved, with no QR code.

**Built now (part 1, individuals).**

- API: `register`, `register-learner`, `email-link`, `verify-email`,
  `approve-learner`, `resend`, `forgot-password`, `reset-password`; sign-in by
  email or sign-in name with a "keep" choice; `/v1/me` says whether an account
  is a school's staff, an individual or a class learner. Answers never tell a
  stranger whether an email has an account; the owner of the address is told
  by email instead. Links carry their token after `#`, so it never reaches a
  server log, and the page removes it from the address bar at once.
- Email: no provider is chosen, so messages go to a local mailbox (kept in
  memory, logged by recipient and subject, readable by tests). The API refuses
  to start in production until a provider is configured.
- Web: the account page first asks how you will come in (an account, a new
  account, a class code or lab pass), then shows one form at a time; pages for
  the three kinds of link; the lab pass card for class learners; adults on
  their own get the learner's home, with progress recorded.
- **Fixed along the way:** waiting progress was kept on the device without
  saying whose, so on a shared device it could be sent as the next learner's;
  it is now tagged with its account, and signing out sends it or removes it.
  A refused request (too many in a minute) now says so, instead of "something
  is not filled in right", and no longer makes the page look signed out. The
  limit on all requests from one address is now a setting.
- **Replaced:** the nickname-only sign-up with a guardian's tick (D-087). Its
  accounts keep working by key; no new ones are made.
- **Corrected:** the review before this work said some account fields had no
  accessible name. They do (each is inside its label); the tool used to read
  the page did not show it.
- **Not done yet:** teachers' emails are not confirmed (their sign-up is
  unchanged until the school step); an email provider; the owner's panel; the
  classroom limit on joining (ten a minute from one address); a lawyer's word
  on the guardian approval under the Personal Data Protection Act 2026
  (REPORTED to have replaced the 2025 Ordinance; not read by us).

## D-097 — The lab office: the owner's panel

Built on 24 November 2026, the second step of D-096.

- **Who.** An owner is a platform admin (`users.platform_role`, unused until
  now). The role is given only on the server, with `owner:grant <email>`, to an
  open adult account; never from the web. Both granting and taking back are
  audited.
- **What.** A page at `/owner`, linked in the header for owners only: counts
  of schools and people; schools (suspend, start, close, reopen); people
  (suspend, restore, close; a one-time reset link for 24 hours to hand on when
  email does not arrive); the latest 100 audit entries. Every change asks
  first and is audited with the owner as actor.
- **Effects.** A suspended account cannot sign in by any means and its sessions
  stop at once. A suspended or closed school gives its staff no powers and its
  classes cannot be joined; its teachers can still sign in. A school gains a
  status (`pending`, `active`, `suspended`), with `pending` ready for schools
  that apply (the next step).
- **Guards.** The owner's own account and other owners' cannot be suspended or
  closed from the panel. Class learners get no reset link (their teacher gives
  a key).
- **What the owner sees.** What running the lab needs, no more: adults' names
  and emails; learners' nicknames, own sign-in names, class counts and whether
  a guardian approved, the guardian's email only in part. No learner progress
  or projects. **Chosen over** showing guardians' emails in full: the owner
  can still send a reset link to hand on without seeing it.
- **Not done:** schools applying for approval (next step); reopening a closed
  account (by design, closing is final); a fuller audit search.

## D-098 — Schools that apply, teachers' passwords, and the classroom's limits

Built on 24 November 2026, the third step of D-096.

- **A new school waits for an owner.** A teacher who names a new school gets a
  school that is `pending`: they can sign in and see it, but cannot make
  classes or invite teachers until an owner approves it in the lab office
  (**Approve**, D-097). Setting `SCHOOL_APPROVAL=automatic` lets schools work
  at once; only the development and browser-test servers use it. The approval
  itself is tested against the API with approval required, as in production.
- **Teachers confirm their email** before their first sign-in, like adults on
  their own; every adult now needs a confirmed email to sign in. Adults made
  before this (development and test accounts only; the lab was never
  deployed) are marked confirmed by migration `0008`.
- **Teachers' passwords.** A forgotten password is reset by email (D-096). When
  email does not arrive, the school's admin makes a one-time reset link for one
  of the school's teachers (24 hours) to hand on; the owner does the same for
  an admin (D-097). Anyone with a password can change it (other devices are
  signed out) and sign out on every device.
- **The classroom's limits.** Joining a class and signing in with a key have
  their own limit, 120 a minute per address (`CLASS_JOINS_PER_MINUTE`), since a
  whole class does it at once from one school address; codes and keys are long
  enough that guessing stays hopeless. All requests: 1,200 a minute per
  address (was 300). Behind a reverse proxy, `TRUST_PROXY` makes the limits
  count each visitor rather than the proxy; it is off by default, so a visitor
  cannot claim another address.
- **The teacher's page** is split into Classes, School (the school's teachers,
  invitations, joining another school) and My account (password, sign out
  everywhere). A school waiting or suspended says so at the top. A join code
  that has run out says so. A new key for a learner asks first, and actions
  that fail now show why.
- **Not done:** account closing by the user or a guardian, and the retention
  job; a check that a school is real (the owner decides, by any means).

## D-099 — The lab office in Cloudflare's Kumo

Decided by the owner on 24 November 2026: the owner's dashboard uses Kumo
(`@cloudflare/kumo` 2.18.0, MIT), Cloudflare's React components on Base UI and
Tailwind CSS v4, with its icon set (`@phosphor-icons/react` 2.1.10, MIT). Both
pinned to the newest release at least two weeks old.

- **Only for the office.** The office page loads on demand, with its own
  stylesheet built from Kumo's theme; students never download either. The main
  bundle did not grow (it shrank slightly, as the office moved out of it); the
  office's own code is about 390 kB and its styles 154 kB (23 kB compressed).
- **The rest of the lab stays as it is.** Kumo's stand-alone stylesheet was not
  used: it resets the whole page and sets its own typeface. Tailwind's defaults
  and Kumo's theme would also change page-wide settings once loaded (the Bangla
  typeface, text sizes, the transition speed and the root colour scheme), so
  the office's stylesheet restates the lab's values. A browser test checks, in
  light and dark mode, that the page's typeface, colour scheme and text sizes
  are the same before and after the office has loaded.
- **What it uses.** Cards for the counts, tabs, tables that scroll sideways on
  a phone, status badges, a dialog to confirm each change, a copy box for
  reset links, paging, empty and loading states. Kumo's built-in English labels
  (paging, copying, tab scrolling) are given in Bangla and English. Kumo's dark
  mode follows the lab's.
- **Licences.** Kumo brings 70 packages, all permissive; the third-party list is
  regenerated and the licence check passes. Kumo's optional chart and form
  extras are not added.

## D-100 — Closing accounts

Built on 24 November 2026, chosen by the owner as the next step.

- **One's own account.** Anyone signed in can close their account from My
  account; a password, if the account has one, confirms it. Class learners,
  who sign in with a key, can close theirs too.
- **A learner's own account, by the guardian.** On the guardian page
  (`/account/guardian`, linked from the first screen and from the approval
  email), the guardian writes the learner's sign-in name and their own email.
  If they match the approval on record, a one-time link (24 hours) goes to that
  email; opening it closes the account. The answer is the same whatever is
  found, so the page tells no one which names or emails exist.
- **Nothing left without someone in charge.** A school's admin hands the role
  on first, and an owner of the lab gives the role back on the server first. A
  teacher's classes pass to their school's admin, and their learners stay.
- **What closing does.** No way in remains (sign-in, key, reset links), every
  session ends, school memberships end, and the consent on record is marked
  withdrawn. The data stays until the retention job removes it; that job is
  not built yet, and its periods wait for the lawyer.
- Migration `0009` adds the `close-account` kind of email link.

## D-101 — The retention job

Built on 25 November 2026, chosen by the owner as the next step.

- **Report first.** `pnpm --filter @banglalab/api retention` only reports, per
  rule, how many rows it would touch; nothing changes. `--apply` does it, in one
  transaction, and writes one `retention.run` audit entry holding the counts
  and nothing else. The report and the applied run select the same rows, so
  what is reported is what is done (tested).
- **Periods are settings.** Each period is a `RETENTION_*` setting whose default
  is the proposed value in [the database design](../architecture/database.md).
  None is confirmed: the owner and a lawyer decide them before the lab goes
  live, and only the settings change.
- **Emptied, not deleted.** Consent records, classes and the audit log point
  to an account, so a closed account is emptied rather than removed: after its
  waiting period its projects, progress, guardian's email, email links,
  sessions and class places are deleted, and its row keeps no name, email,
  sign-in name, password or key. `users.erased_at` (migration `0010`) records
  when.
- **Closing on the lab's behalf.** Three new proposed rules close accounts
  nobody is using: an adult's sign-up never confirmed after 30 days, a
  learner's sign-up no guardian approved after 30 days, and a class learner
  whose every class ended (archived, or the place removed) more than 12 months
  ago. Closing here does what closing by hand does (D-100), and the account is
  then emptied after the same waiting period as any other.
- **Progress is compacted, not summarised.** After two years, repeats of the
  same step are reduced to the latest one. Every progress page counts distinct
  steps and learners and shows the latest time, so none of them changes. A
  table of yearly totals can come later, if the lawyer asks for less.
- **Not yet scheduled.** Nothing runs it on its own: it is meant to run once a
  day on the server, which is set up with hosting. AI usage and payment records
  have no tables yet, so no rules either.

## D-102 — The glossary

Built on 25 November 2026, chosen as the next step after the retention job.

- **The lab's own words.** Each of the 48 terms is the word the lab itself uses
  in each language (ভোল্টেজ, কারেন্ট, রেজিস্টর, সার্কিট), so the glossary explains
  what students actually read. A test fails if a term's word does not appear in
  the lessons or on the lab's screens. Other names in use, such as বিভব পার্থক্য
  or তড়িৎ প্রবাহ, are listed with it and found by the search. They are common
  Bangla words, not checked against the NCTB textbooks; that check belongs to
  the curriculum mapping, which is still to come.
- **A page of its own.** `/glossary`, from the main menu: both names side by
  side (the reader's language first), the unit, a short meaning, the lessons
  that use the term and related terms. A search finds a term by any name in
  either language, then by its meaning. It is part of the app, so it works
  offline.
- **Terms in lessons.** A bold word in a lesson's step, points or next idea that
  names a term shows its name in the other language beside it, the first time
  in that text. A tap opens its meaning, with a link to the glossary in a new
  tab, so the lesson stays as it was. Quiz questions are left alone, so a
  meaning cannot give an answer away.
- The glossary is content under CC BY 4.0, like the lessons.

## D-103 — The redesign, stage 1: colours and type

Decided with the owner on 25 November 2026. The owner asked for the whole
site to be redesigned, with another ESP32 labs site as the reference and Noto
Sans Bengali for Bangla, and chose: a look of the lab's own (inspired by the
reference, nothing copied from it), light and dark both, the three Noto
families, and a design page to approve before any rebuilding. The design page
was approved the same day.

- **Two school materials.** Light is a breadboard: cool white, with the red
  (+) and blue (−) rails as the line under a page's title band. Dark is the
  blackboard: board green with chalk-white text. Amber, the lit LED, stays the
  one action colour. What was taken from the reference, in the lab's own form:
  wire colours on pin names, a numbered lesson path, a drawing for each part,
  and progress as a row of LEDs. Its small all-capital monospace labels were
  not taken: Bangla has no capitals and reads badly in a monospace face.
- **Type.** Noto Sans Bengali for Bangla, Noto Sans for Latin, Noto Sans Mono
  for code, pin names and readings, all under the SIL Open Font License 1.1,
  in place of Anek Bangla. Only the Bengali, Latin and Greek (for Ω) files are
  shipped: 197 KB, against 198 KB before.
- **This stage** changes the colour and type settings of every page, the top
  bar, and the title bands of home, lessons and glossary (holes and rails).
  The lab's work surface has a colour of its own (`bench`) and looks as it
  did; it is redesigned in a later stage. Faint text is darker than before, so
  it meets the 4.5:1 contrast it missed.
- **Stages to come,** one pull request each: home, lessons and glossary; the
  lab; accounts, teachers' and guardians' pages. The owner's office keeps
  Kumo and takes the new colours through its settings.

## D-104 — The redesign, stage 2: home, lessons and glossary

Built on 25 November 2026, the second stage of the redesign (D-103), from
the design page the owner approved.

- **Lessons as a numbered path.** Each lesson is a stop on a wire: its number
  (a tick once it is done), the lab's own drawing of its part, what it needs
  and how far the student has got. The wire turns green behind a finished
  lesson. Only the lesson last worked on stands out, in amber; the rest stay
  quiet. All the tracks stay on one page, as before, so a link to a lesson
  still finds it.
- **Progress as LEDs.** One LED for every lesson, in the title band and
  beside each track, lit when the lesson is done and ringed when it is in
  hand; the steps of the lesson in hand are drawn the same way. The row is one
  picture to a screen reader, with the count in words as its name.
- **Home.** The title is the lab's promise, beside the lab's own drawing of a
  circuit, in place of "My circuits"; the lesson in hand is offered first,
  then the examples, then the student's circuits. The note that everything is
  kept on the device moved under the circuits it is about.
- **Glossary.** Entries read as a dictionary: the two names on the left, the
  meaning, other names, lessons and related terms on the right, in one list
  with hairlines in place of a card for each.
- The drawings come from the lab's parts drawer (`PartIcon`), so a part looks
  the same on the path as in the lab, and no new pictures are shipped.

## D-105 — The redesign, stage 3: the lab's look

Built on 25 November 2026, the third stage of the redesign (D-103).

- **The lesson panel.** Steps are numbered stops, as on the lessons page: a
  tick when done, an amber ring for the one in hand. What the lab checks shows
  a tick, or a dashed ring while it is not yet met.
- **Pin names as wire ends.** A bold pin name in lesson text is drawn as the
  end of a jumper wire with a stripe for what the pin is for: red for power,
  black for ground, yellow for a signal. Red and black are the colours the lab
  gives power and ground wires. Signal wires take turns between yellow, blue
  and green, so the stripe says "a signal" and does not promise the colour the
  wire will be. Which bold words are pins is decided by name (`pins.ts`), and
  tested against every bold word in the lessons.
- **The work surface stays the green mat,** in light and dark. The design page
  drew it light. The lab has a white wire, LED glows and labels drawn for the
  mat, and they would be lost on a light ground. The owner was told.
- The breadboard's rails run under the lab's bar, and the open tab is marked
  in amber.

## D-106 — More room for the circuit: rails that open while in use

Asked for by the owner on 25 November 2026: on a laptop the parts list and
the work panel left the board about half the screen. This is the first of
three parts; a board that grows in every direction and is moved by dragging,
and right-angle wires, follow.

- **The parts list is one column.** Folded, it is a rail of drawings (64 px on
  a laptop, 48 px on a phone). While the pointer is on it, it widens to show
  each part's name, and nothing moves up or down, so a part stays where the
  pointer found it. It folds the moment a part is picked, so the board is
  clear to place it. On a touch screen a first tap opens the list and a second
  picks, so a part is chosen by its name and not by guessing at a drawing. The
  phone's bottom sheet is gone.
- **The work panel is a rail of tabs** at the board's edge on a wide screen.
  What a tab holds opens over the board while the pointer or the focus is in
  it (so typing a program does not close it), and it sits below the lab's bar,
  so Run stays in reach. Folded, the circuit tab counts the lab's messages,
  which would otherwise go unseen. On a phone the panel is below the board, as
  before; that is still to be decided with the owner.
- **Keep open.** Either rail can be kept open, which puts it back beside the
  board; the choice is remembered on the device.
- **The board alone.** One button puts both rails away on a wide screen.
- On a 1366 px laptop the board goes from about 694 px to 1226 px wide.
- **Tests.** The browser tests of what the lab does run with both rails kept
  open, as a student may choose, so that nothing covers the board mid-test;
  `workspace.spec.ts` tests the rails themselves from a browser that has chosen
  nothing.

## D-107 — A work surface that takes in the project, and has no edge

Asked for by the owner on 25 November 2026, after the rails of D-106 left the
breadboard filling the window at 125%.

- **A first look takes in the circuit.** The board is shown whole, in width
  and in height, and at full size at most (it was fitted to the window's width,
  up to 160%). On a touch screen it never goes below full size, as before, so
  that holes stay large enough to tap.
- **The mat has no edge in sight.** It is drawn around the circuit with bare
  room on every side, never less than the window shows, and without
  scrollbars. Dragging the bare mat with a mouse moves the view any way; a
  finger moves it as before. Where the view is moved, more mat is laid down,
  so it does not run out.
- **Parts can go any way.** A part put down in the room to the left or above
  stays there, and the circuit's area and the room around it move out with it.
  The view stays where it was while the mat grows under it.
- **It is large, not endless.** A part can lie up to 2000 px left of and above
  where the first breadboard starts, and 3600 px right of and below it. A
  saved circuit already allowed positions that far (100 hole pitches before
  the corner), so no saved circuit changes.
- **A breadboard's handle** is larger, with arrows four ways for "move me" and
  a tip on pointing at it. Breadboards could always be moved by it; the owner
  had not found it.
- "Fit" goes back to the first view.

## D-108 — Parts are put where the student wants them

Asked for by the owner on 25 November 2026.

- **A breadboard is picked by its size.** Its line in the parts list opens
  the three sizes under it, with their holes (170, 400 and 830). The one chosen
  is the one added. Before, the list always added the 400-hole board and the
  size was changed afterwards.
- **A part beside the breadboards is taken in hand, then put down.** A
  breadboard, battery, bench supply, function generator, board or motor
  driver is no longer dropped in its usual place at once. Picked from the
  list, it is in hand: a half-transparent picture of it follows the mouse, and
  a press on the mat puts it there, with its middle where the mat was pressed.
  Where it has no room the picture is outlined in red and a press adds
  nothing. Picked again in the list, it goes to its usual place, as before. Esc,
  or choosing a tool, puts it back. On a touch screen there is nothing to
  follow: a finger presses where the part goes.
- **A part for the breadboard shows its drawing by the pointer** until the
  pointer is over a hole, where the part itself is drawn where it would go,
  as before.
- Nothing about the ESP32 board changes but where it can be put; its wiring
  and programs are as they were.
- **Tests.** The browser tests of what the lab does add these parts as before,
  through `e2e/pick.ts`, which presses twice. `canvas.spec.ts` tests putting
  them down by hand.

## D-109 — Two kinds of wire: jumper and right-angle

Asked for by the owner on 25 November 2026 (task 8 of the lab plan).

- **A wire is a jumper wire unless it is drawn square.** A jumper wire hangs
  slack between its ends, as before. A square wire runs straight and turns at
  right angles: between its ends and each bend it goes across first, then up
  or down, with a small rounded corner, as a wire laid flat on a board is bent.
- **The kind for new wires is chosen in the toolbar.** On a laptop the rail
  lists "jumper wire" and "right-angle wire" under the wire tool, and pressing
  one takes up the wire tool in that kind. On a phone a toggle appears beside
  the wire tool while it is in hand. The choice is remembered on the device.
- **Any wire can be changed later.** With a wire selected, its quick actions
  offer the other kind. Its route (its bends) is kept either way, so one
  circuit can mix both.
- **A square wire's route** is laid out as any wire's is: its handles sit at
  its corners, and dragging one makes a bend there.
- **Saved format.** A wire may carry `style: 'square'`; left out it is a jumper
  wire. That is circuit version 26. An older circuit opens unchanged, with all
  its wires jumper wires.
- Only the drawing changes: a wire joins the same two places either way.

## D-110 — Run in a lesson checks what was asked for

Asked for by the owner on 25 November 2026 (task 9 of the lab plan): a
lesson or project built as asked must work with its given program, and a
wrong connection must be caught before it puzzles the student.

- **What is checked.** When Run is pressed in a lesson, the lab looks at every
  part and connection the lesson has asked for, in this step and every step
  before it, and lists the ones the circuit does not have. A connection made
  with a resistor of the wrong value counts as not made.
- **What is shown.** A card over the board lists each item, with the step that
  asked for it. "দেখাও" rings both ends of a missing connection on the board.
  A board's "any ground" rings all its ground sockets. Each item goes once it
  is fixed, and the card with the last. A missing part has nothing on the
  board to point at, so the board points at the first item that does.
- **The circuit runs all the same.** Some lessons want a fault to be seen and
  explained, and those explanations (a short circuit, too much current) are
  the lab's, as before.
- **No false warnings.** Every lesson's walkthrough test now checks that, at
  the moment it presses Run, nothing it has been asked for is missing. All 50
  lessons pass, so a circuit built as a lesson asks never gets the card.
- **Later, as the owner said:** a student's own circuit, with no lesson to
  compare against, and telling a wiring fault from a fault in the program.

## D-111 — The redesign, stage 4: accounts and the remaining pages

Built on 25 November 2026, the last stage of the redesign (D-103), chosen by
the owner after reviewing what is left to build.

- **One title band for every page.** The account page, the licences page and
  the ESP32 page now open with the same band as home, lessons and glossary:
  board green with a breadboard's holes, and the red and blue rails under it
  (`PageBand`). Signed in, the name and "sign out" sit on the band. Email-link
  and guardian pages keep their title in their card, under a slim band.
- **Ways in as rows with a drawing.** On the signed-out page each way in
  (sign in, a new account, a class code or lab pass, and then adult or
  under 18) is a row with its drawing and an arrow, like a stop on the lesson
  path.
- **The same marks as the rest of the lab.** The teacher's tabs are underlined
  in amber, as in the lab; a school waiting for approval is a bordered note
  (no left-edge stripe); a learner's own progress in a lesson is a row of LEDs.
- With this, every page a student or teacher sees is in the new design. The
  owner's office keeps Kumo, with the new colours through its settings.

## D-112 — Pause, step and start again

Built on 25 November 2026, chosen by the owner from the list of what is left
(requirement "Pause, reset, step").

- **Only where it means something.** The controls appear while a circuit runs
  that changes over time: a capacitor charging, a board running a program, a
  clock. A circuit of batteries, resistors and LEDs settles at once, and has
  none.
- **Pause** holds the lab's time still; the board stops where it was, and an
  edit made while paused is shown at once, without time moving for it. **Run
  on** lets time go from where it stood; the pause is not counted as running
  slowly.
- **Step**, while paused, moves time on by 1, 10 or 100 ms, as chosen, and
  holds it again; the time it stands at is shown to the millisecond.
- **Start again** begins the running circuit from time zero, with the programs
  it has.
- The simulation advances in the same slices of at most 50 ms whether it runs
  or is stepped, so a stepped circuit behaves as a running one does.

## D-113 — Two stand-in parts become real models: the TMP36 and the buzzer module

Built on 25 November 2026. Of the five parts the lab showed as generic
stand-ins, the owner chose what each should become; this covers the first two.

- **The analog temperature sensor is a TMP36**, chosen over the LM35 because it
  works from 2.7 V, so it suits the ESP32's 3.3 V as well as 5 V. Its output is
  0.5 V + 10 mV per °C (the maker's datasheet figures; REPORTED, not
  checked on a real part): 0.75 V at 25 °C, whatever its supply between 2.7 V
  and 5.5 V. In the lab, below 2.7 V it gives nothing. Its supply current and output resistance are
  ESTIMATES. Its error, self-heating and readings below 0 °C are not
  modelled; the part says so.
- **The active buzzer module is its own part, with three pins: S, + and −.**
  Boards sold under this name differ: some sound when S is HIGH, others when S
  is LOW (REPORTED from sellers' listings). The part has a setting for which,
  HIGH by default. On HIGH the buzzer runs from S to −, and + is not needed, as
  on the kit's board. On LOW it is fed from + and sounds while S is pulled LOW;
  a real board of that kind switches it with a transistor, so S carries only a
  few milliamps, where in the lab it carries the buzzer's current. The part
  says this.
- **The five lessons that use the buzzer now use the module**, with the same
  wiring (S to the pin, − to GND) and the same programs. Their text no longer
  says a two-leg buzzer stands in. A circuit saved part-way through one of them
  keeps its two-leg buzzer, which still works but does not meet the lesson's
  check; the Run check shows what is missing.
- The two-leg buzzer stays in the parts list as a part of its own.
- Circuit format 27 adds the module. Older circuits open unchanged.
- Next: the YL-69 soil sensor as its real four-pin board, then the IR obstacle
  sensor and the TT gear motor from published figures.

## D-114 — The YL-69 soil sensor on its four-pin board

Built on 25 November 2026, the third of the stand-in parts the owner chose to
model (D-113).

- **The YL-69 is its board's four pins: VCC, GND, DO and AO**, built as the
  rain module is. AO falls as the soil gets wetter; the comparator pulls DO
  LOW, and lights the board's second LED, once AO is below the trimmer's
  setting (REPORTED by sellers' pages). The resistances inside are ESTIMATES,
  and nothing has been measured on a real board.
- **AO follows the same curve the three-leg stand-in had**: 90 % of the supply
  when dry, 30 % when soaked (ESTIMATE). The ESP32 programs of the three soil
  lessons were compiled against that curve and cannot be rebuilt on this
  laptop, so keeping it means they read the same values as before.
- **The three soil lessons now use the board**: AO to D34 in place of the
  output, VCC and GND as before; DO is not used. Their text no longer says a
  three-leg sensor stands in.
- **Saved circuits are not rewired.** The owner asked for saved circuits to be
  upgraded, but the board's pins sit in a different order (VCC, GND, DO, AO)
  from the old sensor's (VCC, output, GND), and its wires end in breadboard
  holes, not on the part. Swapping the part in place would join the wire that
  went to the output to the board's GND, and the ground wire to DO, without a
  word. So an older circuit keeps its three-leg sensor, which still works and
  is named as the older one; it has left the parts list. In a soil lesson, Run
  shows that the board is what the lesson asks for.
- Circuit format 28 adds the board. Older circuits open unchanged.

## D-115 — The IR obstacle sensor and the TT gear motor; no stand-ins left

Built on 25 November 2026, the last two of the stand-in parts (D-113, D-114).
Every figure below is REPORTED from sellers' and makers' pages, with the
sources named in the code; none was measured here.

- **The IR obstacle sensor is its three-pin board**, with OUT, GND and VCC in
  the order of the common FC-51 board; some boards put them the other way,
  and the part says to go by what is printed. On 3.3 V to 5 V it draws about
  20 mA. OUT is held HIGH by a 10 kΩ resistor and goes LOW, with the green
  light, while something is within the trimmer's range, 2 cm to 30 cm against
  a white wall. One source describes OUT the other way round; the others,
  and the lessons' programs, agree on LOW.
- **In the lab a tap puts something in front, as before**, and the inspector
  sets how far away it is, the trimmer's range, and whether it is light or
  dark. Sources say only that a darker surface is seen nearer; the lab sees a
  dark one within half the range, an ESTIMATE. Sunlight is not modelled.
- **The TT gear motor is its own part.** One maker measured one motor (and
  says motors vary): 120, 185 and 250 RPM at the shaft on 3, 4.5 and 6 V,
  150 to 160 mA running free, 1.1 A to 1.5 A held still. In the lab its speed
  is in proportion to its voltage, about 42 RPM a volt, within 5 RPM of those
  measurements, and is written on the gearbox.
- **Its current is one resistance**, 29 Ω, matching the 155 mA at 4.5 V. It is
  about a third low at 3 V and a third high at 6 V, and it never stalls. A
  truer model would feed each solution's current back into the solver, which
  the motor-driver lessons do not need and could unsettle; the part says what
  it leaves out.
- **Lessons:** the two IR lessons and the three that use the TT motor (the
  motor driver, the obstacle robot, and auto-watering, where it stands in for
  the pump) now use the new parts, wired as before by pin name. The other
  motor lessons keep the generic DC motor, which they ask for.
- **Saved circuits keep their older parts**, which still work: the three-leg IR
  sensor's legs are in a different order from the board's, so it is not swapped
  in place (as in D-114). The generic DC motor stays a part of its own.
- Circuit format 29 adds both. No part definition is a stand-in any more.
