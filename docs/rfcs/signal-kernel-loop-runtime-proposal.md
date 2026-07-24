# RFC: `@signal-kernel/loop-runtime`

- Status: Proposed
- Date: 2026-07-20
- Target release: experimental `0.1.0`
- Validation repository: `reactive-correction-graph`
- Readiness audit: Not ready
- Extraction decision: Defer package creation

## Summary

Create a framework-neutral, domain-neutral package named
`@signal-kernel/loop-runtime`. It will provide a reusable lifecycle container
around signal-kernel primitives for reactive workflows that combine computed
state, asynchronous resources, effects, invalidation, and repeated settlement.

The package will not be a LangGraph extension, agent coordinator, correction
engine, rendering runtime, or durable workflow platform. LangGraph and
multi-agent coordination remain consumers of the runtime rather than concepts
owned by it.

The package should be created only after the current repository completes the
multi-agent and snapshot extraction gates in Tasks 49-52.

## Context

`@signal-kernel/core` and `@signal-kernel/async-runtime` provide the reactive
primitives used by the correction proof of concept. The application still owns
repeated execution mechanics that are useful outside the correction domain:

- receive epochs and batched input updates
- fixed-point settlement across computed work, effects, and async resources
- latest-epoch stale-result containment
- cancellation and timeout handling
- stable output emission
- trace collection and live subscriptions
- snapshot, restore, and recomputation after restore

Those mechanics currently live beside correction concepts such as drafts,
claims, fact checks, style reviews, correction plans, and rewrites. Publishing
the current project as a generic package would therefore expose a domain model
as if it were a reusable runtime abstraction.

The multi-agent POC provides the next validation pressure: each agent should own
an independent runtime, exchange serialized messages, and restore only its own
runtime type from snapshots. If the same execution lifecycle works for these
independent runtimes without learning agent semantics, it is a viable package
boundary.

## Accepted Decisions

The current proposal records these agreed decisions:

1. The package is a pure execution runtime, not an agent or correction runtime.
2. It is usable without LangGraph in a single process as a headless embedded
   workflow runtime.
3. It is a lifecycle container over existing signal-kernel primitives, not a
   new reactive graph DSL.
4. `receive(input)` accepts an opaque generic value. Merge, patch, reducer, and
   event semantics belong to the loop definition.
5. `emit()` returns a complete settled output. Pending inspection uses a
   separate API.
6. Settlement means the latest receive epoch has reached a reactive fixed
   point, not merely that currently observed promises have completed.
7. A new receive supersedes stale async output from older epochs. Hosts that
   require FIFO completion must queue above the runtime.
8. Automatic retry is not part of v1.
9. Trace events are a versioned JSON-compatible public contract.
10. Snapshot and restore are required lifecycle capabilities; persistence is
    not.
11. Pending work itself is not serialized. Restore recomputes work that did not
    produce a reusable settled value.
12. Snapshot restore is valid only for a compatible loop type and schema. It is
    not a cross-agent state-sharing protocol.
13. The package is isomorphic and ESM-only, with no Node, DOM, UI framework,
    LangGraph, or correction dependencies.
14. Rendering is an explicit non-goal. The package is SSR-safe but does not own
    rendering or DOM hydration.
15. The first release does not include a multi-agent coordinator or LangGraph
    adapter package.

## Goals

- Make signal-kernel async workflow settlement reusable across domains.
- Preserve selective recomputation when inputs change incrementally.
- Give callers a small, typed lifecycle contract.
- Make stale, reused, recomputed, restored, superseded, and emitted work
  observable.
- Support same-runtime-type continuity through serializable snapshots.
- Work in modern browsers, Node ESM, SSR processes, and worker-like runtimes.
- Allow orchestration frameworks, CLIs, servers, and coordinators to embed the
  runtime without framework-specific bindings.
- Keep the public surface small enough to change during experimental `0.x`
  releases.

## Non-Goals

