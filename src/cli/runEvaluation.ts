import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serializeEvaluationReport } from "../evaluation/evaluationReport.js";
import { runLocalLlmEvaluation } from "../evaluation/runLocalLlmEvaluation.js";

async function main() {
  const outputDir = resolve(process.cwd(), ".output");
  const report = await runLocalLlmEvaluation({
    trials: parsePositiveInteger(process.env.EVALUATION_TRIALS, 1),
  });

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    resolve(outputDir, "evaluation.json"),
    serializeEvaluationReport(report),
    "utf8",
  );

  console.log("Local LLM evaluation completed.");
  console.log("");
  console.log("Output written to:");
  console.log("- ./.output/evaluation.json");
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;

  return parsed;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
