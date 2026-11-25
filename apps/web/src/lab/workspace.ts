import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react';
import { create } from 'zustand';

/**
 * How the lab's screen is shared out (D-106). The parts list and the work
 * panel are narrow rails beside the board, so the circuit has the room; each
 * opens over the board while the pointer is on it, and can be kept open, which
 * puts it back beside the board. "Canvas only" puts both away.
 */
const KEY = 'banglalab.panels';

interface Kept {
  parts: boolean;
  panel: boolean;
}

function readKept(): Kept {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Kept>;
    return { parts: saved.parts === true, panel: saved.panel === true };
  } catch {
    // Private mode or a damaged value: start folded.
    return { parts: false, panel: false };
  }
}

interface Workspace extends Kept {
  /** Both rails put away, for the board alone. Not remembered between visits. */
  canvasOnly: boolean;
  keep(side: keyof Kept, open: boolean): void;
  setCanvasOnly(on: boolean): void;
}

export const useWorkspace = create<Workspace>((set, get) => ({
  ...readKept(),
  canvasOnly: false,
  keep: (side, open) => {
    set({ [side]: open } as Pick<Kept, typeof side>);
    try {
      localStorage.setItem(KEY, JSON.stringify({ parts: get().parts, panel: get().panel }));
    } catch {
      // Private mode: the choice lasts for this visit.
    }
  },
  setCanvasOnly: (canvasOnly) => set({ canvasOnly }),
}));

/** How long a rail stays open after the pointer leaves, so a slip off its edge does not close it. */
const CLOSE_DELAY = 180;

/**
 * A rail that opens while it is in use. It is open when kept open, while a
 * mouse is over it, while the keyboard's focus is in it, and after a tap on a
 * touch screen until a tap elsewhere.
 *
 * `focus` says which focus counts: 'keyboard' for the parts list, which must
 * get out of the way once a part is picked with the mouse; 'any' for the work
 * panel, which must not close on someone typing in it.
 */
export function useRail(kept: boolean, focus: 'keyboard' | 'any') {
  const ref = useRef<HTMLElement>(null);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tapped, setTapped] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  // A rail opened by a tap closes on a tap anywhere else.
  useEffect(() => {
    if (!tapped) return;
    const close = (event: globalThis.PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setTapped(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [tapped]);

  return {
    ref,
    open: kept || hover || focused || tapped,
    tapped,
    setTapped,
    /** Folds the rail at once, as after a part is picked: the board must be clear to place it. */
    dismiss: () => {
      window.clearTimeout(timer.current);
      setHover(false);
      setFocused(false);
      setTapped(false);
    },
    handlers: {
      onPointerEnter: (event: PointerEvent) => {
        if (event.pointerType !== 'mouse') return;
        window.clearTimeout(timer.current);
        setHover(true);
      },
      onPointerLeave: (event: PointerEvent) => {
        if (event.pointerType !== 'mouse') return;
        timer.current = window.setTimeout(() => setHover(false), CLOSE_DELAY);
      },
      onFocus: (event: FocusEvent) => {
        if (focus === 'any' || event.target.matches(':focus-visible')) setFocused(true);
      },
      onBlur: (event: FocusEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      },
    },
  };
}