- Correction-specific claims, fact checks, style reviews, or rewrite logic.
- Agent identities, roles, routing, handoff, or team formation.
- Shared mutable state between live runtime instances.
- LangGraph graph construction, checkpoint storage, or state annotations.
- LangSmith or OpenTelemetry exporters.
- HTTP, database, filesystem, queue, or object-storage persistence.
- Distributed durability, exactly-once delivery, or distributed cancellation.
- Automatic provider retries, fallback models, or idempotency policy.
- React, Vue, DOM, SSR rendering, suspense, or hydration reconciliation.
- A latency, token, cost, provider-quality, or factual-correctness benchmark.

## Proposed Layering

```txt
@signal-kernel/core
        |
@signal-kernel/async-runtime
        |
@signal-kernel/snapshot
        |
@signal-kernel/loop-runtime
        |
application loop definitions
        |
optional hosts: CLI, HTTP, LangGraph, coordinator, UI inspector
```

The exact dependency direction between `async-runtime`, `snapshot`, and
`loop-runtime` must be checked against their real public APIs before extraction.
The architecture rule is more important than the diagram: loop-runtime may
depend on signal-kernel family contracts, while those lower-level packages must
not depend on loop-runtime or application domains.

## Repository And Package Boundaries

Preferred workspace shape:

```txt
signal-kernel/
  packages/
    core/
    async-runtime/
    snapshot/
    loop-runtime/

reactive-correction-graph/
  correction loop definition
  multi-agent POC
  LangGraph reference integration
  deterministic evidence and regression fixtures
```

`reactive-correction-graph` remains an external integration and reference
application. Its correction runtime should eventually consume the package
through public exports. It should not become the source repository for the npm
package.

The first release is one new package, not a family of new packages. A future
`@signal-kernel/langgraph-adapter`, `@signal-kernel/agent-coordinator`, or
rendering package requires separate evidence and a separate RFC.

## Dependency Policy

The initial recommendation is to expose compatible signal-kernel packages as
peer dependencies and install the same versions as development dependencies in
the workspace:

```json
{
  "peerDependencies": {
    "@signal-kernel/core": "<compatible-range>",
    "@signal-kernel/async-runtime": "<compatible-range>",
    "@signal-kernel/snapshot": "<compatible-range>"
  }
}
```

The final ranges remain open until a duplicate-package test proves which
packages must share one reactive tracking instance. The package must not list
`@langchain/langgraph` or `@langchain/core` as dependencies or peers.

## Proposed Public Surface

The names below describe the intended shape but are not frozen APIs:

```ts
export {
  defineLoop,
  createLoopRuntime,
} from "@signal-kernel/loop-runtime";

export type {
  LoopDefinition,
  LoopContext,
  LoopRuntime,
  LoopInspection,
  LoopSnapshot,
  LoopTraceEvent,
  LoopRuntimeError,
} from "@signal-kernel/loop-runtime";
```

Conceptual lifecycle:

```ts
const definition = defineLoop<Input, Output, SnapshotState>((context) => {
  // Use @signal-kernel/core primitives directly.
  // Register async resources and effects through the lifecycle context.
  return {
    receive(input) {
      // The definition decides whether input replaces, merges, or reduces.
    },
    readOutput() {
      // Return the latest complete output when the graph is stable.
    },
    snapshotState() {
      // Return loop-owned serializable state.
    },
  };
});

const runtime = createLoopRuntime(definition, options);
runtime.receive(input);
await runtime.runUntilSettled();
const output = runtime.emit();
const snapshot = runtime.snapshot();
```

Conceptual runtime contract:

```ts
type LoopRuntime<Input, Output, SnapshotState> = {
  receive(input: Input): void;
  runUntilSettled(): Promise<void>;
  emit(): Output;
  inspect(): LoopInspection<Output>;
  snapshot(): LoopSnapshot<SnapshotState>;
  trace(): readonly LoopTraceEvent[];
  subscribe(listener: (event: LoopTraceEvent) => void): () => void;
  dispose(): void;
};
```

`emit()` must reject before a successful settlement. `inspect()` may expose the
runtime status and last stable output without presenting it as a new agent or
workflow result.

