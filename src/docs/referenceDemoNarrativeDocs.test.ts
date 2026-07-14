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

describe("reference demo narrative documentation", () => {
  it("requires README to include a guided local demo path", async () => {
    const readme = await readFile("README.md", "utf8");

    expect(readme).toContain("## Guided Local Demo Path");
    expect(readme).toContain("local-first");
    expect(readme).toContain("mock-first");
    expect(readme).toContain("does not require Ollama");
    expect(readme).toContain("does not require LangSmith");
    expect(readme).toContain("does not require a database");
    expect(readme).toContain("does not require an API key");

    expect(readme).toContain("pnpm install --frozen-lockfile");
    expect(readme).toContain("pnpm typecheck");
    expect(readme).toContain("pnpm test");
    expect(readme).toContain("pnpm run demo:compare");
    expect(readme).toContain("pnpm run demo:report");

    expect(readme).toContain(".output/result.md");
    expect(readme).toContain(".output/state.json");
    expect(readme).toContain(".output/trace.json");
    expect(readme).toContain(".output/manifest.json");
    expect(readme).toContain(".output/report.html");
  });

  it("connects the guided demo path to public SDK and LangGraph reference examples", async () => {
    const readme = await readFile("README.md", "utf8");
    const guidedPath = extractSection(readme, "## Guided Local Demo Path");

    expect(guidedPath).toContain("public SDK examples");
    expect(guidedPath).toContain(
      "[src/examples/minimalSdkUsage.ts](./src/examples/minimalSdkUsage.ts)",
    );
    expect(guidedPath).toContain("LangGraph reference examples");
    expect(guidedPath).toContain(
      "[src/examples/langGraphReferenceWorkflow.ts](./src/examples/langGraphReferenceWorkflow.ts)",
    );
    expect(guidedPath).toContain(
      "[src/examples/langGraphPersistentSessionWorkflow.ts](./src/examples/langGraphPersistentSessionWorkflow.ts)",
    );
  });

  it("documents what each guided artifact proves and does not prove", async () => {
    const readme = await readFile("README.md", "utf8");
    const guidedPath = extractSection(readme, "## Guided Local Demo Path");

    expect(guidedPath).toContain(
      "| Artifact | What it proves | What it does not prove |",
    );
    expect(guidedPath).toContain(
      "| `.output/result.md` | A representative correction result was serialized | Factual correctness or writing quality |",
    );
    expect(guidedPath).toContain(
      "| `.output/state.json` | The final settled runtime state was captured | Production persistence or checkpoint durability |",
    );
    expect(guidedPath).toContain(
      "| `.output/trace.json` | Runtime lifecycle events were recorded for one completed run | Latency, concurrency, or production scalability |",
    );
    expect(guidedPath).toContain(
      "| `.output/manifest.json` | Compatible serialized artifacts can be indexed as a bundle | That every optional artifact is always present |",
    );
    expect(guidedPath).toContain(
      "| `.output/report.html` | The bundle can render an offline evidence report | General LLM quality or semantic benchmark accuracy |",
    );
  });

  it("mirrors the guided demo narrative in the Chinese technical article", async () => {
    const article = await readFile(
      "docs/reactive-correction-graph-zh.md",
      "utf8",
    );
    const task40 = extractSection(article, "## Task 40：Reference Demo Narrative");

    expect(task40).toContain("local-first");
    expect(task40).toContain("mock-first");
    expect(task40).toContain("不需要 Ollama");
    expect(task40).toContain("不需要 LangSmith");
    expect(task40).toContain("不需要資料庫");
    expect(task40).toContain("不需要 API key");

    expect(task40).toContain("pnpm install --frozen-lockfile");
    expect(task40).toContain("pnpm typecheck");
    expect(task40).toContain("pnpm test");
    expect(task40).toContain("pnpm run demo:compare");
    expect(task40).toContain("pnpm run demo:report");

    expect(task40).toContain("| Artifact | 能證明 | 不能證明 |");
    expect(task40).toContain(
      "| `.output/result.md` | correction result 被序列化 | factual correctness 或 writing quality |",
    );
    expect(task40).toContain(
      "| `.output/state.json` | settled runtime state 被保存 | production persistence 或 checkpoint durability |",
    );
    expect(task40).toContain(
      "| `.output/trace.json` | runtime lifecycle events 被記錄 | latency、concurrency 或 production scalability |",
    );
    expect(task40).toContain(
      "| `.output/manifest.json` | serialized artifacts 可以被 bundle index 管理 | 每個 optional artifact 永遠存在 |",
    );
    expect(task40).toContain(
      "| `.output/report.html` | bundle 可以產生 offline evidence report | general LLM quality 或 semantic benchmark accuracy |",
    );

    expect(task40).toContain("src/examples/minimalSdkUsage.ts");
    expect(task40).toContain("src/examples/langGraphReferenceWorkflow.ts");
    expect(task40).toContain(
      "src/examples/langGraphPersistentSessionWorkflow.ts",
    );
  });

  it("keeps the guided demo path local-first and mock-first by default", async () => {
    const readme = await readFile("README.md", "utf8");
    const guidedPath = extractSection(readme, "## Guided Local Demo Path");
    const article = await readFile(
      "docs/reactive-correction-graph-zh.md",
      "utf8",
    );
    const task40 = extractSection(article, "## Task 40：Reference Demo Narrative");

    expect(guidedPath).toContain(
      "The default guided path uses deterministic mock behavior only.",
    );
    expect(guidedPath).toContain(
      "Optional integrations stay outside this guided path.",
    );
    expect(task40).toContain(
      "預設 guided path 只使用 deterministic mock provider",
    );
    expect(task40).toContain("optional integrations 不屬於這條預設路徑");

    for (const section of [guidedPath, task40]) {
      expect(section).not.toContain("pnpm run demo:ollama");
      expect(section).not.toContain("pnpm run evaluate:ollama");
      expect(section).not.toContain("OLLAMA_MODEL=");
      expect(section).not.toContain("LANGSMITH_API_KEY");
      expect(section).not.toContain("OPENAI_API_KEY");
    }
  });
});
