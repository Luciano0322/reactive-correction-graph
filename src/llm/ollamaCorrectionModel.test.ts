import { describe, expect, it } from "vitest";
import { createCorrectionModelFromEnv } from "./createCorrectionModel.js";

describe("Ollama structured output contract", () => {
  it("requests schema-constrained style reviews instead of generic JSON generation", async () => {
    const { model, requests } = withOllamaResponse('{"tone":"clear","suggestions":[]}');

    await expect(model.reviewStyle({ draft: "A concise draft." })).resolves.toEqual({
      tone: "clear",
      suggestions: [],
    });
    expect(requests[0]).toMatchObject({
      stream: false,
      options: { temperature: 0 },
      format: {
        type: "object",
        properties: {
          tone: { type: "string", enum: ["clear", "needs-polish"] },
          suggestions: { type: "array", items: { type: "string" } },
        },
        required: ["tone", "suggestions"],
        additionalProperties: false,
      },
    });
  });

  it("requests schema-constrained fact-check items without requiring full claim coverage", async () => {
    const { model, requests } = withOllamaResponse('{"items":[]}');

    await expect(model.factCheckClaims([
      { id: "claim-1", text: "A claim requiring review." },
    ])).resolves.toEqual({ items: [] });
    expect(requests[0]?.format).toEqual({
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
    });
  });

  it.each([
    null,
    [],
    {},
    { suggestions: [] },
    { tone: "clear" },
    { tone: "unknown", suggestions: [] },
    { tone: "clear", suggestions: "Keep it short." },
    { tone: "clear", suggestions: [42] },
    { tone: "clear", suggestions: [], extra: true },
  ].map((response) => ({ response })))("rejects style responses outside the declared schema: $response", async ({ response }) => {
    const { model } = withOllamaResponse(JSON.stringify(response));

    await expect(model.reviewStyle({ draft: "A concise draft." })).rejects.toThrow(
      /Ollama reviewStyle.*invalid response.*fixture-model/,
    );
  });

  it.each([
    null,
    [],
    {},
    { items: "not an array" },
    { items: [null] },
    { items: [{ verdict: "supported", note: "A note." }] },
    { items: [{ claimId: 1, verdict: "supported", note: "A note." }] },
    { items: [{ claimId: "claim-1", verdict: "unknown", note: "A note." }] },
    { items: [{ claimId: "claim-1", verdict: "supported" }] },
    { items: [{ claimId: "claim-1", verdict: "supported", note: 42 }] },
    { items: [{ claimId: "claim-1", verdict: "supported", note: "A note.", extra: true }] },
    { items: [], extra: true },
  ].map((response) => ({ response })))("rejects fact-check responses outside the declared schema: $response", async ({ response }) => {
    const { model } = withOllamaResponse(JSON.stringify(response));

    await expect(model.factCheckClaims([
      { id: "claim-1", text: "A claim requiring review." },
    ])).rejects.toThrow(/Ollama factCheckClaims.*invalid response.*fixture-model/);
  });

  it("preserves a valid needs-polish style review without evaluating its advice", async () => {
    const { model } = withOllamaResponse(
      '{"tone":"needs-polish","suggestions":["Use shorter sentences."]}',
    );

    await expect(model.reviewStyle({ draft: "A verbose draft." })).resolves.toEqual({
      tone: "needs-polish",
      suggestions: ["Use shorter sentences."],
    });
  });

  it("leaves claim coverage decisions to the runtime after validating fact-check structure", async () => {
    const { model } = withOllamaResponse(
      '{"items":[{"claimId":"other-claim","verdict":"needs-review","note":"Requires evidence."}]}',
    );

    await expect(model.factCheckClaims([
      { id: "claim-1", text: "A claim requiring review." },
    ])).resolves.toEqual({
      items: [{ claimId: "other-claim", verdict: "needs-review", note: "Requires evidence." }],
    });
  });

  it("keeps rewrite output as plain markdown without applying a structured-output schema", async () => {
    const markdown = "# Revised draft\n\nPlain markdown, not JSON.\n";
    const { model, requests } = withOllamaResponse(markdown);

    await expect(model.rewriteDraft({
      draft: "An original draft.",
      plan: { actions: ["Make the draft concise."] },
    })).resolves.toBe(markdown);
    expect(requests[0]).not.toHaveProperty("format");
  });
});

function withOllamaResponse(response: string) {
  const requests: Array<Record<string, unknown>> = [];
  const model = createCorrectionModelFromEnv(
    { CORRECTION_MODEL: "ollama", OLLAMA_MODEL: "fixture-model" },
    {
      fetch: async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(JSON.stringify({ response, done: true }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  );
  return { model, requests };
}