The exact `LoopContext.resource()` and effect-registration APIs are deliberately
unresolved. They must be designed from the real correction and multi-agent
graphs rather than inferred from one implementation.

## Settlement Semantics

`runUntilSettled()` waits for the latest receive epoch to reach a fixed point:

```txt
Phase A: drain stale computed work.
Phase B: run ready effects.
If effects generate work, return to Phase A.
Wait for latest-epoch async resources.
Repeat until no computed, effect, or resource work can change the output.
Require one stable output for the latest epoch.
```

Settlement rejects with a typed error when a resource fails, a timeout expires,
the maximum flush-cycle guard is exceeded, or the runtime is disposed.

Calling `receive()` during settlement creates a newer epoch. The current
settlement promise follows the newest epoch. Older async work is cancelled when
possible and always prevented from committing stale output.

The runtime does not provide a FIFO job queue. Hosts can serialize calls when
every command must complete independently.

## Error And Retry Semantics

V1 records and propagates failures but does not retry automatically. Provider
retry, fallback, backoff, and idempotency belong to the host or a future explicit
resource policy.

Restore-triggered recomputation is not reported as a normal retry. The trace
must make the cause observable.

## Snapshot And Restore Semantics

`@signal-kernel/snapshot` must be exercised in the validation POC before the
package API is finalized. The intended semantics are:

- snapshots are versioned and JSON-compatible
- snapshots identify their loop type and schema version
- settled reusable values may be restored
- pending promises, abort controllers, connections, timers, and resource
  handles are not serialized
- work that was pending or omitted is recomputed by the restored runtime
- pre-restore late results cannot mutate or emit from the restored runtime
- two restores from the same snapshot produce isolated runtime instances
- incompatible loop identities or schema versions fail clearly

Snapshot is a continuity mechanism, not live state sharing. A snapshot may
bootstrap, migrate, clone, or recover a compatible runtime. Different agent
roles communicate through messages, not by hydrating each other's snapshots.

Persistence remains a host concern. A host may place the snapshot in memory,
files, a database, object storage, or LangGraph checkpoint state without moving
the live runtime object outside its process.

## Trace Contract

Trace is a versioned public API, not an internal log format. The minimum event
envelope should include stable identity, ordering, epoch, scope, type, label,
and JSON-compatible metadata.

Candidate event types include:

```txt
started
completed
changed
stale
pending
resolved
rejected
cancelled
reused
restored
recomputed
superseded
emitted
```

The final taxonomy should avoid duplicate meanings and must be validated by the
snapshot and multi-agent tests. Domain labels and exporter-specific fields stay
in metadata or adapters.

The runtime exposes both an immutable trace snapshot and live subscription. It
does not own trace persistence, LangSmith, OpenTelemetry, or a dashboard.

## Multi-Agent Validation Model

The POC uses two roles:

```txt
FactCheck Agent
  owns one private runtime and snapshot

Writer Agent
  owns one private runtime and snapshot

Coordinator
  owns routing, lifecycle, correlation, and causal versions
```

Live communication uses versioned JSON-serializable envelopes. Runtime
instances, signals, promises, subscriptions, callbacks, and abort controllers
never cross the agent boundary.

The coordinator is application code during the POC. It is not included in
loop-runtime and should not become a package until another interaction model
validates the abstraction.

## LangGraph Integration

Loop Runtime must work without LangGraph. The current reference repository may
continue to demonstrate this optional outer boundary:

```txt
LangGraph node
  -> receive graph state into an owned runtime
  -> run until settled
  -> emit a serializable graph update
```

LangGraph remains responsible for graph topology, threads, interrupts,
checkpoint orchestration, and any production durability policy. Loop Runtime
owns process-local reactive execution inside the node or agent boundary.

No LangGraph adapter package is planned for the first release. An adapter is
justified only after at least two domains share a meaningful generic contract
that is more valuable than a small example.

## Rendering And SSR Boundary

The package is SSR-safe, not an SSR renderer. Its snapshots may cross a
server/client transport boundary and hydrate a compatible runtime, but it does
not schedule rendering, reconcile DOM state, own suspense, or bind to React or
Vue.

