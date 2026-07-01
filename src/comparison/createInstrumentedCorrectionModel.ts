import { createMockCorrectionModel } from "../llm/mockCorrectionModel.js";
import type { CorrectionRuntimeModel } from "../runtime/createCorrectionRuntime.js";

export type CorrectionOperationCounts = {
  factCheckCalls: number;
  styleReviewCalls: number;
  rewriteDraftCalls: number;
};

export type InstrumentedCorrectionModel = {
  model: CorrectionRuntimeModel;
  counts(): CorrectionOperationCounts;
};

export function createInstrumentedCorrectionModel(
  baseModel: CorrectionRuntimeModel = createMockCorrectionModel(),
): InstrumentedCorrectionModel {
  const operationCounts: CorrectionOperationCounts = {
    factCheckCalls: 0,
    styleReviewCalls: 0,
    rewriteDraftCalls: 0,
  };

  return {
    model: {
      async factCheckClaims(claims, signal) {
        operationCounts.factCheckCalls += 1;
        return baseModel.factCheckClaims(claims, signal);
      },
      async reviewStyle(input, signal) {
        operationCounts.styleReviewCalls += 1;
        return baseModel.reviewStyle(input, signal);
      },
      async rewriteDraft(input, signal) {
        operationCounts.rewriteDraftCalls += 1;
        return baseModel.rewriteDraft(input, signal);
      },
    },
    counts: () => ({ ...operationCounts }),
  };
}
