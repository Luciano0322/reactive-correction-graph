import { describe, expect, it } from "vitest";
import { createTraceCollector } from "../trace/createTraceCollector.js";
import type { LiveTraceEvent } from "../trace/liveTraceEvents.js";
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

  it("streams ordered live runtime events from a graph session", async () => {
    const session = createCorrectionGraphSession();
    const liveEvents: LiveTraceEvent[] = [];

    const unsubscribe = session.subscribe((event) => {
      liveEvents.push(event);
    });
    const state = await session.invoke({
      draft: "Signal-kernel can maybe coordinate async correction branches.",
    });
    unsubscribe();

    expect(liveEvents.map(({ sequence }) => sequence)).toEqual(
      liveEvents.map((_, index) => index + 1),
    );
    expect(liveEvents.map(({ event }) => event)).toEqual(state.trace);
    expect(liveEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          schemaVersion: 1,
          event: expect.objectContaining({
            scope: "runtime",
            type: "started",
            label: "receive",
            metadata: expect.objectContaining({ receiveEpoch: 1 }),
          }),
        }),
        expect.objectContaining({
          schemaVersion: 1,
          event: expect.objectContaining({
            scope: "effect",
            type: "emitted",
            label: "finalResult",
          }),
        }),
      ]),
    );
    expect(JSON.parse(JSON.stringify(liveEvents))).toEqual(liveEvents);
  });

  it("stops streaming live runtime events after unsubscribe", async () => {
    const session = createCorrectionGraphSession();
    const liveEvents: LiveTraceEvent[] = [];
    const draft = "Signal-kernel coordinates async correction branches.";

    const unsubscribe = session.subscribe((event) => {
      liveEvents.push(event);
    });
    await session.invoke({ draft });
    const liveEventCountBeforeUnsubscribe = liveEvents.length;

    unsubscribe();
    const secondState = await session.invoke({
      draft,
      styleGuide: "Use concise technical language.",
    });

    expect(liveEvents).toHaveLength(liveEventCountBeforeUnsubscribe);
    expect(
      liveEvents.some(
        ({ event }) =>
          event.scope === "runtime" &&
          event.type === "started" &&
          event.label === "receive" &&
          event.metadata?.receiveEpoch === 2,
      ),
    ).toBe(false);
    expect(
      secondState.trace.some(
        (event) =>
          event.scope === "runtime" &&
          event.type === "started" &&
          event.label === "receive" &&
          event.metadata?.receiveEpoch === 2,
      ),
    ).toBe(true);
  });

  it("keeps live runtime event streams isolated between graph sessions", async () => {
    const sessionA = createCorrectionGraphSession();
    const sessionB = createCorrectionGraphSession();
    const liveEventsA: LiveTraceEvent[] = [];
    const liveEventsB: LiveTraceEvent[] = [];
    const draftA = "Session A coordinates async correction branches.";
    const draftB = "Session B owns an independent correction draft.";

    const unsubscribeA = sessionA.subscribe((event) => {
      liveEventsA.push(event);
    });
    const unsubscribeB = sessionB.subscribe((event) => {
      liveEventsB.push(event);
    });

    await sessionA.invoke({ draft: draftA });
    const stateB = await sessionB.invoke({ draft: draftB });
    const secondStateA = await sessionA.invoke({
      draft: draftA,
      styleGuide: "Session A style only.",
    });

    unsubscribeA();
    unsubscribeB();

    const receiveEpochs = (events: LiveTraceEvent[]) =>
      events
        .map(({ event }) =>
          event.scope === "runtime" &&
          event.type === "started" &&
          event.label === "receive"
            ? event.metadata?.receiveEpoch
            : undefined,
        )
        .filter((epoch): epoch is number => typeof epoch === "number");
    const sequences = (events: LiveTraceEvent[]) =>
      events.map(({ sequence }) => sequence);

    expect(liveEventsA.map(({ event }) => event)).toEqual(secondStateA.trace);
    expect(liveEventsB.map(({ event }) => event)).toEqual(stateB.trace);
    expect(sequences(liveEventsA)).toEqual(
      liveEventsA.map((_, index) => index + 1),
    );
    expect(sequences(liveEventsB)).toEqual(
      liveEventsB.map((_, index) => index + 1),
    );
    expect(receiveEpochs(liveEventsA)).toEqual([1, 2]);
    expect(receiveEpochs(liveEventsB)).toEqual([1]);
    expect(stateB.finalResult?.revisedDraft).toContain(draftB);
    expect(stateB.finalResult?.revisedDraft).not.toContain(draftA);
  });

  it("reruns style work without fact checking on a style-only session update", async () => {
    const session = createCorrectionGraphSession();
    const draft = "Signal-kernel coordinates async correction branches.";

    const firstState = await session.invoke({ draft });
    const secondState = await session.invoke({
      draft,
      styleGuide: "Use concise technical language.",
    });
    const secondInvocationTrace = secondState.trace.slice(
      firstState.trace.length,
    );
    const hasEvent = (type: string, label: string) =>
      secondInvocationTrace.some(
        (event) => event.type === type && event.label === label,
      );

    expect({
      styleReviewPending: hasEvent("pending", "styleReview"),
      rewriteDraftPending: hasEvent("pending", "rewriteDraft"),
      factCheckPending: hasEvent("pending", "factCheck"),
      factCheckStale: hasEvent("stale", "factCheck"),
      summary: secondState.finalResult?.summary,
    }).toEqual({
      styleReviewPending: true,
      rewriteDraftPending: true,
      factCheckPending: false,
      factCheckStale: false,
      summary: expect.arrayContaining([
        "Apply style guide: Use concise technical language.",
      ]),
    });
  });

  it("reruns fact checking on a claim-changing third session invocation", async () => {
    const session = createCorrectionGraphSession();
    const initialDraft = "Signal-kernel coordinates async correction branches.";
    const styleGuide = "Use concise technical language.";

    await session.invoke({ draft: initialDraft });
    const secondState = await session.invoke({
      draft: initialDraft,
      styleGuide,
    });
    const thirdState = await session.invoke({
      draft: `${initialDraft} A new claim now requires verification.`,
      styleGuide,
    });
    const thirdInvocationTrace = thirdState.trace.slice(
      secondState.trace.length,
    );
    const hasEvent = (type: string, label: string) =>
      thirdInvocationTrace.some(
        (event) => event.type === type && event.label === label,
      );

    expect({
      claimCount: thirdState.claims?.length,
      claimsCompleted: hasEvent("completed", "claims"),
      factCheckPending: hasEvent("pending", "factCheck"),
      rewriteDraftPending: hasEvent("pending", "rewriteDraft"),
      finalResultChanged:
        thirdState.finalResult?.revisedDraft !==
        secondState.finalResult?.revisedDraft,
      revisedDraft: thirdState.finalResult?.revisedDraft,
    }).toEqual({
      claimCount: 2,
      claimsCompleted: true,
      factCheckPending: true,
      rewriteDraftPending: true,
      finalResultChanged: true,
      revisedDraft: expect.stringContaining(
        "A new claim now requires verification.",
      ),
    });
  });

  it("keeps runtime state and trace history isolated between sessions", async () => {
    const sessionA = createCorrectionGraphSession();
    const sessionB = createCorrectionGraphSession();
    const draftA = "Session A coordinates async correction branches.";
    const draftB = "Session B owns an independent correction draft.";

    await sessionA.invoke({ draft: draftA });
    const secondStateA = await sessionA.invoke({
      draft: draftA,
      styleGuide: "Session A style only.",
    });
    const firstStateB = await sessionB.invoke({ draft: draftB });

    const receiveCount = (state: typeof firstStateB) =>
      state.trace.filter(
        (event) =>
          event.scope === "runtime" &&
          event.type === "started" &&
          event.label === "receive",
      ).length;

    expect({
      sessionAReceiveCount: receiveCount(secondStateA),
      sessionBReceiveCount: receiveCount(firstStateB),
      sessionBSummary: firstStateB.finalResult?.summary,
      sessionBRevisedDraft: firstStateB.finalResult?.revisedDraft,
      sessionBContainsDraftA:
        firstStateB.finalResult?.revisedDraft.includes(draftA),
      sessionBContainsStyleA: firstStateB.finalResult?.summary.includes(
        "Apply style guide: Session A style only.",
      ),
    }).toEqual({
      sessionAReceiveCount: 2,
      sessionBReceiveCount: 1,
      sessionBSummary: ["No major correction needed in the mock runtime."],
      sessionBRevisedDraft: expect.stringContaining(draftB),
      sessionBContainsDraftA: false,
      sessionBContainsStyleA: false,
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
