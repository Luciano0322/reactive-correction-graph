import { describe, expect, it } from "vitest";
import { runLocalLlmEvaluation } from "./runLocalLlmEvaluation.js";

describe("runLocalLlmEvaluation", () => {
  it("runs every fixed fixture through the Ollama-backed graph for each trial", async () => {
    const report = await runLocalLlmEvaluation({
      model: "evaluation-model",
      trials: 2,
      fetch: createFakeOllamaFetch(),
    });

    expect({
      schemaVersion: report.schemaVersion,
      provider: report.provider,
      trials: report.trials.map((trial) => ({
        fixture: trial.fixture,
        model: trial.model,
        trial: trial.trial,
        status: trial.status,
        hasClaims: trial.extractedClaimCount > 0,
        hasFullCoverage:
          trial.factCheckCoverageCount === trial.extractedClaimCount,
        error: trial.error,
      })),
    }).toEqual({
      schemaVersion: 1,
      provider: "ollama",
      trials: [
        settledTrial("explanatory-demo", 1),
        settledTrial("explanatory-demo", 2),
        settledTrial("fact-correction", 1),
        settledTrial("fact-correction", 2),
        settledTrial("style-correction", 1),
        settledTrial("style-correction", 2),
      ],
    });
    expect(report.trials.every((trial) => trial.durationMs >= 0)).toBe(true);
  });

  it("records a rejected trial and continues when the Ollama graph fails", async () => {
    const report = await runLocalLlmEvaluation({
      model: "unavailable-model",
      fetch: async () => {
        throw new Error("Ollama is unavailable");
      },
    });

    expect(
      report.trials.map((trial) => ({
        fixture: trial.fixture,
        status: trial.status,
        error: trial.error,
      })),
    ).toEqual([
      rejectedTrial("explanatory-demo"),
      rejectedTrial("fact-correction"),
      rejectedTrial("style-correction"),
    ]);
  });

  it("derives provider coverage diagnostics from the runtime trace", async () => {
    const report = await runLocalLlmEvaluation({
      model: "incomplete-coverage-model",
      fetch: createIncompleteCoverageOllamaFetch(),
    });
    const trial = report.trials.find(
      (item) => item.fixture === "explanatory-demo",
    );

    expect(trial).toMatchObject({
      status: "settled",
      extractedClaimCount: 3,
      factCheckCoverageCount: 1,
      normalizedMissingCount: 2,
      ignoredUnknownCount: 1,
      unresolvedIssueCount: 2,
    });
  });

  it("includes a structural summary with an explicit quality boundary", async () => {
    const report = await runLocalLlmEvaluation({
      model: "summary-model",
      fetch: createFakeOllamaFetch(),
    });

    expect(report.summary).toEqual({
      totalTrials: 3,
      settledTrials: 3,
      rejectedTrials: 0,
      fullCoverageTrials: 3,
      trialsWithNormalizedMissing: 0,
      trialsWithIgnoredUnknown: 0,
      subjectiveCorrectionQuality: "not-evaluated",
    });
  });
});

function settledTrial(fixture: string, trial: number) {
  return {
    fixture,
    model: "evaluation-model",
    trial,
    status: "settled",
    hasClaims: true,
    hasFullCoverage: true,
    error: null,
  };
}

function rejectedTrial(fixture: string) {
  return {
    fixture,
    status: "rejected",
    error: expect.stringContaining("Ollama is unavailable"),
  };
}

function createFakeOllamaFetch(): typeof globalThis.fetch {
  return async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { prompt: string };

    return new Response(
      JSON.stringify({
        response: responseForPrompt(body.prompt),
        done: true,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };
}

function createIncompleteCoverageOllamaFetch(): typeof globalThis.fetch {
  return async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { prompt: string };
    let response = responseForPrompt(body.prompt);

    if (body.prompt.includes("Task: factCheckClaims")) {
      const claims = JSON.parse(
        body.prompt.split("Claims:\n")[1] ?? "[]",
      ) as Array<{ id: string }>;
      response = JSON.stringify({
        items: [
          {
            claimId: claims[0]?.id ?? "claim-1",
            verdict: "supported",
            note: "The provider covered only the first claim.",
          },
          {
            claimId: "claim-999",
            verdict: "needs-review",
            note: "This result does not belong to an extracted claim.",
          },
        ],
      });
    }

    return new Response(JSON.stringify({ response, done: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

function responseForPrompt(prompt: string) {
  if (prompt.includes("Task: factCheckClaims")) {
    const claims = JSON.parse(prompt.split("Claims:\n")[1] ?? "[]") as Array<{
      id: string;
    }>;

    return JSON.stringify({
      items: claims.map((claim) => ({
        claimId: claim.id,
        verdict: "supported",
        note: "Evaluation verifier covered this claim.",
      })),
    });
  }

  if (prompt.includes("Task: reviewStyle")) {
    return JSON.stringify({ tone: "clear", suggestions: [] });
  }

  if (prompt.includes("Task: rewriteDraft")) {
    return "Evaluation rewrite completed.";
  }

  throw new Error(`Unexpected Ollama prompt: ${prompt}`);
}
