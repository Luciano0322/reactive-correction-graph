import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runCorrectionComparisonWithArtifacts } from "../comparison/runCorrectionComparison.js";
import { renderResultMarkdown } from "./renderResultMarkdown.js";

async function main() {
  const { report, state } = await runCorrectionComparisonWithArtifacts();
  const outputDir = resolve(process.cwd(), ".output");

  if (!state.finalResult) {
    throw new Error("Comparison settled without a final result");
  }

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
  console.log(
    "These deterministic fixture counts are not a general performance benchmark.",
  );
  console.log("");
  console.log("Output written to:");
  console.log("- ./.output/result.md");
  console.log("- ./.output/state.json");
  console.log("- ./.output/trace.json");
  console.log("- ./.output/comparison.json");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
