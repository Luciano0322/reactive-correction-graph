import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runReferenceScenario } from "../reference/runReferenceScenario.js";
import { writeReferenceDemoArtifacts } from "./writeReferenceDemoArtifacts.js";

async function main() {
  const { outputDir, scenarioBaseUrl } = parseArgs(process.argv.slice(2));
  const run = await runReferenceScenario({ scenarioBaseUrl });

  await writeReferenceDemoArtifacts(run, outputDir);

  console.log("Running Reactive Correction Graph reference scenario...");
  console.log("");
  console.log("Output written to:");
  console.log(`- ${outputDir}`);
}

function parseArgs(args: string[]) {
  let outputDir = process.env.REFERENCE_OUTPUT_DIR ?? "./.output/reference";
  let scenarioDir = process.env.REFERENCE_SCENARIO_DIR;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--output-dir") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--output-dir requires a path");
      }
      outputDir = value;
      index += 1;
      continue;
    }

    if (arg === "--scenario-dir") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--scenario-dir requires a path");
      }
      scenarioDir = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown demo:reference option: ${arg}`);
  }

  return {
    outputDir: resolve(process.cwd(), outputDir),
    scenarioBaseUrl: scenarioDir ? toDirectoryUrl(scenarioDir) : undefined,
  };
}

function toDirectoryUrl(directory: string) {
  const url = pathToFileURL(resolve(process.cwd(), directory));

  return new URL(url.href.endsWith("/") ? url.href : `${url.href}/`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
