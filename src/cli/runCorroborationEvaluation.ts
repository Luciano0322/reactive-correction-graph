import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseMultiModelCorroborationConfig } from "../evaluation/multiModelCorroborationConfig.js";
import {
  runMultiModelCorroborationEvaluation,
  serializeMultiModelCorroborationEvaluationReport,
} from "../evaluation/runMultiModelCorroborationEvaluation.js";
import { createOllamaClaimVerifier } from "../verification/createOllamaClaimVerifier.js";

async function main() {
  const config = parseMultiModelCorroborationConfig(
    process.env,
    process.argv.slice(2),
  );
  const verifiers = config.models.map((model, index) =>
    createOllamaClaimVerifier({
      verifierId: `ollama-${index + 1}:${model}`,
      model,
      baseUrl: config.baseUrl,
    }),
  ) as [
    ReturnType<typeof createOllamaClaimVerifier>,
    ReturnType<typeof createOllamaClaimVerifier>,
    ...Array<ReturnType<typeof createOllamaClaimVerifier>>,
  ];
  const report = await runMultiModelCorroborationEvaluation({
    claim: config.claim,
    verifiers,
    policy: config.policy,
  });
  const outputDir = resolve(process.cwd(), ".output");

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    resolve(outputDir, "corroboration.json"),
    serializeMultiModelCorroborationEvaluationReport(report),
    "utf8",
  );

  console.log("Multi-model corroboration evaluation completed.");
  console.log(`Outcome: ${report.result.outcome}`);
  console.log("");
  console.log("Output written to:");
  console.log("- ./.output/corroboration.json");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
