import type { CorrectionRuntimeModel } from "../runtime/createCorrectionRuntime.js";
import { createMockCorrectionModel } from "./mockCorrectionModel.js";
import {
  createOllamaCorrectionModel,
  type FetchLike,
} from "./ollamaCorrectionModel.js";

export type CorrectionModelProvider = "mock" | "ollama";

export type CorrectionModelEnv = {
  CORRECTION_MODEL?: string;
  OLLAMA_BASE_URL?: string;
  OLLAMA_MODEL?: string;
};

export type CreateCorrectionModelOptions = {
  fetch?: FetchLike;
};

export function createCorrectionModelFromEnv(
  env: CorrectionModelEnv = process.env,
  options: CreateCorrectionModelOptions = {},
): CorrectionRuntimeModel {
  const provider = normalizeProvider(env.CORRECTION_MODEL);

  if (provider === "mock") {
    return createMockCorrectionModel();
  }

  return createOllamaCorrectionModel({
    baseUrl: env.OLLAMA_BASE_URL,
    model: env.OLLAMA_MODEL ?? "qwen3:4b",
    fetch: options.fetch,
  });
}

function normalizeProvider(value: string | undefined): CorrectionModelProvider {
  if (!value || value === "mock") return "mock";
  if (value === "ollama") return "ollama";

  throw new Error(`Unsupported CORRECTION_MODEL: ${value}`);
}
