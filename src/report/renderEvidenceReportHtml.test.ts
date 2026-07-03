import { describe, expect, it } from "vitest";
import type { EvidenceReportViewModel } from "./createEvidenceReportViewModel.js";
import { renderEvidenceReportHtml } from "./renderEvidenceReportHtml.js";

describe("renderEvidenceReportHtml", () => {
  it("renders a deterministic comparison as semantic, readable HTML", () => {
    const html = renderEvidenceReportHtml(comparisonViewModel());
    const visibleText = extractVisibleText(html);

    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toMatch(/<main\b/);
    expect(html).toMatch(/<h1\b[^>]*>Reactive Correction Evidence Report<\/h1>/);
    expect(html).toMatch(/<table\b/);
    expect(visibleText).toContain("Style-only update Outputs match");
    expect(visibleText).toContain(
      "Operation Eager calls Reactive calls Avoided calls Fact check 1 0 1",
    );
  });

  it("shows recomputed, reused, superseded, and emitted work for each receive", () => {
    const visibleText = extractVisibleText(
      renderEvidenceReportHtml(comparisonViewModel()),
    );

    expect(visibleText).toContain(
      "Receive 2 Recomputed Style review, Rewrite draft Reused Fact check Superseded None Emitted Final result",
    );
  });

  it("keeps reliability evidence and unsupported quality claims explicit", () => {
    const visibleText = extractVisibleText(
      renderEvidenceReportHtml(comparisonViewModel()),
    );

    expect(visibleText).toContain(
      "Reliability Structural reliability Insufficient evidence Structural score Not available Provider compatibility Not evaluated Subjective correction quality Not evaluated",
    );
    expect(visibleText).toContain(
      "Hard gates Stale-result protection Not evaluated Final-result integrity Not evaluated Session isolation Not evaluated",
    );
    expect(visibleText).toContain(
      "Evidence limits Execution counts cover fixed deterministic scenarios only. Matching outputs do not prove factual correctness, writing quality, or usefulness. This report is not a latency, token, cost, or general performance benchmark.",
    );
  });
});

function comparisonViewModel(): EvidenceReportViewModel {
  return {
    title: "Reactive Correction Evidence Report",
    run: {
      id: "comparison-run-001",
      generatedAt: "2026-07-02T00:00:00.000Z",
      command: "demo:compare",
      provider: "deterministic-mock",
    },
    reliability: {
      structuralVerdict: "insufficient-evidence",
      structuralScore: null,
      providerCompatibility: "not-evaluated",
      subjectiveCorrectionQuality: "not-evaluated",
      hardGates: [
        {
          key: "staleResultProtection",
          label: "Stale-result protection",
          status: "not-evaluated",
        },
        {
          key: "finalResultIntegrity",
          label: "Final-result integrity",
          status: "not-evaluated",
        },
        {
          key: "sessionIsolation",
          label: "Session isolation",
          status: "not-evaluated",
        },
      ],
    },
    evidenceLimits: [
      "Execution counts cover fixed deterministic scenarios only.",
      "Matching outputs do not prove factual correctness, writing quality, or usefulness.",
      "This report is not a latency, token, cost, or general performance benchmark.",
    ],
    scenarios: [
      {
        key: "style-only",
        label: "Style-only update",
        comparisonStatus: "comparable",
        outputsMatch: true,
        execution: {
          receiveEpoch: 2,
          recomputed: ["Style review", "Rewrite draft"],
          reused: ["Fact check"],
          superseded: [],
          emitted: ["Final result"],
        },
        operations: [
          {
            key: "factCheck",
            label: "Fact check",
            eagerCalls: 1,
            reactiveCalls: 0,
            avoidedCalls: 1,
          },
        ],
      },
    ],
  };
}

function extractVisibleText(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
