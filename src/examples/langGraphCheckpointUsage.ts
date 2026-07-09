import {
  createCorrectionGraphCheckpoint,
  createCorrectionGraphSession,
  parseCorrectionGraphCheckpoint,
} from "reactive-correction-graph";

export type LangGraphCheckpointUsageExampleResult = {
  checkpointSchemaVersion: number;
  parsedCheckpointSchemaVersion: number;
  restoredCheckpointSchemaVersion: number;
  receiveEpochs: number[];
  factCheckPendingOnRestore: boolean;
  styleReviewPendingOnRestore: boolean;
  rewriteDraftPendingOnRestore: boolean;
  finalResultChangedAfterRestore: boolean;
  summary: string[];
  serializedCheckpointContainsLiveSession: boolean;
};

export async function runLangGraphCheckpointUsageExample(): Promise<LangGraphCheckpointUsageExampleResult> {
  const draft = "Signal-kernel coordinates async correction branches.";
  const userIntent = "Explain durable graph session restore.";

  const graphSession = createCorrectionGraphSession();
  const firstState = await graphSession.invoke({
    draft,
    userIntent,
  });
  const checkpoint = createCorrectionGraphCheckpoint(firstState);
  const serializedCheckpoint = JSON.stringify(checkpoint);
  const parsedCheckpoint = parseCorrectionGraphCheckpoint(
    JSON.parse(serializedCheckpoint),
  );

  const restoredGraphSession = createCorrectionGraphSession({
    checkpoint: parsedCheckpoint,
  });
  const restoredState = await restoredGraphSession.invoke({
    draft,
    userIntent,
    styleGuide: "Use concise technical language.",
  });
  const restoredCheckpoint = createCorrectionGraphCheckpoint(restoredState);
  const restoreTrace = restoredState.trace.slice(
    parsedCheckpoint.state.trace.length,
  );
  const hasRestoreEvent = (type: string, label: string) =>
    restoreTrace.some((event) => event.type === type && event.label === label);
  const receiveEpochs = restoredState.trace
    .map((event) =>
      event.scope === "runtime" &&
      event.type === "started" &&
      event.label === "receive"
        ? event.metadata?.receiveEpoch
        : undefined,
    )
    .filter((epoch): epoch is number => typeof epoch === "number");

  return {
    checkpointSchemaVersion: checkpoint.schemaVersion,
    parsedCheckpointSchemaVersion: parsedCheckpoint.schemaVersion,
    restoredCheckpointSchemaVersion: restoredCheckpoint.schemaVersion,
    receiveEpochs,
    factCheckPendingOnRestore: hasRestoreEvent("pending", "factCheck"),
    styleReviewPendingOnRestore: hasRestoreEvent("pending", "styleReview"),
    rewriteDraftPendingOnRestore: hasRestoreEvent("pending", "rewriteDraft"),
    finalResultChangedAfterRestore:
      restoredState.finalResult?.revisedDraft !==
      firstState.finalResult?.revisedDraft,
    summary: restoredState.finalResult?.summary ?? [],
    serializedCheckpointContainsLiveSession:
      serializedCheckpoint.includes("subscribe"),
  };
}
