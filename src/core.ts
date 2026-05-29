import type { PawPauseOptions, Verdict, Weights } from "./types";
import { STRUCTURAL, resolveAdjacency } from "./keyboard";

export const DEFAULT_WEIGHTS: Weights = {
  concurrent: 0.7,
  concurrentHi: 0.7,
  burst: 0.4,
  cluster: 0.4,
  repeat: 0.3,
  nostruct: 0.2,
};

const DEFAULTS = {
  threshold: 1.0,
  windowMs: 1500,
  releaseSilenceMs: 1000,
  stayLocked: false,
  safeWatermark: 0.3,
};

type Stroke = { code: string; time: number };

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/**
 * Pure scoring function. Given the current window of strokes and how many keys
 * are physically held, returns the score and which signals fired. No state, no
 * side effects — this is the testable heart of the model.
 */
export function scoreWindow(
  buffer: Stroke[],
  keysDownCount: number,
  opts: Required<Pick<PawPauseOptions, "windowMs" | "layout">> & { weights: Weights }
): Omit<Verdict, "blocking"> {
  const fired: Verdict["fired"] = {};
  const w = opts.weights;
  const adjacent = resolveAdjacency(opts.layout);
  let score = 0;

  if (keysDownCount >= 3) { fired.concurrent = true; score += w.concurrent; }
  if (keysDownCount >= 5) { fired.concurrentHi = true; score += w.concurrentHi; }

  const rate = buffer.length / (opts.windowMs / 1000);
  if (rate >= 8) { fired.burst = true; score += w.burst; }

  let run = 0;
  for (let i = 1; i < buffer.length; i++) {
    if (adjacent(buffer[i - 1].code, buffer[i].code)) run++;
  }
  if (run >= 3) { fired.cluster = true; score += w.cluster; }

  const counts: Record<string, number> = {};
  for (const s of buffer) counts[s.code] = (counts[s.code] || 0) + 1;
  if (Object.values(counts).some((v) => v >= 6)) { fired.repeat = true; score += w.repeat; }

  const usedStructure = buffer.some((s) => STRUCTURAL.has(s.code));
  if (buffer.length >= 6 && !usedStructure) { fired.nostruct = true; score += w.nostruct; }

  return { score, fired, rate };
}

/**
 * Stateful detector. Framework-agnostic: feed it key events from anywhere
 * (DOM, React Native, tests) and it tracks the rolling window, concurrency,
 * blocking state, and auto-release timing. Does not touch the DOM.
 */
export class Detector {
  private buffer: Stroke[] = [];
  private keysDown = new Set<string>();
  private lastEvent = 0;
  private _blocking = false;
  private cfg: Required<PawPauseOptions> & { weights: Weights; safeWatermark: number };

  constructor(options: PawPauseOptions = {}) {
    this.cfg = {
      threshold: options.threshold ?? DEFAULTS.threshold,
      windowMs: options.windowMs ?? DEFAULTS.windowMs,
      releaseSilenceMs: options.releaseSilenceMs ?? DEFAULTS.releaseSilenceMs,
      stayLocked: options.stayLocked ?? DEFAULTS.stayLocked,
      layout: options.layout ?? "qwerty",
      weights: { ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) },
      safeWatermark: DEFAULTS.safeWatermark,
    };
  }

  get blocking() { return this._blocking; }

  /** Feed a keyDown. Returns the verdict; blocking flips on if score crosses threshold. */
  feedDown(code: string, opts: { repeat?: boolean; time?: number } = {}): Verdict {
    const t = opts.time ?? now();
    this.lastEvent = t;
    if (!opts.repeat) this.keysDown.add(code);
    this.buffer.push({ code, time: t });
    this.prune(t);
    const v = scoreWindow(this.buffer, this.keysDown.size, this.cfg);
    if (v.score >= this.cfg.threshold) this._blocking = true;
    return { ...v, blocking: this._blocking };
  }

  /** Feed a keyUp so concurrency tracking stays accurate. */
  feedUp(code: string) {
    this.keysDown.delete(code);
  }

  /** True when the latest score is below the "this is calm" watermark. */
  isCalm(): boolean {
    const v = scoreWindow(this.buffer, this.keysDown.size, this.cfg);
    return v.score < this.cfg.safeWatermark;
  }

  /**
   * Call periodically (e.g. every 200ms) to handle auto-release. Returns true
   * on the tick where the block is released.
   */
  tick(time = now()): boolean {
    if (!this._blocking || this.cfg.stayLocked) return false;
    const quietFor = time - this.lastEvent;
    if (this.keysDown.size === 0 && quietFor >= this.cfg.releaseSilenceMs) {
      this.reset();
      return true;
    }
    return false;
  }

  /** Force-release the block (manual unlock / escape hatch). */
  unlock() { this.reset(); }

  reset() {
    this.buffer = [];
    this.keysDown.clear();
    this._blocking = false;
  }

  setStayLocked(v: boolean) { this.cfg.stayLocked = v; }
  setThreshold(v: number) { this.cfg.threshold = v; }
}
