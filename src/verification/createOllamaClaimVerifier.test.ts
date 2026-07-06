import { describe, expect, it } from "vitest";
import { createOllamaClaimVerifier } from "./createOllamaClaimVerifier.js";

describe("createOllamaClaimVerifier", () => {
  it("adapts one configured Ollama model into a claim verifier", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const verifier = createOllamaClaimVerifier({
      verifierId: "local-facts-a",
      model: "facts-model-a",
      baseUrl: "http://ollama.test/",
      fetch: async (input, init) => {
        requests.push({
          url: String(input),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        });
        return new Response(
          JSON.stringify({
            response: JSON.stringify({
              items: [
                {
                  claimId: "claim-1",
                  verdict: "supported",
                  note: "The local fixture supports this claim.",
                },
              ],
            }),
          }),
          { status: 200 },
        );
      },
    });

    const result = await verifier.verify({
      id: "claim-1",
      text: "Signal-kernel tracks reactive dependencies.",
    });

    expect({
      identity: verifier.identity,
      result,
      request: requests[0],
    }).toEqual({
      identity: {
        verifierId: "local-facts-a",
        provider: "ollama",
        model: "facts-model-a",
      },
      result: {
        verdict: "supported",
        note: "The local fixture supports this claim.",
        evidenceReferences: [],
      },
      request: {
        url: "http://ollama.test/api/generate",
        body: expect.objectContaining({
          model: "facts-model-a",
          stream: false,
          format: "json",
          prompt: expect.stringContaining(
            "Signal-kernel tracks reactive dependencies.",
          ),
        }),
      },
    });
  });
});
