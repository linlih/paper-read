import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSelectionTarget, type SelectionTarget } from "./selection.ts";

function target(overrides: Partial<SelectionTarget> = {}): SelectionTarget {
  return {
    block_id: "block_1",
    start_offset: 4,
    end_offset: 13,
    quote_exact: "Attention",
    quote_prefix: "The ",
    quote_suffix: " layer",
    selector: { source: "html-block-text" },
    ...overrides,
  };
}

test("resolveSelectionTarget keeps the captured target after native selection is gone", () => {
  const captured = target();

  const resolved = resolveSelectionTarget(captured, () => {
    throw new Error("native selection should not be read when a captured target exists");
  });

  assert.deepEqual(resolved, captured);
});

test("resolveSelectionTarget falls back to the current native selection target", () => {
  const current = target({ block_id: "block_2" });

  const resolved = resolveSelectionTarget(null, () => current);

  assert.deepEqual(resolved, current);
});
