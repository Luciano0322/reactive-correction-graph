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

const extractSubsection = (markdown: string, heading: string): string => {
  const start = markdown.indexOf(heading);

  if (start === -1) {
    return "";
  }

  const nextHeading = markdown.indexOf("\n### ", start + heading.length);

  return markdown.slice(start, nextHeading === -1 ? undefined : nextHeading);
};

const requiredGuardrails = [
  "unsupported benchmark and replacement claims",
  "factual correctness benchmark",
  "general LLM quality benchmark",
  "latency or cost benchmark",
  "LangGraph replacement",
  "LangSmith replacement",
  "framework-specific web adapter requirement",
  "production durability guarantee",
  "application-level recomputation and traceability demo",
] as const;

const finalPositioningRequirements = [
  "pnpm run demo:reference",
  "deterministic",
  "mock-first",
  "pnpm run evaluate:ollama",
  "opt-in provider compatibility",
  "scorecard.json",
  "subjectiveCorrectionQuality: not-evaluated",
  "reactive-correction-graph",
  "package root",
  "application-level selective recomputation",
  "traceability",
  "integration boundaries",
  "model quality",
  "production readiness",
] as const;

describe("reference demo guardrail documentation", () => {
  it("documents unsupported benchmark and replacement claims in README", async () => {
    const readme = await readFile("README.md", "utf8");
    const section = extractSection(readme, "## Reference Demo Guardrails");

    for (const guardrail of requiredGuardrails) {
      expect(section).toContain(guardrail);
    }
  });

  it("mirrors unsupported benchmark and replacement guardrails in the Chinese article", async () => {
    const article = await readFile(
      "docs/reactive-correction-graph-zh.md",
      "utf8",
    );
    const section = extractTaskSection(article, "Task 47");

    for (const guardrail of requiredGuardrails) {
      expect(section).toContain(guardrail);
    }
  });

  it("keeps Ollama evaluation opt-in and separate from the reference demo path", async () => {
    const [readme, article, localLlmGuide, packageJson] = await Promise.all([
      readFile("README.md", "utf8"),
      readFile("docs/reactive-correction-graph-zh.md", "utf8"),
      readFile("docs/local-llm-provider.md", "utf8"),
      readFile("package.json", "utf8"),
    ]);
    const readmeSection = extractSection(readme, "## Reference Demo Guardrails");
    const articleSection = extractTaskSection(article, "Task 47");
    const scripts = JSON.parse(packageJson) as {
      scripts: Record<string, string>;
    };

    for (const section of [readmeSection, articleSection]) {
      expect(section).toContain(
        "Ollama/manual evaluation remains opt-in and documented separately.",
      );
      expect(section).toContain("docs/local-llm-provider.md");
    }

    expect(localLlmGuide).toContain("pnpm run evaluate:ollama");
    expect(scripts.scripts["demo:reference"]).not.toContain("ollama");
    expect(scripts.scripts["evaluate:ollama"]).toContain("runEvaluation.ts");
  });

  it("summarizes the final reference demo positioning in both documents", async () => {
    const [readme, article] = await Promise.all([
      readFile("README.md", "utf8"),
      readFile("docs/reactive-correction-graph-zh.md", "utf8"),
    ]);
    const summaries = [
      extractSubsection(
        extractSection(readme, "## Reference Demo Guardrails"),
        "### Final positioning summary",
      ),
      extractSubsection(
        extractTaskSection(article, "Task 47"),
        "### Final positioning summary",
      ),
    ];

    for (const summary of summaries) {
      for (const requirement of finalPositioningRequirements) {
        expect(summary).toContain(requirement);
      }
    }
  });
});
