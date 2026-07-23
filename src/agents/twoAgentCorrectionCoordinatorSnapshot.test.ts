import { describe, expect, it } from "vitest";
import { createMockCorrectionModel } from "../llm/mockCorrectionModel.js";
import type {
  CorrectionRuntimeInput,
  FactCheckResult,
} from "../schemas/correction.js";
import {
  createTwoAgentCorrectionCoordinator,
  restoreTwoAgentCorrectionCoordinator,
  type TwoAgentCorrectionCoordinatorSnapshot,
} from "./createTwoAgentCorrectionCoordinator.js";

function createDeferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe("two-agent correction coordinator snapshot", () => {
  it("round-trips a settled coordinator snapshot through JSON", async () => {
    const coordinator = createTwoAgentCorrectionCoordinator({
      coordinatorId: "coordinator-snapshot-round-trip",
    });
    const input: CorrectionRuntimeInput = {
      draft: "The sky maybe appears green under unusual lighting.",
      userIntent: "Clarify the tentative observation.",
      styleGuide: "Use concise language.",
    };

    coordinator.receive(input);
    await coordinator.runUntilSettled();

    const output = coordinator.emit();
    const snapshot = coordinator.snapshot();
    const roundTripped = JSON.parse(
      JSON.stringify(snapshot),
    ) as TwoAgentCorrectionCoordinatorSnapshot;

    expect(roundTripped).toEqual(snapshot);
    expect(roundTripped).toMatchObject({
      schemaVersion: 1,
      coordinatorId: "coordinator-snapshot-round-trip",
      status: "settled",
      inputVersion: 1,
      currentInput: input,
      acceptedEvidence: output.evidenceEnvelope,
      output,
      trace: coordinator.trace(),
      agentSnapshots: {
        "fact-check-agent": {
          identity: {
            agentId: "fact-check-agent",
            role: "fact-check",
          },
          runtimeSnapshot: expect.any(Object),
        },
        "writer-agent": {
          identity: {
            agentId: "writer-agent",
            role: "writer",
          },
          runtimeSnapshot: expect.any(Object),
        },
      },
    });
    expect(
      roundTripped.agentSnapshots["fact-check-agent"].runtimeSnapshot,
    ).toMatchObject({
      schema: "signal-kernel.snapshot.v1",
      graph: {
        id: "reactive-correction-graph/fact-check-agent",
        version: "1",
        instanceId:
          "coordinator-snapshot-round-trip/fact-check-agent",
      },
      metadata: {
        status: "settled",
      },
      nodes: [
        {
          id: "settledState",
          kind: "signal",
          value: expect.objectContaining({
            inputVersion: 1,
            claims: [
              {
                id: "claim-1",
                text: input.draft,
              },
            ],
          }),
        },
      ],
    });
    expect(
      roundTripped.agentSnapshots["writer-agent"].runtimeSnapshot,
    ).toMatchObject({
      schema: "signal-kernel.snapshot.v1",
      graph: {
        id: "reactive-correction-graph/writer-agent",
        version: "1",
        instanceId: "coordinator-snapshot-round-trip/writer-agent",
      },
      metadata: {
        status: "settled",
      },
      nodes: [
        {
          id: "settledState",
          kind: "signal",
          value: expect.objectContaining({
            inputVersion: 1,
            currentInput: input,
            evidenceEnvelope: output.evidenceEnvelope,
            finalResult: output.finalResult,
          }),
        },
      ],
    });

    coordinator.dispose();
  });

  it("continues style reuse and claim invalidation after restore", async () => {
    const source = createTwoAgentCorrectionCoordinator({
      coordinatorId: "coordinator-restore-and-continue",
    });
    const initialInput: CorrectionRuntimeInput = {
      draft: "The sky maybe appears green under unusual lighting.",
      userIntent: "Clarify the tentative observation.",
      styleGuide: "Use concise language.",
    };

    source.receive(initialInput);
    await source.runUntilSettled();

    const initialOutput = source.emit();
    const baselineTrace = source.trace();
    const persistedSnapshot = JSON.parse(
      JSON.stringify(source.snapshot()),
    ) as TwoAgentCorrectionCoordinatorSnapshot;

    source.dispose();

    const restored =
      restoreTwoAgentCorrectionCoordinator(persistedSnapshot);

    expect(restored.emit()).toEqual(initialOutput);
    expect(restored.trace().slice(0, baselineTrace.length)).toEqual(
      baselineTrace,
    );

    restored.receive({
      ...initialInput,
      styleGuide: "Use short declarative sentences.",
    });
    await restored.runUntilSettled();

    const styleOutput = restored.emit();
    const styleTrace = restored.trace().filter(
      (event) => event.metadata?.inputVersion === 2,
    );

    expect(styleOutput).toMatchObject({
      inputVersion: 2,
      evidenceEnvelope: initialOutput.evidenceEnvelope,
    });
    expect(styleTrace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "runtime",
          type: "skipped",
          label: "factCheckAgent",
          metadata: expect.objectContaining({
            inputVersion: 2,
            evidenceInputVersion: 1,
            reason: "evidence reused",
          }),
        }),
        expect.objectContaining({
          scope: "runtime",
          type: "pending",
          label: "writerAgent",
          metadata: expect.objectContaining({
            inputVersion: 2,
          }),
        }),
      ]),
    );
    expect(styleTrace).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "pending",
          label: "factCheckAgent",
        }),
      ]),
    );

    restored.receive({
      ...initialInput,
      draft: "The moon maybe appears green under unusual lighting.",
      styleGuide: "Use short declarative sentences.",
    });
    await restored.runUntilSettled();

    const claimOutput = restored.emit();
    const claimTrace = restored.trace().filter(
      (event) => event.metadata?.inputVersion === 3,
    );

    expect(claimOutput).toMatchObject({
      inputVersion: 3,
      evidenceEnvelope: {
        inputVersion: 3,
        payload: {
          claims: [
            {
              id: "claim-1",
              text: "The moon maybe appears green under unusual lighting.",
            },
          ],
        },
      },
    });
    expect(claimTrace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "runtime",
          type: "stale",
          label: "factCheckEvidence",
          metadata: expect.objectContaining({
            inputVersion: 3,
            evidenceInputVersion: 1,
            reason: "claims changed",
          }),
        }),
        expect.objectContaining({
          scope: "runtime",
          type: "pending",
          label: "factCheckAgent",
          metadata: expect.objectContaining({
            inputVersion: 3,
          }),
        }),
        expect.objectContaining({
          scope: "runtime",
          type: "resolved",
          label: "factCheckAgent",
          metadata: expect.objectContaining({
            inputVersion: 3,
          }),
        }),
      ]),
    );

    restored.dispose();
  });

  it("isolates restored state from async work started by the source coordinator", async () => {
    const delayedFactCheck = createDeferred<FactCheckResult>();
    const baseModel = createMockCorrectionModel();
    let factCheckCallCount = 0;
    const source = createTwoAgentCorrectionCoordinator({
      coordinatorId: "coordinator-pre-restore-work",
      model: {
        ...baseModel,
        factCheckClaims(claims) {
          factCheckCallCount += 1;
          if (factCheckCallCount === 2) {
            return delayedFactCheck.promise;
          }

          return baseModel.factCheckClaims(claims);
        },
      },
    });
    const initialInput: CorrectionRuntimeInput = {
      draft: "The sky maybe appears green under unusual lighting.",
      styleGuide: "Use concise language.",
    };

    source.receive(initialInput);
    await source.runUntilSettled();

    const persistedSnapshot = JSON.parse(
      JSON.stringify(source.snapshot()),
    ) as TwoAgentCorrectionCoordinatorSnapshot;

    source.receive({
      ...initialInput,
      draft: "The moon maybe appears green under unusual lighting.",
    });
    const sourceSettlement = source.runUntilSettled();

    const restored =
      restoreTwoAgentCorrectionCoordinator(persistedSnapshot);
    restored.receive({
      ...initialInput,
      styleGuide: "Use short declarative sentences.",
    });
    await restored.runUntilSettled();

    const restoredOutputBeforeLateResult = restored.emit();
    const restoredTraceBeforeLateResult = restored.trace();

    delayedFactCheck.resolve({
      items: [
        {
          claimId: "claim-1",
          verdict: "supported",
          note: "This result belongs only to the source coordinator.",
        },
      ],
    });
    await sourceSettlement;

    expect(restored.emit()).toEqual(restoredOutputBeforeLateResult);
    expect(restored.trace()).toEqual(restoredTraceBeforeLateResult);
    expect(
      new Set(restored.trace().map((event) => event.id)).size,
    ).toBe(restored.trace().length);

    source.dispose();
    restored.dispose();
  });
});
