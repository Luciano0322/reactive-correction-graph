import { expect, it } from "vitest";
import { createCorrectionRuntime } from "reactive-correction-graph";

it("keeps latest-input following in the legacy host facade without waiting for obsolete physical work", async () => {
  let release!: (value: { items: [] }) => void;
  const obsolete = new Promise<{ items: [] }>((resolve) => { release = resolve; });
  const runtime = createCorrectionRuntime({ model: {
    factCheckClaims: async (claims) => claims[0]?.text.includes("obsolete") ? obsolete : { items: [] },
  } });
  runtime.receive({ draft: "The obsolete claim remains physically pending." });
  const previousWait = runtime.runUntilSettled();
  runtime.receive({ draft: "The current claim replaces it." });

  try {
    await runtime.runUntilSettled();
    await previousWait;
    expect(runtime.emit().finalResult?.revisedDraft).toContain("The current claim");
  } finally {
    release({ items: [] });
  }
});

it("reports Settle execution and causal revision provenance through the existing runtime trace", async () => {
  const runtime = createCorrectionRuntime();
  runtime.receive({ draft: "Settle preserves causal validity, not correction quality." });
  await runtime.runUntilSettled();

  const events = runtime.trace().filter((event) => event.scope === "resource" && ["pending", "resolved"].includes(event.type));
  for (const label of ["factCheck", "styleReview", "rewriteDraft"]) {
    const pending = events.find((event) => event.label === label && event.type === "pending");
    const committed = events.find((event) => event.label === label && event.type === "resolved");
    expect(pending?.metadata?.executionId).toEqual(expect.any(String));
    expect(pending?.metadata?.revisionId).toEqual(expect.any(String));
    expect(committed?.metadata?.executionId).toBe(pending?.metadata?.executionId);
    expect(committed?.metadata?.revisionId).toBe(pending?.metadata?.revisionId);
  }
  expect(runtime.emit().finalResult).toBeDefined();
});
