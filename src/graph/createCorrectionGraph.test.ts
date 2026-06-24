import { describe, expect, it } from "vitest";
import { createCorrectionGraph } from "./createCorrectionGraph.js";

describe("createCorrectionGraph", () => {
  it("invokes a minimal LangGraph workflow around the correction runtime", async () => {
    const graph = createCorrectionGraph();

    const state = await graph.invoke({
      draft: "Signal-kernel can maybe coordinate async correction branches.",
      userIntent: "Keep the claim cautious.",
      styleGuide: "Use concise tone.",
    });
    const roundTripped = JSON.parse(JSON.stringify(state)) as typeof state;

    expect(state.prepared).toBe(true);
    expect(state.finalized).toBe(true);
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
    expect(state.snapshot?.statuses.rewriteDraft).toBe("success");
    expect(roundTripped.finalized).toBe(true);
    expect(roundTripped.finalResult?.revisedDraft).toBe(
      state.finalResult?.revisedDraft,
    );
  });
});
