import {
  createArtifactBundleManifest,
  type ArtifactBundleCommand,
  type ArtifactBundleManifest,
  type ArtifactBundleManifestDependencies,
} from "../artifacts/artifactBundleManifest.js";
import type { LoadedArtifactBundle } from "../artifacts/loadArtifactBundle.js";
import {
  createCorrectionRuntime,
  type CorrectionRuntime,
  type CorrectionRuntimeOptions,
  type CorrectionRuntimeSnapshot,
} from "../runtime/createCorrectionRuntime.js";
import type {
  CorrectionRuntimeInput,
  CorrectionRuntimeOutput,
} from "../schemas/correction.js";
import type {
  LiveTraceEvent,
  LiveTraceEventListener,
  LiveTraceEventSubscription,
} from "../trace/liveTraceEvents.js";
import type { TraceEvent } from "../trace/types.js";

export type CorrectionSessionState = CorrectionRuntimeInput &
  Partial<CorrectionRuntimeOutput> & {
    trace: TraceEvent[];
    snapshot: CorrectionRuntimeSnapshot;
  };

export type CorrectionSessionSnapshot = {
  schemaVersion: 1;
  status: "idle" | "received" | "settled";
  state: CorrectionSessionState | null;
  trace: TraceEvent[];
  runtimeSnapshot: CorrectionRuntimeSnapshot;
};

export type CorrectionSession = {
  receive(input: CorrectionRuntimeInput): void;
  runUntilSettled(): Promise<void>;
  emit(): CorrectionSessionState;
  snapshot(): CorrectionSessionSnapshot;
  subscribe(listener: LiveTraceEventListener): LiveTraceEventSubscription;
  reset(): void;
  dispose(): void;
};

export type CorrectionSessionOptions = CorrectionRuntimeOptions;

export type CorrectionSessionArtifactBundleOptions = {
  command: Extract<ArtifactBundleCommand, "demo">;
  provider: ArtifactBundleManifest["run"]["provider"];
  resultMarkdown: string;
};

export function createCorrectionSession(
  options: CorrectionSessionOptions = {},
): CorrectionSession {
  let runtime = createRuntime(options);
  const listeners = new Set<LiveTraceEventListener>();
  let nextLiveSequence = 1;
  let runtimeSubscription = subscribeToRuntime();
  let lastInput: CorrectionRuntimeInput | undefined;
  let status: CorrectionSessionSnapshot["status"] = "idle";
  let disposed = false;

  return {
    receive(input) {
      assertActive(disposed);
      runtime.receive(input);
      lastInput = input;
      status = "received";
    },
    async runUntilSettled() {
      assertActive(disposed);
      await runtime.runUntilSettled();
      status = "settled";
    },
    emit() {
      assertActive(disposed);
      return emitState(runtime, lastInput);
    },
    snapshot() {
      assertActive(disposed);
      return {
        schemaVersion: 1,
        status,
        state: lastInput ? emitState(runtime, lastInput) : null,
        trace: runtime.trace(),
        runtimeSnapshot: runtime.snapshot(),
      };
    },
    subscribe(listener) {
      assertActive(disposed);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      assertActive(disposed);
      runtimeSubscription();
      runtime = createRuntime(options);
      runtimeSubscription = subscribeToRuntime();
      lastInput = undefined;
      status = "idle";
    },
    dispose() {
      if (disposed) return;
      runtimeSubscription();
      listeners.clear();
      disposed = true;
    },
  };

  function subscribeToRuntime() {
    return runtime.subscribe((event) => {
      const sessionEvent: LiveTraceEvent = {
        schemaVersion: event.schemaVersion,
        sequence: nextLiveSequence++,
        event: event.event,
      };

      for (const listener of listeners) {
        listener(cloneLiveTraceEvent(sessionEvent));
      }
    });
  }
}

export function createCorrectionSessionArtifactBundle(
  snapshot: CorrectionSessionSnapshot,
  options: CorrectionSessionArtifactBundleOptions,
  dependencies: Partial<ArtifactBundleManifestDependencies> = {},
): LoadedArtifactBundle {
  if (!snapshot.state) {
    throw new Error(
      "Correction session snapshot must include state before creating artifacts",
    );
  }

  const manifest = createArtifactBundleManifest(
    {
      command: options.command,
      mode: "runtime",
      provider: options.provider,
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
      },
    },
    dependencies,
  );

  return {
    manifest,
    artifacts: {
      result: {
        ...manifest.artifacts.result!,
        content: options.resultMarkdown,
      },
      state: {
        ...manifest.artifacts.state!,
        content: snapshot.state,
      },
      trace: {
        ...manifest.artifacts.trace!,
        content: snapshot.trace,
      },
    },
  };
}

function createRuntime(options: CorrectionSessionOptions): CorrectionRuntime {
  return createCorrectionRuntime(options);
}

function emitState(
  runtime: CorrectionRuntime,
  input: CorrectionRuntimeInput | undefined,
): CorrectionSessionState {
  if (!input) {
    throw new Error("Correction session must receive input before emitting");
  }

  return {
    ...input,
    ...runtime.emit(),
    trace: runtime.trace(),
    snapshot: runtime.snapshot(),
  };
}

function assertActive(disposed: boolean) {
  if (disposed) {
    throw new Error("Correction session has been disposed");
  }
}

function cloneLiveTraceEvent(event: LiveTraceEvent): LiveTraceEvent {
  return {
    schemaVersion: event.schemaVersion,
    sequence: event.sequence,
    event: cloneTraceEvent(event.event),
  };
}

function cloneTraceEvent(event: TraceEvent): TraceEvent {
  return {
    id: event.id,
    at: event.at,
    scope: event.scope,
    type: event.type,
    label: event.label,
    ...(event.metadata === undefined
      ? {}
      : { metadata: JSON.parse(JSON.stringify(event.metadata)) }),
  };
}
