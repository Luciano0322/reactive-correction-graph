import { describe, expect, it } from "vitest";
import { invokeCorrectionRuntime } from "./correctionRuntimeAdapter.js";

describe("invokeCorrectionRuntime", () => {
  it("returns plain correction state that a future graph node can consume", async () => {
    const state = await invokeCorrectionRuntime({
      draft: "Signal-kernel can maybe coordinate async correction branches.",
      userIntent: "Keep the claim cautious.",
      styleGuide: "Use concise tone.",
    });
    const roundTripped = JSON.parse(JSON.stringify(state)) as typeof state;

    expect(state.draft).toContain("Signal-kernel");
    expect(state.finalResult?.revisedDraft).toContain("Mock correction notes");
    expect(state.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "effect",
          type: "emitted",
          label: "finalResult",
        }),
      ]),
    );
    expect(state.snapshot.statuses.rewriteDraft).toBe("success");
    expect(roundTripped.finalResult?.revisedDraft).toBe(
      state.finalResult?.revisedDraft,
    );
    expect(Array.isArray(roundTripped.trace)).toBe(true);
    expect(roundTripped.snapshot.statuses).toEqual(state.snapshot.statuses);
  });
});
