import { describe, expect, it } from "vitest";
import {
  runLoopRuntimeLifecycleBehaviorSuite,
  type LoopRuntimeBlackBox,
  type LoopRuntimeLifecycleBehaviorHarness,
  type NormalizedLoopRuntimeTraceEvent,
} from "./loopRuntimeLifecycleBehaviorSuite.js";

type TestInput = {
  key: string;
};

type TestOutput = {
  key: string;
};

type TestSnapshot = {
  schemaVersion: 1;
  epoch: number;
  output: TestOutput;
};

type TestTraceEvent = NormalizedLoopRuntimeTraceEvent;

describe("Loop Runtime lifecycle behavior suite", () => {
  it("verifies the generic lifecycle only through its black-box contract", async () => {
    const harness = createTestHarness();

    await expect(
      runLoopRuntimeLifecycleBehaviorSuite(harness),
    ).resolves.toEqual({
      passed: [
        "fixed-point-settlement",
        "latest-epoch-wins",
        "settled-only-emission",
        "trace-contract",
        "snapshot-restore",
      ],
    });
  });
});

function createTestHarness(): LoopRuntimeLifecycleBehaviorHarness<
  TestInput,
  TestOutput,
  TestSnapshot,
  TestTraceEvent
> {
  return {
    initialInput: { key: "initial" },
    latestInput: { key: "latest" },
    fixedPointStages: ["derive", "finalize"],
    createRuntime: () => new ScriptedLoopRuntime(),
    createLatestEpochRuntime() {
      const firstEpochGate = createDeferred<void>();
      const runtime = new ScriptedLoopRuntime(firstEpochGate);

      return {
        runtime,
        waitForFirstPending: () => runtime.waitForFirstPending(),
        releaseFirst: () => firstEpochGate.resolve(),
      };
    },
    restoreRuntime: (snapshot) => ScriptedLoopRuntime.restore(snapshot),
    inputKey: (input) => input.key,
    outputKey: (output) => output.key,
    normalizeTrace: (trace) => trace,
  };
}

class ScriptedLoopRuntime
  implements
    LoopRuntimeBlackBox<
      TestInput,
      TestOutput,
      TestSnapshot,
      TestTraceEvent
    >
{
  private epoch = 0;
  private currentInput: TestInput | undefined;
  private settledOutput: TestOutput | undefined;
  private readonly events: TestTraceEvent[] = [];
  private readonly firstPending = createDeferred<void>();
  private disposed = false;

  constructor(private readonly firstEpochGate?: Deferred<void>) {}

  static restore(snapshot: TestSnapshot): ScriptedLoopRuntime {
    const runtime = new ScriptedLoopRuntime();
    runtime.epoch = snapshot.epoch;
    runtime.currentInput = { key: snapshot.output.key };
    runtime.settledOutput = { ...snapshot.output };
    runtime.record("restored", "snapshot", snapshot.output.key);
    return runtime;
  }

  receive(input: TestInput): void {
    this.assertActive();
    this.epoch += 1;
    this.currentInput = { ...input };
  }

  async runUntilSettled(): Promise<void> {
    this.assertActive();
    const input = this.currentInput;
    const epoch = this.epoch;

    if (!input) {
      throw new Error("Test runtime must receive input before settling");
    }

    this.record("pending", "derive", input.key);

    if (epoch === 1 && this.firstEpochGate) {
      this.firstPending.resolve();
      await this.firstEpochGate.promise;
    }

    if (epoch !== this.epoch) {
      this.record("superseded", "derive", input.key);
      return;
    }

    this.record("resolved", "derive", input.key);
    this.record("pending", "finalize", input.key);
    await Promise.resolve();

    if (epoch !== this.epoch) {
      this.record("superseded", "finalize", input.key);
      return;
    }

    this.record("resolved", "finalize", input.key);
    this.settledOutput = { key: input.key };
    this.record("emitted", "output", input.key);
  }

  emit(): TestOutput {
    this.assertActive();
    if (!this.settledOutput) {
      throw new Error("Test runtime has no settled output");
    }
    return { ...this.settledOutput };
  }

  snapshot(): TestSnapshot {
    const output = this.emit();
    return {
      schemaVersion: 1,
      epoch: this.epoch,
      output,
    };
  }

  trace(): readonly TestTraceEvent[] {
    this.assertActive();
    return this.events.map((event) => ({ ...event }));
  }

  dispose(): void {
    this.disposed = true;
  }

  waitForFirstPending(): Promise<void> {
    return this.firstPending.promise;
  }

  private record(
    type: TestTraceEvent["type"],
    label: string,
    inputKey: string,
  ): void {
    this.events.push({
      sequence: this.events.length + 1,
      type,
      label,
      inputKey,
    });
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error("Test runtime has been disposed");
    }
  }
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
