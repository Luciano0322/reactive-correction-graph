import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("runtime observability documentation", () => {
  it("explains how live events relate to trace artifacts and bundles", async () => {
    const [readme, article] = await Promise.all([
      readFile("README.md", "utf8"),
      readFile("docs/reactive-correction-graph-zh.md", "utf8"),
    ]);

    expect(readme).toContain("## Live Events, Trace, And Artifacts");
    expect(readme).toContain("GET /api/sessions/:id/events");
    expect(readme).toContain("LiveTraceEvent");
    expect(readme).toContain("same TraceEvent payload");
    expect(readme).toContain("trace.json");
    expect(readme).toContain("manifest.json");
    expect(readme).toContain("does not enter the artifact bundle");

    expect(article).toContain("## Task 34：Live runtime event stream");
    expect(article).toContain("GET /api/sessions/:id/events");
    expect(article).toContain("LiveTraceEvent");
    expect(article).toContain("同一份 TraceEvent");
    expect(article).toContain("trace.json");
    expect(article).toContain("manifest.json");
    expect(article).toContain("不是新的 truth source");
  });
});
