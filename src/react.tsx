import { useRef, useEffect, useState, useCallback } from "react";
import { attachGuard } from "./guard";
import type { GuardOptions, GuardHandle } from "./guard";
import type { ClampInfo, Verdict } from "./types";

export interface UsePawPauseResult<T extends HTMLElement> {
  /** Attach to the text field you want to guard. */
  ref: React.RefObject<T>;
  /** Live verdict for building an instrument UI. */
  verdict: Verdict;
  /** True while input is being suppressed. */
  blocking: boolean;
  armed: boolean;
  setArmed: (v: boolean) => void;
  unlock: () => void;
  /** Last clamp info — useful for controlled inputs to apply safeValue. */
  lastClamp: ClampInfo | null;
}

const EMPTY: Verdict = { score: 0, fired: {}, rate: 0, blocking: false };

/**
 * React binding. For CONTROLLED inputs, pass `rollback: false` and apply
 * `lastClamp.safeValue` to your state inside an effect or onClamp.
 *
 *   const { ref, blocking, lastClamp } = usePawPause<HTMLTextAreaElement>({ rollback: false });
 *   useEffect(() => { if (lastClamp) setValue(lastClamp.safeValue); }, [lastClamp]);
 */
export function usePawPause<T extends HTMLElement>(
  options: Omit<GuardOptions, "onScore" | "onClamp" | "onRelease"> & {
    onClamp?: (i: ClampInfo) => void;
    onRelease?: () => void;
  } = {}
): UsePawPauseResult<T> {
  const ref = useRef<T>(null);
  const handleRef = useRef<GuardHandle | null>(null);
  const [verdict, setVerdict] = useState<Verdict>(EMPTY);
  const [blocking, setBlocking] = useState(false);
  const [armed, setArmedState] = useState(true);
  const [lastClamp, setLastClamp] = useState<ClampInfo | null>(null);

  // Keep latest callbacks without re-attaching the guard.
  const cb = useRef(options);
  cb.current = options;

  useEffect(() => {
    if (!ref.current) return;
    const handle = attachGuard(ref.current, {
      ...options,
      onScore: (v) => { setVerdict(v); setBlocking(v.blocking); },
      onClamp: (i) => { setBlocking(true); setLastClamp(i); cb.current.onClamp?.(i); },
      onRelease: () => { setBlocking(false); setVerdict(EMPTY); cb.current.onRelease?.(); },
    });
    handleRef.current = handle;
    return () => handle.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setArmed = useCallback((v: boolean) => {
    setArmedState(v);
    if (v) handleRef.current?.arm();
    else handleRef.current?.disarm();
  }, []);

  const unlock = useCallback(() => {
    handleRef.current?.unlock();
    setBlocking(false);
  }, []);

  return { ref, verdict, blocking, armed, setArmed, unlock, lastClamp };
}
