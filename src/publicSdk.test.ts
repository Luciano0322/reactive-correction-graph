import { describe, expect, it } from "vitest";
import {
  createCorrectionGraphCheckpoint,
  createCorrectionGraphSession,
  createCorrectionSession,
  createCorrectionSessionArtifactBundle,
  parseCorrectionGraphCheckpoint,
  restoreCorrectionSessionFromCheckpoint,
} from "reactive-correction-graph";

describe("public SDK surface", () => {
  it("runs representative session and checkpoint APIs from the package root", async () => {
    const session = createCorrectionSession();

    session.receive({
      draft: "Signal-kernel coordinates async correction branches.",
      userIntent: "Explain the public SDK boundary.",
    });
    await session.runUntilSettled();

    const sessionSnapshot = session.snapshot();
    const artifactBundle = createCorrectionSessionArtifactBundle(
      sessionSnapshot,
      {
        command: "demo",
        provider: "deterministic-mock",
        resultMarkdown: "# Result\n\nPublic SDK artifact bundle.\n",
      },
      {
        createRunId: () => "public-sdk-001",
        now: () => new Date("2026-07-09T00:00:00.000Z"),
      },
    );

    const graphSession = createCorrectionGraphSession();
    const graphState = await graphSession.invoke({
      draft: "Signal-kernel coordinates async correction branches.",
      styleGuide: "Use concise technical language.",
    });
    const checkpoint = createCorrectionGraphCheckpoint(graphState);
    const parsedCheckpoint = parseCorrectionGraphCheckpoint(
      JSON.parse(JSON.stringify(checkpoint)),
    );
    const restoredSession =
      restoreCorrectionSessionFromCheckpoint(parsedCheckpoint);

    await restoredSession.runUntilSettled();

    const restoredState = restoredSession.emit();

    expect({
      sessionFinalResult: sessionSnapshot.state?.finalResult?.revisedDraft,
      artifactRunId: artifactBundle.manifest.run.id,
      checkpointSchemaVersion: checkpoint.schemaVersion,
      restoredFinalResult: restoredState.finalResult,
    }).toEqual({
      sessionFinalResult: expect.stringContaining("Mock correction notes"),
      artifactRunId: "public-sdk-001",
      checkpointSchemaVersion: 1,
      restoredFinalResult: graphState.finalResult,
    });
  });
});
