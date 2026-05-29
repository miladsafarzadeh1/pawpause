# Architecture

Paw Pause is three layers, each usable on its own.

```
┌─────────────────────────────────────────────┐
│  pawpause/react   usePawPause() hook          │  ← React state + lifecycle
├─────────────────────────────────────────────┤
│  attachGuard()    DOM binding                 │  ← listeners, suppress, rollback, a11y
├─────────────────────────────────────────────┤
│  Detector + scoreWindow()   pure model        │  ← no DOM, fully testable
└─────────────────────────────────────────────┘
```

Each layer depends only on the one below it. You can take just the `Detector`
into React Native, a CLI, or a test harness; the DOM and React layers are
conveniences over the same core.

## Why a weighted-signal model (not ML)

A small set of interpretable signals beats a black-box classifier here:

- **Explainable.** Every clamp can say *which* signals fired. That matters when
  a user asks "why did you eat my message?" and for tuning per product.
- **Zero training data / zero privacy cost.** No keystroke logging, no model to
  ship or update. Only physical key *codes* (`KeyA`, not `"a"`) touch the model,
  so the actual text is never inspected.
- **Cheap.** Runs synchronously on each keydown with no measurable latency.

The signals were chosen to capture how a cat differs from a human physically:
cats press multiple keys at once with a paw or body (concurrency), roll across
neighbors (adjacency), and produce structureless bursts with no spaces, returns,
or corrections. Humans trip at most one of these incidentally.

## The controlled-input problem (the important one)

Naively, "suppress the cat" means revert the field's value. But most real apps —
Slack, Linear, Notion, anything React — use **controlled inputs**: the value is
owned by application state, and writing `el.value = ...` is overwritten on the
next render. So the guard separates two concerns:

- **`suppress`** (default on): `preventDefault()` on keydown while clamped. This
  stops *new* keystrokes from ever producing input and works on controlled and
  uncontrolled fields alike.
- **`rollback`** (default on, but turn OFF for controlled inputs): revert the
  field to the value captured just before the burst. Safe to auto-apply only on
  uncontrolled DOM. For controlled hosts, the guard instead hands you
  `clampInfo.safeValue` so *you* set state — which is what the React example does.

The "safe value" is snapshotted continuously while typing is calm (score below a
low watermark) and frozen once a burst starts building, so reverting to it
cleanly drops the cat's contribution without losing the human's prior text.

## Auto-release & the "parked cat" case

A cat that sits *on* the keys never sends a `keyup`, so silence-based release
alone would hang. The detector tracks the set of physically-held keys; release
only happens when nothing is held *and* the window has been quiet. A polling
`tick()` (200ms) drives this so release works even with no further events. While
the cat is parked, keys stay held → still detected → still suppressed. Correct by
construction.

## Tuning

`threshold`, `windowMs`, `releaseSilenceMs`, and every signal `weight` are
options. Raise the threshold for fewer false positives, lower it for a twitchier
guard. `scoreWindow()` is exported pure so you can replay recorded sessions in
tests and tune against real data.

## Build

`tsup` emits ESM + CJS + `.d.ts` for two entry points (`.` and `./react`).
`react` is an optional peer dependency, so non-React consumers pull in nothing.
