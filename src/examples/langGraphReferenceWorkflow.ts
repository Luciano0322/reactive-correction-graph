import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  createCorrectionSession,
  type CorrectionSessionSnapshot,
} from "reactive-correction-graph";

type ReferenceWorkflowTraceLabel =
  | "prepareReferenceInput"
  | "runCorrectionNode"
  | "finalizeReferenceOutput";

type RuntimeTrace = CorrectionSessionSnapshot["trace"];

const ReferenceWorkflowAnnotation = Annotation.Root({
  draft: Annotation<string>,
  userIntent: Annotation<string | undefined>,
  styleGuide: Annotation<string | undefined>,
  prepared: Annotation<boolean>,
  correctionCompleted: Annotation<boolean>,
  finalized: Annotation<boolean>,
  revisedDraft: Annotation<string | undefined>,
  summary: Annotation<string[]>,
  runtimeTrace: Annotation<RuntimeTrace>,
  workflowTraceLabels: Annotation<ReferenceWorkflowTraceLabel[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
});

type ReferenceWorkflowState = typeof ReferenceWorkflowAnnotation.State;
type ReferenceWorkflowUpdate = typeof ReferenceWorkflowAnnotation.Update;

export type LangGraphReferenceWorkflowExampleResult = {
  prepared: boolean;
  correctionCompleted: boolean;
  finalized: boolean;
  revisedDraft: string | undefined;
  summary: string[];
  workflowTraceLabels: ReferenceWorkflowTraceLabel[];
  runtimeTraceEventCount: number;
};

export function createLangGraphReferenceWorkflow() {
  return new StateGraph(ReferenceWorkflowAnnotation)
    .addNode("prepareReferenceInput", prepareReferenceInputNode)
    .addNode("runCorrectionNode", runCorrectionNode)
    .addNode("finalizeReferenceOutput", finalizeReferenceOutputNode)
    .addEdge(START, "prepareReferenceInput")
    .addEdge("prepareReferenceInput", "runCorrectionNode")
    .addEdge("runCorrectionNode", "finalizeReferenceOutput")
    .addEdge("finalizeReferenceOutput", END)
    .compile();
}

export async function runLangGraphReferenceWorkflowExample(): Promise<LangGraphReferenceWorkflowExampleResult> {
  const workflow = createLangGraphReferenceWorkflow();
  const state = await workflow.invoke({
    draft: "Signal-kernel coordinates async correction branches.",
    userIntent: "Explain this as a reference LangGraph node.",
    styleGuide: "Use concise technical language.",
  });

  return {
    prepared: state.prepared,
    correctionCompleted: state.correctionCompleted,
    finalized: state.finalized,
    revisedDraft: state.revisedDraft,
    summary: state.summary,
    workflowTraceLabels: state.workflowTraceLabels,
    runtimeTraceEventCount: state.runtimeTrace.length,
  };
}

function prepareReferenceInputNode(
  state: ReferenceWorkflowState,
): ReferenceWorkflowUpdate {
  return {
    draft: state.draft.trim(),
    prepared: true,
    workflowTraceLabels: ["prepareReferenceInput"],
  };
}

async function runCorrectionNode(
  state: ReferenceWorkflowState,
): Promise<ReferenceWorkflowUpdate> {
  const session = createCorrectionSession();

  session.receive({
    draft: state.draft,
    userIntent: state.userIntent,
    styleGuide: state.styleGuide,
  });
  await session.runUntilSettled();

  const snapshot = session.snapshot();
  const correctionState = session.emit();

  return {
    correctionCompleted: true,
    revisedDraft: correctionState.finalResult?.revisedDraft,
    summary: correctionState.finalResult?.summary ?? [],
    runtimeTrace: snapshot.trace,
    workflowTraceLabels: ["runCorrectionNode"],
  };
}

function finalizeReferenceOutputNode(): ReferenceWorkflowUpdate {
  return {
    finalized: true,
    workflowTraceLabels: ["finalizeReferenceOutput"],
  };
}