A future rendering runtime is only an architectural possibility. It is not a
committed roadmap item in this RFC.

## Extraction Gates

Do not create the publishable package until the current repository proves:

1. One FactCheck Agent and one Writer Agent own separate runtimes.
2. Agents exchange only versioned serialized envelopes.
3. At least one agent uses the real `@signal-kernel/snapshot` package.
4. Restored settled state is reusable.
5. Omitted pending work recomputes after restore.
6. A pre-restore late result cannot overwrite restored state.
7. Trace distinguishes restored, reused, recomputed, and superseded work.
8. Two restored sessions remain isolated.
9. The POC runs deterministically without LangGraph, network, database, or UI.
10. The correction reference comparison and savings artifacts remain valid.

Tasks 49-51 prove the multi-agent contracts, vertical slice, and recovery
behavior. Task 52 performs the extraction readiness audit before a package repo
is created.

No publishable package implementation or source-file move begins until the readiness audit passes.

## Extraction Evidence Matrix

This matrix audits candidate mechanics against observable behavior in the
current correction POC. `Proven in the POC` means the cited behavior passes in
this repository; it does not mean the generic package API or implementation
already exists. `Partial evidence` and `Missing extraction evidence` are
blocking gaps unless a later readiness decision explicitly narrows the first
release.

| Candidate generic mechanic | Current source ownership | Task 49-51 behavior evidence | Readiness |
| --- | --- | --- | --- |
| Opaque `receive(input)` and lifecycle boundary | `src/runtime/signalNode.ts`; `src/agents/coordinatorContracts.ts` | Task 49: `src/agents/agentContracts.test.ts` round-trips opaque serialized payloads, while `src/agents/coordinatorContracts.test.ts` proves isolated session ownership. | **Partial evidence**: the POC separates message and runtime ownership, but no domain-neutral `LoopDefinition` contract exists. |
| Fixed-point settlement and settled-only `emit()` | `src/runtime/createCorrectionRuntime.ts`; `src/agents/createTwoAgentCorrectionCoordinator.ts` | Task 50: `src/agents/createTwoAgentCorrectionCoordinator.test.ts` settles both agents before emitting and follows the newest receive when older work finishes late. Task 52d/e reruns those lifecycle expectations through a reusable black-box suite and POC adapter. | **Proven through the POC adapter**: fixed-point stage ordering and settled-only emission pass. Pending-only inspection remains a separate missing capability below. |
| Latest-epoch stale-result containment | `src/agents/createTwoAgentCorrectionCoordinator.ts` | Task 50: `src/agents/createTwoAgentCorrectionCoordinator.test.ts` rejects a late FactCheck result from a superseded receive. | **Proven in the POC**: the newest causal input wins without stale evidence committing. |
| Settled snapshot reuse and restore isolation | `src/agents/createAgentRuntimeSnapshotAdapter.ts`; `src/agents/createTwoAgentCorrectionCoordinator.ts`; `src/agents/parseTwoAgentCorrectionCoordinatorSnapshot.ts` | Task 51: `src/agents/twoAgentCorrectionCoordinatorSnapshot.test.ts` proves JSON round-trip, settled reuse, restore-and-continue, and late source-work isolation; `src/agents/twoAgentCorrectionCoordinatorRestoreGuards.test.ts` proves isolated restores and identity/schema rejection. | **Proven in the POC**: compatible settled snapshots restore into isolated live runtimes. |
| Omitted-pending-work recomputation | `src/agents/createTwoAgentCorrectionCoordinator.ts` currently rejects snapshots before settlement. | Task 51 documents that pending work is not serialized, but its snapshot tests start from settled snapshots only. | **Missing extraction evidence**: interrupted-work replay and automatic recomputation from a pending snapshot are not implemented. |
| Restored, reused, recomputed, and superseded trace semantics | `src/trace/types.ts`; `src/agents/createTwoAgentCorrectionCoordinator.ts` | Task 50 uses `skipped` metadata for reuse and `stale` metadata for invalidation; Task 51 preserves the restored trace baseline in `src/agents/twoAgentCorrectionCoordinatorSnapshot.test.ts`. | **Partial evidence**: reuse and stale behavior are observable, but `restored`, `recomputed`, and `superseded` are not yet versioned trace event types. |
| Pending inspection and live trace subscription | `src/runtime/createCorrectionRuntime.ts`; `src/session/createCorrectionSession.ts` | Tasks 49-51 do not exercise a generic `inspect()` contract or a runtime-neutral subscription contract. | **Missing extraction evidence**: the proposed inspection surface remains a design, not a validated package behavior. |
| Error propagation, no automatic retry, and disposal | `src/runtime/createCorrectionRuntime.ts`; `src/session/createCorrectionSession.ts`; `src/agents/coordinatorContracts.ts` | Task 49: `src/agents/coordinatorContracts.test.ts` proves owned-session disposal and coordinator isolation. Tasks 49-51 do not provide a generic typed-error or no-retry behavior suite. | **Partial evidence**: disposal ownership is proven, while generic error and retry semantics remain unproven. |

