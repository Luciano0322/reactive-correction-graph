import { describe, expect, it } from "vitest";
import type { CorrectionPlan } from "../schemas/correction.js";
import { createCorrectionRuntime } from "../runtime/createCorrectionRuntime.js";
import { createCorrectionModelFromEnv } from "./createCorrectionModel.js";
import { createOllamaCorrectionModel } from "./ollamaCorrectionModel.js";

describe("createCorrectionModelFromEnv", () => {
  it("uses the deterministic mock correction model by default", async () => {
    const model = createCorrectionModelFromEnv({});
    const plan: CorrectionPlan = {
      actions: ["Keep the mock provider deterministic."],
    };

    const rewritten = await model.rewriteDraft(
      {
        draft: "Signal-kernel can maybe coordinate async correction branches.",
        plan,
      },
    );

    expect(rewritten).toContain("Mock correction notes");
  });

  it("can run the correction runtime with an Ollama-backed model and injected fetch", async () => {
    const { fetch, requests } = createFakeOllamaFetch();
    const model = createCorrectionModelFromEnv(
      {
        CORRECTION_MODEL: "ollama",
        OLLAMA_BASE_URL: "http://ollama.local",
        OLLAMA_MODEL: "qwen3:4b",
      },
      { fetch },
    );
    const runtime = createCorrectionRuntime({ model });

    runtime.receive({
      draft: "Signal-kernel can maybe coordinate async correction branches.",
    });
    await runtime.runUntilSettled();

    const output = runtime.emit();

    expect(output.finalResult?.revisedDraft).toContain(
      "Ollama rewrite draft",
    );
    expect(requests.map((request) => request.task).sort()).toEqual([
      "factCheckClaims",
      "reviewStyle",
      "rewriteDraft",
    ]);
    expect(
      requests.every(
        (request) =>
          request.url === "http://ollama.local/api/generate" &&
          request.model === "qwen3:4b" &&
          request.stream === false,
      ),
    ).toBe(true);
  });

  it("reports a clear provider error when Ollama returns an empty response", async () => {
    const model = createOllamaCorrectionModel({
      model: "qwen3:4b",
      fetch: async () =>
        new Response(JSON.stringify({ response: "", done: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
    });

    await expect(
      model.factCheckClaims([
        {
          id: "claim-1",
          text: "Signal-kernel coordinates async correction branches.",
        },
      ]),
    ).rejects.toThrow(/Ollama factCheckClaims.*empty response.*qwen3:4b/);
  });

  it("rejects through the runtime trace when Ollama returns invalid JSON", async () => {
    const model = createOllamaCorrectionModel({
      model: "qwen3:4b",
      fetch: createInvalidFactCheckJsonFetch(),
    });
    const runtime = createCorrectionRuntime({ model });

    runtime.receive({
      draft: "Signal-kernel coordinates async correction branches.",
    });

    await expect(runtime.runUntilSettled()).rejects.toThrow(
      /factCheck.*invalid JSON.*qwen3:4b/,
    );

    const trace = runtime.trace();

    expect(
      trace.some(
        (event) =>
          event.scope === "resource" &&
          event.type === "rejected" &&
          event.label === "factCheck",
      ),
    ).toBe(true);
    expect(
      trace.some(
        (event) =>
          event.scope === "effect" &&
          event.type === "emitted" &&
          event.label === "finalResult",
      ),
    ).toBe(false);
  });
});

type FakeOllamaRequest = {
  url: string;
  model: string;
  stream: boolean;
  task: "factCheckClaims" | "reviewStyle" | "rewriteDraft";
};

function createFakeOllamaFetch() {
  const requests: FakeOllamaRequest[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      prompt: string;
      stream: boolean;
    };
    const task = inferTask(body.prompt);

    requests.push({
      url: String(input),
      model: body.model,
      stream: body.stream,
      task,
    });

    return new Response(
      JSON.stringify({
        response: responseForTask(task),
        done: true,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  };

  return { fetch, requests };
}

function createInvalidFactCheckJsonFetch(): typeof globalThis.fetch {
  return async (input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      prompt: string;
    };
    const task = inferTask(body.prompt);

    return new Response(
      JSON.stringify({
        response: invalidJsonResponseForTask(task),
        done: true,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  };
}

function inferTask(prompt: string): FakeOllamaRequest["task"] {
  if (prompt.includes("Task: factCheckClaims")) return "factCheckClaims";
  if (prompt.includes("Task: reviewStyle")) return "reviewStyle";
  if (prompt.includes("Task: rewriteDraft")) return "rewriteDraft";

  throw new Error(`Unexpected Ollama prompt: ${prompt}`);
}

function responseForTask(task: FakeOllamaRequest["task"]) {
  if (task === "factCheckClaims") {
    return JSON.stringify({
      items: [
        {
          claimId: "claim-1",
          verdict: "needs-review",
          note: "Ollama local verifier flagged this claim for review.",
        },
      ],
    });
  }

  if (task === "reviewStyle") {
    return JSON.stringify({
      tone: "clear",
      suggestions: ["Ollama local style reviewer suggests concise wording."],
    });
  }

  return [
    "Ollama rewrite draft",
    "",
    "---",
    "",
    "Local correction notes:",
    "- Review claim claim-1: Ollama local verifier flagged this claim for review.",
  ].join("\n");
}

function invalidJsonResponseForTask(task: FakeOllamaRequest["task"]) {
  if (task === "factCheckClaims") return "{not valid json";
  return responseForTask(task);
}
