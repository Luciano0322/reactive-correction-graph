import { signal } from "@signal-kernel/core";
import {
  assertJsonValue,
  captureSnapshot,
  cloneJsonValue,
  createSnapshotScope,
  restoreSnapshot,
  type JsonValue,
  type SnapshotDocument,
} from "@signal-kernel/snapshot";

export type AgentRuntimeSnapshotAdapter = {
  settle(state: JsonValue): void;
  restore(snapshot: SnapshotDocument): void;
  snapshot(): SnapshotDocument;
};

export type CreateAgentRuntimeSnapshotAdapterOptions = {
  graphId: string;
  graphVersion: string;
  instanceId: string;
};

export function createAgentRuntimeSnapshotAdapter(
  options: CreateAgentRuntimeSnapshotAdapterOptions,
): AgentRuntimeSnapshotAdapter {
  const settledState = signal<JsonValue>(null);
  const scope = createSnapshotScope(options);

  scope.signal("settledState", settledState);

  return {
    settle(state) {
      assertJsonValue(state, "agent settled state");
      settledState.set(cloneJsonValue(state));
    },
    restore(snapshot) {
      restoreSnapshot(scope, snapshot);
    },
    snapshot() {
      return captureSnapshot(scope, {
        metadata: {
          status: settledState.peek() === null ? "idle" : "settled",
        },
      });
    },
  };
}
