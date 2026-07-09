import { describe, expect, it } from "vitest";
import { createCorrectionSession } from "../session/createCorrectionSession.js";
import { createCorrectionGraph } from "./createCorrectionGraph.js";
import {
  createCorrectionGraphCheckpoint,
  parseCorrectionGraphCheckpoint,
  restoreCorrectionSessionFromCheckpoint,
} from "./correctionGraphCheckpoint.js";

describe("correction graph checkpoint contract", () => {
  it("creates a versioned JSON checkpoint from completed graph state", async () => {
    const graph = createCorrectionGraph();
    const state = await graph.invoke({
      draft: "Signal-kernel coordinates async correction branches.",
      userIntent: "Explain the durable restore boundary.",
      styleGuide: "Use concise technical language.",
    });

    const checkpoint = createCorrectionGraphCheckpoint(state);
    const roundTripped = parseCorrectionGraphCheckpoint(
      JSON.parse(JSON.stringify(checkpoint)),
    );

    expect({
      schemaVersion: checkpoint.schemaVersion,
      stateKeys: Object.keys(checkpoint.state).sort(),
      draft: checkpoint.state.draft,
      finalResult: checkpoint.state.finalResult,
      traceLength: checkpoint.state.trace.length,
      graphTraceLength: checkpoint.state.graphTrace.length,
      runtimeStatus: checkpoint.state.snapshot?.statuses.rewriteDraft,
      roundTripped,
      serializedText: JSON.stringify(checkpoint),
    }).toEqual({
      schemaVersion: 1,
      stateKeys: [
        "claims",
        "correctionPlan",
        "draft",
        "factCheckResult",
        "finalResult",
        "finalized",
        "graphTrace",
        "prepared",
        "revisedDraft",
        "snapshot",
        "styleGuide",
        "styleReviewResult",
        "trace",
        "userIntent",
      ],
      draft: state.draft,
      finalResult: state.finalResult,
      traceLength: state.trace.length,
      graphTraceLength: state.graphTrace.length,
      runtimeStatus: "success",
      roundTripped: checkpoint,
      serializedText: expect.not.stringContaining("subscribe"),
    });
  });

  it("rejects unsupported versions and live runtime values", () => {
    expect(() =>
      parseCorrectionGraphCheckpoint({
        schemaVersion: 2,
        state: {
          draft: "Unsupported checkpoint.",
          trace: [],
          graphTrace: [],
        },
      }),
    ).toThrow("Unsupported correction graph checkpoint schema version: 2");

    expect(() =>
      parseCorrectionGraphCheckpoint({
        schemaVersion: 1,
        state: {
          draft: "Live runtime objects do not belong in graph checkpoints.",
          trace: [],
          graphTrace: [],
          session: createCorrectionSession(),
        },
      }),
    ).toThrow("Correction graph checkpoint must contain JSON-compatible data");

    expect(() =>
      parseCorrectionGraphCheckpoint({
        schemaVersion: 1,
        state: {
          draft: "Promises do not belong in graph checkpoints.",
          trace: [],
          graphTrace: [],
          pending: Promise.resolve("work"),
        },
      }),
    ).toThrow("Correction graph checkpoint must contain JSON-compatible data");
  });

  it("restores a fresh correction session from checkpoint input", async () => {
    const graph = createCorrectionGraph();
    const originalState = await graph.invoke({
      draft: "Signal-kernel coordinates async correction branches.",
      userIntent: "Explain the durable restore boundary.",
      styleGuide: "Use concise technical language.",
    });
    const checkpoint = createCorrectionGraphCheckpoint(originalState);
    const serializedCheckpoint = JSON.parse(JSON.stringify(checkpoint));

    const restoredSession =
      restoreCorrectionSessionFromCheckpoint(serializedCheckpoint);
    await restoredSession.runUntilSettled();

    const restoredState = restoredSession.emit();
    const restoredSnapshot = restoredSession.snapshot();
    const receiveStartedCount = restoredState.trace.filter(
      (event) =>
        event.scope === "runtime" &&
        event.type === "started" &&
        event.label === "receive",
    ).length;

    expect({
      finalResult: restoredState.finalResult,
      claims: restoredState.claims,
      factCheckResult: restoredState.factCheckResult,
      styleReviewResult: restoredState.styleReviewResult,
      receiveStartedCount,
      snapshotStatus: restoredSnapshot.status,
      runtimeStatus: restoredSnapshot.runtimeSnapshot.statuses.rewriteDraft,
      graphTraceRestoredIntoRuntime: restoredState.trace.some(
        (event) => event.scope === "graph",
      ),
    }).toEqual({
      finalResult: originalState.finalResult,
      claims: originalState.claims,
      factCheckResult: originalState.factCheckResult,
      styleReviewResult: originalState.styleReviewResult,
      receiveStartedCount: 1,
      snapshotStatus: "settled",
      runtimeStatus: "success",
      graphTraceRestoredIntoRuntime: false,
    });
  });

  it("keeps selective recomputation on a second receive after restore", async () => {
    const graph = createCorrectionGraph();
    const originalState = await graph.invoke({
      draft: "Signal-kernel coordinates async correction branches.",
      userIntent: "Explain the durable restore boundary.",
    });
    const checkpoint = createCorrectionGraphCheckpoint(originalState);
    const restoredSession = restoreCorrectionSessionFromCheckpoint(
      JSON.parse(JSON.stringify(checkpoint)),
    );

    await restoredSession.runUntilSettled();
    const restoredState = restoredSession.emit();
    const firstTraceLength = restoredState.trace.length;

    restoredSession.receive({
      draft: checkpoint.state.draft,
      userIntent: checkpoint.state.userIntent,
      styleGuide: "Use concise technical language.",
    });
    await restoredSession.runUntilSettled();

    const secondState = restoredSession.emit();
    const secondReceiveTrace = secondState.trace.slice(firstTraceLength);
    const hasEvent = (type: string, label: string) =>
      secondReceiveTrace.some(
        (event) => event.type === type && event.label === label,
      );
    const receiveEpochs = secondState.trace
      .map((event) =>
        event.scope === "runtime" &&
        event.type === "started" &&
        event.label === "receive"
          ? event.metadata?.receiveEpoch
          : undefined,
      )
      .filter((epoch): epoch is number => typeof epoch === "number");

    expect({
      receiveEpochs,
      factCheckStale: hasEvent("stale", "factCheck"),
      factCheckPending: hasEvent("pending", "factCheck"),
      styleReviewStale: hasEvent("stale", "styleReview"),
      styleReviewPending: hasEvent("pending", "styleReview"),
      rewriteDraftPending: hasEvent("pending", "rewriteDraft"),
      summary: secondState.finalResult?.summary,
      finalResultChanged:
        secondState.finalResult?.revisedDraft !==
        restoredState.finalResult?.revisedDraft,
    }).toEqual({
      receiveEpochs: [1, 2],
      factCheckStale: false,
      factCheckPending: false,
      styleReviewStale: true,
      styleReviewPending: true,
      rewriteDraftPending: true,
      summary: expect.arrayContaining([
        "Apply style guide: Use concise technical language.",
      ]),
      finalResultChanged: true,
    });
  });

  it("prevents pre-restore async work from overwriting the restored session", async () => {
    const graph = createCorrectionGraph();
    const originalState = await graph.invoke({
      draft: "Signal-kernel coordinates async correction branches.",
      userIntent: "Explain the durable restore boundary.",
    });
    const checkpoint = createCorrectionGraphCheckpoint(originalState);
    const staleRewriteStarted = createDeferred<void>();
    const releaseStaleRewrite = createDeferred<void>();
    let rewriteCallCount = 0;
    const staleSession = restoreCorrectionSessionFromCheckpoint(checkpoint, {
      model: {
        rewriteDraft: async ({ draft }) => {
          rewriteCallCount += 1;

          if (rewriteCallCount === 1) {
            return `${draft}\n\nInitial pre-restore session rewrite.`;
          }

          staleRewriteStarted.resolve();
          await releaseStaleRewrite.promise;
          return `${draft}\n\nStale pre-restore rewrite.`;
        },
      },
    });

    await staleSession.runUntilSettled();
    staleSession.receive({
      draft:
        "Signal-kernel coordinates async correction branches. Stale update should not win.",
      userIntent: checkpoint.state.userIntent,
    });
    const staleWork = staleSession.runUntilSettled();
    await staleRewriteStarted.promise;

    const restoredSession = restoreCorrectionSessionFromCheckpoint(
      JSON.parse(JSON.stringify(checkpoint)),
    );
    await restoredSession.runUntilSettled();

    const restoredBeforeOldWorkFinishes = restoredSession.emit();
    const restoredTraceLengthBeforeOldWork =
      restoredBeforeOldWorkFinishes.trace.length;

    releaseStaleRewrite.resolve();
    await staleWork;

    const staleState = staleSession.emit();
    const restoredAfterOldWorkFinishes = restoredSession.emit();
    const restoredReceiveEpochs = restoredAfterOldWorkFinishes.trace
      .map((event) =>
        event.scope === "runtime" &&
        event.type === "started" &&
        event.label === "receive"
          ? event.metadata?.receiveEpoch
          : undefined,
      )
      .filter((epoch): epoch is number => typeof epoch === "number");

    expect({
      restoredFinalResultBefore:
        restoredBeforeOldWorkFinishes.finalResult?.revisedDraft,
      restoredFinalResultAfter:
        restoredAfterOldWorkFinishes.finalResult?.revisedDraft,
      restoredTraceLengthBeforeOldWork,
      restoredTraceLengthAfterOldWork: restoredAfterOldWorkFinishes.trace.length,
      restoredReceiveEpochs,
      restoredContainsStaleUpdate:
        restoredAfterOldWorkFinishes.finalResult?.revisedDraft.includes(
          "Stale update should not win.",
        ),
      staleSessionCompletedStaleWork:
        staleState.finalResult?.revisedDraft.includes(
          "Stale pre-restore rewrite.",
        ),
    }).toEqual({
      restoredFinalResultBefore: originalState.finalResult?.revisedDraft,
      restoredFinalResultAfter: originalState.finalResult?.revisedDraft,
      restoredTraceLengthBeforeOldWork,
      restoredTraceLengthAfterOldWork: restoredTraceLengthBeforeOldWork,
      restoredReceiveEpochs: [1],
      restoredContainsStaleUpdate: false,
      staleSessionCompletedStaleWork: true,
    });
  });
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}
