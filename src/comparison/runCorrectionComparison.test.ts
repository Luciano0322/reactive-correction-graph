import { describe, expect, it } from "vitest";
import { runCorrectionComparison } from "./runCorrectionComparison.js";

describe("runCorrectionComparison", () => {
  it("reports avoided fact-check work for a style-only update", async () => {
    const report = await runCorrectionComparison();
    const styleOnly = report.scenarios.find(
      (scenario) => scenario.scenario === "style-only",
    );
    const roundTripped = JSON.parse(JSON.stringify(report)) as typeof report;

    expect({
      provider: report.provider,
      styleOnly,
      roundTripped,
    }).toEqual({
      provider: "deterministic-mock",
      styleOnly: {
        scenario: "style-only",
        eager: {
          factCheckCalls: 2,
          styleReviewCalls: 2,
          rewriteDraftCalls: 2,
          finalResultProduced: true,
        },
        reactive: {
          factCheckCalls: 1,
          styleReviewCalls: 2,
          rewriteDraftCalls: 2,
          finalResultProduced: true,
        },
        finalResultsMatch: true,
      },
      roundTripped: report,
    });
  });

  it("reports renewed fact-check work when claims change", async () => {
    const report = await runCorrectionComparison();
    const styleOnly = report.scenarios.find(
      (scenario) => scenario.scenario === "style-only",
    );
    const claimChanging = report.scenarios.find(
      (scenario) => scenario.scenario === "claim-changing",
    );

    expect({
      eagerFactCheckCalls: claimChanging?.eager.factCheckCalls,
      reactiveFactChecksBeforeChange: styleOnly?.reactive.factCheckCalls,
      reactiveFactChecksAfterChange: claimChanging?.reactive.factCheckCalls,
      eagerRewriteCalls: claimChanging?.eager.rewriteDraftCalls,
      reactiveRewriteCalls: claimChanging?.reactive.rewriteDraftCalls,
      finalResultsMatch: claimChanging?.finalResultsMatch,
      eagerFinalResultProduced: claimChanging?.eager.finalResultProduced,
      reactiveFinalResultProduced: claimChanging?.reactive.finalResultProduced,
    }).toEqual({
      eagerFactCheckCalls: 3,
      reactiveFactChecksBeforeChange: 1,
      reactiveFactChecksAfterChange: 2,
      eagerRewriteCalls: 3,
      reactiveRewriteCalls: 3,
      finalResultsMatch: true,
      eagerFinalResultProduced: true,
      reactiveFinalResultProduced: true,
    });
  });
});
