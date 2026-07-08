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
  type CorrectionRuntime,
  type CorrectionRuntimeOptions,
  type CorrectionRuntimeSnapshot,
} from "../runtime/createCorrectionRuntime.js";
import {
  createCorrectionGraphCheckpoint,
  parseCorrectionGraphCheckpoint,
  restoreCorrectionSessionFromCheckpoint,
  type CorrectionGraphCheckpoint,
} from "./correctionGraphCheckpoint.js";

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
export type CorrectionGraphSessionOptions = CorrectionRuntimeOptions & {
  checkpoint?: unknown;
};
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
  options: CorrectionGraphSessionOptions = {},
) {
  const { checkpoint, ...runtimeOptions } = options;
  const runtime =
    checkpoint === undefined
      ? createCorrectionRuntime(runtimeOptions)
      : createCheckpointBackedCorrectionRuntime(checkpoint, runtimeOptions);

  return Object.assign(createCorrectionGraph({ runtime }), {
    subscribe: runtime.subscribe,
    checkpoint: createCorrectionGraphCheckpoint,
  });
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

function createCheckpointBackedCorrectionRuntime(
  checkpointValue: unknown,
  options: CorrectionRuntimeOptions,
): CorrectionRuntime {
  const checkpoint = parseCorrectionGraphCheckpoint(checkpointValue);
  const checkpointInput = checkpointStateToRuntimeInput(checkpoint);
  const session = restoreCorrectionSessionFromCheckpoint(checkpoint, options);
  let restoredSettled = false;
  let pendingInput: CorrectionRuntimeInput | undefined;

  return {
    receive(input) {
      if (!restoredSettled) {
        pendingInput = input;
        return;
      }

      session.receive(input);
    },
    async runUntilSettled() {
      if (!restoredSettled) {
        await session.runUntilSettled();
        restoredSettled = true;

        const input = pendingInput;
        pendingInput = undefined;
        if (input && !areRuntimeInputsEqual(input, checkpointInput)) {
          session.receive(input);
          await session.runUntilSettled();
        }
        return;
      }

      await session.runUntilSettled();
    },
    emit() {
      return session.emit();
    },
    snapshot() {
      return session.snapshot().runtimeSnapshot;
    },
    trace() {
      return session.snapshot().trace;
    },
    subscribe(listener) {
      return session.subscribe(listener);
    },
  };
}

function checkpointStateToRuntimeInput(
  checkpoint: CorrectionGraphCheckpoint,
): CorrectionRuntimeInput {
  return {
    draft: checkpoint.state.draft,
    userIntent: checkpoint.state.userIntent,
    styleGuide: checkpoint.state.styleGuide,
  };
}

function areRuntimeInputsEqual(
  left: CorrectionRuntimeInput,
  right: CorrectionRuntimeInput,
) {
  return (
    left.draft === right.draft &&
    left.userIntent === right.userIntent &&
    left.styleGuide === right.styleGuide
  );
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
