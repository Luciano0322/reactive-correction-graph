import { describe, expect, it } from "vitest";
import { projectReceiveExecutionSummary } from "../trace/projectReceiveExecutionSummary.js";
import { runReferenceScenario } from "./runReferenceScenario.js";

describe("runReferenceScenario", () => {
  it("loads the reference fixtures and runs the initial transition through the runtime", async () => {
    const run = await runReferenceScenario({ transitionId: "initial" });

    expect({
      scenarioId: run.scenario.id,
      transitionId: run.transition.id,
      provider: run.provider,
      draft: run.state.draft,
      finalResult: run.state.finalResult,
      trace: run.trace,
    }).toEqual({
      scenarioId: "technical-article-correction",
      transitionId: "initial",
      provider: "deterministic-mock",
      draft: expect.stringContaining("Reactive Correction Graph"),
      finalResult: expect.objectContaining({
        revisedDraft: expect.stringContaining("Mock correction notes"),
        summary: expect.arrayContaining([
          expect.stringContaining("Respect user intent"),
        ]),
      }),
      trace: expect.arrayContaining([
        expect.objectContaining({
          scope: "effect",
          type: "emitted",
          label: "finalResult",
        }),
      ]),
    });
  });

  it("keeps the reference run on the deterministic mock model even when model-like options are present", async () => {
    const forbiddenModel = {
      factCheckClaims: async () => {
        throw new Error("reference demo must not use an injected fact checker");
      },
      reviewStyle: async () => {
        throw new Error("reference demo must not use an injected style reviewer");
      },
      rewriteDraft: async () => {
        throw new Error("reference demo must not use an injected rewriter");
      },
    };
    const run = await runReferenceScenario({
      transitionId: "initial",
      model: forbiddenModel,
    } as unknown as Parameters<typeof runReferenceScenario>[0]);

    expect({
      provider: run.provider,
      revisedDraft: run.state.finalResult?.revisedDraft,
    }).toEqual({
      provider: "deterministic-mock",
      revisedDraft: expect.stringContaining("Mock correction notes"),
    });
  });

  it("runs the default reference scenario as multiple receive epochs", async () => {
    const run = await runReferenceScenario();
    const receiveStartedEpochs = run.trace
      .filter(
        (event) =>
          event.scope === "runtime" &&
          event.type === "started" &&
          event.label === "receive",
      )
      .map((event) => event.metadata?.receiveEpoch);

    expect({
      receiveStartedCount: receiveStartedEpochs.length,
      receiveStartedEpochs,
      finalResultProduced: Boolean(run.state.finalResult),
    }).toEqual({
      receiveStartedCount: expect.any(Number),
      receiveStartedEpochs: expect.arrayContaining([1, 2]),
      finalResultProduced: true,
    });
    expect(receiveStartedEpochs.length).toBeGreaterThan(1);
  });

  it("applies initial, style-only, and claim-changing transitions in order", async () => {
    const run = await runReferenceScenario();

    expect(
      run.receives.map((receive) => ({
        receiveEpoch: receive.receiveEpoch,
        transitionId: receive.transition.id,
        draft: receive.state.draft,
        styleGuide: receive.state.styleGuide,
      })),
    ).toEqual([
      {
        receiveEpoch: 1,
        transitionId: "initial",
        draft: run.scenario.initialDraft,
        styleGuide: run.scenario.styleGuide,
      },
      {
        receiveEpoch: 2,
        transitionId: "style-only",
        draft: run.scenario.initialDraft,
        styleGuide: run.scenario.metadata.styleOnlyStyleGuide,
      },
      {
        receiveEpoch: 3,
        transitionId: "claim-changing",
        draft: run.scenario.inputs.claimChanging.draft,
        styleGuide: run.scenario.metadata.styleOnlyStyleGuide,
      },
    ]);
    expect(run.transition.id).toBe("claim-changing");
    expect(run.state.draft).toBe(run.scenario.inputs.claimChanging.draft);
  });

  it("reuses settled fact-check work for the style-only transition", async () => {
    const run = await runReferenceScenario();
    const styleOnlyReceive = run.receives.find(
      (receive) => receive.transition.id === "style-only",
    );

    expect(styleOnlyReceive).toBeDefined();

    const summary = projectReceiveExecutionSummary(
      run.trace,
      styleOnlyReceive!.receiveEpoch,
    );

    expect(summary).toEqual({
      receiveEpoch: styleOnlyReceive!.receiveEpoch,
      recomputed: ["styleReview", "rewriteDraft"],
      reused: ["factCheck"],
      superseded: [],
      emitted: ["finalResult"],
    });
  });

  it("recomputes fact-check work for the claim-changing transition", async () => {
    const run = await runReferenceScenario();
    const claimChangingReceive = run.receives.find(
      (receive) => receive.transition.id === "claim-changing",
    );

    expect(claimChangingReceive).toBeDefined();

    const summary = projectReceiveExecutionSummary(
      run.trace,
      claimChangingReceive!.receiveEpoch,
    );

    expect(summary).toEqual({
      receiveEpoch: claimChangingReceive!.receiveEpoch,
      recomputed: ["factCheck", "styleReview", "rewriteDraft"],
      reused: [],
      superseded: [],
      emitted: ["finalResult"],
    });
  });
});
