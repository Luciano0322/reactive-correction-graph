import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createArtifactBundleManifest,
  serializeArtifactBundleManifest,
  type ArtifactBundleManifest,
} from "../artifacts/artifactBundleManifest.js";
import { loadArtifactBundle } from "../artifacts/loadArtifactBundle.js";
import {
  createRecomputeSavingsReport,
  serializeRecomputeSavingsReport,
  type RecomputeSavingsExecutionSummaries,
} from "../comparison/recomputeSavingsReport.js";
import {
  createStructuralReliabilityScorecard,
  serializeStructuralReliabilityScorecard,
} from "../evaluation/structuralReliabilityScorecard.js";
import type { ReferenceScenarioRun } from "../reference/runReferenceScenario.js";
import { createEvidenceReportViewModel } from "../report/createEvidenceReportViewModel.js";
import { renderEvidenceReportHtml } from "../report/renderEvidenceReportHtml.js";
import {
  projectReceiveExecutionSummary,
  serializeReceiveExecutionSummaryReport,
  type ReceiveExecutionSummaryReport,
} from "../trace/projectReceiveExecutionSummary.js";
import { renderResultMarkdown } from "./renderResultMarkdown.js";

export async function writeReferenceDemoArtifacts(
  run: ReferenceScenarioRun,
  outputDir: string,
): Promise<ArtifactBundleManifest> {
  const executionSummaryReport: ReceiveExecutionSummaryReport = {
    schemaVersion: 1,
    summaries: run.receives.map((receive) =>
      projectReceiveExecutionSummary(run.trace, receive.receiveEpoch),
    ),
  };
  const executionSummaries = Object.fromEntries(
    run.receives
      .filter((receive) => receive.transition.id !== "initial")
      .map((receive) => [
        receive.transition.id,
        projectReceiveExecutionSummary(run.trace, receive.receiveEpoch),
      ]),
  ) as RecomputeSavingsExecutionSummaries;
  const savingsReport = createRecomputeSavingsReport(
    run.comparison,
    run.comparisonBaseline,
    executionSummaries,
  );
  const scorecard = createStructuralReliabilityScorecard({
    policyVersion: 1,
    runtimeSettlement: {
      settledRuns: run.receives.length,
      rejectedRuns: 0,
    },
    providerCompatibility: null,
    claimCoverage: null,
    unknownIdContainment: null,
    contractEvidence: {
      staleResultProtection: "not-evaluated",
      finalResultIntegrity: "not-evaluated",
      sessionIsolation: "not-evaluated",
    },
    executionEfficiency: {
      savingsReportSchemaVersion: 1,
      recomputationCalls: executionSummaryReport.summaries.reduce(
        (total, summary) => total + summary.recomputed.length,
        0,
      ),
    },
  });
  const sourceManifest = createArtifactBundleManifest({
    command: "demo:reference",
    mode: "runtime",
    provider: run.provider,
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
      scorecard: {
        path: "scorecard.json",
        mediaType: "application/json",
        schema: { name: "structural-reliability-scorecard", version: 1 },
      },
    },
  });

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(outputDir, "result.md"),
      renderResultMarkdown(run.state.finalResult),
      "utf8",
    ),
    writeFile(
      resolve(outputDir, "state.json"),
      `${JSON.stringify(run.state, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDir, "trace.json"),
      `${JSON.stringify(run.trace, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDir, "execution-summary.json"),
      serializeReceiveExecutionSummaryReport(executionSummaryReport),
      "utf8",
    ),
    writeFile(
      resolve(outputDir, "comparison.json"),
      `${JSON.stringify(run.comparison, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDir, "savings.json"),
      serializeRecomputeSavingsReport(savingsReport),
      "utf8",
    ),
    writeFile(
      resolve(outputDir, "scorecard.json"),
      serializeStructuralReliabilityScorecard(scorecard),
      "utf8",
    ),
    writeFile(
      resolve(outputDir, "manifest.json"),
      serializeArtifactBundleManifest(sourceManifest),
      "utf8",
    ),
  ]);

  const sourceBundle = await loadArtifactBundle(outputDir);
  const reportHtml = renderEvidenceReportHtml(
    createEvidenceReportViewModel(sourceBundle),
  );
  const manifest: ArtifactBundleManifest = {
    ...sourceManifest,
    artifacts: {
      ...sourceManifest.artifacts,
      report: {
        path: "report.html",
        mediaType: "text/html",
        schema: null,
      },
    },
  };

  await Promise.all([
    writeFile(resolve(outputDir, "report.html"), reportHtml, "utf8"),
    writeFile(
      resolve(outputDir, "manifest.json"),
      serializeArtifactBundleManifest(manifest),
      "utf8",
    ),
  ]);

  return manifest;
}
