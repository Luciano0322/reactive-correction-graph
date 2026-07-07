import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import type { CorrectionRuntimeModel } from "../runtime/createCorrectionRuntime.js";
import { createCorrectionSessionHttpServer } from "./createCorrectionSessionHttpServer.js";

let server: Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = createCorrectionSessionHttpServer();
  baseUrl = await listen(server);
});

test.afterAll(async () => {
  await closeServer(server);
});

test("submits an initial correction through the mock session workspace", async ({
  page,
}) => {
  await page.goto(baseUrl);

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Reactive Correction Session",
    }),
  ).toBeVisible();
  await expect(page.getByText("Mock provider", { exact: true })).toBeVisible();
  await expect(page.getByText("No correction yet.")).toBeVisible();

  const draft = "Signal-kernel coordinates async correction branches.";
  await page.getByLabel("Draft").fill(draft);
  await page
    .getByLabel("Style guide")
    .fill("Use concise technical language.");
  await page.getByRole("button", { name: "Run correction" }).click();

  await expect(page.getByRole("status")).toHaveText("Correction settled");
  const result = page.getByRole("region", { name: "Correction result" });
  await expect(result.getByRole("heading", { name: "Revised draft" })).toBeVisible();
  await expect(result).toContainText(draft);
  await expect(result).toContainText("Mock correction notes");
  await expect(result).toContainText(
    "Apply style guide: Use concise technical language.",
  );
});

test("shows pending and settled execution activity", async ({ page }) => {
  await page.route("**/api/sessions/*/invocations", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        sessionId: "session-activity",
        viewModel: {
          status: "settled",
          input: { draft: "A correction draft." },
          finalResult: {
            revisedDraft: "A revised correction draft.",
            summary: ["Applied correction plan."],
            unresolvedIssues: [],
          },
          resources: {
            factCheck: "success",
            styleReview: "success",
            rewriteDraft: "success",
          },
          execution: {
            receiveEpoch: 2,
            recomputed: ["styleReview"],
            reused: ["factCheck"],
            superseded: ["rewriteDraft"],
            emitted: ["finalResult"],
          },
        },
      }),
    });
  });
  await page.goto(baseUrl);

  await page.getByLabel("Draft").fill("A correction draft.");
  await page.getByRole("button", { name: "Run correction" }).click();

  const activity = page.getByRole("region", { name: "Execution activity" });
  await expect(activity.getByRole("list", { name: "Pending work" })).toContainText(
    "Fact check",
  );
  await expect(activity.getByRole("list", { name: "Pending work" })).toContainText(
    "Style review",
  );
  await expect(activity.getByRole("list", { name: "Pending work" })).toContainText(
    "Rewrite draft",
  );

  await expect(page.getByRole("status")).toHaveText("Correction settled");
  await expect(
    activity.getByRole("list", { name: "Recomputed work" }),
  ).toContainText("Style review");
  await expect(activity.getByRole("list", { name: "Reused work" })).toContainText(
    "Fact check",
  );
  await expect(
    activity.getByRole("list", { name: "Superseded work" }),
  ).toContainText("Rewrite draft");
  await expect(activity.getByRole("list", { name: "Pending work" })).toContainText(
    "None",
  );
});

test("shows live style-only pending work before the final result arrives", async ({
  page,
}) => {
  const slowServer = createCorrectionSessionHttpServer({
    runtime: {
      model: createStyleOnlyDelayedCorrectionModel(1_500),
      settleTimeoutMs: 5_000,
    },
  });
  const slowBaseUrl = await listen(slowServer);

  try {
    await page.goto(slowBaseUrl);
    const activity = page.getByRole("region", { name: "Execution activity" });
    const pendingWork = activity.getByRole("list", { name: "Pending work" });
    const draft = "Signal-kernel coordinates async correction branches.";

    await page.getByLabel("Draft").fill(draft);
    await page.getByRole("button", { name: "Run correction" }).click();
    await expect(page.getByRole("status")).toHaveText("Correction settled");
    await expect(activity).toContainText("Settled epoch 1");

    await page.getByLabel("Style guide").fill("Use concise language.");
    await page.getByRole("button", { name: "Run correction" }).click();

    await expect(pendingWork).toContainText("Style review");
    await expect(page.getByRole("status")).toHaveText("Running correction");
    await expect(pendingWork).not.toContainText("Fact check");

    await expect(page.getByRole("status")).toHaveText("Correction settled");
    await expect(activity).toContainText("Settled epoch 2");
    await expect(activity.getByRole("list", { name: "Reused work" })).toContainText(
      "Fact check",
    );
  } finally {
    await closeServer(slowServer);
  }
});

