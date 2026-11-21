// The world a sketch module runs in, in JavaScript: the same world as
// harness/world.cpp (a virtual clock, pins that remember, inputs from a script),
// reached through the module's imports. It must produce the same trace as the
// native world for the same sketch.
//
// Nothing here needs Node: the same file runs in a browser or a web worker.

// Pin modes and interrupt edges, as Arduino.h defines them.
const OUTPUT = 0x03;
const INPUT_PULLUP = 0x05;
const OUTPUT_OPEN_DRAIN = 0x13;
const RISING = 1;
const FALLING = 2;
const CHANGE = 3;
const PINS = 40;
const CALL_COST_US = 2;
const END = Symbol('end of run');

/** Reads script lines the way harness/world.cpp does. */
function readScript(lines) {
  const events = [];
  for (const line of lines) {
    const match = /^\s*([0-9.]+)\s+(\S+)\s*(.*)$/.exec(line);
    if (!match) continue;
    const event = { at: Math.trunc(Number(match[1]) * 1000), kind: match[2][0] };
    if (event.kind === 's') {
      event.text = match[3];
    } else {
      const numbers = /^(-?\d+)\s+(-?\d+)/.exec(match[3]);
      if (!numbers) continue;
      event.pin = Number(numbers[1]);
      event.value = Number(numbers[2]);
    }
    events.push(event);
  }
  return events;
}

function decode(chunks) {
  const all = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.length;
  }
  return new TextDecoder().decode(all);
}

/**
 * Runs a sketch module (its bytes) for `runMs` of virtual time with the given
 * script lines. Returns the serial text, the trace of pin events, and what the
 * run cost.
 */
