import { describe, expect, it } from "vitest";
import {
  createCorrectionSession,
  createCorrectionSessionArtifactBundle,
} from "./createCorrectionSession.js";

describe("createCorrectionSession", () => {
  it("runs a correction through a headless session interface", async () => {
    const session = createCorrectionSession();
    const input = {
      draft: "Signal-kernel coordinates async correction branches.",
      userIntent: "Explain why selective recomputation matters.",
      styleGuide: "Use concise technical language.",
    };

    session.receive(input);
    await session.runUntilSettled();

    const state = session.emit();
    const snapshot = session.snapshot();
    const roundTripped = JSON.parse(JSON.stringify({ state, snapshot })) as {
      state: typeof state;
      snapshot: typeof snapshot;
    };

    expect({
      draft: state.draft,
      finalResult: state.finalResult?.revisedDraft,
      traceHasFinalResult: state.trace.some(
        (event) =>
          event.scope === "effect" &&
          event.type === "emitted" &&
          event.label === "finalResult",
      ),
      runtimeStatus: state.snapshot.statuses.rewriteDraft,
      snapshotStatus: snapshot.status,
      snapshotTraceLength: snapshot.trace.length,
      roundTrippedFinalResult: roundTripped.state.finalResult?.revisedDraft,
    }).toEqual({
      draft: input.draft,
      finalResult: expect.stringContaining("Mock correction notes"),
      traceHasFinalResult: true,
      runtimeStatus: "success",
      snapshotStatus: "settled",
      snapshotTraceLength: state.trace.length,
      roundTrippedFinalResult: state.finalResult?.revisedDraft,
    });
  });

  it("creates a runtime artifact bundle from a serialized session snapshot", async () => {
    const session = createCorrectionSession();
    const input = {
      draft: "Signal-kernel coordinates async correction branches.",
    };

    session.receive(input);
    await session.runUntilSettled();

    const snapshot = session.snapshot();
    const bundle = createCorrectionSessionArtifactBundle(
      snapshot,
      {
        command: "demo",
        provider: "deterministic-mock",
        resultMarkdown: "# Result\n\nA revised correction draft.\n",
      },
      {
        createRunId: () => "session-bundle-001",
        now: () => new Date("2026-07-08T00:00:00.000Z"),
      },
    );
    const roundTripped = JSON.parse(JSON.stringify(bundle)) as typeof bundle;

    expect(bundle).toEqual({
      manifest: {
        schemaVersion: 1,
        run: {
          id: "session-bundle-001",
          generatedAt: "2026-07-08T00:00:00.000Z",
          command: "demo",
          mode: "runtime",
          provider: "deterministic-mock",
        },
        artifacts: {
          result: {
            path: "result.md",
            mediaType: "text/markdown",
            schema: null,
          },
          state: {
            path: "state.json",
            mediaType: "application/json",
            schema: { name: "correction-state", version: 1 },
          },
          trace: {
            path: "trace.json",
            mediaType: "application/json",
            schema: { name: "trace-events", version: 1 },
          },
          executionSummary: null,
          comparison: null,
          savings: null,
          evaluation: null,
          scorecard: null,
          report: null,
        },
      },
      artifacts: {
        result: {
          path: "result.md",
          mediaType: "text/markdown",
          schema: null,
          content: "# Result\n\nA revised correction draft.\n",
        },
        state: {
          path: "state.json",
          mediaType: "application/json",
          schema: { name: "correction-state", version: 1 },
          content: snapshot.state,
        },
        trace: {
          path: "trace.json",
          mediaType: "application/json",
          schema: { name: "trace-events", version: 1 },
          content: snapshot.trace,
        },
      },
    });
    expect(roundTripped).toEqual(bundle);
  });

  it("keeps live subscribers attached when the session resets", async () => {
    const session = createCorrectionSession();
    const liveEvents: Array<{
      sequence: number;
      type: string;
      label: string;
    }> = [];
    const unsubscribe = session.subscribe((event) => {
      liveEvents.push({
        sequence: event.sequence,
        type: event.event.type,
        label: event.event.label,
      });
    });

    session.receive({
      draft: "Signal-kernel avoids repeated fact checking for unchanged claims.",
    });
    await session.runUntilSettled();

    const firstState = session.emit();
    const firstEventCount = liveEvents.length;

    session.reset();

    expect({
      finalResult: firstState.finalResult?.revisedDraft,
      resetSnapshot: session.snapshot(),
    }).toEqual({
      finalResult: expect.stringContaining("Mock correction notes"),
      resetSnapshot: {
        schemaVersion: 1,
        status: "idle",
        state: null,
        trace: [],
        runtimeSnapshot: {
          statuses: {
            factCheck: "idle",
            styleReview: "idle",
            rewriteDraft: "idle",
          },
        },
      },
    });
    expect(() => session.emit()).toThrow(
      "Correction session must receive input before emitting",
    );

    session.receive({
      draft: "Signal-kernel keeps style-only edits away from fact checking.",
    });
    await session.runUntilSettled();

    const secondState = session.emit();
    const secondEventCount = liveEvents.length;
    const liveSequences = liveEvents.map((event) => event.sequence);

    unsubscribe();
    session.receive({
      draft: "Signal-kernel still settles after live subscribers detach.",
    });
    await session.runUntilSettled();

    expect({
      secondFinalResult: secondState.finalResult?.revisedDraft,
      receivedAfterReset: secondEventCount > firstEventCount,
      uniqueSequences: new Set(liveSequences).size,
      sortedSequences: [...liveSequences].sort((a, b) => a - b),
      eventCountAfterUnsubscribe: liveEvents.length,
    }).toEqual({
      secondFinalResult: expect.stringContaining("Mock correction notes"),
      receivedAfterReset: true,
      uniqueSequences: liveSequences.length,
      sortedSequences: liveSequences,
      eventCountAfterUnsubscribe: secondEventCount,
    });
  });

  it("closes public session operations after dispose", async () => {
    const session = createCorrectionSession();
    const unsubscribe = session.subscribe(() => undefined);

    session.dispose();

    expect(() => unsubscribe()).not.toThrow();
    expect(() =>
      session.receive({
        draft: "A disposed session should not accept new input.",
      }),
    ).toThrow("Correction session has been disposed");
    await expect(session.runUntilSettled()).rejects.toThrow(
      "Correction session has been disposed",
    );
    expect(() => session.emit()).toThrow("Correction session has been disposed");
    expect(() => session.snapshot()).toThrow(
      "Correction session has been disposed",
    );
    expect(() => session.subscribe(() => undefined)).toThrow(
      "Correction session has been disposed",
    );
    expect(() => session.reset()).toThrow(
      "Correction session has been disposed",
    );
    expect(() => session.dispose()).not.toThrow();
  });
});