## Black-Box POC Validation And Migration Baseline

Task 52d defines the framework-neutral lifecycle verifier in
`src/testing/loopRuntimeLifecycleBehaviorSuite.ts`. It exercises fixed-point
settlement, latest-epoch wins, settled-only emission, ordered JSON-compatible
trace, and settled snapshot restore only through the proposed black-box
lifecycle methods.

Task 52e connects that verifier to the existing two-agent coordinator through
`src/testing/twoAgentLoopRuntimeBehaviorHarness.ts`. The adapter delegates
execution and snapshot behavior to the POC and only normalizes domain trace
events into the candidate lifecycle vocabulary.

Passing through the POC adapter does not make the candidate package boundary import-clean or extraction-ready.
The architecture guard still reports correction and coordinator imports, while
pending snapshot recomputation, generic inspection, and the final public trace
taxonomy remain unresolved.

The deterministic before-extraction regression fixture is
`docs/rfcs/signal-kernel-loop-runtime-extraction-baseline.json`. It records the
initial eager/reactive call counts, style-only and claim-changing comparison,
and per-operation recomputation savings from
`src/examples/reference-scenario.json`. Future package migration must preserve
this baseline or explain and approve an intentional change. It is not a
latency, token, cost, provider-quality, or semantic-correctness benchmark.

## Readiness Audit Result

Decision: do not create `packages/loop-runtime` or move runtime source files.

The machine-readable audit is
`docs/rfcs/signal-kernel-loop-runtime-readiness-audit.json`. The current POC
proves the lifecycle shape, latest-epoch containment, settled snapshot
continuity, restored-session isolation, and the deterministic comparison
baseline. It does not yet prove an import-clean implementation boundary.

Extraction remains blocked by:

- correction and coordinator imports in the files that currently own the
  candidate mechanics
- no pending-snapshot omitted-work recomputation behavior
- no versioned public `restored`, `reused`, `recomputed`, and `superseded`
  trace taxonomy
- no generic pending inspection and last-stable-output contract
- no framework-neutral typed error and disposal behavior suite
- no resource/effect registration contract validated by a second
  non-correction loop

The decision is a deferral, not a rejection of the package direction. A future
audit may change the status to ready only after every blocker has a passing
black-box test and the architecture audit reports no forbidden imports.

## Extraction Plan

1. Preserve the Task 49-52 evidence and before-extraction baseline in
   `reactive-correction-graph`.
2. Close the blockers recorded in the machine-readable readiness audit.
3. Rerun Task 52 and record an explicit ready decision.
4. Only then create `packages/loop-runtime` in the signal-kernel workspace.
5. Port behavior tests before moving implementation mechanics.
6. Implement the smallest generic lifecycle that passes those tests.
7. Convert the correction runtime into a loop definition that consumes the
   package through public exports.
8. Remove duplicated local settlement, epoch, trace, and restore mechanics.
9. Rerun reference comparison, savings, snapshot, browser, and multi-agent
   tests.
