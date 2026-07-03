import { describe, expect, it } from "vitest";
import { parseMultiModelCorroborationConfig } from "./multiModelCorroborationConfig.js";

describe("parseMultiModelCorroborationConfig", () => {
  it("creates an explicit manual Ollama corroboration configuration", () => {
    const config = parseMultiModelCorroborationConfig(
      {
        OLLAMA_CORROBORATION_MODELS: "llama3.2:3b, qwen3:4b, gemma3:4b",
        OLLAMA_BASE_URL: "http://ollama.test",
        CORROBORATION_MINIMUM_MODELS: "3",
      },
      ["Signal-kernel tracks reactive dependencies."],
    );

    expect(config).toEqual({
      claim: {
        id: "claim-1",
        text: "Signal-kernel tracks reactive dependencies.",
      },
      models: ["llama3.2:3b", "qwen3:4b", "gemma3:4b"],
      baseUrl: "http://ollama.test",
      policy: {
        policyVersion: 1,
        minimumIndependentModels: 3,
      },
    });
  });

  it("rejects a manual evaluation without two configured models", () => {
    expect(() =>
      parseMultiModelCorroborationConfig(
        { OLLAMA_CORROBORATION_MODELS: "llama3.2:3b" },
        ["A claim."],
      ),
    ).toThrow(
      "OLLAMA_CORROBORATION_MODELS must contain at least two comma-separated models",
    );
  });

  it("rejects a manual evaluation without a claim", () => {
    expect(() =>
      parseMultiModelCorroborationConfig(
        { OLLAMA_CORROBORATION_MODELS: "llama3.2:3b,qwen3:4b" },
        [],
      ),
    ).toThrow(
      'Usage: pnpm run evaluate:corroboration -- "claim to verify"',
    );
  });

});
