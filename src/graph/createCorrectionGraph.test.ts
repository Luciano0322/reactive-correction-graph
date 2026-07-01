import { describe, expect, it } from "vitest";
import { createTraceCollector } from "../trace/createTraceCollector.js";
import {
  createCorrectionGraph,
  createCorrectionGraphSession,
} from "./createCorrectionGraph.js";

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

  it("keeps graph-level lifecycle trace separate from runtime trace", async () => {
    const graph = createCorrectionGraph();

    const state = await graph.invoke({
      draft: "Signal-kernel can maybe coordinate async correction branches.",
      userIntent: "Keep the claim cautious.",
      styleGuide: "Use concise tone.",
    });

    expect(state.graphTrace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "graph",
          type: "started",
          label: "prepareInput",
        }),
        expect.objectContaining({
          scope: "graph",
          type: "completed",
          label: "prepareInput",
        }),
        expect.objectContaining({
          scope: "graph",
          type: "started",
          label: "reactiveCorrection",
        }),
        expect.objectContaining({
          scope: "graph",
          type: "completed",
          label: "reactiveCorrection",
        }),
        expect.objectContaining({
          scope: "graph",
          type: "started",
          label: "finalize",
        }),
        expect.objectContaining({
          scope: "graph",
          type: "completed",
          label: "finalize",
        }),
      ]),
    );
    expect(state.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "effect",
          type: "emitted",
          label: "finalResult",
        }),
      ]),
    );
    expect(
      state.graphTrace?.some(
        (event) => event.scope === "effect" && event.label === "finalResult",
      ),
    ).toBe(false);
    expect(state.trace?.some((event) => event.scope === "graph")).toBe(false);
  });

  it("keeps one runtime alive across graph session invocations", async () => {
    const session = createCorrectionGraphSession();
    const draft = "Signal-kernel coordinates async correction branches.";

    const firstState = await session.invoke({ draft });
    const secondState = await session.invoke({
      draft,
      userIntent: "Explain the incremental update.",
    });
    const receiveStartedCount = secondState.trace.filter(
      (event) =>
        event.scope === "runtime" &&
        event.type === "started" &&
        event.label === "receive",
    ).length;

    expect({
      firstFinalResultExists: Boolean(firstState.finalResult),
      receiveStartedCount,
      secondSummary: secondState.finalResult?.summary,
    }).toEqual({
      firstFinalResultExists: true,
      receiveStartedCount: 2,
      secondSummary: expect.arrayContaining([
        "Respect user intent: Explain the incremental update.",
      ]),
    });
  });

  it("uses the correction model supplied by the graph caller", async () => {
    const graph = createCorrectionGraph({
      model: {
        rewriteDraft: async ({ draft }) =>
          `${draft}\n\nGraph provider rewrite marker.`,
      },
    });

    const state = await graph.invoke({
      draft: "Signal-kernel coordinates async correction branches.",
    });

    expect(state.finalResult?.revisedDraft).toContain(
      "Graph provider rewrite marker.",
    );
  });

  it("keeps provider failures visible through runtime trace", async () => {
    const traceCollector = createTraceCollector();
    const graph = createCorrectionGraph({
      traceCollector,
      model: {
        factCheckClaims: async () => {
          throw new Error("Local provider unavailable");
        },
      },
    });

    await expect(
      graph.invoke({
        draft: "Signal-kernel coordinates async correction branches.",
      }),
    ).rejects.toThrow(/factCheck failed: Local provider unavailable/);

    expect(traceCollector.events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "resource",
          type: "rejected",
          label: "factCheck",
        }),
      ]),
    );
  });
});
