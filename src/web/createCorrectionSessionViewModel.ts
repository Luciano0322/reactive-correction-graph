import type { CorrectionGraphState } from "../graph/createCorrectionGraph.js";
import type { CorrectionRuntimeInput, FinalResult } from "../schemas/correction.js";
import {
  projectReceiveExecutionSummary,
  type ReceiveExecutionSummary,
} from "../trace/projectReceiveExecutionSummary.js";

export type CorrectionSessionViewModel = {
  status: "settled";
  input: CorrectionRuntimeInput;
  finalResult: FinalResult;
  resources: {
    factCheck: "idle" | "pending" | "success" | "error" | "cancelled";
    styleReview: "idle" | "pending" | "success" | "error" | "cancelled";
    rewriteDraft: "idle" | "pending" | "success" | "error" | "cancelled";
  };
  execution: ReceiveExecutionSummary;
};

export function createCorrectionSessionViewModel(
  state: CorrectionGraphState,
): CorrectionSessionViewModel {
  if (!state.finalResult || !state.snapshot) {
    throw new Error("Settled correction state is missing final output");
  }

  const receiveEpoch = latestReceiveEpoch(state);

  return {
    status: "settled",
    input: {
      draft: state.draft,
      ...(state.userIntent === undefined
        ? {}
        : { userIntent: state.userIntent }),
      ...(state.styleGuide === undefined
        ? {}
        : { styleGuide: state.styleGuide }),
    },
    finalResult: state.finalResult,
    resources: state.snapshot.statuses,
    execution: projectReceiveExecutionSummary(state.trace, receiveEpoch),
  };
}

function latestReceiveEpoch(state: CorrectionGraphState): number {
  for (let index = state.trace.length - 1; index >= 0; index -= 1) {
    const event = state.trace[index];
    const receiveEpoch =
      event.scope === "runtime" &&
      event.type === "started" &&
      event.label === "receive"
        ? event.metadata?.receiveEpoch
        : undefined;

    if (typeof receiveEpoch === "number") return receiveEpoch;
  }

  throw new Error("Settled correction state is missing receive metadata");
}
