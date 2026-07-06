import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createArtifactBundleManifest,
  serializeArtifactBundleManifest,
} from "../artifacts/artifactBundleManifest.js";
import {
  createRecomputeSavingsReport,
  serializeRecomputeSavingsReport,
} from "../comparison/recomputeSavingsReport.js";
import { runCorrectionComparisonWithArtifacts } from "../comparison/runCorrectionComparison.js";
import {
  projectReceiveExecutionSummary,
  serializeReceiveExecutionSummaryReport,
  type ReceiveExecutionSummaryReport,
} from "../trace/projectReceiveExecutionSummary.js";
import { renderResultMarkdown } from "./renderResultMarkdown.js";

async function main() {
  const { baseline, report, state } =
    await runCorrectionComparisonWithArtifacts();
  const outputDir = resolve(process.cwd(), ".output");

  if (!state.finalResult) {
    throw new Error("Comparison settled without a final result");
  }

  const executionSummaries = {
    "style-only": projectReceiveExecutionSummary(state.trace, 2),
    "claim-changing": projectReceiveExecutionSummary(state.trace, 3),
  };
  const savingsReport = createRecomputeSavingsReport(
    report,
    baseline,
    executionSummaries,
  );
  const executionSummaryReport: ReceiveExecutionSummaryReport = {
    schemaVersion: 1,
    summaries: [
      executionSummaries["style-only"],
      executionSummaries["claim-changing"],
    ],
  };
  const manifest = createArtifactBundleManifest({
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
    },
  });

  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(outputDir, "result.md"),
      renderResultMarkdown(state.finalResult),
      "utf8",
    ),
    writeFile(
      resolve(outputDir, "state.json"),
      `${JSON.stringify(state, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDir, "trace.json"),
      `${JSON.stringify(state.trace, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDir, "comparison.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(outputDir, "savings.json"),
      serializeRecomputeSavingsReport(savingsReport),
      "utf8",
    ),
    writeFile(
      resolve(outputDir, "execution-summary.json"),
      serializeReceiveExecutionSummaryReport(executionSummaryReport),
      "utf8",
    ),
    writeFile(
      resolve(outputDir, "manifest.json"),
      serializeArtifactBundleManifest(manifest),
      "utf8",
    ),
  ]);

  console.log("Observed provider call counts:");
  for (const scenario of report.scenarios) {
    console.log(
      [
        `- ${scenario.scenario}`,
        `factCheck eager=${scenario.eager.factCheckCalls} reactive=${scenario.reactive.factCheckCalls}`,
        `styleReview eager=${scenario.eager.styleReviewCalls} reactive=${scenario.reactive.styleReviewCalls}`,
        `rewriteDraft eager=${scenario.eager.rewriteDraftCalls} reactive=${scenario.reactive.rewriteDraftCalls}`,
      ].join("; "),
    );
  }
  console.log("");
  console.log("Recompute savings by update:");
  for (const scenario of savingsReport.scenarios) {
    console.log(
      [
        `- ${scenario.scenario}`,
        ...scenario.operations.map(
          (operation) =>
            `${operation.operation} avoided=${operation.avoidedCalls} reused=${operation.reusedReceives} superseded=${operation.supersededCalls}`,
        ),
      ].join("; "),
    );
  }
  console.log("");
  console.log(
    "These deterministic fixture counts are not a general performance benchmark.",
  );
  console.log("");
  console.log("Output written to:");
  console.log("- ./.output/result.md");
  console.log("- ./.output/state.json");
  console.log("- ./.output/trace.json");
  console.log("- ./.output/comparison.json");
  console.log("- ./.output/savings.json");
  console.log("- ./.output/execution-summary.json");
  console.log("- ./.output/manifest.json");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
