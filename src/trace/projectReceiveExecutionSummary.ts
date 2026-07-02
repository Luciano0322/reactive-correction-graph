import type { TraceEvent } from "./types.js";

export type ReceiveExecutionSummary = {
  receiveEpoch: number;
  recomputed: string[];
  reused: string[];
  superseded: string[];
  emitted: string[];
};

const CORRECTION_OPERATION_ORDER = [
  "factCheck",
  "styleReview",
  "rewriteDraft",
];

export function projectReceiveExecutionSummary(
  trace: TraceEvent[],
  receiveEpoch: number,
): ReceiveExecutionSummary {
  const startIndex = trace.findIndex(
    (event) =>
      isReceiveStart(event) &&
      event.metadata?.receiveEpoch === receiveEpoch,
  );

  if (startIndex === -1) {
    throw new Error(`Receive epoch ${receiveEpoch} was not found in trace`);
  }

  const nextReceiveIndex = trace.findIndex(
    (event, index) => index > startIndex && isReceiveStart(event),
  );
  const receiveTrace = trace.slice(
    startIndex,
    nextReceiveIndex === -1 ? trace.length : nextReceiveIndex,
  );
  const recomputed = orderCorrectionOperations(
    uniqueLabels(
      receiveTrace,
      (event) => event.scope === "resource" && event.type === "resolved",
    ),
  );
  const previouslyResolved = orderCorrectionOperations(
    uniqueLabels(
      trace.slice(0, startIndex),
      (event) => event.scope === "resource" && event.type === "resolved",
    ),
  );
  const currentWork = uniqueLabels(
    receiveTrace,
    (event) =>
      event.scope === "resource" &&
      ["stale", "pending", "rejected"].includes(event.type),
  );

  return {
    receiveEpoch,
    recomputed,
    reused: orderCorrectionOperations(
      previouslyResolved.filter(
        (label) => !recomputed.includes(label) && !currentWork.includes(label),
      ),
    ),
    superseded: orderCorrectionOperations(
      uniqueLabels(receiveTrace, (event) =>
        isPendingResourceCancellation(trace, event),
      ),
    ),
    emitted: uniqueLabels(
      receiveTrace,
      (event) => event.scope === "effect" && event.type === "emitted",
    ),
  };
}

export function serializeReceiveExecutionSummary(
  summary: ReceiveExecutionSummary,
): string {
  return `${JSON.stringify(summary, null, 2)}\n`;
}

function isReceiveStart(event: TraceEvent) {
  return (
    event.scope === "runtime" &&
    event.type === "started" &&
    event.label === "receive"
  );
}

function uniqueLabels(
  trace: TraceEvent[],
  matches: (event: TraceEvent) => boolean,
) {
  return [...new Set(trace.filter(matches).map((event) => event.label))];
}

function orderCorrectionOperations(labels: string[]) {
  return CORRECTION_OPERATION_ORDER.filter((label) => labels.includes(label));
}

function isPendingResourceCancellation(
  trace: TraceEvent[],
  event: TraceEvent,
) {
  const token = event.metadata?.token;
  if (
    event.scope !== "resource" ||
    event.type !== "skipped" ||
    typeof token !== "number"
  ) {
    return false;
  }

  const cancellationIndex = trace.findIndex(
    (candidate) => candidate.id === event.id,
  );
  const previousLifecycle = trace
    .slice(0, cancellationIndex)
    .filter(
      (candidate) =>
        candidate.scope === "resource" &&
        candidate.label === event.label &&
        candidate.metadata?.token === token &&
        ["pending", "resolved", "rejected"].includes(candidate.type),
    );
  const pendingEvent = previousLifecycle.at(-1);

  if (pendingEvent?.type !== "pending") return false;

  const pendingIndex = trace.findIndex(
    (candidate) => candidate.id === pendingEvent.id,
  );
  const executionWasSkipped = trace
    .slice(pendingIndex + 1, cancellationIndex)
    .some(
      (candidate) =>
        candidate.scope === "resource" &&
        candidate.label === event.label &&
        candidate.type === "skipped" &&
        typeof candidate.metadata?.token !== "number",
    );

  return !executionWasSkipped;
}