10. Publish experimental `0.1.0` only after all release gates pass.

The extraction is contract-driven. `createCorrectionRuntime.ts` should not be
copied wholesale into the new package.

## Experimental `0.1.0` Release Gates

- fixed-point settlement tests pass
- latest-epoch stale-result containment tests pass
- settled-only `emit()` tests pass
- snapshot restore and omitted-pending-work recomputation tests pass
- restore trace and restored-session isolation tests pass
- browser and Node ESM smoke tests pass
- correction reference comparison and savings results remain unchanged
- package dependency and import guards reject LangGraph, Node, DOM, UI,
  coordinator, and correction dependencies
- public examples import package exports only, without deep source imports
- package limitations and experimental status are documented

## Alternatives Rejected

### Publish `reactive-correction-graph` as the generic package

Rejected because its runtime and schema are correction-specific. It remains the
reference consumer.

### Build a new reactive graph DSL

Rejected because signal-kernel already provides the primitives. Loop Runtime
should add lifecycle and settlement, not competing syntax.

### Put agent coordination into Loop Runtime

Rejected because agent identity, routing, messages, and retry policy are host
concerns and have only one current domain example.

### Make LangGraph a required dependency

Rejected because the runtime must be independently useful and framework
neutral.

### Serialize in-flight promises and side effects

Rejected because these values are not portable or safely resumable. Restore
recomputes omitted work instead.

### Add rendering support now

Rejected because rendering has different ownership and performance contracts
and would pull the package into framework-specific concerns.

## Risks

- A lifecycle context may accidentally become a second graph DSL.
- A generic API inferred from one domain may retain hidden correction
  assumptions.
- Trace compatibility can become expensive if too many event types are frozen
  early.
- Snapshot integration may expose stronger coupling between signal-kernel
  package versions than expected.
- Latest-epoch semantics may surprise event-oriented consumers unless FIFO is
  documented as a host responsibility.
- Recomputed provider calls after restore can duplicate external side effects.
- Peer dependency ranges may create installation friction during early `0.x`
  development.

These risks are why the proposal requires multi-agent, restore, and external
consumer validation before package extraction.

## Open Question Dispositions

| Question | Disposition | Decision or exit criterion |
| --- | --- | --- |
| Smallest useful `LoopContext.resource()` contract | Deferred | A second non-correction loop must validate the minimum registration surface without creating a graph DSL. This blocks extraction. |
| Effects that generate new work | Deferred | A black-box fixed-point case must prove how effects signal additional work without exposing scheduler internals. This blocks extraction. |
| `@signal-kernel/snapshot` API exposure | Deferred | Keep direct snapshot compatibility in the POC; choose wrap-versus-expose only after the package-level dependency and peer-resolution tests exist. |
| Singleton peer resolution | Deferred | Run a duplicate-install workspace test for core, async-runtime, and snapshot before selecting peer ranges or publishing. |
| Trace event taxonomy | Deferred | Freeze a versioned taxonomy only after `restored`, `reused`, `recomputed`, and `superseded` are emitted without POC adapter normalization. This blocks extraction. |
| Loop identity and snapshot migrations | Accepted | V1 snapshots require matching loop identity and schema. Incompatible snapshots fail; no migration registry is included in `0.1.0`. |
| Clock and ID factories | Accepted | Runtime options may inject clock and ID factories for deterministic tests, with isomorphic defaults and no global mutable registry. |
| `/testing` subpath | Deferred | Keep the behavior suite in the reference consumer until a second external adapter proves a public testing subpath is useful. |
| Pending-work disposal guarantees | Accepted | Disposal is idempotent, rejects new lifecycle operations, and prevents pending async work from committing or emitting. Typed error details still require black-box tests. |

## Outcome If Accepted

The signal-kernel ecosystem gains one focused package:

```txt
@signal-kernel/loop-runtime
```

It provides process-local reactive workflow execution and continuity without
owning application domains or orchestration frameworks. The correction project
remains the evidence-producing reference consumer, while multi-agent and
LangGraph scenarios validate the boundary from outside the package.
