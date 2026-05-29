import React, { useState, useEffect } from "react";
import { usePawPause } from "pawpause/react";

/**
 * A Slack-style message composer guarded by Paw Pause.
 * Controlled input → rollback:false, apply safeValue ourselves, gate Send.
 */
export function GuardedComposer({ channel = "general", onSend = (m: string) => {} }) {
  const [value, setValue] = useState("");
  const [heldNotice, setHeldNotice] = useState<number | null>(null);

  const { ref, blocking, lastClamp, unlock } = usePawPause<HTMLTextAreaElement>({
    rollback: false,
    onClamp: () => {},
  });

  useEffect(() => {
    if (lastClamp) {
      const held = value.length - lastClamp.safeValue.length;
      setValue(lastClamp.safeValue);
      setHeldNotice(held > 0 ? held : 0);
    }
  }, [lastClamp]); // eslint-disable-line

  useEffect(() => {
    if (!blocking) setHeldNotice(null);
  }, [blocking]);

  const send = () => {
    if (blocking || !value.trim()) return;
    onSend(value);
    setValue("");
  };

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, maxWidth: 520 }}>
      <div style={{ fontSize: 13, color: "#616061", marginBottom: 6 }}>Message #{channel}</div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder={`Message #${channel}`}
        aria-describedby="pp-status"
        style={{ width: "100%", minHeight: 64, border: "none", outline: "none", resize: "none", font: "15px system-ui" }}
      />
      <div id="pp-status" role="status" aria-live="polite" style={{ minHeight: 20, fontSize: 13, color: "#b4480f" }}>
        {blocking && `🐾 Paw Pause held ${heldNotice ?? 0} characters from your cat. Press Esc to override.`}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {blocking && <button onClick={unlock}>I'm human</button>}
        <button onClick={send} disabled={blocking}>Send</button>
      </div>
    </div>
  );
}
