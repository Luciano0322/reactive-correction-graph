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
});
