import type {
  Claim,
  CorrectionPlan,
  FactCheckResult,
  StyleReviewResult,
} from "../schemas/correction.js";
import type { CorrectionRuntimeModel } from "../runtime/createCorrectionRuntime.js";

export type FetchLike = typeof globalThis.fetch;

export type OllamaCorrectionModelOptions = {
  baseUrl?: string;
  model: string;
  fetch?: FetchLike;
};

type OllamaGenerateResponse = {
  response?: unknown;
};

const factCheckSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claimId: { type: "string" },
          verdict: { type: "string", enum: ["supported", "needs-review"] },
          note: { type: "string" },
        },
        required: ["claimId", "verdict", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const styleReviewSchema = {
  type: "object",
  properties: {
    tone: { type: "string", enum: ["clear", "needs-polish"] },
    suggestions: { type: "array", items: { type: "string" } },
  },
  required: ["tone", "suggestions"],
  additionalProperties: false,
};

export function createOllamaCorrectionModel(
  options: OllamaCorrectionModelOptions,
): CorrectionRuntimeModel {
  const baseUrl = trimTrailingSlash(options.baseUrl ?? "http://localhost:11434");
  const fetchFn = options.fetch ?? globalThis.fetch;

  if (!options.model) {
    throw new Error("OLLAMA_MODEL is required when CORRECTION_MODEL=ollama");
  }

  return {
    async factCheckClaims(claims, signal) {
      const response = await generateJson({
        baseUrl,
        fetchFn,
        model: options.model,
        task: "factCheckClaims",
        prompt: factCheckPrompt(claims),
        format: factCheckSchema,
        signal,
      });

      if (!isFactCheckResult(response)) {
        throw new Error(
          `Ollama factCheckClaims returned an invalid response for model ${options.model}: expected the fact-check schema`,
        );
      }
      return response;
    },
    async reviewStyle(input, signal) {
      const response = await generateJson({
        baseUrl,
        fetchFn,
        model: options.model,
        task: "reviewStyle",
        prompt: styleReviewPrompt(input),
        format: styleReviewSchema,
        signal,
      });

      if (!isStyleReviewResult(response)) {
        throw new Error(
          `Ollama reviewStyle returned an invalid response for model ${options.model}: expected the style-review schema`,
        );
      }
      return response;
    },
    async rewriteDraft(input, signal) {
      return generateText({
        baseUrl,
        fetchFn,
        model: options.model,
        task: "rewriteDraft",
        prompt: rewritePrompt(input),
        signal,
      });
    },
  };
}

async function generateJson(input: {
  baseUrl: string;
  fetchFn: FetchLike;
  model: string;
  task: string;
  prompt: string;
  signal?: AbortSignal;
  format: Record<string, unknown>;
}): Promise<unknown> {
  const text = await generateText({
    ...input,
    format: input.format,
  });

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(
      `Ollama ${input.task} returned an empty response for model ${input.model}`,
    );
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    throw new Error(
      `Ollama ${input.task} returned invalid JSON for model ${input.model}: ${previewText(trimmed)}`,
      { cause: error },
    );
  }
}

async function generateText(input: {
  baseUrl: string;
  fetchFn: FetchLike;
  model: string;
  task: string;
  prompt: string;
  signal?: AbortSignal;
  format?: Record<string, unknown>;
}) {
  const response = await input.fetchFn(`${input.baseUrl}/api/generate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      stream: false,
      ...(input.format ? { format: input.format } : {}),
      options: {
        temperature: 0,
      },
    }),
    signal: input.signal,
  });

  if (!response.ok) {
    throw new Error(`Ollama generate failed with HTTP ${response.status}`);
  }

  const body = (await response.json()) as OllamaGenerateResponse;
  if (typeof body.response !== "string") {
    throw new Error("Ollama generate response did not include text");
  }

  return body.response;
}

function previewText(text: string) {
  return text.length <= 160 ? text : `${text.slice(0, 157)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStyleReviewResult(value: unknown): value is StyleReviewResult {
  return isRecord(value)
    && Object.keys(value).every((key) => key === "tone" || key === "suggestions")
    && (value.tone === "clear" || value.tone === "needs-polish")
    && Array.isArray(value.suggestions)
    && value.suggestions.every((suggestion) => typeof suggestion === "string");
}

function isFactCheckResult(value: unknown): value is FactCheckResult {
  return isRecord(value)
    && Object.keys(value).every((key) => key === "items")
    && Array.isArray(value.items)
    && value.items.every((item: unknown) =>
      isRecord(item)
      && Object.keys(item).every((key) => ["claimId", "verdict", "note"].includes(key))
      && typeof item.claimId === "string"
      && (item.verdict === "supported" || item.verdict === "needs-review")
      && typeof item.note === "string");
}

function factCheckPrompt(claims: Claim[]) {
  return [
    "Task: factCheckClaims",
    "Respond in JSON using this shape:",
    "{\"items\":[{\"claimId\":\"claim-1\",\"verdict\":\"supported\",\"note\":\"short note\"}]}",
    "Allowed verdict values are supported or needs-review.",
    "",
    "Claims:",
    JSON.stringify(claims, null, 2),
  ].join("\n");
}

function styleReviewPrompt(input: { draft: string; styleGuide?: string }) {
  return [
    "Task: reviewStyle",
    "Respond in JSON using this shape:",
    "{\"tone\":\"clear\",\"suggestions\":[\"short suggestion\"]}",
    "Allowed tone values are clear or needs-polish.",
    "",
    `Style guide: ${input.styleGuide ?? "none"}`,
    "",
    "Draft:",
    input.draft,
  ].join("\n");
}

function rewritePrompt(input: { draft: string; plan: CorrectionPlan }) {
  return [
    "Task: rewriteDraft",
    "Rewrite the draft using the correction plan.",
    "Return only the revised markdown draft.",
    "",
    "Correction plan:",
    JSON.stringify(input.plan, null, 2),
    "",
    "Draft:",
    input.draft,
  ].join("\n");
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
