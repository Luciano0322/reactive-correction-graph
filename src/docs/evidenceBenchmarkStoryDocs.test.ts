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

describe("evidence and benchmark story documentation", () => {
  it("states the project value as reducing wasted recomputation inside agent workflow nodes", async () => {
    const readme = await readFile("README.md", "utf8");
    const valueStatement = extractSection(readme, "## Value Statement");

    expect(valueStatement).toContain(
      "Reactive Correction Graph reduces wasted recomputation inside agent workflow nodes.",
    );
    expect(valueStatement).toContain(
      "It makes reuse, invalidation, and emitted results observable through traces, artifacts, and reference tests.",
    );
    expect(valueStatement).toContain(
      "It is not positioned as a LangGraph replacement, LangSmith replacement, or general LLM quality benchmark.",
    );
  });

  it("names evidence categories and maps them to concrete artifact or test sources", async () => {
    const readme = await readFile("README.md", "utf8");
    const evidenceStory = extractSection(readme, "## Evidence And Benchmark Story");

    expect(evidenceStory).toContain(
      "| Evidence category | Artifact or test sources |",
    );
    expect(evidenceStory).toContain(
      "| Recomputation savings | `.output/savings.json`, `.output/comparison.json`, `.output/execution-summary.json` |",
    );
    expect(evidenceStory).toContain(
      "| Session reuse | `.output/trace.json`, `.output/state.json`, `src/examples/langGraphPersistentSessionWorkflow.test.ts` |",
    );
    expect(evidenceStory).toContain(
      "| State safety | `src/examples/langGraphReferenceWorkflow.test.ts`, `src/graph/correctionGraphCheckpoint.test.ts` |",
    );
    expect(evidenceStory).toContain(
      "| Public boundary safety | `src/examples/publicImportGuard.test.ts`, `src/publicSdk.test.ts`, `src/publicSdkPackaging.test.ts` |",
    );
    expect(evidenceStory).toContain(
      "| Report reproducibility | `.output/manifest.json`, `.output/report.html`, `src/report/createEvidenceReportViewModel.test.ts` |",
    );
  });

  it("explains recomputation savings and receive/session reuse from existing comparison artifacts", async () => {
    const readme = await readFile("README.md", "utf8");
    const evidenceStory = extractSection(readme, "## Evidence And Benchmark Story");

    expect(evidenceStory).toContain(
      "Recomputation savings are scoped to the deterministic style-only and claim-changing transitions.",
    );
    expect(evidenceStory).toContain(
      "`comparison.json` compares eager fresh-runtime calls against persistent reactive-session calls.",
    );
    expect(evidenceStory).toContain(
      "`savings.json` reports `avoidedCalls`, `reusedReceives`, and `supersededCalls`.",
    );
    expect(evidenceStory).toContain(
      "`execution-summary.json` groups recomputed, reused, superseded, and emitted work by receive.",
    );
    expect(evidenceStory).toContain(
      "For the style-only update, the persistent reactive session avoids one fact-check call because the settled fact-check result is reused.",
    );
    expect(evidenceStory).toContain(
      "For the claim-changing update, fact-check work runs again, so the demo does not claim fact-check reuse.",
    );
    expect(evidenceStory).toContain(
      "Session reuse is evidenced by receive epochs in `.output/trace.json` and `.output/state.json`.",
    );
    expect(evidenceStory).toContain(
      "`src/examples/langGraphPersistentSessionWorkflow.test.ts` verifies that one workflow session reuses receives while a separate workflow starts isolated.",
    );
  });

  it("explains state safety and public-boundary safety from reference workflow tests", async () => {
    const readme = await readFile("README.md", "utf8");
    const evidenceStory = extractSection(readme, "## Evidence And Benchmark Story");

    expect(evidenceStory).toContain(
      "State safety means LangGraph state remains JSON-compatible workflow facts.",
    );
    expect(evidenceStory).toContain(
      "`src/examples/langGraphReferenceWorkflow.test.ts` round-trips workflow state through JSON and rejects live runtime handles.",
    );
    expect(evidenceStory).toContain(
      "`src/graph/correctionGraphCheckpoint.test.ts` verifies checkpoint restore, second receive behavior, and isolated restored sessions.",
    );
    expect(evidenceStory).toContain(
      "Runtime objects, sessions, signals, promises, subscriptions, and AbortController values stay out of graph state.",
    );
    expect(evidenceStory).toContain(
      "Public boundary safety means reference examples import through `reactive-correction-graph` instead of internal source paths.",
    );
    expect(evidenceStory).toContain(
      "`src/examples/publicImportGuard.test.ts` rejects relative imports, `/src/` imports, and package subpath imports in reference examples.",
    );
    expect(evidenceStory).toContain(
      "`src/publicSdk.test.ts` exercises representative session, graph session, checkpoint, and artifact APIs from the package root.",
    );
    expect(evidenceStory).toContain(
      "`src/publicSdkPackaging.test.ts` keeps the build metadata pointed at `dist/index.js` and `dist/index.d.ts`.",
    );
  });

  it("documents quality boundaries for traces, repeated verification, and local LLM evaluation", async () => {
    const readme = await readFile("README.md", "utf8");
    const evidenceStory = extractSection(readme, "## Evidence And Benchmark Story");

    expect(evidenceStory).toContain(
      "Trace evidence shows which runtime work changed, became stale, ran, resolved, was reused, or emitted.",
    );
    expect(evidenceStory).toContain(
      "Trace evidence does not prove factual correctness, writing quality, provider quality, or semantic usefulness.",
    );
    expect(evidenceStory).toContain(
      "Repeated verification records intentional verification attempts.",
    );
    expect(evidenceStory).toContain(
      "Repeated verification does not prove independent corroboration unless verifier identity, evidence sources, agreement, and disagreement are recorded separately.",
    );
    expect(evidenceStory).toContain(
      "Local LLM evaluation is a manual provider compatibility path.",
    );
    expect(evidenceStory).toContain(
      "Local LLM evaluation does not turn `subjectiveCorrectionQuality: not-evaluated` into a quality score.",
    );
    expect(evidenceStory).toContain(
      "The current demo is not a latency, token, cost, semantic accuracy, provider quality, or production durability benchmark.",
    );
  });

  it("mirrors the evidence and limitation story in the Chinese technical article", async () => {
    const article = await readFile(
      "docs/reactive-correction-graph-zh.md",
      "utf8",
    );
    const task41 = extractSection(
      article,
      "## Task 41：Evidence And Benchmark Story",
    );

    expect(task41).toContain("減少 agent workflow node 裡的重算浪費");
    expect(task41).toContain(
      "讓 reuse、invalidation、emitted results 可以透過 trace、artifact、reference tests 被觀察",
    );
    expect(task41).toContain(
      "不是 LangGraph replacement、LangSmith replacement，也不是 general LLM quality benchmark",
    );

    expect(task41).toContain("| 證據類別 | artifact 或 test source |");
    expect(task41).toContain("Recomputation savings");
    expect(task41).toContain(".output/savings.json");
    expect(task41).toContain(".output/comparison.json");
    expect(task41).toContain(".output/execution-summary.json");
    expect(task41).toContain("Session reuse");
    expect(task41).toContain(".output/trace.json");
    expect(task41).toContain(".output/state.json");
    expect(task41).toContain("src/examples/langGraphPersistentSessionWorkflow.test.ts");
    expect(task41).toContain("State safety");
    expect(task41).toContain("src/examples/langGraphReferenceWorkflow.test.ts");
    expect(task41).toContain("src/graph/correctionGraphCheckpoint.test.ts");
    expect(task41).toContain("Public boundary safety");
    expect(task41).toContain("src/examples/publicImportGuard.test.ts");
    expect(task41).toContain("src/publicSdk.test.ts");
    expect(task41).toContain("src/publicSdkPackaging.test.ts");
    expect(task41).toContain("Report reproducibility");
    expect(task41).toContain(".output/manifest.json");
    expect(task41).toContain(".output/report.html");

    expect(task41).toContain("style-only update");
    expect(task41).toContain("claim-changing update");
    expect(task41).toContain("fact-check reuse");
    expect(task41).toContain("LangGraph state 維持 JSON-compatible workflow facts");
    expect(task41).toContain(
      "runtime objects、sessions、signals、promises、subscriptions、AbortController",
    );
    expect(task41).toContain(
      "reference examples 透過 `reactive-correction-graph` package root",
    );
    expect(task41).toContain("Trace evidence 只能說明 runtime work lifecycle");
    expect(task41).toContain(
      "不能證明 factual correctness、writing quality、provider quality 或 semantic usefulness",
    );
    expect(task41).toContain("Repeated verification");
    expect(task41).toContain("independent corroboration");
    expect(task41).toContain("Local LLM evaluation");
    expect(task41).toContain("`subjectiveCorrectionQuality: not-evaluated`");
    expect(task41).toContain(
      "不是 latency、token、cost、semantic accuracy、provider quality 或 production durability benchmark",
    );
  });
});
