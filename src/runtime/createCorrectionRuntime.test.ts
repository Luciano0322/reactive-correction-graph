import { describe, expect, it } from "vitest";
import { createCorrectionRuntime } from "./createCorrectionRuntime.js";

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
});
