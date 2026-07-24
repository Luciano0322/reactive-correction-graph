import {
  createTwoAgentCorrectionCoordinator,
  restoreTwoAgentCorrectionCoordinator,
  type TwoAgentCorrectionCoordinator,
  type TwoAgentCorrectionCoordinatorSnapshot,
  type TwoAgentCorrectionOutput,
} from "../agents/createTwoAgentCorrectionCoordinator.js";
import { createMockCorrectionModel } from "../llm/mockCorrectionModel.js";
import type {
  Claim,
  CorrectionRuntimeInput,
  FactCheckResult,
} from "../schemas/correction.js";
import type { TraceEvent } from "../trace/types.js";
import type {
  LoopRuntimeBlackBox,
  LoopRuntimeLifecycleBehaviorHarness,
  NormalizedLoopRuntimeTraceEvent,
} from "./loopRuntimeLifecycleBehaviorSuite.js";

type PocLoopRuntime = LoopRuntimeBlackBox<
  CorrectionRuntimeInput,
  TwoAgentCorrectionOutput,
  TwoAgentCorrectionCoordinatorSnapshot,
  NormalizedLoopRuntimeTraceEvent
>;

let nextCoordinatorId = 1;

export function createTwoAgentLoopRuntimeBehaviorHarness(): LoopRuntimeLifecycleBehaviorHarness<
  CorrectionRuntimeInput,
  TwoAgentCorrectionOutput,
  TwoAgentCorrectionCoordinatorSnapshot,
  NormalizedLoopRuntimeTraceEvent
> {
  return {
    initialInput: {
      draft: "The first claim maybe needs review.",
      styleGuide: "Use concise language.",
    },
    latestInput: {
      draft: "The current claim is supported.",
      styleGuide: "Use concise language.",
    },
    fixedPointStages: ["factCheckAgent", "writerAgent"],
    createRuntime: () =>
      new TwoAgentLoopRuntimeAdapter(
        createTwoAgentCorrectionCoordinator({
          coordinatorId: createCoordinatorId(),
        }),
      ),
    createLatestEpochRuntime: createLatestEpochScenario,
    restoreRuntime: (snapshot) =>
      new TwoAgentLoopRuntimeAdapter(
        restoreTwoAgentCorrectionCoordinator(snapshot),
        snapshot,
      ),
    inputKey: (input) => input.draft,
    outputKey: readOutputClaimKey,
    normalizeTrace: (trace) => trace,
  };
}

class TwoAgentLoopRuntimeAdapter implements PocLoopRuntime {
  private readonly inputKeys = new Map<number, string>();
  private inputVersion = 0;
  private restoredInputKey: string | undefined;

  constructor(
    private readonly coordinator: TwoAgentCorrectionCoordinator,
    restoredSnapshot?: TwoAgentCorrectionCoordinatorSnapshot,
  ) {
    if (restoredSnapshot) {
      this.inputVersion = restoredSnapshot.inputVersion;
      this.restoredInputKey = restoredSnapshot.currentInput.draft;
      this.inputKeys.set(
        restoredSnapshot.inputVersion,
        restoredSnapshot.currentInput.draft,
      );
    }
  }

  receive(input: CorrectionRuntimeInput): void {
    this.inputVersion += 1;
    this.inputKeys.set(this.inputVersion, input.draft);
    this.coordinator.receive(input);
  }

  runUntilSettled(): Promise<void> {
    return this.coordinator.runUntilSettled();
  }

  emit(): TwoAgentCorrectionOutput {
    return this.coordinator.emit();
  }

  snapshot(): TwoAgentCorrectionCoordinatorSnapshot {
    return this.coordinator.snapshot();
  }

  trace(): readonly NormalizedLoopRuntimeTraceEvent[] {
    const normalized = this.coordinator
      .trace()
      .flatMap((event) => this.normalizeCoordinatorEvent(event));

    if (this.restoredInputKey) {
      normalized.push({
        sequence: normalized.length + 1,
        type: "restored",
        label: "snapshot",
        inputKey: this.restoredInputKey,
      });
    }

    return normalized.map((event, index) => ({
      ...event,
      sequence: index + 1,
    }));
  }

  dispose(): void {
    this.coordinator.dispose();
  }

  private normalizeCoordinatorEvent(
    event: TraceEvent,
  ): NormalizedLoopRuntimeTraceEvent[] {
    const inputVersion = event.metadata?.inputVersion;
    const inputKey =
      typeof inputVersion === "number"
        ? this.inputKeys.get(inputVersion)
        : undefined;

    if (
      (event.type === "pending" || event.type === "resolved") &&
      (event.label === "factCheckAgent" || event.label === "writerAgent")
    ) {
      return [
        {
          sequence: 0,
          type: event.type,
          label: event.label,
          ...(inputKey === undefined ? {} : { inputKey }),
        },
      ];
    }

    if (event.type === "emitted" && event.label === "twoAgentFinalResult") {
      return [
        {
          sequence: 0,
          type: "emitted",
          label: "output",
          ...(inputKey === undefined ? {} : { inputKey }),
        },
      ];
    }

    if (
      event.type === "stale" &&
      event.metadata?.reason === "superseded async result"
    ) {
      return [
        {
          sequence: 0,
          type: "superseded",
          label: event.label,
          ...(inputKey === undefined ? {} : { inputKey }),
        },
      ];
    }

    return [];
  }
}

function createLatestEpochScenario() {
  const firstFactCheck = createDeferred<FactCheckResult>();
  const firstPending = createDeferred<void>();
  const baseModel = createMockCorrectionModel();
  let firstClaims: Claim[] = [];
  let callCount = 0;
  const coordinator = createTwoAgentCorrectionCoordinator({
    coordinatorId: createCoordinatorId(),
    model: {
      ...baseModel,
      factCheckClaims(claims) {
        callCount += 1;
        if (callCount === 1) {
          firstClaims = claims.map((claim) => ({ ...claim }));
          firstPending.resolve();
          return firstFactCheck.promise;
        }

        return baseModel.factCheckClaims(claims);
      },
    },
  });

  return {
    runtime: new TwoAgentLoopRuntimeAdapter(coordinator),
    waitForFirstPending: () => firstPending.promise,
    releaseFirst: () =>
      firstFactCheck.resolve({
        items: firstClaims.map((claim) => ({
          claimId: claim.id,
          verdict: "needs-review",
          note: "This result belongs to the superseded input.",
        })),
      }),
  };
}

function readOutputClaimKey(output: TwoAgentCorrectionOutput): string {
  const payload = output.evidenceEnvelope.payload as unknown as {
    claims: Claim[];
  };
  return payload.claims.map((claim) => claim.text).join(" ");
}

function createCoordinatorId(): string {
  return `loop-runtime-poc-${nextCoordinatorId++}`;
}

type Deferred<Value> = {
  promise: Promise<Value>;
  resolve(value: Value): void;
};

function createDeferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}
