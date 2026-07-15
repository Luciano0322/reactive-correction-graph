import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createArtifactBundleManifest,
  serializeArtifactBundleManifest,
  type ArtifactBundleManifest,
} from "../artifacts/artifactBundleManifest.js";
import {
  serializeRecomputeSavingsReport,
  type RecomputeSavingsReport,
} from "../comparison/recomputeSavingsReport.js";
import type { ReferenceScenarioRun } from "../reference/runReferenceScenario.js";
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
    summaries: [projectReceiveExecutionSummary(run.trace, 1)],
  };
  const savingsReport: RecomputeSavingsReport = {
    schemaVersion: 1,
    provider: run.provider,
    scenarios: [],
  };
  const manifest = createArtifactBundleManifest({
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
      savings: {
        path: "savings.json",
        mediaType: "application/json",
        schema: { name: "recompute-savings", version: 1 },
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
      resolve(outputDir, "savings.json"),
      serializeRecomputeSavingsReport(savingsReport),
      "utf8",
    ),
    writeFile(
      resolve(outputDir, "manifest.json"),
      serializeArtifactBundleManifest(manifest),
      "utf8",
    ),
  ]);

  return manifest;
}
