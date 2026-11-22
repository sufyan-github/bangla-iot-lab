import { PIR_BLOCK_MS } from './library';

/**
 * The timing of an HC-SR501 motion sensor, with its jumper in the "repeat"
 * position: the output goes HIGH on movement, stays HIGH for the hold time
 * after the last movement, and once it has fallen it ignores movement for a
 * short while.
 */
export interface PirState {
  high: boolean;
  /** While HIGH: when the output falls if nothing moves again, in milliseconds. */
  lowAt: number;
  /** While LOW: the sensor ignores movement until this time. */
  readyAt: number;
}

export const PIR_IDLE: PirState = { high: false, lowAt: 0, readyAt: 0 };

export interface PirInput {
  /** Something is moving in front of the sensor. */
  motion: boolean;
  powered: boolean;
  holdMs: number;
}

/** The sensor's state at `now`, given what it was and what is in front of it. */
export function stepPir(state: PirState, now: number, input: PirInput): PirState {
  // Without power it forgets everything. (A real one also needs about a minute after
  // power-up before its output can be trusted; that is not modelled.)
  if (!input.powered) return PIR_IDLE;
  if (state.high) {
    if (input.motion) return { ...state, lowAt: now + input.holdMs };
    if (now < state.lowAt) return state;
    return { high: false, lowAt: 0, readyAt: state.lowAt + PIR_BLOCK_MS };
  }
  if (input.motion && now >= state.readyAt) {
    return { high: true, lowAt: now + input.holdMs, readyAt: 0 };
  }
  return state;
}

/** When the state next changes with nothing else changing, or Infinity. */
export function pirDeadline(state: PirState, motion: boolean): number {
  if (state.high) return motion ? Infinity : state.lowAt;
  return motion ? state.readyAt : Infinity;
}
