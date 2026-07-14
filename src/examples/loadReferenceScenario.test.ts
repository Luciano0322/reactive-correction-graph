import { describe, expect, it } from "vitest";
import type { CorrectionRuntimeInput } from "../schemas/correction.js";
import { loadReferenceScenario } from "./loadReferenceScenario.js";

describe("reference scenario fixtures", () => {
  it("loads a non-empty technical article correction scenario", async () => {
    const scenario = await loadReferenceScenario();

    expect(scenario).toEqual(expect.objectContaining({
      id: "technical-article-correction",
      title: "Technical article correction",
      initialDraft: expect.stringContaining("Reactive Correction Graph"),
      styleGuide: expect.stringContaining("concise"),
    }));
    expect(scenario.initialDraft.trim().length).toBeGreaterThan(80);
    expect(scenario.styleGuide.trim().length).toBeGreaterThan(40);
  });

  it("loads scenario metadata that explains the application proof target", async () => {
    const scenario = await loadReferenceScenario();

    expect(scenario.metadata).toEqual(
      expect.objectContaining({
        kind: "reference-application",
        fixturePaths: {
          initialDraft: "reference-article.md",
          styleGuide: "reference-style-guide.md",
          metadata: "reference-scenario.json",
        },
        proofTarget: expect.stringContaining("reuse fact-check work"),
      }),
    );
  });

  it("returns typed runtime inputs for the fixed scenario", async () => {
    const scenario = await loadReferenceScenario();
    const initialInput: CorrectionRuntimeInput = scenario.inputs.initial;

    expect(initialInput).toEqual({
      draft: scenario.initialDraft,
      userIntent: expect.stringContaining("Explain"),
      styleGuide: scenario.styleGuide,
    });
  });

  it("defines fixed transitions for initial, style-only, and claim-changing updates", async () => {
    const scenario = await loadReferenceScenario();
    const styleOnlyInput: CorrectionRuntimeInput = scenario.inputs.styleOnly;
    const claimChangingInput: CorrectionRuntimeInput =
      scenario.inputs.claimChanging;

    expect(
      scenario.transitions.map((transition) => ({
        id: transition.id,
        input: transition.input,
        proofTarget: transition.proofTarget,
      })),
    ).toEqual([
      {
        id: "initial",
        input: scenario.inputs.initial,
        proofTarget: expect.stringContaining("baseline"),
      },
      {
        id: "style-only",
        input: styleOnlyInput,
        proofTarget: expect.stringContaining("reuse fact-check work"),
      },
      {
        id: "claim-changing",
        input: claimChangingInput,
        proofTarget: expect.stringContaining("recompute fact-check work"),
      },
    ]);
    expect(styleOnlyInput).toEqual({
      draft: scenario.inputs.initial.draft,
      userIntent: scenario.inputs.initial.userIntent,
      styleGuide: expect.stringContaining("Use more concise"),
    });
    expect(claimChangingInput.draft).not.toBe(scenario.inputs.initial.draft);
    expect(claimChangingInput.styleGuide).toBe(styleOnlyInput.styleGuide);
  });

  it("keeps the reference scenario mock-first and free of provider requirements", async () => {
    const scenario = await loadReferenceScenario();

    expect(scenario.metadata.executionBoundary).toEqual({
      provider: "mock",
      requiresNetwork: false,
      requiresOllama: false,
      requiresLangSmith: false,
      requiresApiKey: false,
    });
  });
});
