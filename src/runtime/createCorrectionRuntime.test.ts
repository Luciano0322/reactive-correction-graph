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
});
