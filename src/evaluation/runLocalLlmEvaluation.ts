import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createCorrectionGraph } from "../graph/createCorrectionGraph.js";
import { createOllamaCorrectionModel } from "../llm/ollamaCorrectionModel.js";
import type { FetchLike } from "../llm/ollamaCorrectionModel.js";
import type { CorrectionRuntimeInput } from "../schemas/correction.js";
import type { TraceEvent } from "../trace/types.js";
import type {
  EvaluationTrialResult,
  LocalLlmEvaluationReport,
} from "./evaluationReport.js";
import { summarizeEvaluationTrials } from "./evaluationReport.js";

const FIXTURES = [
  { id: "explanatory-demo", path: "src/examples/input.md" },
  { id: "fact-correction", path: "src/examples/fact-correction.md" },
  { id: "style-correction", path: "src/examples/style-correction.md" },
] as const;

export type RunLocalLlmEvaluationOptions = {
  model?: string;
  trials?: number;
  baseUrl?: string;
  fetch?: FetchLike;
  cwd?: string;
};

export async function runLocalLlmEvaluation(
  options: RunLocalLlmEvaluationOptions = {},
): Promise<LocalLlmEvaluationReport> {
  const modelName = options.model ?? process.env.OLLAMA_MODEL ?? "qwen3:4b";
  const model = createOllamaCorrectionModel({
    model: modelName,
    baseUrl: options.baseUrl ?? process.env.OLLAMA_BASE_URL,
    fetch: options.fetch,
  });
  const graph = createCorrectionGraph({
    model,
    settleTimeoutMs: 120_000,
    settlePollMs: 100,
  });
  const trials: EvaluationTrialResult[] = [];

  for (const fixture of FIXTURES) {
    const markdown = await readFile(
      resolve(options.cwd ?? process.cwd(), fixture.path),
      "utf8",
    );
    const input = parseEvaluationInput(markdown);

    for (let trial = 1; trial <= (options.trials ?? 1); trial += 1) {
      const startedAt = Date.now();
      try {
        const state = await graph.invoke(input);

        if (!state.finalResult) {
          throw new Error("Evaluation graph settled without a final result");
        }

        const extractedClaimCount = state.claims?.length ?? 0;
        const coverage = collectCoverageDiagnostics(
          state.trace ?? [],
          extractedClaimCount,
        );

        trials.push({
          fixture: fixture.id,
          model: modelName,
          trial,
          status: "settled",
          durationMs: Date.now() - startedAt,
          extractedClaimCount,
          factCheckCoverageCount: coverage.factCheckCoverageCount,
          normalizedMissingCount: coverage.normalizedMissingCount,
          ignoredUnknownCount: coverage.ignoredUnknownCount,
          unresolvedIssueCount: state.finalResult.unresolvedIssues.length,
          error: null,
        });
      } catch (error) {
        trials.push({
          fixture: fixture.id,
          model: modelName,
          trial,
          status: "rejected",
          durationMs: Date.now() - startedAt,
          extractedClaimCount: 0,
          factCheckCoverageCount: 0,
          normalizedMissingCount: 0,
          ignoredUnknownCount: 0,
          unresolvedIssueCount: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    schemaVersion: 1,
    provider: "ollama",
    summary: summarizeEvaluationTrials(trials),
    trials,
  };
}

function parseEvaluationInput(markdown: string): CorrectionRuntimeInput {
  const frontMatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown);
  if (!frontMatter) return { draft: markdown };

  const metadata = JSON.parse(frontMatter[1] ?? "{}") as Record<string, unknown>;

  return {
    draft: (frontMatter[2] ?? "").trim(),
    userIntent: optionalString(metadata.userIntent),
    styleGuide: optionalString(metadata.styleGuide),
  };
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function collectCoverageDiagnostics(
  trace: TraceEvent[],
  extractedClaimCount: number,
) {
  const normalizedMissingCount = trace.filter(
    (event) =>
      event.scope === "resource" &&
      event.type === "changed" &&
      event.label === "factCheckCoverage",
  ).length;
  const ignoredUnknownCount = trace.filter(
    (event) =>
      event.scope === "resource" &&
      event.type === "skipped" &&
      event.label === "factCheckCoverage",
  ).length;

  return {
    factCheckCoverageCount: Math.max(
      0,
      extractedClaimCount - normalizedMissingCount,
    ),
    normalizedMissingCount,
    ignoredUnknownCount,
  };
}
