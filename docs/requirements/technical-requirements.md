# Technical requirements

Source: the owner's master build brief (November 2026). This document restates
it as testable requirements and records which phase delivers each one.
Status values: **Done** (implemented and tested), **Partial**, **Planned**.

## 1. Product goals

| ID  | Requirement                                                              | Phase | Status                                                                                                                           |
| --- | ------------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| G-1 | Bangla-first interface; English available; technical terms shown in both | 0+    | Partial — all Phase 0 screens are bilingual; side-by-side term glossary is Planned                                               |
| G-2 | Works on Android phones and Windows laptops                              | 0–3   | Partial — responsive and tested in an emulated phone profile; real-device testing is Phase 3                                     |
| G-3 | Offline lessons and local project storage after first load               | 0–2   | Partial — app shell, projects and the 33 lessons work offline; class content later                                               |
| G-4 | Students learn Class 6–12 electronics through guided lessons             | 2     | Partial — 18 kit lessons, 6 lessons on parts beyond the kit and 9 projects, all with automatic checks; no curriculum mapping yet |
| G-5 | Teachers manage classes and see aggregate progress                       | 2     | Planned                                                                                                                          |
| G-6 | Schools manage teachers, licences and subscriptions                      | 4–5   | Planned                                                                                                                          |

## 2. Functional requirements by module

| Module                  | Requirement                                                                                                                                  | Phase | Status                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------- |
| Virtual lab             | Breadboard canvas, palette, wire drawing with snapping                                                                                       | 0     | Done                                                                          |
|                         | Component properties (voltage, resistance, colour)                                                                                           | 0     | Done                                                                          |
|                         | Run / stop with live re-solve; voltage and current display                                                                                   | 0     | Done                                                                          |
|                         | Circuit validation and error explanations                                                                                                    | 0     | Done for the 10 diagnostics listed in simulation.md                           |
|                         | Pause, reset, step                                                                                                                           | 1     | Planned — meaningless for DC; arrive with transient analysis                  |
|                         | Project save / load                                                                                                                          | 0     | Done (local)                                                                  |
|                         | Undo / redo                                                                                                                                  | 1     | Planned                                                                       |
| Components              | Battery, resistor, LED                                                                                                                       | 0     | Done                                                                          |
|                         | Push button, switch, potentiometer, capacitor, diode, NPN, buzzer, motor, servo, LDR, ultrasonic, temperature, LCD, relay, soil moisture, IR | 1     | Planned                                                                       |
| MCU lab                 | UNO emulation: digital output, serial output                                                                                                 | 0     | Done (stand-alone test page)                                                  |
|                         | UNO pins connected to the breadboard circuit; inputs, ADC, PWM, timers                                                                       | 1     | Planned                                                                       |
|                         | Pico emulation (rp2040js + MicroPython)                                                                                                      | 1     | Planned, subject to firmware validation                                       |
| Programming             | Compile C for the UNO on the server, run in the emulator                                                                                     | 0     | Done (plain avr-libc C)                                                       |
|                         | Arduino core (`setup`/`loop`, `digitalWrite`…), Blockly, CodeMirror, MicroPython                                                             | 1     | Planned                                                                       |
|                         | Real-board upload (STK500v1, UF2)                                                                                                            | 1–3   | Planned                                                                       |
| Instruments             | Per-part voltage/current/power meter                                                                                                         | 0     | Done                                                                          |
|                         | Probe multimeter, oscilloscope, logic analyser, plotting                                                                                     | 1     | Planned                                                                       |
| IoT lab                 | Behavioural Wi-Fi, MQTT, dashboards                                                                                                          | 2+    | Planned                                                                       |
| Learning                | Lesson engine, catalogue, NCTB mapping, auto-checks                                                                                          | 2     | Partial — lesson engine, catalogue and auto-checks done; NCTB mapping planned |
| Classroom               | Classes, access codes, assignment, progress                                                                                                  | 2     | Planned (schema foundation Done)                                              |
| AI tutor                | Rule-based hints, then gated LLM                                                                                                             | 2     | Planned — Phase 0 diagnostics are the seed of the rule engine                 |
| Gallery                 | Submission, teacher review, moderation                                                                                                       | 2     | Planned                                                                       |
| School / platform admin | Licences, payments, audit, moderation                                                                                                        | 4–5   | Planned (audit table Done)                                                    |
| Public website          | Marketing pages, plans, registration                                                                                                         | 5     | Planned                                                                       |

## 3. Non-functional requirements

| ID  | Requirement                                            | How it is met or will be verified                                                                                                                          |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N-1 | Simulation logic is separate from UI                   | `packages/*` may not import React, Fastify, Drizzle or Dexie (ESLint rule); simulation runs in a Web Worker                                                |
| N-2 | Simulation accuracy is never asserted without evidence | Golden tests against ngspice 45.2; limits documented in simulation.md                                                                                      |
| N-3 | Untrusted code never runs in the API process           | Separate compile worker; per-job bubblewrap sandbox; escape tests                                                                                          |
| N-4 | Minimal personal data about children                   | Learner rows cannot hold email or roles (database CHECK constraints, tested)                                                                               |
| N-5 | Server-side authorisation for every role               | Phase 2, with accounts. Until then the API binds to localhost only                                                                                         |
| N-6 | Offline first                                          | PWA precache; IndexedDB; e2e test reloads with the network disabled                                                                                        |
| N-7 | Low-end Android performance                            | Phase 4 target: usable on a 2 GB RAM phone. Phase 0 measurements in the report                                                                             |
| N-8 | Accessibility                                          | Visible focus, 44 px touch targets, reduced-motion support, status messages announced. Keyboard operation of the canvas and an automated audit are Planned |
| N-9 | No fake functionality                                  | No control is rendered unless it works; unavailable actions are disabled with a reason                                                                     |

## 4. Out of scope for the initial release

Kubernetes, microservices, native Android, ESP32 emulation, AR/VR, public chat,
direct messages, comments, followers, unrestricted student image upload.

## 5. Constraints and assumptions

- Node.js 22 LTS is used for now; the brief names Node 26 (see decision D-001).
- Fully offline C++ compilation is not promised; compiling needs the server.
- Real pilot-school work (Phase 3), legal review and payment registration are
  human activities this repository can only prepare for.
