import { describe, expect, it } from "vitest";
import { runPersistentLangGraphReferenceWorkflowExample } from "./langGraphPersistentSessionWorkflow.js";

describe("persistent LangGraph reference workflow example", () => {
  it("reuses an explicit graph session across repeated invocations without module-level state", async () => {
    const result = await runPersistentLangGraphReferenceWorkflowExample();

    expect({
      firstReceiveEpochs: result.firstReceiveEpochs,
      secondReceiveEpochs: result.secondReceiveEpochs,
      isolatedReceiveEpochs: result.isolatedReceiveEpochs,
      factCheckPendingOnSecondInvoke: result.factCheckPendingOnSecondInvoke,
      styleReviewPendingOnSecondInvoke: result.styleReviewPendingOnSecondInvoke,
      rewriteDraftPendingOnSecondInvoke:
        result.rewriteDraftPendingOnSecondInvoke,
      secondSummary: result.secondSummary,
      secondRevisedDraft: result.secondRevisedDraft,
      secondWorkflowTraceLabels: result.secondWorkflowTraceLabels,
      isolatedWorkflowContainsFirstDraft:
        result.isolatedWorkflowContainsFirstDraft,
    }).toEqual({
      firstReceiveEpochs: [1],
      secondReceiveEpochs: [1, 2],
      isolatedReceiveEpochs: [1],
      factCheckPendingOnSecondInvoke: false,
      styleReviewPendingOnSecondInvoke: true,
      rewriteDraftPendingOnSecondInvoke: true,
      secondSummary: expect.arrayContaining([
        "Apply style guide: Use concise technical language.",
        "Respect user intent: Explain persistent graph session reuse.",
      ]),
      secondRevisedDraft: expect.stringContaining("Mock correction notes"),
      secondWorkflowTraceLabels: [
        "preparePersistentReferenceInput",
        "runPersistentCorrectionNode",
        "finalizePersistentReferenceOutput",
      ],
      isolatedWorkflowContainsFirstDraft: false,
    });
  });
});
