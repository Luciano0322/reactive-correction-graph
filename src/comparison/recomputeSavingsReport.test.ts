import { describe, expect, it } from "vitest";
import {
  calculateRecomputeSavingsOperation,
  serializeRecomputeSavingsReport,
  summarizeRecomputeSavingsEvidence,
  type RecomputeSavingsReport,
} from "./recomputeSavingsReport.js";
import { runCorrectionComparison } from "./runCorrectionComparison.js";
import type { ReceiveExecutionSummary } from "../trace/projectReceiveExecutionSummary.js";

describe("recomputeSavingsReport", () => {
  it("round-trips a versioned per-operation savings report as JSON", () => {
    const report: RecomputeSavingsReport = {
      schemaVersion: 1,
      provider: "deterministic-mock",
      scenarios: [
        {
          scenario: "style-only",
          comparisonStatus: "comparable",
          incomparableReason: null,
          operations: [
            {
              operation: "factCheck",
              eagerCalls: 2,
              reactiveCalls: 1,
              avoidedCalls: 1,
              reusedReceives: 1,
              supersededCalls: 0,
            },
            {
              operation: "styleReview",
              eagerCalls: 2,
              reactiveCalls: 2,
              avoidedCalls: 0,
              reusedReceives: 0,
              supersededCalls: 0,
            },
            {
              operation: "rewriteDraft",
              eagerCalls: 2,
              reactiveCalls: 2,
              avoidedCalls: 0,
              reusedReceives: 0,
              supersededCalls: 0,
            },
          ],
        },
      ],
    };

    const serialized = serializeRecomputeSavingsReport(report);

    expect({
      parsed: JSON.parse(serialized),
      endsWithNewline: serialized.endsWith("\n"),
    }).toEqual({
      parsed: report,
      endsWithNewline: true,
    });
  });

  it("calculates an avoided fact-check call from style-only comparison counts", async () => {
    const comparison = await runCorrectionComparison();
    const styleOnly = comparison.scenarios.find(
      (scenario) => scenario.scenario === "style-only",
    );

    expect(styleOnly).toBeDefined();

    const factCheckSavings = calculateRecomputeSavingsOperation({
      operation: "factCheck",
      eagerCalls: styleOnly?.eager.factCheckCalls ?? 0,
      reactiveCalls: styleOnly?.reactive.factCheckCalls ?? 0,
      reusedReceives: 1,
      supersededCalls: 0,
    });

    expect(factCheckSavings).toEqual({
      operation: "factCheck",
      eagerCalls: 2,
      reactiveCalls: 1,
      avoidedCalls: 1,
      reusedReceives: 1,
      supersededCalls: 0,
    });
  });

  it("reports no fact-check savings for a claim-changing update", async () => {
    const comparison = await runCorrectionComparison();
    const styleOnly = comparison.scenarios.find(
      (scenario) => scenario.scenario === "style-only",
    );
    const claimChanging = comparison.scenarios.find(
      (scenario) => scenario.scenario === "claim-changing",
    );

    if (!styleOnly || !claimChanging) {
      throw new Error("Expected ordered style-only and claim-changing scenarios");
    }

    const factCheckSavings = calculateRecomputeSavingsOperation({
      operation: "factCheck",
      eagerCalls:
        claimChanging.eager.factCheckCalls - styleOnly.eager.factCheckCalls,
      reactiveCalls:
        claimChanging.reactive.factCheckCalls -
        styleOnly.reactive.factCheckCalls,
      reusedReceives: 0,
      supersededCalls: 0,
    });

    expect(factCheckSavings).toEqual({
      operation: "factCheck",
      eagerCalls: 1,
      reactiveCalls: 1,
      avoidedCalls: 0,
      reusedReceives: 0,
      supersededCalls: 0,
    });
  });

  it("accounts for superseded calls separately from reused receives", () => {
    const executionSummaries: ReceiveExecutionSummary[] = [
      {
        receiveEpoch: 2,
        recomputed: ["styleReview", "rewriteDraft"],
        reused: ["factCheck"],
        superseded: [],
        emitted: ["finalResult"],
      },
      {
        receiveEpoch: 3,
        recomputed: ["factCheck", "styleReview", "rewriteDraft"],
        reused: [],
        superseded: ["factCheck", "styleReview"],
        emitted: ["finalResult"],
      },
    ];
    const executionEvidence = summarizeRecomputeSavingsEvidence(
      executionSummaries,
      "factCheck",
    );

    expect(
      calculateRecomputeSavingsOperation({
        operation: "factCheck",
        eagerCalls: 2,
        reactiveCalls: 2,
        ...executionEvidence,
      }),
    ).toEqual({
      operation: "factCheck",
      eagerCalls: 2,
      reactiveCalls: 2,
      avoidedCalls: 0,
      reusedReceives: 1,
      supersededCalls: 1,
    });
  });
});
