import { expect, test } from "@playwright/test";
import type { EvidenceReportViewModel } from "./createEvidenceReportViewModel.js";
import { renderEvidenceReportHtml } from "./renderEvidenceReportHtml.js";

test("keeps report content readable within desktop and mobile viewports", async ({
  page,
}) => {
  await page.setContent(renderEvidenceReportHtml(comparisonViewModel()));

  await expect(page.getByRole("main")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Reactive Correction Evidence Report",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Style-only update" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", {
      name: "Style-only update operation counts",
    }),
  ).toBeVisible();

  const layout = await page.evaluate(() => ({
    documentFits:
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
    tablesFit: [...document.querySelectorAll("table")].every((table) => {
      const bounds = table.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= window.innerWidth;
    }),
  }));

  expect(layout).toEqual({ documentFits: true, tablesFit: true });
});

test("lets keyboard users skip directly to the report content", async ({
  page,
}) => {
  await page.setContent(renderEvidenceReportHtml(comparisonViewModel()));

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to report content" });
  await expect(skipLink).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
});

test("keeps a readable measure on desktop while using mobile space", async ({
  page,
}) => {
  await page.setContent(renderEvidenceReportHtml(comparisonViewModel()));

  const viewport = page.viewportSize();
  const mainBounds = await page.getByRole("main").boundingBox();
  expect(viewport).not.toBeNull();
  expect(mainBounds).not.toBeNull();

  if (!viewport || !mainBounds) return;

  if (viewport.width >= 1000) {
    expect(mainBounds.width).toBeLessThanOrEqual(1040);
    expect(
      Math.abs(mainBounds.x - (viewport.width - mainBounds.width) / 2),
    ).toBeLessThanOrEqual(1);
  } else {
    expect(mainBounds.x).toBeGreaterThanOrEqual(12);
    expect(mainBounds.width).toBeGreaterThanOrEqual(viewport.width - 32);
  }
});

function comparisonViewModel(): EvidenceReportViewModel {
  return {
    title: "Reactive Correction Evidence Report",
    run: {
      id: "comparison-run-browser",
      generatedAt: "2026-07-03T00:00:00.000Z",
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
          {
            key: "styleReview",
            label: "Style review",
            eagerCalls: 1,
            reactiveCalls: 1,
            avoidedCalls: 0,
          },
          {
            key: "rewriteDraft",
            label: "Rewrite draft",
            eagerCalls: 1,
            reactiveCalls: 1,
            avoidedCalls: 0,
          },
        ],
      },
    ],
  };
}
