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
    expect(visibleText).toContain(
      "Reactive Correction Evidence Report Style-only update Outputs match Operation Eager calls Reactive calls Avoided calls Fact check 1 0 1",
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
    scenarios: [
      {
        key: "style-only",
        label: "Style-only update",
        comparisonStatus: "comparable",
        outputsMatch: true,
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
