import { describe, expect, it } from "vitest";
import {
  createCorrectionRuntime,
  type CorrectionRuntimeModel,
} from "../runtime/createCorrectionRuntime.js";
import {
  projectReceiveExecutionSummary,
  serializeReceiveExecutionSummary,
  type ReceiveExecutionSummary,
} from "./projectReceiveExecutionSummary.js";

describe("projectReceiveExecutionSummary", () => {
  it("projects recomputed and emitted operations for one receive", async () => {
    const runtime = createCorrectionRuntime();

    runtime.receive({
      draft: "Signal-kernel coordinates async correction branches.",
    });
    await runtime.runUntilSettled();

    const trace = runtime.trace();
    const originalTrace = structuredClone(trace);

    expect(projectReceiveExecutionSummary(trace, 1)).toEqual({
      receiveEpoch: 1,
      recomputed: ["factCheck", "styleReview", "rewriteDraft"],
      reused: [],
      superseded: [],
      emitted: ["finalResult"],
    });
    expect(trace).toEqual(originalTrace);
  });

  it("reports fact check reuse for a style-only receive", async () => {
    const runtime = createCorrectionRuntime();
    const draft = "Signal-kernel coordinates async correction branches.";

    runtime.receive({ draft });
    await runtime.runUntilSettled();

    runtime.receive({
      draft,
      styleGuide: "Use concise technical language.",
    });
    await runtime.runUntilSettled();

    expect(projectReceiveExecutionSummary(runtime.trace(), 2)).toEqual({
      receiveEpoch: 2,
      recomputed: ["styleReview", "rewriteDraft"],
      reused: ["factCheck"],
      superseded: [],
      emitted: ["finalResult"],
    });
  });

  it("reports renewed fact-check work when claims change", async () => {
    const runtime = createCorrectionRuntime();

    runtime.receive({
      draft: "Signal-kernel coordinates async correction branches.",
    });
    await runtime.runUntilSettled();

    runtime.receive({
      draft: [
        "Signal-kernel coordinates async correction branches.",
        "The updated draft adds another claim that requires verification.",
      ].join(" "),
    });
    await runtime.runUntilSettled();

    expect(projectReceiveExecutionSummary(runtime.trace(), 2)).toEqual({
      receiveEpoch: 2,
      recomputed: ["factCheck", "styleReview", "rewriteDraft"],
      reused: [],
      superseded: [],
      emitted: ["finalResult"],
    });
  });

  it("distinguishes superseded async work from completed work", async () => {
    const runtime = createCorrectionRuntime({
      model: createSupersedableCorrectionModel(),
    });

    runtime.receive({
      draft: "FIRST_PENDING_DRAFT requires verification.",
    });
    await flushPendingResources();

    runtime.receive({
      draft: "SECOND_LATEST_DRAFT replaces the pending claim.",
    });
    await runtime.runUntilSettled();

    expect(projectReceiveExecutionSummary(runtime.trace(), 2)).toEqual({
      receiveEpoch: 2,
      recomputed: ["factCheck", "styleReview", "rewriteDraft"],
      reused: [],
      superseded: ["factCheck", "styleReview"],
      emitted: ["finalResult"],
    });
  });

  it("serializes a receive summary as inspectable JSON", () => {
    const summary: ReceiveExecutionSummary = {
      receiveEpoch: 2,
      recomputed: ["styleReview", "rewriteDraft"],
      reused: ["factCheck"],
      superseded: [],
      emitted: ["finalResult"],
    };

    const serialized = serializeReceiveExecutionSummary(summary);

    expect({
      parsed: JSON.parse(serialized),
      endsWithNewline: serialized.endsWith("\n"),
    }).toEqual({
      parsed: summary,
      endsWithNewline: true,
    });
  });
});

function createSupersedableCorrectionModel(): CorrectionRuntimeModel {
  let factCheckAttempt = 0;
  let styleReviewAttempt = 0;

  return {
    async factCheckClaims(claims, signal) {
      factCheckAttempt += 1;
      if (factCheckAttempt === 1) await waitForAbort(signal);

      return {
        items: claims.map((claim) => ({
          claimId: claim.id,
          verdict: "supported" as const,
          note: "The latest claim was checked.",
        })),
      };
    },
    async reviewStyle(_input, signal) {
      styleReviewAttempt += 1;
      if (styleReviewAttempt === 1) await waitForAbort(signal);

      return {
        tone: "clear",
        suggestions: [],
      };
    },
    async rewriteDraft(input) {
      return input.draft;
    },
  };
}

function waitForAbort(signal?: AbortSignal) {
  if (signal?.aborted) return Promise.resolve();

  return new Promise<void>((resolve) => {
    signal?.addEventListener("abort", () => resolve(), { once: true });
  });
}

async function flushPendingResources() {
  await Promise.resolve();
  await Promise.resolve();
}
