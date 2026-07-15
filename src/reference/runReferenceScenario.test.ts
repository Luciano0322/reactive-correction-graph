import { describe, expect, it } from "vitest";
import { runReferenceScenario } from "./runReferenceScenario.js";

describe("runReferenceScenario", () => {
  it("loads the reference fixtures and runs the initial transition through the runtime", async () => {
    const run = await runReferenceScenario();

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
});
