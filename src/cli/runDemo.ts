import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCorrectionRuntime } from "../runtime/createCorrectionRuntime.js";
import { createTraceCollector } from "../trace/createTraceCollector.js";

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error("Usage: pnpm demo ./src/examples/input.md");
    process.exitCode = 1;
    return;
  }

  const absoluteInputPath = resolve(process.cwd(), inputPath);
  const outputDir = resolve(process.cwd(), ".output");
  const draft = await readFile(absoluteInputPath, "utf8");

  const traceCollector = createTraceCollector();
  traceCollector.started("cli", "demo", {
    inputPath,
  });

  const runtime = createCorrectionRuntime(traceCollector);
  runtime.receive({ draft });
  await runtime.runUntilSettled();

  const state = runtime.emit();

  if (!state.finalResult) {
    throw new Error("Runtime settled without a final result");
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, "result.md"), renderResultMarkdown(state), "utf8");
  await writeFile(resolve(outputDir, "state.json"), JSON.stringify(state, null, 2), "utf8");

  traceCollector.completed("cli", "demo", {
    outputDir: ".output",
  });

  const trace = runtime.trace();
  await writeFile(resolve(outputDir, "trace.json"), JSON.stringify(trace, null, 2), "utf8");

  console.log("Running Reactive Correction Graph...");
  console.log("");
  console.log("Output written to:");
  console.log("- ./.output/result.md");
  console.log("- ./.output/trace.json");
  console.log("- ./.output/state.json");
}

function renderResultMarkdown(state: ReturnType<ReturnType<typeof createCorrectionRuntime>["emit"]>) {
  const result = state.finalResult;
  if (!result) return "# Reactive Correction Result\n\nNo final result emitted.\n";

  const summary = result.summary.map((item) => `- ${item}`).join("\n");
  const unresolved =
    result.unresolvedIssues.length > 0
      ? result.unresolvedIssues.map((item) => `- ${item}`).join("\n")
      : "- None";

  return [
    "# Reactive Correction Result",
    "",
    "## Revised Draft",
    "",
    result.revisedDraft,
    "",
    "## Correction Summary",
    "",
    summary,
    "",
    "## Unresolved Issues",
    "",
    unresolved,
    "",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
