import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadArtifactBundle } from "../artifacts/loadArtifactBundle.js";
import { runReferenceScenario } from "../reference/runReferenceScenario.js";
import { writeReferenceDemoArtifacts } from "./writeReferenceDemoArtifacts.js";

describe("writeReferenceDemoArtifacts", () => {
  it("does not report avoided calls when final results are incomparable", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "rcg-reference-artifacts-"));

    try {
      const run = await runReferenceScenario();
      const styleOnly = run.comparison.scenarios.find(
        (scenario) => scenario.scenario === "style-only",
      );

      if (!styleOnly) {
        throw new Error("Reference comparison must include style-only");
      }

      styleOnly.finalResultsMatch = false;
      await writeReferenceDemoArtifacts(run, outputDir);
      const bundle = await loadArtifactBundle(outputDir);
      const savings = bundle.artifacts.savings?.content as {
        scenarios: Array<{
          scenario: string;
          comparisonStatus: string;
          incomparableReason: string | null;
          operations: Array<{ avoidedCalls: number | null }>;
        }>;
      };
      const styleOnlySavings = savings.scenarios.find(
        (scenario) => scenario.scenario === "style-only",
      );

      expect(styleOnlySavings).toEqual(
        expect.objectContaining({
          comparisonStatus: "incomparable",
          incomparableReason:
            "Eager and reactive final results are not structurally equal",
          operations: expect.arrayContaining([
            expect.objectContaining({ avoidedCalls: null }),
          ]),
        }),
      );
      expect(
        styleOnlySavings?.operations.every(
          (operation) => operation.avoidedCalls === null,
        ),
      ).toBe(true);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("keeps correction quality explicitly unevaluated in the reference artifact bundle", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "rcg-reference-artifacts-"));

    try {
      const run = await runReferenceScenario();
      await writeReferenceDemoArtifacts(run, outputDir);
      const bundle = await loadArtifactBundle(outputDir);

      expect(bundle.artifacts.scorecard).toEqual(
        expect.objectContaining({
          path: "scorecard.json",
          mediaType: "application/json",
          schema: { name: "structural-reliability-scorecard", version: 1 },
          content: expect.objectContaining({
            providerCompatibility: {
              status: "not-evaluated",
              settledTrials: null,
              rejectedTrials: null,
              settlementRate: null,
            },
            executionEfficiency: {
              status: "reported-separately",
              savingsReportSchemaVersion: 1,
              recomputationCalls: 8,
            },
            subjectiveCorrectionQuality: "not-evaluated",
          }),
        }),
      );
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("writes result, state, trace, and manifest artifacts for a reference scenario run", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "rcg-reference-artifacts-"));

    try {
      const run = await runReferenceScenario();
      const manifest = await writeReferenceDemoArtifacts(run, outputDir);
      const bundle = await loadArtifactBundle(outputDir);

      expect({
        returnedCommand: manifest.run.command,
        loadedCommand: bundle.manifest.run.command,
        sourceRunPreserved: bundle.manifest.run,
        mode: bundle.manifest.run.mode,
        provider: bundle.manifest.run.provider,
        result: bundle.artifacts.result,
        state: bundle.artifacts.state,
        trace: bundle.artifacts.trace,
        executionSummary: bundle.artifacts.executionSummary,
        comparison: bundle.artifacts.comparison,
        savings: bundle.artifacts.savings,
        scorecard: bundle.artifacts.scorecard,
        report: bundle.artifacts.report,
      }).toEqual({
        returnedCommand: "demo:reference",
        loadedCommand: "demo:reference",
        sourceRunPreserved: manifest.run,
        mode: "runtime",
        provider: "deterministic-mock",
        result: expect.objectContaining({
          path: "result.md",
          mediaType: "text/markdown",
          schema: null,
          content: expect.stringContaining("## Revised Draft"),
        }),
        state: expect.objectContaining({
          path: "state.json",
          mediaType: "application/json",
          schema: { name: "correction-state", version: 1 },
          content: expect.objectContaining({
            finalResult: expect.objectContaining({
              revisedDraft: expect.stringContaining("Mock correction notes"),
            }),
          }),
        }),
        trace: expect.objectContaining({
          path: "trace.json",
          mediaType: "application/json",
          schema: { name: "trace-events", version: 1 },
          content: expect.arrayContaining([
            expect.objectContaining({
              scope: "effect",
              type: "emitted",
              label: "finalResult",
            }),
          ]),
        }),
        executionSummary: expect.objectContaining({
          path: "execution-summary.json",
          mediaType: "application/json",
          schema: { name: "receive-execution-summaries", version: 1 },
          content: {
            schemaVersion: 1,
            summaries: [
              {
                receiveEpoch: 1,
                recomputed: ["factCheck", "styleReview", "rewriteDraft"],
                reused: [],
                superseded: [],
                emitted: ["finalResult"],
              },
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
                superseded: [],
                emitted: ["finalResult"],
              },
            ],
          },
        }),
        comparison: expect.objectContaining({
          path: "comparison.json",
          mediaType: "application/json",
          schema: { name: "correction-comparison", version: 1 },
          content: run.comparison,
        }),
        savings: expect.objectContaining({
          path: "savings.json",
          mediaType: "application/json",
          schema: { name: "recompute-savings", version: 1 },
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
                  {
                    operation: "styleReview",
                    eagerCalls: 1,
                    reactiveCalls: 1,
                    avoidedCalls: 0,
                    reusedReceives: 0,
                    supersededCalls: 0,
                  },
                  {
                    operation: "rewriteDraft",
                    eagerCalls: 1,
                    reactiveCalls: 1,
                    avoidedCalls: 0,
                    reusedReceives: 0,
                    supersededCalls: 0,
                  },
                ],
              },
              {
                scenario: "claim-changing",
                comparisonStatus: "comparable",
                incomparableReason: null,
                operations: [
                  {
                    operation: "factCheck",
                    eagerCalls: 1,
                    reactiveCalls: 1,
                    avoidedCalls: 0,
                    reusedReceives: 0,
                    supersededCalls: 0,
                  },
                  {
                    operation: "styleReview",
                    eagerCalls: 1,
                    reactiveCalls: 1,
                    avoidedCalls: 0,
                    reusedReceives: 0,
                    supersededCalls: 0,
                  },
                  {
                    operation: "rewriteDraft",
                    eagerCalls: 1,
                    reactiveCalls: 1,
                    avoidedCalls: 0,
                    reusedReceives: 0,
                    supersededCalls: 0,
                  },
                ],
              },
            ],
          },
        }),
        scorecard: expect.objectContaining({
          path: "scorecard.json",
          mediaType: "application/json",
          schema: { name: "structural-reliability-scorecard", version: 1 },
          content: expect.objectContaining({
            subjectiveCorrectionQuality: "not-evaluated",
          }),
        }),
        report: {
          path: "report.html",
          mediaType: "text/html",
          schema: null,
          content: expect.stringContaining(
            "Technical article correction reference scenario",
          ),
        },
      });
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
