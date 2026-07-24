export type NormalizedLoopRuntimeTraceEvent = {
  sequence: number;
  type:
    | "pending"
    | "resolved"
    | "emitted"
    | "superseded"
    | "restored";
  label: string;
  inputKey?: string;
};

export type LoopRuntimeBlackBox<Input, Output, Snapshot, TraceEvent> = {
  receive(input: Input): void;
  runUntilSettled(): Promise<void>;
  emit(): Output;
  snapshot(): Snapshot;
  trace(): readonly TraceEvent[];
  dispose(): void;
};

export type LatestEpochBehaviorScenario<
  Input,
  Output,
  Snapshot,
  TraceEvent,
> = {
  runtime: LoopRuntimeBlackBox<Input, Output, Snapshot, TraceEvent>;
  waitForFirstPending(): Promise<void>;
  releaseFirst(): void;
};

export type LoopRuntimeLifecycleBehaviorHarness<
  Input,
  Output,
  Snapshot,
  TraceEvent,
> = {
  initialInput: Input;
  latestInput: Input;
  fixedPointStages: readonly string[];
  createRuntime(): LoopRuntimeBlackBox<Input, Output, Snapshot, TraceEvent>;
  createLatestEpochRuntime(): LatestEpochBehaviorScenario<
    Input,
    Output,
    Snapshot,
    TraceEvent
  >;
  restoreRuntime(
    snapshot: Snapshot,
  ): LoopRuntimeBlackBox<Input, Output, Snapshot, TraceEvent>;
  inputKey(input: Input): string;
  outputKey(output: Output): string;
  normalizeTrace(
    trace: readonly TraceEvent[],
  ): readonly NormalizedLoopRuntimeTraceEvent[];
};

export type LoopRuntimeLifecycleBehaviorName =
  | "fixed-point-settlement"
  | "latest-epoch-wins"
  | "settled-only-emission"
  | "trace-contract"
  | "snapshot-restore";

export type LoopRuntimeLifecycleBehaviorReport = {
  passed: LoopRuntimeLifecycleBehaviorName[];
};

export async function runLoopRuntimeLifecycleBehaviorSuite<
  Input,
  Output,
  Snapshot,
  TraceEvent,
>(
  harness: LoopRuntimeLifecycleBehaviorHarness<
    Input,
    Output,
    Snapshot,
    TraceEvent
  >,
): Promise<LoopRuntimeLifecycleBehaviorReport> {
  await verifyFixedPointSettlement(harness);
  await verifyLatestEpochWins(harness);
  await verifySettledOnlyEmission(harness);
  await verifyTraceContract(harness);
  await verifySnapshotRestore(harness);

  return {
    passed: [
      "fixed-point-settlement",
      "latest-epoch-wins",
      "settled-only-emission",
      "trace-contract",
      "snapshot-restore",
    ],
  };
}

async function verifyFixedPointSettlement<
  Input,
  Output,
  Snapshot,
  TraceEvent,
>(
  harness: LoopRuntimeLifecycleBehaviorHarness<
    Input,
    Output,
    Snapshot,
    TraceEvent
  >,
): Promise<void> {
  assertBehavior(
    harness.fixedPointStages.length >= 2,
    "fixed-point settlement requires at least two observable stages",
  );

  const runtime = harness.createRuntime();

  try {
    runtime.receive(harness.initialInput);
    await runtime.runUntilSettled();

    assertOutputMatches(runtime.emit(), harness.initialInput, harness);

    const trace = harness.normalizeTrace(runtime.trace());
    let lastResolvedIndex = -1;

    for (const stage of harness.fixedPointStages) {
      const pendingIndex = trace.findIndex(
        (event) => event.type === "pending" && event.label === stage,
      );
      const resolvedIndex = trace.findIndex(
        (event) => event.type === "resolved" && event.label === stage,
      );

      assertBehavior(
        pendingIndex !== -1 && resolvedIndex > pendingIndex,
        `fixed-point stage "${stage}" must resolve after becoming pending`,
      );
      lastResolvedIndex = Math.max(lastResolvedIndex, resolvedIndex);
    }

    const emittedIndex = trace.findIndex((event) => event.type === "emitted");
    assertBehavior(
      emittedIndex > lastResolvedIndex,
      "fixed-point output must emit after every required stage resolves",
    );
  } finally {
    runtime.dispose();
  }
}

async function verifyLatestEpochWins<
  Input,
  Output,
  Snapshot,
  TraceEvent,
