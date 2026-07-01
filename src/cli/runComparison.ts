import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runCorrectionComparison } from "../comparison/runCorrectionComparison.js";

async function main() {
  const report = await runCorrectionComparison();
  const outputDir = resolve(process.cwd(), ".output");

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    resolve(outputDir, "comparison.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

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
  console.log("Comparison written to ./.output/comparison.json");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
