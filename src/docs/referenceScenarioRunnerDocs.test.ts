import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const extractSection = (markdown: string, heading: string): string => {
  const start = markdown.indexOf(heading);

  if (start === -1) {
    return "";
  }

  const nextHeading = markdown.indexOf("\n## ", start + heading.length);

  return markdown.slice(start, nextHeading === -1 ? undefined : nextHeading);
};

const expectedOutputPaths = [
  ".output/reference/result.md",
  ".output/reference/state.json",
  ".output/reference/trace.json",
  ".output/reference/execution-summary.json",
  ".output/reference/savings.json",
  ".output/reference/manifest.json",
] as const;

describe("reference scenario runner documentation", () => {
  it("documents the demo:reference command and output paths in README", async () => {
    const readme = await readFile("README.md", "utf8");
    const section = extractSection(readme, "## Reference Scenario Runner");

    expect(section).toContain("pnpm run demo:reference");
    expect(section).toContain(
      "pnpm run demo:reference -- --output-dir ./.output/reference",
    );
    expect(section).toContain("REFERENCE_OUTPUT_DIR");
    expect(section).toContain("./.output/reference");
    expect(section).toContain("deterministic mock");
    expect(section).toContain("does not require Ollama");

    for (const outputPath of expectedOutputPaths) {
      expect(section).toContain(outputPath);
    }
  });

  it("mirrors the demo:reference command and output paths in the Chinese technical article", async () => {
    const article = await readFile(
      "docs/reactive-correction-graph-zh.md",
      "utf8",
    );
    const section = extractSection(
      article,
      "## Task 43：Reference Scenario Runner",
    );

    expect(section).toContain("pnpm run demo:reference");
    expect(section).toContain(
      "pnpm run demo:reference -- --output-dir ./.output/reference",
    );
    expect(section).toContain("REFERENCE_OUTPUT_DIR");
    expect(section).toContain("./.output/reference");
    expect(section).toContain("deterministic mock");
    expect(section).toContain("不需要 Ollama");

    for (const outputPath of expectedOutputPaths) {
      expect(section).toContain(outputPath);
    }
  });
});