>(
  harness: LoopRuntimeLifecycleBehaviorHarness<
    Input,
    Output,
    Snapshot,
    TraceEvent
  >,
): Promise<void> {
  const scenario = harness.createLatestEpochRuntime();
  const { runtime } = scenario;
  let firstSettlement: Promise<void> | undefined;

  try {
    runtime.receive(harness.initialInput);
    firstSettlement = runtime.runUntilSettled();
    await scenario.waitForFirstPending();

    runtime.receive(harness.latestInput);
    await runtime.runUntilSettled();

    scenario.releaseFirst();
    await firstSettlement;

    assertOutputMatches(runtime.emit(), harness.latestInput, harness);

    const trace = harness.normalizeTrace(runtime.trace());
    const initialKey = harness.inputKey(harness.initialInput);
    const latestKey = harness.inputKey(harness.latestInput);

    assertBehavior(
      trace.some(
        (event) =>
          event.type === "superseded" && event.inputKey === initialKey,
      ),
      "latest-epoch settlement must trace superseded work from the older input",
    );
    assertBehavior(
      trace.some(
        (event) => event.type === "emitted" && event.inputKey === latestKey,
      ),
      "latest-epoch settlement must emit the newest input",
    );
  } finally {
    scenario.releaseFirst();
    await firstSettlement?.catch(() => undefined);
    runtime.dispose();
  }
}

async function verifySettledOnlyEmission<
  Input,
  Output,
  Snapshot,
  TraceEvent,
>(
  harness: LoopRuntimeLifecycleBehaviorHarness<
    Input,
    Output,
    Snapshot,
    TraceEvent
  >,
): Promise<void> {
  const runtime = harness.createRuntime();

  try {
    let rejectedBeforeSettlement = false;

    try {
      runtime.emit();
    } catch {
      rejectedBeforeSettlement = true;
    }

    assertBehavior(
      rejectedBeforeSettlement,
      "emit() must reject before the runtime has settled",
    );

    runtime.receive(harness.initialInput);
    await runtime.runUntilSettled();
    assertOutputMatches(runtime.emit(), harness.initialInput, harness);
  } finally {
    runtime.dispose();
  }
}

async function verifyTraceContract<
  Input,
  Output,
  Snapshot,
  TraceEvent,
>(
  harness: LoopRuntimeLifecycleBehaviorHarness<
    Input,
    Output,
    Snapshot,
    TraceEvent
  >,
): Promise<void> {
  const runtime = harness.createRuntime();

  try {
    runtime.receive(harness.initialInput);
    await runtime.runUntilSettled();

    const rawTrace = runtime.trace();
    const serializedTrace = JSON.stringify(rawTrace);
    assertBehavior(
      JSON.stringify(JSON.parse(serializedTrace)) === serializedTrace,
      "trace must be JSON-compatible",
    );

    const trace = harness.normalizeTrace(rawTrace);
    assertBehavior(trace.length > 0, "trace must not be empty after settlement");

    for (let index = 0; index < trace.length; index += 1) {
      const previous = trace[index - 1];
      const current = trace[index]!;
      assertBehavior(
        Number.isInteger(current.sequence) &&
          current.sequence > 0 &&
          (!previous || current.sequence > previous.sequence),
        "trace sequence must be positive and strictly increasing",
      );
    }

    for (const requiredType of ["pending", "resolved", "emitted"] as const) {
      assertBehavior(
        trace.some((event) => event.type === requiredType),
        `trace must include a ${requiredType} event`,
      );
    }
  } finally {
    runtime.dispose();
  }
}

async function verifySnapshotRestore<
  Input,
  Output,
  Snapshot,
  TraceEvent,
>(
  harness: LoopRuntimeLifecycleBehaviorHarness<
    Input,
    Output,
    Snapshot,
    TraceEvent
  >,
): Promise<void> {
  const source = harness.createRuntime();
  let restored:
    | LoopRuntimeBlackBox<Input, Output, Snapshot, TraceEvent>
    | undefined;

  try {
    source.receive(harness.initialInput);
    await source.runUntilSettled();

    const sourceOutput = source.emit();
    const serializedSnapshot = JSON.stringify(source.snapshot());
    const roundTrippedSnapshot = JSON.parse(serializedSnapshot) as Snapshot;
    restored = harness.restoreRuntime(roundTrippedSnapshot);

    assertBehavior(
      harness.outputKey(restored.emit()) === harness.outputKey(sourceOutput),
      "restored runtime must reuse the settled output",
    );
    assertBehavior(
      harness
        .normalizeTrace(restored.trace())
        .some((event) => event.type === "restored"),
      "restored runtime must trace snapshot restoration",
    );
  } finally {
    source.dispose();
    restored?.dispose();
  }
}

function assertOutputMatches<Input, Output, Snapshot, TraceEvent>(
  output: Output,
  input: Input,
  harness: LoopRuntimeLifecycleBehaviorHarness<
    Input,
    Output,
    Snapshot,
    TraceEvent
  >,
): void {
  assertBehavior(
    harness.outputKey(output) === harness.inputKey(input),
    "settled output must belong to the expected input",
  );
}

function assertBehavior(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Loop Runtime behavior violation: ${message}`);
  }
}
