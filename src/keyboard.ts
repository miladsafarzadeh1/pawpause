import type { KeyboardLayout } from "./types";

/** event.code values treated as "human structure". */
export const STRUCTURAL = new Set([
  "Space", "Enter", "NumpadEnter", "Backspace", "Tab",
]);

const QWERTY_ROWS: string[][] = [
  ["KeyQ","KeyW","KeyE","KeyR","KeyT","KeyY","KeyU","KeyI","KeyO","KeyP"],
  ["KeyA","KeyS","KeyD","KeyF","KeyG","KeyH","KeyJ","KeyK","KeyL"],
  ["KeyZ","KeyX","KeyC","KeyV","KeyB","KeyN","KeyM","Comma","Period"],
];

/** Build an adjacency map (each key -> set of physically neighboring keys). */
function buildAdjacency(rows: string[][]): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {};
  rows.forEach((row, r) => {
    row.forEach((key, c) => {
      const n = new Set<string>();
      if (c > 0) n.add(row[c - 1]);
      if (c < row.length - 1) n.add(row[c + 1]);
      for (const dr of [r - 1, r + 1]) {
        if (dr >= 0 && dr < rows.length) {
          for (const oc of [c - 1, c, c + 1]) {
            if (oc >= 0 && oc < rows[dr].length) n.add(rows[dr][oc]);
          }
        }
      }
      map[key] = n;
    });
  });
  return map;
}

const QWERTY = buildAdjacency(QWERTY_ROWS);

/** Resolve a KeyboardLayout option into a lookup function. */
export function resolveAdjacency(layout: KeyboardLayout = "qwerty") {
  if (layout === "qwerty") {
    return (a: string, b: string) => a !== b && (QWERTY[a]?.has(b) ?? false);
  }
  const custom: Record<string, Set<string>> = {};
  for (const [k, list] of Object.entries(layout.adjacency)) {
    custom[k] = new Set(list);
  }
  return (a: string, b: string) => a !== b && (custom[a]?.has(b) ?? false);
}
