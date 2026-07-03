import { describe, expect, it } from "vitest";
import { createArtifactBundleManifest } from "../artifacts/artifactBundleManifest.js";
import type { LoadedArtifactBundle } from "../artifacts/loadArtifactBundle.js";
import {
  createStructuralReliabilityScorecard,
  type StructuralReliabilityScorecard,
} from "../evaluation/structuralReliabilityScorecard.js";
import { createEvidenceReportViewModel } from "./createEvidenceReportViewModel.js";

describe("createEvidenceReportViewModel", () => {
  it("derives understandable operation counts from a valid comparison bundle", () => {
    const viewModel = createEvidenceReportViewModel(comparisonBundle());

    expect(viewModel).toEqual({
      title: "Reactive Correction Evidence Report",
      run: {
        id: "comparison-run-001",
        generatedAt: "2026-07-02T00:00:00.000Z",
        command: "demo:compare",
        provider: "deterministic-mock",
      },
      reliability: {
        structuralVerdict: "insufficient-evidence",
        structuralScore: null,
        providerCompatibility: "not-evaluated",
        subjectiveCorrectionQuality: "not-evaluated",
        hardGates: [
          {
            key: "staleResultProtection",
            label: "Stale-result protection",
            status: "not-evaluated",
          },
          {
            key: "finalResultIntegrity",
            label: "Final-result integrity",
            status: "not-evaluated",
          },
          {
            key: "sessionIsolation",
            label: "Session isolation",
            status: "not-evaluated",
          },
        ],
      },
      evidenceLimits: [
        "Execution counts cover fixed deterministic scenarios only.",
        "Matching outputs do not prove factual correctness, writing quality, or usefulness.",
        "This report is not a latency, token, cost, or general performance benchmark.",
      ],
      scenarios: [
        {
          key: "style-only",
          label: "Style-only update",
          comparisonStatus: "comparable",
          outputsMatch: true,
          execution: {
            receiveEpoch: 2,
            recomputed: ["Style review", "Rewrite draft"],
            reused: ["Fact check"],
            superseded: [],
            emitted: ["Final result"],
          },
          operations: [
            {
              key: "factCheck",
              label: "Fact check",
              eagerCalls: 1,
              reactiveCalls: 0,
              avoidedCalls: 1,
            },
          ],
        },
      ],
    });
  });

  it("uses compatible scorecard evidence when the bundle provides it", () => {
    const scorecard = createStructuralReliabilityScorecard({
      policyVersion: 1,
      runtimeSettlement: { settledRuns: 4, rejectedRuns: 0 },
      providerCompatibility: { settledTrials: 3, rejectedTrials: 1 },
      claimCoverage: { coveredClaims: 4, totalClaims: 4 },
      unknownIdContainment: { containedUnknownIds: 2, totalUnknownIds: 2 },
      contractEvidence: {
        staleResultProtection: "passed",
        finalResultIntegrity: "passed",
        sessionIsolation: "passed",
      },
      executionEfficiency: { savingsReportSchemaVersion: 1 },
    });

    expect(
      createEvidenceReportViewModel(comparisonBundle(scorecard)).reliability,
    ).toEqual({
      structuralVerdict: "pass",
      structuralScore: 100,
      providerCompatibility: "evaluated",
      subjectiveCorrectionQuality: "not-evaluated",
      hardGates: [
        {
          key: "staleResultProtection",
          label: "Stale-result protection",
          status: "passed",
        },
        {
          key: "finalResultIntegrity",
          label: "Final-result integrity",
          status: "passed",
        },
        {
          key: "sessionIsolation",
          label: "Session isolation",
          status: "passed",
        },
      ],
    });
  });
});

function comparisonBundle(
  scorecard?: StructuralReliabilityScorecard,
): LoadedArtifactBundle {
  const manifest = createArtifactBundleManifest(
    {
      command: "demo:compare",
      mode: "comparison",
      provider: "deterministic-mock",
      artifacts: {
        result: {
          path: "result.md",
          mediaType: "text/markdown",
          schema: null,
        },
        state: {
          path: "state.json",
          mediaType: "application/json",
          schema: { name: "correction-state", version: 1 },
        },
        trace: {
          path: "trace.json",
          mediaType: "application/json",
          schema: { name: "trace-events", version: 1 },
        },
        executionSummary: {
          path: "execution-summary.json",
          mediaType: "application/json",
          schema: { name: "receive-execution-summaries", version: 1 },
        },
        comparison: {
          path: "comparison.json",
          mediaType: "application/json",
          schema: { name: "correction-comparison", version: 1 },
        },
        savings: {
          path: "savings.json",
          mediaType: "application/json",
          schema: { name: "recompute-savings", version: 1 },
        },
        ...(scorecard
          ? {
              scorecard: {
                path: "scorecard.json",
                mediaType: "application/json" as const,
                schema: {
                  name: "structural-reliability-scorecard",
                  version: 1,
                },
              },
            }
          : {}),
      },
    },
    {
      createRunId: () => "comparison-run-001",
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    },
  );

  return {
    manifest,
    artifacts: {
      result: {
        ...manifest.artifacts.result!,
        content: "# Result",
      },
      state: {
        ...manifest.artifacts.state!,
        content: {},
      },
      trace: {
        ...manifest.artifacts.trace!,
        content: [],
      },
      executionSummary: {
        ...manifest.artifacts.executionSummary!,
        content: {
          schemaVersion: 1,
          summaries: [
            {
              receiveEpoch: 2,
              recomputed: ["styleReview", "rewriteDraft"],
              reused: ["factCheck"],
              superseded: [],
              emitted: ["finalResult"],
            },
          ],
        },
      },
      comparison: {
        ...manifest.artifacts.comparison!,
        content: {
          provider: "deterministic-mock",
          scenarios: [
            {
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
          ],
        },
      },
      savings: {
        ...manifest.artifacts.savings!,
        content: {
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
                  eagerCalls: 1,
                  reactiveCalls: 0,
                  avoidedCalls: 1,
                  reusedReceives: 1,
                  supersededCalls: 0,
                },
              ],
            },
          ],
        },
      },
      ...(scorecard
        ? {
            scorecard: {
              ...manifest.artifacts.scorecard!,
              content: scorecard,
            },
          }
        : {}),
    },
  };
}
