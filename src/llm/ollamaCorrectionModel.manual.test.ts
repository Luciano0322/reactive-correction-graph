import { describe, expect, it } from "vitest";
import { createCorrectionGraph } from "../graph/createCorrectionGraph.js";
import { createCorrectionRuntime } from "../runtime/createCorrectionRuntime.js";
import { createCorrectionModelFromEnv } from "./createCorrectionModel.js";

const runIfOllamaModelConfigured = process.env.OLLAMA_MODEL ? it : it.skip;
const timeoutMs = process.env.OLLAMA_MODEL && process.env.OLLAMA_SMOKE_TIMEOUT_MS !== undefined
  ? Number(process.env.OLLAMA_SMOKE_TIMEOUT_MS)
  : 120_000;
const testTimeoutMs = timeoutMs + 30_000;
if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || testTimeoutMs > 2_147_483_647) {
  throw new Error("OLLAMA_SMOKE_TIMEOUT_MS must be a positive integer within the Node timer range");
}
const stages = ["factCheck", "styleReview", "rewriteDraft"] as const;

describe("LangGraph + Ollama manual smoke test", () => {
  runIfOllamaModelConfigured(
    "runs the correction graph against a local Ollama model when OLLAMA_MODEL is set",
    async () => {
      const model = createCorrectionModelFromEnv({
        CORRECTION_MODEL: "ollama",
        OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
        OLLAMA_MODEL: process.env.OLLAMA_MODEL,
      });
      const runtime = createCorrectionRuntime({
        model,
        settleTimeoutMs: timeoutMs,
      });
      const graph = createCorrectionGraph({ runtime });
      const startedAt = performance.now();
      const stageStartedAt = new Map<string, number>();
      const report = (event: string, details: Record<string, unknown> = {}) => {
        console.log(
          `[ollama-smoke] ${JSON.stringify({
            event,
            elapsedMs: Math.round(performance.now() - startedAt),
            ...details,
          })}`,
        );
      };
      const unsubscribe = runtime.subscribe(({ event }) => {
        if (event.scope !== "resource") return;
        if (!stages.some((stage) => stage === event.label)) return;
        const now = performance.now();
        if (event.type === "pending") {
          stageStartedAt.set(event.label, now);
          report("stage-started", { stage: event.label });
        } else if (event.type === "resolved" || event.type === "rejected") {
          const stageStart = stageStartedAt.get(event.label);
          report(event.type === "resolved" ? "stage-completed" : "stage-failed", {
            stage: event.label,
            stageElapsedMs: stageStart === undefined ? undefined : Math.round(now - stageStart),
          });
        }
      });

      try {
        report("run-started", { timeoutMs, testTimeoutMs });
        const state = await graph.invoke({
          draft: "Signal-kernel can maybe coordinate async correction branches.",
        });

        expect(state.finalResult?.revisedDraft).toBeDefined();
        expect(state.graphTrace).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              scope: "graph",
              type: "completed",
              label: "finalize",
            }),
          ]),
        );
        expect(state.trace).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              scope: "effect",
              type: "emitted",
              label: "finalResult",
            }),
          ]),
        );
        report("run-completed");
      } catch (error) {
        const { statuses } = runtime.snapshot();
        const now = performance.now();
        report("run-failed", {
          statuses,
          pendingStages: stages.flatMap((stage) => {
            const stageStart = stageStartedAt.get(stage);
            return statuses[stage] === "pending" && stageStart !== undefined
              ? [{ stage, stageElapsedMs: Math.round(now - stageStart) }]
              : [];
          }),
          notStartedStages: stages.filter((stage) =>
            statuses[stage] === "pending" && !stageStartedAt.has(stage)),
        });
        throw error;
      } finally {
        unsubscribe();
      }
    },
    testTimeoutMs,
  );
});
