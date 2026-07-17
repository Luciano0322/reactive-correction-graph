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

const requiredReadingGuide = [
  "Application Evidence Report",
  "Read the report from top to bottom by receive.",
  "`Initial baseline`",
  "`Style-only update`",
  "`Claim-changing update`",
  "`Evidence status`",
  "`Reuse decision`",
  "`What this scenario proves`",
  "`What this scenario does not prove`",
  "Missing evidence means the artifact bundle is incomplete; it is not counted as verified reuse.",
  "does not prove factual correctness, provider quality, latency savings, token savings, or production readiness",
] as const;

describe("application evidence report documentation", () => {
  it("documents how to read the application report in README", async () => {
    const readme = await readFile("README.md", "utf8");
    const section = extractSection(readme, "## Application Evidence Report");

    for (const expected of requiredReadingGuide) {
      expect(section).toContain(expected);
    }
  });

  it("mirrors the application report reading guide in the Chinese technical article", async () => {
    const article = await readFile(
      "docs/reactive-correction-graph-zh.md",
      "utf8",
    );
    const section = extractTaskSection(article, "Task 45");

    for (const expected of requiredReadingGuide) {
      expect(section).toContain(expected);
    }
  });
});
