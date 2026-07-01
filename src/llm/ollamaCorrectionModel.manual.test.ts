import { describe, expect, it } from "vitest";
import { createCorrectionGraph } from "../graph/createCorrectionGraph.js";
import { createCorrectionModelFromEnv } from "./createCorrectionModel.js";

const runIfOllamaModelConfigured = process.env.OLLAMA_MODEL ? it : it.skip;

describe("LangGraph + Ollama manual smoke test", () => {
  runIfOllamaModelConfigured(
    "runs the correction graph against a local Ollama model when OLLAMA_MODEL is set",
    async () => {
      const model = createCorrectionModelFromEnv({
        CORRECTION_MODEL: "ollama",
        OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
        OLLAMA_MODEL: process.env.OLLAMA_MODEL,
      });
      const graph = createCorrectionGraph({
        model,
        settleTimeoutMs: 120_000,
        settlePollMs: 100,
      });

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
    },
    120_000,
  );
});