export function runModule(bytes, { runMs = 5000, script = [] } = {}) {
  const compileStarted = performance.now();
  const module = new WebAssembly.Module(bytes);
  const compileMs = performance.now() - compileStarted;

  const limit = runMs * 1000;
  let now = 0;
  const modeOf = new Int32Array(PINS);
  const outputLevel = new Int32Array(PINS);
  const inputLevel = new Int32Array(PINS).fill(-1);
  const millivolts = new Int32Array(PINS).fill(1650);
  const pulse = new Uint32Array(PINS);
  const touch = new Int32Array(PINS).fill(60);
  const handler = new Int32Array(PINS);
  const handlerMode = new Int32Array(PINS);
  const typed = [];
  const events = readScript(script);
  let next = 0;
  const trace = [];
  const serial = [];
  let hostCalls = 0;
  let instance;
  const valid = (pin) => pin >= 0 && pin < PINS;

  const levelSeen = (pin) => {
    if (!valid(pin)) return 0;
    if (modeOf[pin] === OUTPUT || modeOf[pin] === OUTPUT_OPEN_DRAIN) return outputLevel[pin];
    if (inputLevel[pin] >= 0) return inputLevel[pin];
    return modeOf[pin] === INPUT_PULLUP ? 1 : 0;
  };
  const apply = (event) => {
    if (event.kind === 's') {
      for (const byte of new TextEncoder().encode(event.text)) typed.push(byte);
      typed.push(10);
      return;
    }
    if (!valid(event.pin)) return;
    if (event.kind === 'a') millivolts[event.pin] = event.value;
    if (event.kind === 'p') pulse[event.pin] = event.value;
    if (event.kind === 't') touch[event.pin] = event.value;
    if (event.kind === 'd') {
      const before = levelSeen(event.pin);
      inputLevel[event.pin] = event.value ? 1 : 0;
      const after = levelSeen(event.pin);
      if (handler[event.pin] && before !== after) {
        const edge = after ? RISING : FALLING;
        if (handlerMode[event.pin] === CHANGE || handlerMode[event.pin] === edge)
          instance.exports.__indirect_function_table.get(handler[event.pin])();
      }
    }
  };
  const advance = (microseconds) => {
    const target = Math.min(microseconds > limit ? limit : now + microseconds, limit);
    while (next < events.length && events[next].at <= target) {
      now = Math.max(events[next].at, now);
      apply(events[next++]);
    }
    now = target;
    if (now >= limit) throw END;
  };

  const host = {
    host_pin_mode(pin, mode) {
      if (!valid(pin)) return;
      modeOf[pin] = mode;
      trace.push(`M ${now} ${pin} ${mode}`);
    },
    host_digital_write(pin, level) {
      if (!valid(pin)) return;
      if (outputLevel[pin] !== level) trace.push(`D ${now} ${pin} ${level}`);
      outputLevel[pin] = level;
    },
    host_digital_read: (pin) => levelSeen(pin),
    host_analog_millivolts: (pin) => (valid(pin) ? millivolts[pin] : 0),
    host_pwm(pin, duty, maxDuty, frequency) {
      trace.push(`W ${now} ${pin} ${duty >>> 0} ${maxDuty >>> 0} ${frequency.toFixed(0)}`);
    },
    host_touch_read: (pin) => (valid(pin) ? touch[pin] : 0),
    host_pulse_in(pin, _level, timeout) {
      const wait = timeout >>> 0;
      const length = valid(pin) ? pulse[pin] : 0;
      if (length === 0 || length > wait) {
        advance(wait);
        return 0;
      }
      advance(length + 500);
      return length;
    },
    host_attach_interrupt(pin, fn, mode) {
      if (!valid(pin)) return;
      handler[pin] = fn;
      handlerMode[pin] = mode;
    },
    host_detach_interrupt(pin) {
      if (valid(pin)) handler[pin] = 0;
    },
    host_serial_write(pointer, length) {
      // A copy: the sketch reuses this memory as soon as the call returns.
      serial.push(new Uint8Array(instance.exports.memory.buffer, pointer, length >>> 0).slice());
    },
    host_serial_available: () => typed.length,
    host_serial_read: () => (typed.length ? typed.shift() : -1),
    host_serial_peek: () => (typed.length ? typed[0] : -1),
    host_micros: () => BigInt(now),
    host_delay_micros: (microseconds) => advance(Number(microseconds)),
    host_tick: () => advance(CALL_COST_US),
  };
  // Count every call across the boundary: it is the cost this design adds.
  const counted = Object.fromEntries(
    Object.entries(host).map(([name, fn]) => [
      name,
      (...args) => {
        hostCalls++;
        return fn(...args);
      },
    ]),
  );
  // The C library asks for a few system calls it never makes here (the sketch
  // has no files). Each answers "not supported", and exit ends the run.
  const system = {};
  const others = [];
  for (const wanted of WebAssembly.Module.imports(module)) {
    if (wanted.module === 'wasi_snapshot_preview1') {
      system[wanted.name] =
        wanted.name === 'proc_exit'
          ? () => {
              throw END;
            }
          : () => 52; // ENOSYS
    } else if (!(wanted.name in host)) {
      others.push(`${wanted.module}.${wanted.name}`);
    }
  }
  if (others.length)
    return { ok: false, how: `module needs ${others.join(', ')}`, missing: others };

  const started = performance.now();
  let how = 'ran to the end of the time';
  let ok = true;
  try {
    instance = new WebAssembly.Instance(module, { env: counted, wasi_snapshot_preview1: system });
    instance.exports._initialize?.();
    instance.exports.run();
  } catch (error) {
    if (error !== END) {
      ok = false;
      how = `stopped by ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  const realMs = performance.now() - started;
  const text = trace.length ? `${trace.join('\n')}\n` : '';
  return {
    ok,
    how,
    realMs,
    compileMs,
    bytes: bytes.byteLength,
    hostCalls,
    memoryBytes: instance?.exports.memory.buffer.byteLength ?? 0,
    serial: decode(serial),
    trace: text,
    systemCalls: Object.keys(system),
  };
}