test("keeps one session across sequential correction updates", async ({
  page,
}) => {
  await page.goto(baseUrl);
  const activity = page.getByRole("region", { name: "Execution activity" });
  const draftInput = page.getByLabel("Draft");
  const styleGuideInput = page.getByLabel("Style guide");

  await draftInput.fill("Signal-kernel coordinates async correction branches.");
  await page.getByRole("button", { name: "Run correction" }).click();
  await expect(page.getByRole("status")).toHaveText("Correction settled");
  await expect(activity).toContainText("Settled epoch 1");

  await styleGuideInput.fill("Use short, direct sentences.");
  await page.getByRole("button", { name: "Run correction" }).click();
  await expect(page.getByRole("status")).toHaveText("Correction settled");
  await expect(activity).toContainText("Settled epoch 2");
  await expect(activity.getByRole("list", { name: "Reused work" })).toContainText(
    "Fact check",
  );
  await expect(
    activity.getByRole("list", { name: "Recomputed work" }),
  ).toContainText("Style review");
  await expect(
    activity.getByRole("list", { name: "Recomputed work" }),
  ).toContainText("Rewrite draft");

  await draftInput.fill(
    "Signal-kernel maybe prevents every correction branch from rerunning.",
  );
  await page.getByRole("button", { name: "Run correction" }).click();
  await expect(page.getByRole("status")).toHaveText("Correction settled");
  await expect(activity).toContainText("Settled epoch 3");
  await expect(
    activity.getByRole("list", { name: "Recomputed work" }),
  ).toContainText("Fact check");
  await expect(page.getByRole("region", { name: "Correction result" })).toContainText(
    "This claim is tentative and should be verified.",
  );
});

test("keeps correction sessions isolated between browser pages", async ({
  context,
}) => {
  const firstPage = await context.newPage();
  const secondPage = await context.newPage();
  const firstDraft = "The first session owns this correction draft.";
  const secondDraft = "The second session owns a different correction draft.";

  await Promise.all([firstPage.goto(baseUrl), secondPage.goto(baseUrl)]);
  await firstPage.getByLabel("Draft").fill(firstDraft);
  await secondPage.getByLabel("Draft").fill(secondDraft);
  await Promise.all([
    firstPage.getByRole("button", { name: "Run correction" }).click(),
    secondPage.getByRole("button", { name: "Run correction" }).click(),
  ]);
  await Promise.all([
    expect(firstPage.getByRole("status")).toHaveText("Correction settled"),
    expect(secondPage.getByRole("status")).toHaveText("Correction settled"),
  ]);

  const firstResult = firstPage.getByRole("region", {
    name: "Correction result",
  });
  const secondResult = secondPage.getByRole("region", {
    name: "Correction result",
  });
  await expect(firstResult).toContainText(firstDraft);
  await expect(firstResult).not.toContainText(secondDraft);
  await expect(secondResult).toContainText(secondDraft);
  await expect(secondResult).not.toContainText(firstDraft);
  await expect(
    firstPage.getByRole("region", { name: "Execution activity" }),
  ).toContainText("Settled epoch 1");
  await expect(
    secondPage.getByRole("region", { name: "Execution activity" }),
  ).toContainText("Settled epoch 1");

  await firstPage.getByLabel("Style guide").fill("Use concise language.");
  await firstPage.getByRole("button", { name: "Run correction" }).click();
  await expect(firstPage.getByRole("status")).toHaveText("Correction settled");

  await expect(
    firstPage.getByRole("region", { name: "Execution activity" }),
  ).toContainText("Settled epoch 2");
  await expect(
    secondPage.getByRole("region", { name: "Execution activity" }),
  ).toContainText("Settled epoch 1");
  await expect(secondResult).toContainText(secondDraft);
  await expect(secondResult).not.toContainText("Use concise language.");
});

async function listen(httpServer: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });
  const address = httpServer.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(httpServer: Server): Promise<void> {
  if (!httpServer.listening) return;

  const closed = new Promise<void>((resolve, reject) => {
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
  httpServer.closeAllConnections();
  await closed;
}

function createStyleOnlyDelayedCorrectionModel(
  delayMs: number,
): CorrectionRuntimeModel {
  return {
    async factCheckClaims(claims) {
      return {
        items: claims.map((claim) => ({
          claimId: claim.id,
          verdict: "supported",
          note: "Delayed fact check completed.",
        })),
      };
    },
    async reviewStyle(input) {
      if (input.styleGuide) {
        await sleep(delayMs);
      }

      return {
        tone: "clear",
        suggestions: input.styleGuide
          ? [`Apply style guide: ${input.styleGuide}`]
          : [],
      };
    },
    async rewriteDraft(input) {
      if (
        input.plan.actions.some((action) =>
          action.startsWith("Apply style guide:"),
        )
      ) {
        await sleep(delayMs);
      }

      return [
        input.draft,
        "",
        "---",
        "",
        "Delayed rewrite",
        ...input.plan.actions.map((action) => `- ${action}`),
      ].join("\n");
    },
  };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
