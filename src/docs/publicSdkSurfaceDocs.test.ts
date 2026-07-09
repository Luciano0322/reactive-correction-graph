import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("public SDK surface documentation", () => {
  it("documents the supported import surface, private internals, and non-goals", async () => {
    const [readme, article] = await Promise.all([
      readFile("README.md", "utf8"),
      readFile("docs/reactive-correction-graph-zh.md", "utf8"),
    ]);

    expect(readme).toContain("## Public SDK Surface");
    expect(readme).toContain('from "reactive-correction-graph"');
    expect(readme).toContain("createCorrectionSession");
    expect(readme).toContain("createCorrectionGraphSession");
    expect(readme).toContain("createCorrectionGraphCheckpoint");
    expect(readme).toContain("parseCorrectionGraphCheckpoint");
    expect(readme).toContain("restoreCorrectionSessionFromCheckpoint");
    expect(readme).toContain("createCorrectionSessionArtifactBundle");
    expect(readme).toContain("src/examples/minimalSdkUsage.ts");
    expect(readme).toContain("src/examples/langGraphCheckpointUsage.ts");
    expect(readme).toContain("private reference implementation");
    expect(readme).toContain("not published to npm");
    expect(readme).toContain("Private internals");
    expect(readme).toContain("Non-goals");
    expect(readme).toContain("Do not import from `src/runtime/*`");
    expect(readme).toContain("not a React or Vue adapter");
    expect(readme).toContain("not a production LangGraph checkpointer");
    expect(readme).toContain("not a LangSmith replacement");

    expect(article).toContain("## Task 38：Public SDK Surface");
    expect(article).toContain("這個 repo 目前是 private reference implementation");
    expect(article).toContain("不是現在就要 publish 到 npm");
    expect(article).toContain('from "reactive-correction-graph"');
    expect(article).toContain("createCorrectionSession");
    expect(article).toContain("createCorrectionGraphSession");
    expect(article).toContain("createCorrectionGraphCheckpoint");
    expect(article).toContain("parseCorrectionGraphCheckpoint");
    expect(article).toContain("restoreCorrectionSessionFromCheckpoint");
    expect(article).toContain("createCorrectionSessionArtifactBundle");
    expect(article).toContain("Private internals");
    expect(article).toContain("Non-goals");
    expect(article).toContain("不要從 `src/runtime/*` 匯入");
    expect(article).toContain("不是 React 或 Vue adapter");
    expect(article).toContain("不是 production LangGraph checkpointer");
    expect(article).toContain("不是 LangSmith replacement");
  });
});
