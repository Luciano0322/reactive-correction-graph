import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  createCorrectionGraphSession,
  type CorrectionGraphState,
} from "reactive-correction-graph";

type PersistentWorkflowTraceLabel =
  | "preparePersistentReferenceInput"
  | "runPersistentCorrectionNode"
  | "finalizePersistentReferenceOutput";

type RuntimeTrace = CorrectionGraphState["trace"];

const PersistentWorkflowAnnotation = Annotation.Root({
  draft: Annotation<string>,
  userIntent: Annotation<string | undefined>,
  styleGuide: Annotation<string | undefined>,
  prepared: Annotation<boolean>,
  correctionCompleted: Annotation<boolean>,
  finalized: Annotation<boolean>,
  revisedDraft: Annotation<string | undefined>,
  summary: Annotation<string[]>,
  runtimeTrace: Annotation<RuntimeTrace>,
  workflowTraceLabels: Annotation<PersistentWorkflowTraceLabel[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
});

type PersistentWorkflowState = typeof PersistentWorkflowAnnotation.State;
type PersistentWorkflowUpdate = typeof PersistentWorkflowAnnotation.Update;

export type PersistentLangGraphReferenceWorkflowExampleResult = {
  firstReceiveEpochs: number[];
  secondReceiveEpochs: number[];
  isolatedReceiveEpochs: number[];
  factCheckPendingOnSecondInvoke: boolean;
  styleReviewPendingOnSecondInvoke: boolean;
  rewriteDraftPendingOnSecondInvoke: boolean;
  secondSummary: string[];
  secondRevisedDraft: string | undefined;
  secondWorkflowTraceLabels: PersistentWorkflowTraceLabel[];
  isolatedWorkflowContainsFirstDraft: boolean;
};

export function createPersistentLangGraphReferenceWorkflow() {
  const correctionSession = createCorrectionGraphSession();

  return new StateGraph(PersistentWorkflowAnnotation)
    .addNode("preparePersistentReferenceInput", preparePersistentInputNode)
    .addNode("runPersistentCorrectionNode", async (state) => {
      const correctionState = await correctionSession.invoke({
        draft: state.draft,
        userIntent: state.userIntent,
        styleGuide: state.styleGuide,
      });

      return {
        correctionCompleted: true,
        revisedDraft: correctionState.finalResult?.revisedDraft,
        summary: correctionState.finalResult?.summary ?? [],
        runtimeTrace: correctionState.trace,
        workflowTraceLabels: ["runPersistentCorrectionNode"],
      };
    })
    .addNode("finalizePersistentReferenceOutput", finalizePersistentOutputNode)
    .addEdge(START, "preparePersistentReferenceInput")
    .addEdge("preparePersistentReferenceInput", "runPersistentCorrectionNode")
    .addEdge("runPersistentCorrectionNode", "finalizePersistentReferenceOutput")
    .addEdge("finalizePersistentReferenceOutput", END)
    .compile();
}

export async function runPersistentLangGraphReferenceWorkflowExample(): Promise<PersistentLangGraphReferenceWorkflowExampleResult> {
  const workflow = createPersistentLangGraphReferenceWorkflow();
  const draft = "Signal-kernel coordinates async correction branches.";
  const firstState = await workflow.invoke({
    draft,
    userIntent: "Explain persistent graph session reuse.",
  });
  const secondState = await workflow.invoke({
    draft,
    userIntent: "Explain persistent graph session reuse.",
    styleGuide: "Use concise technical language.",
  });
  const secondTrace = secondState.runtimeTrace.slice(
    firstState.runtimeTrace.length,
  );

  const isolatedWorkflow = createPersistentLangGraphReferenceWorkflow();
  const isolatedState = await isolatedWorkflow.invoke({
    draft: "Independent reference workflow session.",
    userIntent: "Show that workflow factories own their sessions.",
  });

  return {
    firstReceiveEpochs: receiveEpochs(firstState.runtimeTrace),
    secondReceiveEpochs: receiveEpochs(secondState.runtimeTrace),
    isolatedReceiveEpochs: receiveEpochs(isolatedState.runtimeTrace),
    factCheckPendingOnSecondInvoke: hasTraceEvent(
      secondTrace,
      "pending",
      "factCheck",
    ),
    styleReviewPendingOnSecondInvoke: hasTraceEvent(
      secondTrace,
      "pending",
      "styleReview",
    ),
    rewriteDraftPendingOnSecondInvoke: hasTraceEvent(
      secondTrace,
      "pending",
      "rewriteDraft",
    ),
    secondSummary: secondState.summary,
    secondRevisedDraft: secondState.revisedDraft,
    secondWorkflowTraceLabels: secondState.workflowTraceLabels,
    isolatedWorkflowContainsFirstDraft: Boolean(
      isolatedState.revisedDraft?.includes(draft),
    ),
  };
}

function preparePersistentInputNode(
  state: PersistentWorkflowState,
): PersistentWorkflowUpdate {
  return {
    draft: state.draft.trim(),
    prepared: true,
    workflowTraceLabels: ["preparePersistentReferenceInput"],
  };
}

function finalizePersistentOutputNode(): PersistentWorkflowUpdate {
  return {
    finalized: true,
    workflowTraceLabels: ["finalizePersistentReferenceOutput"],
  };
}

function receiveEpochs(trace: RuntimeTrace): number[] {
  return trace
    .map((event) =>
      event.scope === "runtime" &&
      event.type === "started" &&
      event.label === "receive"
        ? event.metadata?.receiveEpoch
        : undefined,
    )
    .filter((epoch): epoch is number => typeof epoch === "number");
}

function hasTraceEvent(
  trace: RuntimeTrace,
  type: string,
  label: string,
): boolean {
  return trace.some((event) => event.type === type && event.label === label);
}
