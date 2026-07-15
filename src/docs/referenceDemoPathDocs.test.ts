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

const expectedReferenceArtifacts = [
  ".output/reference/result.md",
  ".output/reference/state.json",
  ".output/reference/trace.json",
  ".output/reference/execution-summary.json",
  ".output/reference/savings.json",
  ".output/reference/manifest.json",
] as const;

describe("reference demo path documentation", () => {
  it("gives README readers a direct reference demo command", async () => {
    const readme = await readFile("README.md", "utf8");
    const section = extractSection(readme, "## Reference Demo Path");

    expect(section).toContain("Reference Demo Path");
    expect(section).toContain("pnpm run demo:reference");
  });

  it("lists the reference demo artifacts to inspect", async () => {
    const readme = await readFile("README.md", "utf8");
    const section = extractSection(readme, "## Reference Demo Path");

    expect(section).toContain("Inspect these artifacts");

    for (const artifactPath of expectedReferenceArtifacts) {
      expect(section).toContain(artifactPath);
    }
  });

  it("mirrors the reference demo path in the Chinese technical article", async () => {
    const article = await readFile(
      "docs/reactive-correction-graph-zh.md",
      "utf8",
    );
    const section = extractTaskSection(article, "Task 46");

    expect(section).toContain("Reference Demo Path");
    expect(section).toContain("pnpm run demo:reference");
    expect(section).toContain("Inspect these artifacts");

    for (const artifactPath of expectedReferenceArtifacts) {
      expect(section).toContain(artifactPath);
    }
  });

  it("documents optional Ollama evaluation as provider compatibility only", async () => {
    const readme = await readFile("README.md", "utf8");
    const readmeSection = extractSection(readme, "## Reference Demo Path");
    const article = await readFile(
      "docs/reactive-correction-graph-zh.md",
      "utf8",
    );
    const articleSection = extractTaskSection(article, "Task 46");

    for (const section of [readmeSection, articleSection]) {
      expect(section).toContain(
        "Optional Ollama evaluation is a provider compatibility check, not a quality proof.",
      );
      expect(section).toContain("pnpm run evaluate:ollama");
      expect(section).toContain("docs/local-llm-provider.md");
    }
  });

  it("guards the reference demo against product and production benchmark claims", async () => {
    const readme = await readFile("README.md", "utf8");
    const readmeSection = extractSection(readme, "## Reference Demo Path");
    const article = await readFile(
      "docs/reactive-correction-graph-zh.md",
      "utf8",
    );
    const articleSection = extractTaskSection(article, "Task 46");

    for (const section of [readmeSection, articleSection]) {
      expect(section).toContain(
        "This reference demo is not a complete product or production benchmark.",
      );
      expect(section).toContain(
        "It does not prove production readiness, latency, cost, token savings, provider quality, or factual correctness.",
      );
    }
  });

  it("connects CLI, SDK, LangGraph, report, and reference scenario boundaries", async () => {
    const readme = await readFile("README.md", "utf8");
    const readmeSection = extractSection(readme, "## Reference Demo Path");
    const article = await readFile(
      "docs/reactive-correction-graph-zh.md",
      "utf8",
    );
    const articleSection = extractTaskSection(article, "Task 46");

    for (const section of [readmeSection, articleSection]) {
      expect(section).toContain("Final demo narrative");
      expect(section).toContain(
        "`pnpm run demo:reference` is the CLI entry point.",
      );
      expect(section).toContain("`src/index.ts` is the public SDK boundary.");
      expect(section).toContain(
        "`src/examples/langGraphReferenceWorkflow.ts` shows the LangGraph orchestration boundary.",
      );
      expect(section).toContain(
        "The application evidence report explains the saved runtime evidence.",
      );
      expect(section).toContain(
        "`src/examples/reference-scenario.json` defines the reference scenario.",
      );
    }
  });
});
