import { describe, expect, it } from "vitest";
import { createArtifactBundleManifest } from "../artifacts/artifactBundleManifest.js";
import type { LoadedArtifactBundle } from "../artifacts/loadArtifactBundle.js";
import {
  createStructuralReliabilityScorecard,
  type StructuralReliabilityScorecard,
} from "../evaluation/structuralReliabilityScorecard.js";
import { createCorrectionGraphSession } from "../graph/createCorrectionGraph.js";
import {
  createDeveloperInspectorViewModel,
  createDeveloperInspectorViewModelFromLiveSessionSnapshot,
} from "./createDeveloperInspectorViewModel.js";

describe("createDeveloperInspectorViewModel", () => {
  it("separates user-facing result data from developer diagnostics in an artifact bundle", () => {
    const viewModel = createDeveloperInspectorViewModel(artifactBundle());

    expect(viewModel).toEqual({
      title: "Reactive Correction Developer Inspector",
      source: {
        type: "artifact-bundle",
        runId: "inspector-run-001",
        generatedAt: "2026-07-07T00:00:00.000Z",
        command: "demo:compare",
        mode: "comparison",
        provider: "deterministic-mock",
      },
      userFacing: {
        resultMarkdown: "# Result\n\nA revised correction draft.",
      },
      developerDiagnostics: {
        trace: {
          status: "available",
          eventCount: 2,
        },
        artifacts: [
          {
            key: "result",
            label: "Result",
            status: "available",
            path: "result.md",
            schema: null,
          },
          {
            key: "state",
            label: "State",
            status: "available",
            path: "state.json",
            schema: "correction-state@1",
          },
          {
            key: "trace",
            label: "Trace",
            status: "available",
            path: "trace.json",
            schema: "trace-events@1",
          },
          {
            key: "executionSummary",
            label: "Execution summary",
            status: "missing",
            path: null,
            schema: null,
          },
          {
            key: "comparison",
            label: "Comparison",
            status: "available",
            path: "comparison.json",
            schema: "correction-comparison@1",
          },
          {
            key: "savings",
            label: "Savings",
            status: "missing",
            path: null,
            schema: null,
          },
          {
            key: "evaluation",
            label: "Evaluation",
            status: "missing",
            path: null,
            schema: null,
          },
          {
            key: "scorecard",
            label: "Scorecard",
            status: "missing",
            path: null,
            schema: null,
          },
          {
            key: "report",
            label: "Report",
            status: "missing",
            path: null,
            schema: null,
          },
        ],
        warnings: [
          {
            code: "artifact-missing",
            artifact: "executionSummary",
            message: "Execution summary artifact is not available in this bundle.",
          },
          {
            code: "artifact-missing",
            artifact: "savings",
            message: "Savings artifact is not available in this bundle.",
          },
          {
            code: "artifact-missing",
            artifact: "evaluation",
            message: "Evaluation artifact is not available in this bundle.",
          },
          {
            code: "artifact-missing",
            artifact: "scorecard",
            message: "Scorecard artifact is not available in this bundle.",
          },
          {
            code: "artifact-missing",
            artifact: "report",
            message: "Report artifact is not available in this bundle.",
          },
        ],
      },
    });
  });

  it("groups receive-level execution activity for developer inspection", () => {
    const viewModel = createDeveloperInspectorViewModel(
      artifactBundle({ includeExecutionSummary: true }),
    );

    expect(viewModel.developerDiagnostics.execution).toEqual({
      status: "available",
      receives: [
        {
          receiveEpoch: 2,
          recomputed: ["Style review", "Rewrite draft"],
          reused: ["Fact check"],
          skipped: ["Fact check"],
          superseded: ["Rewrite draft"],
          emitted: ["Final result"],
        },
      ],
    });
  });

  it("keeps claims, intent, and evidence in developer-only diagnostics", () => {
    const scorecard = createStructuralReliabilityScorecard({
      policyVersion: 1,
      runtimeSettlement: { settledRuns: 4, rejectedRuns: 0 },
      providerCompatibility: { settledTrials: 4, rejectedTrials: 0 },
      claimCoverage: { coveredClaims: 2, totalClaims: 2 },
      unknownIdContainment: { containedUnknownIds: 1, totalUnknownIds: 1 },
      contractEvidence: {
        staleResultProtection: "passed",
        finalResultIntegrity: "passed",
        sessionIsolation: "passed",
      },
      corroboration: {
        policyVersion: 1,
        outcome: "agreement",
        verificationAttempts: 3,
        independentModels: 2,
      },
      executionEfficiency: {
        savingsReportSchemaVersion: 1,
        recomputationCalls: 4,
      },
    });

    const viewModel = createDeveloperInspectorViewModel(
      artifactBundle({ includeInternalState: true, scorecard }),
    );

    expect(viewModel.userFacing).toEqual({
      resultMarkdown: "# Result\n\nA revised correction draft.",
    });
    expect(viewModel.userFacing).not.toHaveProperty("claims");
    expect(viewModel.userFacing).not.toHaveProperty("intent");
    expect(viewModel.userFacing).not.toHaveProperty("evidence");
    expect(viewModel.developerDiagnostics.internalState).toEqual({
      status: "available",
      intent: {
        userIntent: "Explain reactive invalidation.",
        styleGuide: "Keep the revision concise.",
      },
      claims: [
        {
          id: "claim-1",
          text: "Reactive invalidation avoids unchanged fact-check work.",
        },
        {
          id: "claim-2",
          text: "The correction graph keeps trace evidence inspectable.",
        },
      ],
    });
    expect(viewModel.developerDiagnostics.evidence).toEqual({
      verification: {
        status: "reported-separately",
        policyVersion: 1,
        outcome: "agreement",
        verificationAttempts: 3,
        independentModels: 2,
      },
      recomputation: {
        status: "reported-separately",
        recomputationCalls: 4,
      },
    });
  });

  it("builds the same inspector contract from a live session snapshot", async () => {
    const session = createCorrectionGraphSession();
    const draft = "Signal-kernel coordinates async correction branches.";

    await session.invoke({
      draft,
      userIntent: "Explain reactive invalidation.",
    });
    const liveState = await session.invoke({
      draft,
      userIntent: "Explain reactive invalidation.",
      styleGuide: "Use concise technical language.",
    });

    const viewModel = createDeveloperInspectorViewModelFromLiveSessionSnapshot({
      sessionId: "session-inspector-001",
      state: liveState,
      mode: "graph",
    });

    expect(viewModel.source).toEqual({
      type: "live-session",
      sessionId: "session-inspector-001",
      mode: "graph",
      provider: "deterministic-mock",
    });
    expect(viewModel.userFacing.resultMarkdown).toContain("## Revised Draft");
    expect(viewModel.developerDiagnostics.trace).toEqual({
      status: "available",
      eventCount: liveState.trace.length,
    });
    expect(viewModel.developerDiagnostics.artifacts).toEqual([]);
    expect(viewModel.developerDiagnostics.warnings).toEqual([]);
    expect(viewModel.developerDiagnostics.internalState).toEqual({
      status: "available",
      intent: {
        userIntent: "Explain reactive invalidation.",
        styleGuide: "Use concise technical language.",
      },
      claims: liveState.claims,
    });
    expect(viewModel.developerDiagnostics.execution).toEqual({
      status: "available",
      receives: [
        expect.objectContaining({
          receiveEpoch: 1,
          recomputed: ["Fact check", "Style review", "Rewrite draft"],
          reused: [],
          emitted: ["Final result"],
        }),
        expect.objectContaining({
          receiveEpoch: 2,
          recomputed: ["Style review", "Rewrite draft"],
          reused: ["Fact check"],
          emitted: ["Final result"],
        }),
      ],
    });
  });
});

