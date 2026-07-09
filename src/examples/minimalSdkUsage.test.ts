import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runMinimalSdkUsageExample } from "./minimalSdkUsage.js";

describe("minimal SDK usage example", () => {
  it("runs through the public package root only", async () => {
    const source = await readFile(
      new URL("./minimalSdkUsage.ts", import.meta.url),
      "utf8",
    );
    const importSpecifiers = Array.from(
      source.matchAll(/from\s+["']([^"']+)["']/g),
      ([, specifier]) => specifier,
    );

    const result = await runMinimalSdkUsageExample();

    expect({
      importSpecifiers,
      artifactRunId: result.artifactRunId,
      revisedDraft: result.revisedDraft,
      summary: result.summary,
      unresolvedIssueCount: result.unresolvedIssueCount,
      traceEventCount: result.traceEventCount,
    }).toEqual({
      importSpecifiers: ["reactive-correction-graph"],
      artifactRunId: "minimal-sdk-example-001",
      revisedDraft: expect.stringContaining("Mock correction notes"),
      summary: [
        "Apply style guide: Use concise technical language.",
        "Respect user intent: Explain the reactive correction flow.",
      ],
      unresolvedIssueCount: 0,
      traceEventCount: expect.any(Number),
    });
    expect(result.traceEventCount).toBeGreaterThan(0);
  });
});
