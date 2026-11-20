# Simulation design

## Pipeline

```
CircuitDocument (shared)  →  buildNetlist (simulation)  →  solveDc (circuit-engine)
        ↑                                                          ↓
   editor / storage              readings + diagnostics  ←  simulate (simulation)
```

### 1. Circuit document

`packages/shared/src/circuit.ts`. A circuit is a list of components and wires.
Parts on the board name the hole each lead is in (`a12`, `tp7`); off-board parts
(the battery) expose terminals (`BAT1.pos`). The schema is versioned
(`schemaVersion: 1`) and validated with TypeBox on load and before every save.

### 2. Breadboard model

`packages/shared/src/breadboard.ts`. A half-size board: 30 columns, rows a–e and
f–j joined per column, four power rails of 25 holes each. `stripOf(hole)` names
the metal strip a hole belongs to; two holes are connected by the board exactly
when their strip names match.

### 3. Netlist

`packages/simulation/src/netlist.ts`. Strips, battery terminals and board
sockets become nodes.

| Part                                | Becomes                                                              |
| ----------------------------------- | -------------------------------------------------------------------- |
| Battery                             | source with 0.5 Ω in series                                          |
| Resistor                            | resistor                                                             |
| LED                                 | Shockley diode fitted to the colour's forward voltage at 20 mA       |
| Push button                         | 50 mΩ resistor while held, nothing otherwise                         |
| Potentiometer                       | two resistors that add up to its value, split at the knob position   |
| Capacitor                           | capacitor (open circuit in a settled solve)                          |
| UNO 5V socket                       | 5 V source with 0.2 Ω in series                                      |
| UNO pin, output HIGH / LOW          | 5 V source with 25 Ω in series / 25 Ω to ground                      |
| UNO pin, input / input with pull-up | 100 MΩ to ground / 5 V source with 35 kΩ in series                   |
| Wire                                | 10 mΩ resistor (so each wire's current is known and can be animated) |

Ground is the UNO's GND if there is a board, otherwise the negative terminal of
the first battery. Only sockets with a wire in them get a device.

### 4. Solver

`packages/circuit-engine`. Modified Nodal Analysis: unknowns are node voltages
plus one current per voltage source, held in `Float64Array`s. Nonlinear devices
are linearised each Newton-Raphson iteration; junction voltages are limited with
SPICE's `pnjlim` rule so the exponential cannot overflow. The linear system is
solved by dense Gaussian elimination with partial pivoting — at school-circuit
sizes (tens of unknowns) this is faster than a sparse solver.

Two things keep beginner circuits solvable:

- Each junction has GMIN (1 pS) in parallel, as in SPICE.
- Any group of nodes with no path to ground is tied to ground at one node. No
  current can flow between unconnected groups, so this changes no current. An
  unconnected LED therefore reads 0 V and 0 A rather than failing or inventing a voltage.

Convergence: relative 1e-9, 1 nV, 1 pA; at most 200 iterations. The LED example
converges in 5 iterations and about 19 µs on a laptop.

### 5. Readings and diagnostics

`packages/simulation/src/simulate.ts` turns the solution into per-part voltage,
current and power, per-wire current, and diagnostics:

| Code                 | Raised when                                              |
| -------------------- | -------------------------------------------------------- |
| `no-battery`         | there are parts but no battery                           |
| `open-circuit`       | no battery delivers more than 1 µA                       |
| `short-circuit`      | a battery's terminal voltage falls below half its rating |
| `led-reversed`       | LED voltage below −0.5 V                                 |
| `led-overcurrent`    | LED current above 30 mA                                  |
| `led-burned`         | LED current above 100 mA                                 |
| `led-bypassed`       | current flows in the circuit but not through this LED    |
| `led-low-voltage`    | LED is forward-biased but below its turn-on voltage      |
| `legs-in-same-strip` | both leads of a part are in one strip                    |
| `solver-failed`      | no solution found                                        |

Diagnostics are codes; the wording lives in `packages/i18n`. These rules are the
starting point for the Phase 2 rule-based tutor.

## Accuracy: what has been verified

`pnpm golden:regen` solves ten reference circuits with **ngspice 45.2** (the
WebAssembly build in `eecircuit-engine`, so no system install) and writes
`packages/circuit-engine/golden/*.json`. The unit tests require agreement within
1 µV / 1 nA plus 10 ppm on every node voltage and source current, and fail if a
golden file no longer matches its circuit.

Covered: resistor networks, single and multiple LEDs in series and parallel,
reversed LED, LED with no resistor, batteries in series, a silicon diode clamp.

## Running through time

`packages/simulation/src/session.ts`. A `SimulationSession` owns the circuit,
the emulated boards and the clock; time moves only when `advance(ms)` is
called, so it is deterministic and tested without a real clock. The web app
drives it from a Web Worker in real time and receives a frame about thirty
times a second. See decisions D-016 to D-018 for the scheduling, caching and
averaging rules.

Time steps use backward Euler in `solveTimeStep`. Three time-dependent circuits
(RC charge, a capacitor discharging through an LED, two capacitors in series)
are compared with ngspice transient analysis; agreement is within 12 mV.

Signals for the oscilloscope and logic analyser are recorded by the session as
(time, value) pairs, one per change, so pin edges are exact.

## Known limitations (do not overstate)

- **Time steps are fixed and first-order.** 0.1 ms with backward Euler. Fast
  time constants (below about 1 ms) are followed only roughly.
- **Only the capacitor has memory.** No inductors; no transistor or other
  three-terminal semiconductor yet.
- **LED model is an ideal Shockley diode.** It matches the nominal forward
  voltage at 20 mA exactly but real LEDs have series resistance, so current at
  high drive is overestimated. Reverse breakdown is not modelled.
- **Part and pin values are typical, not measured.** Battery internal
  resistance is a fixed 0.5 Ω; pin output resistance a fixed 25 Ω.
- **Burn-out is reported, not remembered.** A "burned" LED recovers when the
  circuit is fixed. Capacitor polarity is not modelled.
- **No tolerance or temperature effects.** Temperature is fixed at 27 °C.
- **Coupling delay.** A program reading a pin it also drives sees the result up
  to 1 ms late.
- ngspice agreement shows the _solver_ is right for these device equations; it
  says nothing about how closely the equations match a physical part.

## Adding a component (checklist)

1. Schema and type in `shared/src/circuit.ts`; bump `schemaVersion` if existing documents change meaning.
2. Placement and connection rules in `shared/src/editing.ts`, with tests.
3. Device model in `circuit-engine/src/devices.ts` if a new primitive is needed, with a golden case.
4. Netlist expansion in `simulation/src/netlist.ts`; readings and diagnostics in `simulate.ts`, with tests.
5. Drawing in `apps/web/src/lab/parts.tsx`; palette entry; inspector settings.
6. Bangla and English label and explanation in `i18n/src/messages.ts`.

## UNO emulation

`packages/board-emulators` wraps avr8js: an ATmega328P at 16 MHz with ports B, C
and D, timers 0–2, the ADC and USART0. Verified by test with real compiled
sketches: `delay` timing, `INPUT_PULLUP` and `digitalRead`, `analogWrite` duty
on all three timers, `analogRead` with `Serial.println`. Not emulated: SPI, I²C,
EEPROM, and interrupts triggered by the circuit.
