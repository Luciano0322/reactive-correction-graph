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

const extractTaskSection = (markdown: string, taskLabel: string): string => {
  const start = markdown.indexOf(`## ${taskLabel}`);

  if (start === -1) {
    return "";
  }

  const nextHeading = markdown.indexOf("\n## ", start + taskLabel.length);

  return markdown.slice(start, nextHeading === -1 ? undefined : nextHeading);
};

const requiredTransitionStory = [
  "initial",
  "baseline",
  "style-only",
  "avoided fact-check call",
  "reused: factCheck",
  "recomputed: styleReview, rewriteDraft",
  "claim-changing",
  "recomputed: factCheck, styleReview, rewriteDraft",
  ".output/reference/execution-summary.json",
  ".output/reference/savings.json",
  "does not prove token savings, latency savings, provider quality, or factual correctness",
] as const;

describe("reference scenario transition documentation", () => {
  it("documents the recomputation-savings story in README", async () => {
    const readme = await readFile("README.md", "utf8");
    const section = extractSection(readme, "## Reference Scenario Transitions");

    for (const expected of requiredTransitionStory) {
      expect(section).toContain(expected);
    }
  });

  it("mirrors the recomputation-savings story in the Chinese technical article", async () => {
    const article = await readFile(
      "docs/reactive-correction-graph-zh.md",
      "utf8",
    );
    const section = extractTaskSection(article, "Task 44");

    for (const expected of requiredTransitionStory) {
      expect(section).toContain(expected);
    }
  });
});
