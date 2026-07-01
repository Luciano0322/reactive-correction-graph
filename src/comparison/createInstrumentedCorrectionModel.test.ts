import { describe, expect, it } from "vitest";
import { createInstrumentedCorrectionModel } from "./createInstrumentedCorrectionModel.js";

describe("createInstrumentedCorrectionModel", () => {
  it("counts provider operations without changing deterministic output", async () => {
    const instrumented = createInstrumentedCorrectionModel();
    const claims = [
      {
        id: "claim-1",
        text: "Signal-kernel coordinates correction work.",
      },
    ];

    const factCheck = await instrumented.model.factCheckClaims(claims);
    const styleReview = await instrumented.model.reviewStyle({
      draft: claims[0]?.text ?? "",
      styleGuide: "Use concise language.",
    });
    const revisedDraft = await instrumented.model.rewriteDraft({
      draft: claims[0]?.text ?? "",
      plan: { actions: ["Keep the explanation concise."] },
    });

    expect({
      counts: instrumented.counts(),
      verdict: factCheck.items[0]?.verdict,
      tone: styleReview.tone,
      revisedDraft,
    }).toEqual({
      counts: {
        factCheckCalls: 1,
        styleReviewCalls: 1,
        rewriteDraftCalls: 1,
      },
      verdict: "supported",
      tone: "needs-polish",
      revisedDraft: expect.stringContaining("Keep the explanation concise."),
    });
  });
});