function artifactBundle(
  options: {
    includeExecutionSummary?: boolean;
    includeInternalState?: boolean;
    scorecard?: StructuralReliabilityScorecard;
  } = {},
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
        comparison: {
          path: "comparison.json",
          mediaType: "application/json",
          schema: { name: "correction-comparison", version: 1 },
        },
        ...(options.scorecard
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
        ...(options.includeExecutionSummary
          ? {
              executionSummary: {
                path: "execution-summary.json",
                mediaType: "application/json" as const,
                schema: {
                  name: "receive-execution-summaries",
                  version: 1,
                },
              },
            }
          : {}),
      },
    },
    {
      createRunId: () => "inspector-run-001",
      now: () => new Date("2026-07-07T00:00:00.000Z"),
    },
  );

  return {
    manifest,
    artifacts: {
      result: {
        ...manifest.artifacts.result!,
        content: "# Result\n\nA revised correction draft.",
      },
      state: {
        ...manifest.artifacts.state!,
        content: options.includeInternalState
          ? {
              userIntent: "Explain reactive invalidation.",
              styleGuide: "Keep the revision concise.",
              claims: [
                {
                  id: "claim-1",
                  text: "Reactive invalidation avoids unchanged fact-check work.",
                },
                {
                  id: "claim-2",
                  text: "The correction graph keeps trace evidence inspectable.",
                },
              ],
              finalResult: { revisedDraft: "A revised correction draft." },
            }
          : {
              finalResult: { revisedDraft: "A revised correction draft." },
            },
      },
      trace: {
        ...manifest.artifacts.trace!,
        content: options.includeExecutionSummary
          ? [
              {
                id: "trace-1",
                at: 1,
                scope: "runtime",
                type: "started",
                label: "receive",
              },
              {
                id: "trace-2",
                at: 2,
                scope: "runtime",
                type: "started",
                label: "receive",
                metadata: { receiveEpoch: 2 },
              },
              {
                id: "trace-3",
                at: 3,
                scope: "resource",
                type: "skipped",
                label: "factCheck",
                metadata: { reason: "claims unchanged" },
              },
              {
                id: "trace-4",
                at: 4,
                scope: "effect",
                type: "emitted",
                label: "finalResult",
              },
            ]
          : [
              {
                id: "trace-1",
                at: 1,
                scope: "runtime",
                type: "started",
                label: "receive",
              },
              {
                id: "trace-2",
                at: 2,
                scope: "effect",
                type: "emitted",
                label: "finalResult",
              },
            ],
      },
      ...(options.includeExecutionSummary
        ? {
            executionSummary: {
              ...manifest.artifacts.executionSummary!,
              content: {
                schemaVersion: 1,
                summaries: [
                  {
                    receiveEpoch: 2,
                    recomputed: ["styleReview", "rewriteDraft"],
                    reused: ["factCheck"],
                    superseded: ["rewriteDraft"],
                    emitted: ["finalResult"],
                  },
                ],
              },
            },
          }
        : {}),
      comparison: {
        ...manifest.artifacts.comparison!,
        content: { provider: "deterministic-mock", scenarios: [] },
      },
      ...(options.scorecard
        ? {
            scorecard: {
              ...manifest.artifacts.scorecard!,
              content: options.scorecard,
            },
          }
        : {}),
    },
  };
}
