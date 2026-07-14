import {
  createCorrectionSession,
  createCorrectionSessionArtifactBundle,
} from "reactive-correction-graph";

export type MinimalSdkUsageExampleResult = {
  revisedDraft: string;
  summary: string[];
  unresolvedIssueCount: number;
  traceEventCount: number;
  artifactRunId: string;
};

export async function runMinimalSdkUsageExample(): Promise<MinimalSdkUsageExampleResult> {
  const session = createCorrectionSession();

  session.receive({
    draft: "Signal-kernel coordinates async correction branches.",
    userIntent: "Explain the reactive correction flow.",
    styleGuide: "Use concise technical language.",
  });
  await session.runUntilSettled();

  const snapshot = session.snapshot();
  const state = session.emit();
  const finalResult = state.finalResult;

  if (!finalResult) {
    throw new Error("Minimal SDK usage example did not produce a final result.");
  }

  const artifactBundle = createCorrectionSessionArtifactBundle(
    snapshot,
    {
      command: "demo",
      provider: "deterministic-mock",
      resultMarkdown: finalResult.revisedDraft,
    },
    {
      createRunId: () => "minimal-sdk-example-001",
      now: () => new Date("2026-07-09T00:00:00.000Z"),
    },
  );

  return {
    revisedDraft: finalResult.revisedDraft,
    summary: finalResult.summary,
    unresolvedIssueCount: finalResult.unresolvedIssues.length,
    traceEventCount: snapshot.trace.length,
    artifactRunId: artifactBundle.manifest.run.id,
  };
}
