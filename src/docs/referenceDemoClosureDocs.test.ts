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

const referenceArtifacts = [
  ".output/reference/result.md",
  ".output/reference/state.json",
  ".output/reference/trace.json",
  ".output/reference/execution-summary.json",
  ".output/reference/comparison.json",
  ".output/reference/savings.json",
  ".output/reference/scorecard.json",
  ".output/reference/report.html",
  ".output/reference/manifest.json",
] as const;

describe("reference demo closure documentation", () => {
  it("documents the one-command reference evidence path in README", async () => {
    const readme = await readFile("README.md", "utf8");
    const section = extractSection(readme, "## Reference Demo Path");

    expect(section).toContain(
      "One command produces the complete reference evidence bundle.",
    );
    expect(section).toContain("pnpm run demo:reference");

    for (const artifact of referenceArtifacts) {
      expect(section).toContain(artifact);
    }

    expect(section).toContain(
      "`comparison.json` records cumulative eager and reactive operation counts.",
    );
    expect(section).toContain(
      "`savings.json` reports avoided calls only when final results are structurally comparable.",
    );
    expect(section).toContain(
      "`report.html` renders the same bundle as an offline evidence report.",
    );
    expect(section).toContain(
      "The manifest keeps the `demo:reference` source-run identity.",
    );
    expect(section).toContain("subjectiveCorrectionQuality: not-evaluated");
  });

  it("records the same closure path in the Chinese technical article", async () => {
    const article = await readFile(
      "docs/reactive-correction-graph-zh.md",
      "utf8",
    );
    const section = extractSection(
      article,
      "## Task 48：Reference Demo Closure",
    );

    expect(section).toContain("單一指令會產生完整的 reference evidence bundle");
    expect(section).toContain("pnpm run demo:reference");

    for (const artifact of referenceArtifacts) {
      expect(section).toContain(artifact);
    }

    expect(section).toContain(
      "`comparison.json` 記錄 eager 與 reactive 的累積 operation counts",
    );
    expect(section).toContain(
      "`savings.json` 只在 final results structurally comparable 時回報 `avoidedCalls`",
    );
    expect(section).toContain(
      "`report.html` 把同一份 bundle render 成 offline evidence report",
    );
    expect(section).toContain(
      "`manifest.json` 保留 `demo:reference` source-run identity",
    );
    expect(section).toContain("subjectiveCorrectionQuality: not-evaluated");
  });
});
