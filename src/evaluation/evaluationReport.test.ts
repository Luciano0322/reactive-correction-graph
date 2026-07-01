import { describe, expect, it } from "vitest";
import {
  serializeEvaluationReport,
  summarizeEvaluationTrials,
  type EvaluationTrialResult,
  type LocalLlmEvaluationReport,
} from "./evaluationReport.js";

describe("serializeEvaluationReport", () => {
  it("round-trips settled and rejected trial results as JSON", () => {
    const report: LocalLlmEvaluationReport = {
      schemaVersion: 1,
      provider: "ollama",
      summary: {
        totalTrials: 2,
        settledTrials: 1,
        rejectedTrials: 1,
        fullCoverageTrials: 1,
        trialsWithNormalizedMissing: 1,
        trialsWithIgnoredUnknown: 1,
        subjectiveCorrectionQuality: "not-evaluated",
      },
      trials: [
        {
          fixture: "explanatory-demo",
          model: "llama3.2:3b",
          trial: 1,
          status: "settled",
          durationMs: 1_250,
          extractedClaimCount: 3,
          factCheckCoverageCount: 3,
          normalizedMissingCount: 0,
          ignoredUnknownCount: 1,
          unresolvedIssueCount: 0,
          error: null,
        },
        {
          fixture: "claim-correction",
          model: "llama3.2:3b",
          trial: 2,
          status: "rejected",
          durationMs: 30_000,
          extractedClaimCount: 2,
          factCheckCoverageCount: 0,
          normalizedMissingCount: 2,
          ignoredUnknownCount: 0,
          unresolvedIssueCount: 2,
          error: "Correction runtime did not settle before timeout",
        },
      ],
    };

    const serialized = serializeEvaluationReport(report);

    expect({
      parsed: JSON.parse(serialized),
      endsWithNewline: serialized.endsWith("\n"),
    }).toEqual({
      parsed: report,
      endsWithNewline: true,
    });
  });

  it("summarizes structural outcomes without grading correction quality", () => {
    const trials: EvaluationTrialResult[] = [
      evaluationTrial({
        status: "settled",
        extractedClaimCount: 3,
        factCheckCoverageCount: 3,
      }),
      evaluationTrial({
        status: "settled",
        extractedClaimCount: 3,
        factCheckCoverageCount: 1,
        normalizedMissingCount: 2,
        ignoredUnknownCount: 1,
      }),
      evaluationTrial({
        status: "rejected",
        error: "Ollama is unavailable",
      }),
    ];

    expect(summarizeEvaluationTrials(trials)).toEqual({
      totalTrials: 3,
      settledTrials: 2,
      rejectedTrials: 1,
      fullCoverageTrials: 1,
      trialsWithNormalizedMissing: 1,
      trialsWithIgnoredUnknown: 1,
      subjectiveCorrectionQuality: "not-evaluated",
    });
  });
});

function evaluationTrial(
  overrides: Partial<EvaluationTrialResult>,
): EvaluationTrialResult {
  return {
    fixture: "fixture",
    model: "model",
    trial: 1,
    status: "settled",
    durationMs: 100,
    extractedClaimCount: 0,
    factCheckCoverageCount: 0,
    normalizedMissingCount: 0,
    ignoredUnknownCount: 0,
    unresolvedIssueCount: 0,
    error: null,
    ...overrides,
  };
}
