import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type {
  Claim,
  CorrectionPlan,
  CorrectionRuntimeInput,
  FactCheckResult,
  FinalResult,
  StyleReviewResult,
} from "../schemas/correction.js";
import type { TraceEvent } from "../trace/types.js";
import {
  invokeCorrectionRuntime,
  type CorrectionRuntimeAdapterState,
} from "../runtime/correctionRuntimeAdapter.js";
import type { CorrectionRuntimeSnapshot } from "../runtime/createCorrectionRuntime.js";

const CorrectionGraphAnnotation = Annotation.Root({
  draft: Annotation<string>,
  userIntent: Annotation<string | undefined>,
  styleGuide: Annotation<string | undefined>,
  prepared: Annotation<boolean>,
  finalized: Annotation<boolean>,
  claims: Annotation<Claim[] | undefined>,
  factCheckResult: Annotation<FactCheckResult | undefined>,
  styleReviewResult: Annotation<StyleReviewResult | undefined>,
  correctionPlan: Annotation<CorrectionPlan | undefined>,
  revisedDraft: Annotation<string | undefined>,
  finalResult: Annotation<FinalResult | undefined>,
  trace: Annotation<TraceEvent[]>,
  snapshot: Annotation<CorrectionRuntimeSnapshot | undefined>,
});

export type CorrectionGraphState = typeof CorrectionGraphAnnotation.State;
export type CorrectionGraphUpdate = typeof CorrectionGraphAnnotation.Update;

export function createCorrectionGraph() {
  return new StateGraph(CorrectionGraphAnnotation)
    .addNode("prepareInput", prepareInputNode)
    .addNode("reactiveCorrection", reactiveCorrectionNode)
    .addNode("finalize", finalizeNode)
    .addEdge(START, "prepareInput")
    .addEdge("prepareInput", "reactiveCorrection")
    .addEdge("reactiveCorrection", "finalize")
    .addEdge("finalize", END)
    .compile();
}

function prepareInputNode(state: CorrectionGraphState): CorrectionGraphUpdate {
  return {
    draft: state.draft.trim(),
    prepared: true,
  };
}

async function reactiveCorrectionNode(
  state: CorrectionGraphState,
): Promise<CorrectionRuntimeAdapterState> {
  return invokeCorrectionRuntime(toRuntimeInput(state));
}

function finalizeNode(): CorrectionGraphUpdate {
  return {
    finalized: true,
  };
}

function toRuntimeInput(state: CorrectionGraphState): CorrectionRuntimeInput {
  return {
    draft: state.draft,
    userIntent: state.userIntent,
    styleGuide: state.styleGuide,
  };
}
