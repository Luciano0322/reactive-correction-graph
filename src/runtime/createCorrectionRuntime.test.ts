import { describe, expect, it } from "vitest";
import {
  createCorrectionRuntime,
  type CorrectionRuntimeModel,
} from "./createCorrectionRuntime.js";

describe("createCorrectionRuntime", () => {
  it("settles a draft into output and records resource trace events", async () => {
    const runtime = createCorrectionRuntime();

    runtime.receive({
      draft: "Signal-kernel can maybe coordinate async correction branches.",
    });
    await runtime.runUntilSettled();

    const output = runtime.emit();
    const trace = runtime.trace();

    expect(output.finalResult?.revisedDraft).toContain("Mock correction notes");
    expect(output.claims?.length).toBeGreaterThan(0);
    expect(trace.some((event) => event.type === "pending")).toBe(true);
    expect(trace.some((event) => event.type === "resolved")).toBe(true);
    expect(trace.some((event) => event.type === "emitted")).toBe(true);
  });

  it("records the baseline trace lifecycle when a draft settles", async () => {
    const runtime = createCorrectionRuntime();

    runtime.receive({
      draft: "Signal-kernel can maybe coordinate async correction branches.",
    });
    await runtime.runUntilSettled();

    const eventTypes = new Set(runtime.trace().map((event) => event.type));

    expect(eventTypes).toContain("changed");
    expect(eventTypes).toContain("stale");
    expect(eventTypes).toContain("pending");
    expect(eventTypes).toContain("resolved");
    expect(eventTypes).toContain("emitted");
  });

  it("settles again after a second receive", async () => {
    const runtime = createCorrectionRuntime();

    runtime.receive({
      draft: "Signal-kernel can maybe coordinate async correction branches.",
    });
    await runtime.runUntilSettled();

    runtime.receive({
      draft: "Signal-kernel can coordinate async correction branches. The second draft should settle too.",
    });
    await runtime.runUntilSettled();

    const output = runtime.emit();
    const trace = runtime.trace();

    const receiveStartedCount = trace.filter(
      (event) =>
        event.scope === "runtime" &&
        event.type === "started" &&
        event.label === "receive",
    ).length;
    const finalResultEmittedCount = trace.filter(
      (event) =>
        event.scope === "effect" &&
        event.type === "emitted" &&
        event.label === "finalResult",
    ).length;

    expect(output.finalResult).toBeDefined();
    expect(receiveStartedCount).toBe(2);
    expect(finalResultEmittedCount).toBe(2);
  });

  it("reruns style review and rewrite without rerunning fact check when only style guide changes", async () => {
    const runtime = createCorrectionRuntime();
    const draft = "Signal-kernel can coordinate async correction branches.";

    runtime.receive({ draft });
    await runtime.runUntilSettled();

    const traceCountBeforeStyleGuideChange = runtime.trace().length;

    runtime.receive({
      draft,
      styleGuide: "Use concise tone.",
    });
    await runtime.runUntilSettled();

    const secondReceiveTrace = runtime
      .trace()
      .slice(traceCountBeforeStyleGuideChange);

    expect(
      secondReceiveTrace.some(
        (event) =>
          event.scope === "resource" &&
          event.type === "pending" &&
          event.label === "styleReview",
      ),
    ).toBe(true);
    expect(
      secondReceiveTrace.some(
        (event) =>
          event.scope === "resource" &&
          event.type === "pending" &&
          event.label === "rewriteDraft",
      ),
    ).toBe(true);
    expect(
      secondReceiveTrace.some(
        (event) =>
          event.scope === "resource" &&
          event.type === "pending" &&
          event.label === "factCheck",
      ),
    ).toBe(false);
    expect(
      secondReceiveTrace.some(
        (event) =>
          event.scope === "resource" &&
          event.type === "stale" &&
          event.label === "factCheck",
      ),
    ).toBe(false);
  });

  it("updates claims, fact check, rewrite, and final result when draft claims change", async () => {
    const runtime = createCorrectionRuntime();

    runtime.receive({
      draft: "Signal-kernel can maybe coordinate async correction branches.",
    });
    await runtime.runUntilSettled();

    const firstOutput = runtime.emit();
    const traceCountBeforeDraftChange = runtime.trace().length;

    runtime.receive({
      draft:
        "Signal-kernel coordinates async correction branches. The updated draft adds a second verifiable claim.",
    });
    await runtime.runUntilSettled();

    const secondOutput = runtime.emit();
    const secondReceiveTrace = runtime.trace().slice(traceCountBeforeDraftChange);

    expect(secondOutput.claims).not.toEqual(firstOutput.claims);
    expect(secondOutput.finalResult).toBeDefined();
    expect(secondOutput.finalResult).not.toEqual(firstOutput.finalResult);
    expect(
      secondReceiveTrace.some(
        (event) =>
          event.scope === "computed" &&
          event.type === "completed" &&
          event.label === "claims",
      ),
    ).toBe(true);
    expect(
      secondReceiveTrace.some(
        (event) =>
          event.scope === "resource" &&
          event.type === "pending" &&
          event.label === "factCheck",
      ),
    ).toBe(true);
    expect(
      secondReceiveTrace.some(
        (event) =>
          event.scope === "resource" &&
          event.type === "pending" &&
          event.label === "rewriteDraft",
      ),
    ).toBe(true);
  });

  it("reruns style review without rerunning fact check when draft style changes but claims stay the same", async () => {
    const runtime = createCorrectionRuntime();

    runtime.receive({
      draft: "# Draft\n\nSignal-kernel coordinates async correction branches.",
    });
    await runtime.runUntilSettled();

    const firstOutput = runtime.emit();
    const traceCountBeforeStyleOnlyChange = runtime.trace().length;

    runtime.receive({
      draft: "# Polished Draft\n\nSignal-kernel coordinates async correction branches.",
    });
    await runtime.runUntilSettled();

    const secondOutput = runtime.emit();
    const secondReceiveTrace = runtime
      .trace()
      .slice(traceCountBeforeStyleOnlyChange);

    expect(secondOutput.claims).toEqual(firstOutput.claims);
    expect(
      secondReceiveTrace.some(
        (event) =>
          event.scope === "resource" &&
          event.type === "pending" &&
          event.label === "styleReview",
      ),
    ).toBe(true);
    expect(
      secondReceiveTrace.some(
        (event) =>
          event.scope === "resource" &&
          event.type === "pending" &&
          event.label === "factCheck",
      ),
    ).toBe(false);
  });

  it("exposes stable output and resource statuses before settling again", async () => {
    const runtime = createCorrectionRuntime();

    runtime.receive({
      draft: "Signal-kernel can maybe coordinate async correction branches.",
    });
    await runtime.runUntilSettled();

    const firstSnapshot = runtime.snapshot();

    runtime.receive({
      draft:
        "Signal-kernel coordinates async correction branches. Snapshot should keep the stable result while rewrite is pending.",
    });

    const pendingSnapshot = runtime.snapshot();

    expect(firstSnapshot.stableFinalResult).toBeDefined();
    expect(pendingSnapshot.stableFinalResult).toEqual(
      firstSnapshot.stableFinalResult,
    );
    expect(pendingSnapshot.statuses.rewriteDraft).toBe("pending");
  });

  it("keeps the previous revised draft readable while a new rewrite is pending", async () => {
    const runtime = createCorrectionRuntime();

    runtime.receive({
      draft: "Signal-kernel can maybe coordinate async correction branches.",
    });
    await runtime.runUntilSettled();

    const firstRevisedDraft = runtime.emit().finalResult?.revisedDraft;

    runtime.receive({
      draft:
        "Signal-kernel coordinates async correction branches. Pending rewrite output should replace the first draft after settling.",
    });

    const pendingSnapshot = runtime.snapshot();

    expect(firstRevisedDraft).toBeDefined();
    expect(pendingSnapshot.statuses.rewriteDraft).toBe("pending");
    expect(pendingSnapshot.stableFinalResult?.revisedDraft).toBe(
      firstRevisedDraft,
    );

    await runtime.runUntilSettled();

    const settledRevisedDraft = runtime.emit().finalResult?.revisedDraft;

    expect(settledRevisedDraft).toBeDefined();
    expect(settledRevisedDraft).not.toBe(firstRevisedDraft);
    expect(settledRevisedDraft).toContain(
      "Pending rewrite output should replace the first draft after settling.",
    );
  });

  it("settles the latest receive when a second draft arrives before the first one finishes", async () => {
    const runtime = createCorrectionRuntime();
    const firstMarker = "FIRST_PENDING_DRAFT_MARKER";
    const secondMarker = "SECOND_LATEST_DRAFT_MARKER";

    runtime.receive({
      draft: `${firstMarker} can maybe coordinate async correction branches.`,
    });
    runtime.receive({
      draft: `${secondMarker} coordinates async correction branches.`,
    });

    await runtime.runUntilSettled();

    const output = runtime.emit();
    const finalResult = output.finalResult;
    const trace = runtime.trace();
    const receiveStartedCount = trace.filter(
      (event) =>
        event.scope === "runtime" &&
        event.type === "started" &&
        event.label === "receive",
    ).length;
    const finalResultEmittedCount = trace.filter(
      (event) =>
        event.scope === "effect" &&
        event.type === "emitted" &&
        event.label === "finalResult",
    ).length;

    expect(finalResult?.revisedDraft).toContain(secondMarker);
    expect(finalResult?.revisedDraft).not.toContain(firstMarker);
    expect(receiveStartedCount).toBe(2);
    expect(finalResultEmittedCount).toBe(1);
  });

  it("rejects clearly and records trace when an async rewrite step fails", async () => {
    const runtime = createCorrectionRuntime({
      model: {
        rewriteDraft: async () => {
          throw new Error("rewriteDraft exploded");
        },
      },
    });

    runtime.receive({
      draft: "Signal-kernel coordinates async correction branches.",
    });

    const startedAt = Date.now();

    await expect(runtime.runUntilSettled()).rejects.toThrow(
      /rewriteDraft.*exploded/,
    );

    const elapsedMs = Date.now() - startedAt;
    const trace = runtime.trace();

    expect(elapsedMs).toBeLessThan(1_000);
    expect(runtime.snapshot().statuses.rewriteDraft).toBe("error");
    expect(
      trace.some(
        (event) =>
          event.scope === "resource" &&
          event.type === "rejected" &&
          event.label === "rewriteDraft",
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

  it("normalizes missing fact-check coverage into unresolved issues", async () => {
    const runtime = createCorrectionRuntime({
      model: {
        factCheckClaims: async (claims) => ({
          items: [
            {
              claimId: claims[0]?.id ?? "claim-1",
              verdict: "supported",
              note: "The provider only checked the first claim.",
            },
          ],
        }),
      },
    });

    runtime.receive({
      draft: [
        "Signal-kernel coordinates async correction branches.",
        "The runtime keeps unrelated style work from rerunning.",
        "The demo should expose incomplete provider output.",
      ].join(" "),
    });
    await runtime.runUntilSettled();

    const output = runtime.emit();
    const claims = output.claims ?? [];
    const factCheckItems = output.factCheckResult?.items ?? [];
    const missingCoverageItems = factCheckItems.filter(
      (item) => item.verdict === "needs-review",
    );

    expect(claims).toHaveLength(3);
    expect(factCheckItems).toHaveLength(claims.length);
    expect(missingCoverageItems?.map((item) => item.claimId)).toEqual([
      "claim-2",
      "claim-3",
    ]);
    expect(
      missingCoverageItems?.every((item) =>
        item.note.includes("Provider did not return a fact-check result"),
      ),
    ).toBe(true);
    expect(output.finalResult?.unresolvedIssues).toEqual(
      expect.arrayContaining(missingCoverageItems.map((item) => item.note)),
    );
  });

  it("uses the configured settle timeout when slow async work is still pending", async () => {
    const runtime = createCorrectionRuntime({
      model: createDelayedCorrectionModel(50),
      settleTimeoutMs: 10,
      settlePollMs: 2,
    });

    runtime.receive({
      draft: "Signal-kernel coordinates async correction branches.",
    });

    await expect(runtime.runUntilSettled()).rejects.toThrow(
      /did not settle before timeout/,
    );
  });

  it("can wait longer for a slow local model provider", async () => {
    const runtime = createCorrectionRuntime({
      model: createDelayedCorrectionModel(50),
      settleTimeoutMs: 2_000,
      settlePollMs: 5,
    });

    runtime.receive({
      draft: "Signal-kernel coordinates async correction branches.",
    });
    await runtime.runUntilSettled();

    expect(runtime.emit().finalResult?.revisedDraft).toContain(
      "Delayed rewrite",
    );
  });
});

function createDelayedCorrectionModel(delayMs: number): CorrectionRuntimeModel {
  return {
    async factCheckClaims(claims) {
      await sleepForTest(delayMs);
      return {
        items: claims.map((claim) => ({
          claimId: claim.id,
          verdict: "supported" as const,
          note: "Delayed fact check completed.",
        })),
      };
    },
    async reviewStyle() {
      await sleepForTest(delayMs);
      return {
        tone: "clear",
        suggestions: ["Delayed style review completed."],
      };
    },
    async rewriteDraft(input) {
      await sleepForTest(delayMs);
      return [
        input.draft,
        "",
        "---",
        "",
        "Delayed rewrite",
        ...input.plan.actions.map((action) => `- ${action}`),
      ].join("\n");
    },
  };
}

function sleepForTest(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
