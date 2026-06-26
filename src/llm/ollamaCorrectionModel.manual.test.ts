import { describe, expect, it } from "vitest";
import { createCorrectionRuntime } from "../runtime/createCorrectionRuntime.js";
import { createCorrectionModelFromEnv } from "./createCorrectionModel.js";

const runIfOllamaModelConfigured = process.env.OLLAMA_MODEL ? it : it.skip;

describe("Ollama correction model manual smoke test", () => {
  runIfOllamaModelConfigured(
    "runs the correction runtime against a local Ollama model when OLLAMA_MODEL is set",
    async () => {
      const model = createCorrectionModelFromEnv({
        CORRECTION_MODEL: "ollama",
        OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
        OLLAMA_MODEL: process.env.OLLAMA_MODEL,
      });
      const runtime = createCorrectionRuntime({
        model,
        settleTimeoutMs: 120_000,
        settlePollMs: 100,
      });

      runtime.receive({
        draft: "Signal-kernel can maybe coordinate async correction branches.",
      });
      await runtime.runUntilSettled();

      expect(runtime.emit().finalResult?.revisedDraft).toBeDefined();
    },
    120_000,
  );
});
