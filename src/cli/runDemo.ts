import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCorrectionRuntime } from "../runtime/createCorrectionRuntime.js";
import { createTraceCollector } from "../trace/createTraceCollector.js";
import { createCorrectionModelFromEnv } from "../llm/createCorrectionModel.js";

async function main() {
  const { inputPath, provider } = parseArgs(process.argv.slice(2));
  const selectedProvider = provider ?? process.env.CORRECTION_MODEL ?? "mock";

  if (!inputPath) {
    console.error("Usage: pnpm demo [--provider mock|ollama] ./src/examples/input.md");
    process.exitCode = 1;
    return;
  }

  const absoluteInputPath = resolve(process.cwd(), inputPath);
  const outputDir = resolve(process.cwd(), ".output");
  const draft = await readFile(absoluteInputPath, "utf8");

  const traceCollector = createTraceCollector();
  traceCollector.started("cli", "demo", {
    inputPath,
    provider: selectedProvider,
  });

  const model = createCorrectionModelFromEnv({
    ...process.env,
    ...(provider ? { CORRECTION_MODEL: provider } : {}),
  });
  const runtime = createCorrectionRuntime({
    traceCollector,
    model,
    ...settleOptionsForProvider(selectedProvider),
  });
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

function settleOptionsForProvider(provider: string) {
  if (provider !== "ollama") return {};

  return {
    settleTimeoutMs: parsePositiveInteger(
      process.env.CORRECTION_SETTLE_TIMEOUT_MS,
      120_000,
    ),
    settlePollMs: parsePositiveInteger(process.env.CORRECTION_SETTLE_POLL_MS, 100),
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;

  return Math.trunc(parsed);
}

function parseArgs(args: string[]) {
  let provider: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--provider") {
      provider = args[index + 1];
      index += 1;
      continue;
    }

    positional.push(arg);
  }

  return {
    inputPath: positional[0],
    provider,
  };
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
