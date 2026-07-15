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

  it("renders reference scenario reuse and recomputation evidence", () => {
    const visibleText = extractVisibleText(
      renderEvidenceReportHtml(referenceViewModel()),
    );

    expect(visibleText).toContain(
      "Technical article correction reference scenario",
    );
    expect(visibleText).toContain(
      "Style-only update Avoided fact-check call",
    );
    expect(visibleText).toContain("Reused Fact check");
    expect(visibleText).toContain(
      "Draft claims stayed stable, so settled fact-check work remained current.",
    );
    expect(visibleText).toContain(
      "Claim-changing update Fact-check work recomputes",
    );
    expect(visibleText).toContain(
      "Recomputed Fact check, Style review, Rewrite draft",
    );
    expect(visibleText).toContain(
      "Draft claims changed, so previous fact-check coverage was not reused.",
    );
    expect(visibleText).toContain("execution-summary.json#receive-2");
  });

  it("explains what the reference scenario proves and does not prove", () => {
    const visibleText = extractVisibleText(
      renderEvidenceReportHtml(referenceViewModel()),
    );

    expect(visibleText).toContain(
      "What this scenario proves The runtime can avoid fact-check recomputation when only style guidance changes.",
    );
    expect(visibleText).toContain(
      "What this scenario does not prove The scenario is deterministic and does not prove factual correctness.",
    );
  });

  it("shows unavailable reference evidence without implying the transition was verified", () => {
    const visibleText = extractVisibleText(
      renderEvidenceReportHtml(partialReferenceViewModel()),
    );

    expect(visibleText).toContain("Evidence: execution-summary.json and Not available");
    expect(visibleText).toContain(
      "Initial correction Baseline correction work is established Changed Initial draft, intent, and style guidance are received. Recomputed None Reused None Superseded None Emitted None Evidence status Missing Reuse decision Execution evidence is unavailable for this receive; no reuse decision can be verified. Evidence execution-summary.json#receive-1",
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

function referenceViewModel(): EvidenceReportViewModel {
  return {
    title: "Reactive Correction Evidence Report",
    run: {
      id: "reference-run-001",
      generatedAt: "2026-07-02T00:00:00.000Z",
      command: "demo:reference",
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
    scenarios: [],
    applicationScenario: {
      key: "reference-correction",
      label: "Technical article correction reference scenario",
      evidence: {
        executionSummaryArtifact: "execution-summary.json",
        savingsArtifact: "savings.json",
      },
      transitions: [
        {
          key: "initial",
          label: "Initial correction",
          receiveEpoch: 1,
          changed: "Initial draft, intent, and style guidance are received.",
          outcome: "Baseline correction work is established",
          recomputed: ["Fact check", "Style review", "Rewrite draft"],
          reused: [],
          superseded: [],
          emitted: ["Final result"],
          evidence: "execution-summary.json#receive-1",
          evidenceStatus: "available",
          reuseDecision:
            "No previous settled correction work is available for the baseline receive.",
        },
        {
          key: "style-only",
          label: "Style-only update",
          receiveEpoch: 2,
          changed: "Only style guidance changes while draft claims stay stable.",
          outcome: "Avoided fact-check call",
          recomputed: ["Style review", "Rewrite draft"],
          reused: ["Fact check"],
          superseded: [],
          emitted: ["Final result"],
          evidence: "execution-summary.json#receive-2",
          evidenceStatus: "available",
          reuseDecision:
            "Draft claims stayed stable, so settled fact-check work remained current.",
        },
        {
          key: "claim-changing",
          label: "Claim-changing update",
          receiveEpoch: 3,
          changed: "The draft introduces a claim-changing edit.",
          outcome: "Fact-check work recomputes",
          recomputed: ["Fact check", "Style review", "Rewrite draft"],
          reused: [],
          superseded: ["Fact check"],
          emitted: ["Final result"],
          evidence: "execution-summary.json#receive-3",
          evidenceStatus: "available",
          reuseDecision:
            "Draft claims changed, so previous fact-check coverage was not reused.",
        },
      ],
      proves: [
        "The runtime can avoid fact-check recomputation when only style guidance changes.",
      ],
      limits: [
        "The scenario is deterministic and does not prove factual correctness.",
      ],
    },
  };
}

function partialReferenceViewModel(): EvidenceReportViewModel {
  const viewModel = referenceViewModel();
  const applicationScenario = viewModel.applicationScenario!;

  return {
    ...viewModel,
    applicationScenario: {
      ...applicationScenario,
      evidence: {
        ...applicationScenario.evidence,
        savingsArtifact: "Not available",
      },
      transitions: applicationScenario.transitions.map((transition) =>
        transition.key === "initial"
          ? {
              ...transition,
              recomputed: [],
              reused: [],
              superseded: [],
              emitted: [],
              evidenceStatus: "missing",
              reuseDecision:
                "Execution evidence is unavailable for this receive; no reuse decision can be verified.",
            }
          : transition,
      ),
    },
  };
}

function extractVisibleText(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
