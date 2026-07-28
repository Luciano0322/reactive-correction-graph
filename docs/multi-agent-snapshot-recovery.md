# Multi-Agent Snapshot Recovery

Task 51 adds a durable JSON boundary around the deterministic FactCheck Agent
to Writer Agent reference flow. It uses the real `@signal-kernel/snapshot`
package for each owned agent runtime and a versioned aggregate document for
coordinator state.

Snapshot is continuity, not live state sharing. Agents still communicate
through versioned evidence envelopes. They do not read or hydrate one another's
runtime snapshots.

## Public SDK surface

The package root exports:

- `createTwoAgentCorrectionCoordinator`
- `parseTwoAgentCorrectionCoordinatorSnapshot`
- `restoreTwoAgentCorrectionCoordinator`
- `TwoAgentCorrectionCoordinatorSnapshot`
- `RestoreTwoAgentCorrectionCoordinatorOptions`

```ts
const coordinator = createTwoAgentCorrectionCoordinator({
  coordinatorId: "article-correction",
});

coordinator.receive(input);
await coordinator.runUntilSettled();

const serialized = JSON.stringify(coordinator.snapshot());
const parsed = parseTwoAgentCorrectionCoordinatorSnapshot(
  JSON.parse(serialized),
);
const restored = restoreTwoAgentCorrectionCoordinator(parsed);
```

`restoreTwoAgentCorrectionCoordinator()` also parses its `unknown` input before
it creates live sessions. Call the parser separately when an integration wants
to validate checkpoint data without starting a coordinator.

## Snapshot contract

The aggregate document uses `schemaVersion: 1` and records:

- coordinator identity, settled status, and current causal input version
- current correction input
- accepted FactCheck evidence envelope
- settled output and trace baseline
- one identified `SnapshotDocument` for the FactCheck Agent
- one identified `SnapshotDocument` for the Writer Agent

Each agent document has a role-specific graph id and version plus a
coordinator-specific instance id. Its `settledState` writable signal contains
only JSON-compatible accepted state. Promises, abort controllers, model
functions, sessions, subscriptions, and other live handles are omitted.

The parser rejects malformed aggregate data, unsupported schema versions,
missing agent documents, identity mismatches, incompatible snapshot graph
identity, invalid causal evidence, and malformed output or trace data before
runtime construction.

## Restore semantics

Restore always creates a new process-local coordinator and two new agent
sessions. It restores each agent scope, then hydrates the aggregate input
version, accepted evidence, output, and trace baseline.

The next receive continues from the restored causal version:

- a style-only update reuses restored FactCheck evidence
- a claim-changing update marks that evidence stale and reruns FactCheck
- trace ids continue after the restored baseline

Async work owned by a source coordinator cannot mutate the restored
coordinator because no promise, signal, session, or callback crosses the
snapshot boundary. Restoring the same value twice also produces isolated live
instances.

## LangGraph checkpoint boundary

LangGraph checkpoint state may contain the JSON-compatible aggregate snapshot
as ordinary data. A node or host can parse that value and create a live
coordinator when execution resumes.

LangGraph remains responsible for thread identity, checkpoint timing, storage,
retention, interrupts, and replay policy.

Live coordinators, agent sessions, model functions, promises, subscriptions,
and abort controllers remain process-local and must not be placed in graph
state.

The same snapshot document can be stored in memory, a file, object storage, or
a database chosen by the host. This project does not provide a production
LangGraph checkpointer or persistence adapter.

## Durability limits

Only settled coordinator snapshots are currently supported. Calling
`snapshot()` before a settled output exists is rejected. Pending work is not
serialized, and this slice does not yet provide interrupted-work replay or
automatic recomputation from a pending snapshot.

No database, migration framework, encryption policy, distributed locking,
retry policy, deduplication service, delivery guarantee, or exactly-once
execution is implemented here. Snapshot recovery does not make a model call
deterministic and does not prove production durability.
