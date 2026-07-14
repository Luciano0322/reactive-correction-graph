import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("LangGraph reference integration documentation", () => {
  it("documents the reference workflow examples and role split", async () => {
    const [readme, article] = await Promise.all([
      readFile("README.md", "utf8"),
      readFile("docs/reactive-correction-graph-zh.md", "utf8"),
    ]);

    expect(readme).toContain("## LangGraph Reference Integration");
    expect(readme).toContain("src/examples/langGraphReferenceWorkflow.ts");
    expect(readme).toContain(
      "src/examples/langGraphPersistentSessionWorkflow.ts",
    );
    expect(readme).toContain(
      "LangGraph owns orchestration and checkpoint policy",
    );
    expect(readme).toContain(
      "signal-kernel owns node-local reactive invalidation and async settling",
    );
    expect(readme).toContain("createCorrectionSession()");
    expect(readme).toContain("createCorrectionGraphSession()");
    expect(readme).toContain("Do not store sessions or runtimes in LangGraph state");
    expect(readme).toContain("module-level hidden state");
    expect(readme).toContain("mock-first");
    expect(readme).toContain("does not require LangSmith");

    expect(article).toContain("## Task 39：LangGraph Reference Integration");
    expect(article).toContain("src/examples/langGraphReferenceWorkflow.ts");
    expect(article).toContain(
      "src/examples/langGraphPersistentSessionWorkflow.ts",
    );
    expect(article).toContain("LangGraph 負責 orchestration 與 checkpoint policy");
    expect(article).toContain(
      "signal-kernel 負責 node-local reactive invalidation 與 async settling",
    );
    expect(article).toContain("createCorrectionSession()");
    expect(article).toContain("createCorrectionGraphSession()");
    expect(article).toContain("不要把 session 或 runtime 存進 LangGraph state");
    expect(article).toContain("不要依賴 module-level hidden state");
    expect(article).toContain("mock-first");
    expect(article).toContain("不需要 LangSmith");
  });
});
