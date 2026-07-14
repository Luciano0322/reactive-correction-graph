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

describe("reference scenario definition documentation", () => {
  it("documents the reference scenario purpose in README", async () => {
    const readme = await readFile("README.md", "utf8");
    const section = extractSection(readme, "## Reference Scenario Definition");

    expect(section).toContain("technical article correction");
    expect(section).toContain("reference application scenario");
    expect(section).toContain("not a production app");
    expect(section).toContain("style-only update");
    expect(section).toContain("claim-changing update");
    expect(section).toContain("reuse fact-check work");
    expect(section).toContain("recompute fact-check work");
    expect(section).toContain("src/examples/reference-article.md");
    expect(section).toContain("src/examples/reference-style-guide.md");
    expect(section).toContain("src/examples/reference-scenario.json");
  });

  it("mirrors the reference scenario purpose in the Chinese technical article", async () => {
    const article = await readFile(
      "docs/reactive-correction-graph-zh.md",
      "utf8",
    );
    const section = extractSection(
      article,
      "## Task 42：Reference Scenario Definition",
    );

    expect(section).toContain("technical article correction");
    expect(section).toContain("reference application scenario");
    expect(section).toContain("不是 production app");
    expect(section).toContain("style-only update");
    expect(section).toContain("claim-changing update");
    expect(section).toContain("reuse fact-check work");
    expect(section).toContain("recompute fact-check work");
    expect(section).toContain("src/examples/reference-article.md");
    expect(section).toContain("src/examples/reference-style-guide.md");
    expect(section).toContain("src/examples/reference-scenario.json");
  });
});
