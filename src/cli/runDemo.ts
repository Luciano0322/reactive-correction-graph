import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCorrectionGraph } from "../graph/createCorrectionGraph.js";
import type {
  CorrectionRuntimeInput,
  CorrectionRuntimeOutput,
} from "../schemas/correction.js";
import { createCorrectionRuntime } from "../runtime/createCorrectionRuntime.js";
import { createTraceCollector } from "../trace/createTraceCollector.js";
import type { TraceEvent } from "../trace/types.js";
import { createCorrectionModelFromEnv } from "../llm/createCorrectionModel.js";
import { renderResultMarkdown } from "./renderResultMarkdown.js";

type DemoState = Partial<CorrectionRuntimeOutput> & {
  trace?: TraceEvent[];
  graphTrace?: TraceEvent[];
};

async function main() {
  const {
    inputPath: requestedInputPath,
    mode,
    provider,
  } = parseArgs(process.argv.slice(2));
  const inputPath =
    requestedInputPath ??
    (mode === "graph" ? "./src/examples/input.md" : undefined);
  const selectedProvider = provider ?? process.env.CORRECTION_MODEL ?? "mock";

  if (!inputPath) {
    console.error(
      "Usage: pnpm demo [--provider mock|ollama] ./src/examples/input.md\n" +
        "   or: pnpm demo:graph [./src/examples/input.md]",
    );
    process.exitCode = 1;
    return;
  }

  const absoluteInputPath = resolve(process.cwd(), inputPath);
  const outputDir = resolve(process.cwd(), ".output");
  const input = parseDemoInput(await readFile(absoluteInputPath, "utf8"));
  const model = createCorrectionModelFromEnv({
    ...process.env,
    ...(provider ? { CORRECTION_MODEL: provider } : {}),
  });

  let state: DemoState;
  let trace: TraceEvent[];

  if (mode === "graph") {
    const graph = createCorrectionGraph({
      model,
      ...settleOptionsForProvider(selectedProvider),
    });
    state = await graph.invoke(input);
    trace = state.trace ?? [];
  } else {
    const traceCollector = createTraceCollector();
    traceCollector.started("cli", "demo", {
      inputPath,
      provider: selectedProvider,
    });

    const runtime = createCorrectionRuntime({
      traceCollector,
      model,
      ...settleOptionsForProvider(selectedProvider),
    });
    runtime.receive(input);
    await runtime.runUntilSettled();

    state = runtime.emit();
    traceCollector.completed("cli", "demo", {
      outputDir: ".output",
    });
    trace = runtime.trace();
  }

  if (!state.finalResult) {
    throw new Error("Demo settled without a final result");
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    resolve(outputDir, "result.md"),
    renderResultMarkdown(state.finalResult),
    "utf8",
  );
  await writeFile(resolve(outputDir, "state.json"), JSON.stringify(state, null, 2), "utf8");
  await writeFile(resolve(outputDir, "trace.json"), JSON.stringify(trace, null, 2), "utf8");

  console.log("Running Reactive Correction Graph...");
  console.log("");
  console.log("Output written to:");
  console.log("- ./.output/result.md");
  console.log("- ./.output/trace.json");
  console.log("- ./.output/state.json");
}

function parseDemoInput(markdown: string): CorrectionRuntimeInput {
  const frontMatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown);
  if (!frontMatter) return { draft: markdown };

  const metadata = JSON.parse(frontMatter[1] ?? "{}") as Record<string, unknown>;

  return {
    draft: (frontMatter[2] ?? "").trim(),
    userIntent: optionalMetadataString(metadata, "userIntent"),
    styleGuide: optionalMetadataString(metadata, "styleGuide"),
  };
}

function optionalMetadataString(
  metadata: Record<string, unknown>,
  key: "userIntent" | "styleGuide",
) {
  const value = metadata[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Demo input metadata ${key} must be a string`);
  }

  return value;
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
  let mode: string | undefined;
  let provider: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--mode") {
      mode = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--provider") {
      provider = args[index + 1];
      index += 1;
      continue;
    }

    positional.push(arg);
  }

  return {
    inputPath: positional[0],
    mode,
    provider,
  };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
