# Integration guide

How real apps wire Paw Pause into a message composer or editor.

## Pattern A — uncontrolled field (simplest)

Plain DOM, the guard owns suppression and rollback end to end:

```js
import { attachGuard } from "pawpause";
attachGuard(document.querySelector("#note")); // done
```

## Pattern B — controlled input (React / Slack / Linear / Notion)

The host owns the value, so disable rollback and apply `safeValue` yourself.
Also gate your **send** action on `blocking` so a half-detected burst can't be
fired off:

```tsx
import { usePawPause } from "pawpause/react";

function MessageComposer({ onSend }) {
  const [value, setValue] = useState("");
  const { ref, blocking, lastClamp, unlock } = usePawPause<HTMLTextAreaElement>({
    rollback: false,
    threshold: 1.0,
  });

  useEffect(() => {
    if (lastClamp) setValue(lastClamp.safeValue);
  }, [lastClamp]);

  const send = () => {
    if (blocking) return;        // never send while clamped
    onSend(value);
    setValue("");
  };

  return (
    <div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-describedby="pp-status"
      />
      {/* live region: announces the clamp without stealing focus */}
      <div id="pp-status" role="status" aria-live="polite">
        {blocking ? "Paw Pause is holding suspected cat input. Press Esc to override." : ""}
      </div>
      <button onClick={send} disabled={blocking}>Send</button>
      {blocking && <button onClick={unlock}>I'm human — unlock</button>}
    </div>
  );
}
```

### Slack-specific notes

- Slack's composer is a `contenteditable`, not a `<textarea>`. The guard reads
  `textContent` for those, so `attachGuard(composerEl, { rollback: false })`
  works; apply `safeValue` through whatever sets the composer's content.
- Wire `blocking` into the send keybinding (Enter) as well as the button.
- Show the clamp as a transient inline banner ("🐾 held 12 characters"), not a
  modal — keep it non-blocking and dismissible.

## Pattern C — observer only (analytics / soft warning)

Don't suppress at all; just measure and nudge:

```js
attachGuard(el, {
  suppress: false,
  rollback: false,
  onClamp: (i) => analytics.track("cat_typing_detected", { score: i.score }),
});
```

## Tuning per surface

- **High-stakes (send-to-channel, destructive shortcuts):** keep threshold at
  1.0 or lower; pair with send-gating.
- **Low-stakes (a personal notes field):** raise threshold to ~1.4 to avoid ever
  interrupting fast human typists.
- **Code editors:** developers type structureless adjacent characters more than
  prose writers; raise threshold and consider dropping the `nostruct` weight.

## Accessibility checklist

- Keep `escapeToUnlock` on. Never trap a user.
- Announce clamps via `role="status"` / `aria-live="polite"`; the guard sets
  `aria-invalid` on the field for you.
- Don't auto-focus or move focus on clamp.
- Prefer auto-release (default) over `stayLocked` on shared/public surfaces.

## Framework adapters

- **Vue / Svelte:** use `attachGuard` in `onMounted`/`onMount`, call
  `handle.destroy()` on unmount. The guard is framework-neutral.
- **React Native / non-DOM:** use the `Detector` class directly — feed it
  `feedDown`/`feedUp` from your own key events and read `.blocking`.
