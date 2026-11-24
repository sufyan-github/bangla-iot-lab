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
