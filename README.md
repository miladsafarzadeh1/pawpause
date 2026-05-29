# 🐾 Paw Pause

Detect when a cat is walking on the keyboard and suppress the input — before it
posts gibberish to your Slack channel, fires a destructive shortcut, or mangles
a draft. Smart by design: humans keep typing normally; cats get clamped.


- **Framework-agnostic core** — pure scoring engine, no DOM, fully testable.
- **DOM guard** — attach to any `<input>`, `<textarea>`, or `contenteditable`.
- **React hook** — `usePawPause()` with live state for instrument UIs.
- **Zero network, zero storage** — keystrokes are scored in memory and discarded. Only physical key *codes* are inspected, never the characters typed.
- **~3 kB**, no runtime dependencies.

## Quick start (vanilla)

```js
import { attachGuard } from "pawpause";

const input = document.querySelector("#composer");
const guard = attachGuard(input, {
  onClamp: (info) => console.log("Cat held", info),
  onRelease: () => console.log("All clear"),
});

// later: guard.disarm(); guard.destroy();
```

## Quick start (React, controlled input)

```tsx
import { usePawPause } from "pawpause/react";

function Composer() {
  const [value, setValue] = useState("");
  const { ref, blocking, lastClamp } = usePawPause<HTMLTextAreaElement>({
    rollback: false, // controlled input: we apply safeValue ourselves
  });

  useEffect(() => {
    if (lastClamp) setValue(lastClamp.safeValue); // roll back the cat's garbage
  }, [lastClamp]);

  return (
    <>
      <textarea ref={ref} value={value} onChange={(e) => setValue(e.target.value)} />
      {blocking && <span role="status">🐾 Paw Pause is holding cat input. Press Esc to override.</span>}
    </>
  );
}
```

## How detection works

Every keystroke updates a rolling ~1.5s window. Six weighted signals sum into a
score; cross the threshold and input is suppressed:

| Signal        | Fires when                              | Weight |
|---------------|-----------------------------------------|--------|
| Concurrent    | 3+ keys physically held at once         | 0.7    |
| Heavy press   | 5+ keys held (sitting on it)            | 0.7    |
| Burst rate    | 8+ keys/sec                             | 0.4    |
| Adjacency roll| 3+ consecutive neighboring keys         | 0.4    |
| Repetition    | same key 6+ times                       | 0.3    |
| No structure  | 6+ keys, no space/return/delete         | 0.2    |

A human trips maybe one; a paw-flop trips several at once. All weights and the
`threshold` (default `1.0`) are configurable. See `ARCHITECTURE.md` for why this
model, and `INTEGRATION.md` for Slack-style and other host patterns.

## Safety & accessibility

A false positive must never trap a real person. Therefore:

- **Auto-release is the default** — the clamp lifts after ~1s of calm typing.
- **Escape always unlocks** (`escapeToUnlock`, on by default).
- The guard sets `aria-invalid` during a clamp so you can announce it via a live region; the library never steals focus.

## API surface

- `attachGuard(el, options) → GuardHandle` — `arm`, `disarm`, `unlock`, `setThreshold`, `setStayLocked`, `destroy`.
- `new Detector(options)` — `feedDown`, `feedUp`, `tick`, `unlock`, `reset` (use directly on React Native or in tests).
- `scoreWindow(buffer, keysDown, cfg)` — the pure function, for unit tests.
- `usePawPause(options)` (from `pawpause/react`).

## License

MIT.

## Live:

