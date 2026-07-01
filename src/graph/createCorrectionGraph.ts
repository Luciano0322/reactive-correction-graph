import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type {
  Claim,
  CorrectionPlan,
  CorrectionRuntimeInput,
  FactCheckResult,
  FinalResult,
  StyleReviewResult,
} from "../schemas/correction.js";
import type { TraceEvent, TraceEventType } from "../trace/types.js";
import {
  invokeCorrectionRuntime,
  type CorrectionRuntimeAdapterOptions,
  type CorrectionRuntimeAdapterState,
} from "../runtime/correctionRuntimeAdapter.js";
import {
  createCorrectionRuntime,
  type CorrectionRuntimeOptions,
  type CorrectionRuntimeSnapshot,
} from "../runtime/createCorrectionRuntime.js";

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
  graphTrace: Annotation<TraceEvent[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  snapshot: Annotation<CorrectionRuntimeSnapshot | undefined>,
});

export type CorrectionGraphState = typeof CorrectionGraphAnnotation.State;
export type CorrectionGraphUpdate = typeof CorrectionGraphAnnotation.Update;
type GraphNodeLabel = "prepareInput" | "reactiveCorrection" | "finalize";

let nextGraphTraceId = 1;

export function createCorrectionGraph(
  options: CorrectionRuntimeAdapterOptions = {},
) {
  return new StateGraph(CorrectionGraphAnnotation)
    .addNode("prepareInput", prepareInputNode)
    .addNode("reactiveCorrection", (state) =>
      reactiveCorrectionNode(state, options),
    )
    .addNode("finalize", finalizeNode)
    .addEdge(START, "prepareInput")
    .addEdge("prepareInput", "reactiveCorrection")
    .addEdge("reactiveCorrection", "finalize")
    .addEdge("finalize", END)
    .compile();
}

export function createCorrectionGraphSession(
  options: CorrectionRuntimeOptions = {},
) {
  const runtime = createCorrectionRuntime(options);
  return createCorrectionGraph({ runtime });
}

function prepareInputNode(state: CorrectionGraphState): CorrectionGraphUpdate {
  return {
    draft: state.draft.trim(),
    prepared: true,
    graphTrace: graphLifecycleEvents("prepareInput"),
  };
}

async function reactiveCorrectionNode(
  state: CorrectionGraphState,
  options: CorrectionRuntimeAdapterOptions,
): Promise<CorrectionRuntimeAdapterState & CorrectionGraphUpdate> {
  const started = graphTraceEvent("started", "reactiveCorrection");
  const correctionState = await invokeCorrectionRuntime(
    toRuntimeInput(state),
    options,
  );

  return {
    ...correctionState,
    graphTrace: [
      started,
      graphTraceEvent("completed", "reactiveCorrection"),
    ],
  };
}

function finalizeNode(): CorrectionGraphUpdate {
  return {
    finalized: true,
    graphTrace: graphLifecycleEvents("finalize"),
  };
}

function toRuntimeInput(state: CorrectionGraphState): CorrectionRuntimeInput {
  return {
    draft: state.draft,
    userIntent: state.userIntent,
    styleGuide: state.styleGuide,
  };
}

function graphLifecycleEvents(label: GraphNodeLabel): TraceEvent[] {
  return [
    graphTraceEvent("started", label),
    graphTraceEvent("completed", label),
  ];
}

function graphTraceEvent(
  type: Extract<TraceEventType, "started" | "completed">,
  label: GraphNodeLabel,
): TraceEvent {
  return {
    id: `graph-trace-${nextGraphTraceId++}`,
    at: Date.now(),
    scope: "graph",
    type,
    label,
  };
}
