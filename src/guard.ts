import { Detector } from "./core";
import type { ClampInfo, PawPauseOptions, Verdict } from "./types";

export interface GuardOptions extends PawPauseOptions {
  /**
   * Block the offending keystrokes via preventDefault while clamped.
   * Works on any element, controlled or not. Default true.
   */
  suppress?: boolean;
  /**
   * Auto-revert the field to its pre-cat value when a clamp fires. Safe for
   * UNCONTROLLED elements only. For controlled inputs (React/Slack), leave this
   * false and apply `clampInfo.safeValue` from onClamp yourself. Default true.
   */
  rollback?: boolean;
  /** Pressing Escape releases a clamp. A safety valve against false positives. Default true. */
  escapeToUnlock?: boolean;
  /** Poll interval for auto-release, ms. Default 200. */
  pollMs?: number;

  onClamp?: (info: ClampInfo) => void;
  onRelease?: () => void;
  onScore?: (verdict: Verdict) => void;
}

export interface GuardHandle {
  arm(): void;
  disarm(): void;
  unlock(): void;
  isArmed(): boolean;
  setStayLocked(v: boolean): void;
  setThreshold(v: number): void;
  destroy(): void;
}

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

function readValue(el: Field): string {
  if ("value" in el) return (el as HTMLInputElement).value;
  return el.textContent ?? "";
}
function writeValue(el: Field, v: string) {
  if ("value" in el) (el as HTMLInputElement).value = v;
  else el.textContent = v;
}

/**
 * Attach Paw Pause to a text field. Returns a handle to control it.
 *
 *   const guard = attachGuard(textarea, {
 *     onClamp: (i) => showToast(`Held ${i.fired ? "cat" : ""} input`),
 *   });
 */
export function attachGuard(el: Field, options: GuardOptions = {}): GuardHandle {
  const suppress = options.suppress ?? true;
  const rollback = options.rollback ?? true;
  const escapeToUnlock = options.escapeToUnlock ?? true;
  const pollMs = options.pollMs ?? 200;

  const detector = new Detector(options);
  let armed = true;
  let safeValue = readValue(el);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const emitScore = (v: Verdict) => options.onScore?.(v);

  const beginClamp = (v: Verdict) => {
    const info: ClampInfo = { score: v.score, fired: v.fired, safeValue };
    if (rollback) writeValue(el, safeValue);
    // Let assistive tech announce the clamp.
    el.setAttribute("aria-invalid", "true");
    options.onClamp?.(info);
  };

  const endClamp = () => {
    el.removeAttribute("aria-invalid");
    options.onRelease?.();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!armed) return;
    if (escapeToUnlock && e.key === "Escape" && detector.blocking) {
      detector.unlock();
      endClamp();
      return;
    }
    if (detector.blocking) {
      if (suppress) e.preventDefault();
      return;
    }
    const wasBlocking = detector.blocking;
    const v = detector.feedDown(e.code, { repeat: e.repeat });
    emitScore(v);
    if (v.blocking && !wasBlocking) {
      if (suppress) e.preventDefault();
      beginClamp(v);
    }
  };

  const onKeyUp = (e: KeyboardEvent) => detector.feedUp(e.code);

  const onInput = () => {
    if (detector.blocking) return;
    if (detector.isCalm()) safeValue = readValue(el);
  };

  el.addEventListener("keydown", onKeyDown);
  el.addEventListener("keyup", onKeyUp);
  el.addEventListener("input", onInput);

  const startPolling = () => {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (detector.tick()) endClamp();
    }, pollMs);
  };
  const stopPolling = () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  };
  startPolling();

  return {
    arm() { armed = true; },
    disarm() { armed = false; detector.unlock(); endClamp(); },
    unlock() { detector.unlock(); endClamp(); },
    isArmed() { return armed; },
    setStayLocked(v) { detector.setStayLocked(v); },
    setThreshold(v) { detector.setThreshold(v); },
    destroy() {
      stopPolling();
      el.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("keyup", onKeyUp);
      el.removeEventListener("input", onInput);
      el.removeAttribute("aria-invalid");
    },
  };
}
