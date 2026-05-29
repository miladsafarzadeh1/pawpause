/**
 * Public types for Paw Pause.
 */

/** A keyboard layout, used to detect physically-adjacent "paw roll" keypresses. */
export type KeyboardLayout = "qwerty" | { adjacency: Record<string, string[]> };

/** Weight contributed by each detection signal toward the total score. */
export interface Weights {
  /** 3+ keys physically held at once. */
  concurrent: number;
  /** 5+ keys held — a cat sitting on the keyboard. */
  concurrentHi: number;
  /** Sustained high keypress rate (keys/sec). */
  burst: number;
  /** Consecutive keys that are physically adjacent (a paw roll). */
  cluster: number;
  /** The same key hammered many times. */
  repeat: number;
  /** A wall of keys with no human structure (no space/return/delete). */
  nostruct: number;
}

export type SignalId = keyof Weights;

/** The result of feeding a key event through the detector. */
export interface Verdict {
  /** Summed weight of all currently-firing signals. */
  score: number;
  /** Which signals are firing right now. */
  fired: Partial<Record<SignalId, boolean>>;
  /** Current keypress rate over the window (keys/sec). */
  rate: number;
  /** True if score has crossed the threshold and input should be suppressed. */
  blocking: boolean;
}

export interface PawPauseOptions {
  /** Score needed to start blocking. Default 1.0. */
  threshold?: number;
  /** Rolling analysis window in ms. Default 1500. */
  windowMs?: number;
  /** Quiet period before auto-release. Default 1000. */
  releaseSilenceMs?: number;
  /** If true, block stays until unlock() is called. Default false (auto-release). */
  stayLocked?: boolean;
  /** Override individual signal weights. */
  weights?: Partial<Weights>;
  /** Keyboard layout for adjacency detection. Default "qwerty". */
  layout?: KeyboardLayout;
}

/** Info handed to the host when a clamp begins. */
export interface ClampInfo {
  score: number;
  fired: Partial<Record<SignalId, boolean>>;
  /**
   * The field value captured just before the cat burst began. Controlled-input
   * hosts (React, Slack, etc.) should set their state to this to roll back the
   * garbage; uncontrolled elements have it applied automatically when
   * `rollback` is enabled.
   */
  safeValue: string;
}
