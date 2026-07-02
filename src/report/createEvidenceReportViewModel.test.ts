import { describe, expect, it } from "vitest";
import { createArtifactBundleManifest } from "../artifacts/artifactBundleManifest.js";
import type { LoadedArtifactBundle } from "../artifacts/loadArtifactBundle.js";
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
      scenarios: [
        {
          key: "style-only",
          label: "Style-only update",
          comparisonStatus: "comparable",
          outputsMatch: true,
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
});

function comparisonBundle(): LoadedArtifactBundle {
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
        savings: {
          path: "savings.json",
          mediaType: "application/json",
          schema: { name: "recompute-savings", version: 1 },
        },
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
    },
  };
}
