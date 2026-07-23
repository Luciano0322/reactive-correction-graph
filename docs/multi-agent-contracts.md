# Multi-Agent Contract Boundary

Task 49 defines the language and ownership rules required before live
multi-agent coordination. Task 50 adds the first deterministic reference
coordinator over those contracts. Neither task turns the existing correction
branches into autonomous agents.

Current factCheck, styleReview, and rewriteDraft branches are not isolated agents.
They are operations inside one correction runtime. An isolated agent has its
own identity, session lifecycle, private runtime state, and serialized message
boundary.

## Roles

- FactCheck Agent owns claim verification and evidence output.
- Writer Agent owns style-aware revision from the draft plus accepted evidence.
- Coordinator owns routing and lifecycle. Task 50 implements the first
  deterministic routing behavior through `createTwoAgentCorrectionCoordinator`.

Each agent owns one private session and runtime state. The coordinator may hold
and dispose those sessions, but it does not expose one agent's live signals,
promises, subscriptions, or runtime object to another agent.

```txt
Coordinator boundary
  |-- FactCheck Agent session
  |     `-- private runtime state
  `-- Writer Agent session
        `-- private runtime state
```

Creating another coordinator boundary creates another pair of sessions.
Mutating or disposing one coordinator's sessions does not affect the other
coordinator.

## Framework-neutral public boundary

The package root exports the initial contracts:

- `AgentIdentity` names the fixed FactCheck and Writer roles.
- `AgentMessageEnvelope` carries identity, message, correlation, causation, and
  input-version data.
- `AgentResult` represents completed, failed, and stale outcomes.
- `parseAgentMessageEnvelope` validates serialized input and rejects malformed,
  unknown-recipient, role-mismatch, and stale-version messages.
- `AgentSessionBoundary` is the minimum private-session lifecycle owned by a
  coordinator.
- `createAgentCoordinatorBoundary` creates and owns one session for each role.
- `createTwoAgentCorrectionCoordinator` runs the deterministic FactCheck to
  Writer reference flow and exposes `receive`, `runUntilSettled`, `emit`,
  `trace`, and `dispose`.

Versioned JSON-serializable envelopes are the only planned live communication
boundary between agents. Runtime instances, signals, callbacks, promises,
subscriptions, and abort controllers never cross that boundary.

The contracts depend on TypeScript and local data only. They do not depend on
LangGraph state, HTTP, DOM APIs, UI frameworks, databases, or model providers.

## Deterministic two-agent reference flow

The Task 50 coordinator owns one FactCheck Agent session and one Writer Agent
session. Its default model is deterministic and local, while the optional
`model` setting permits test or provider adapters that implement the existing
correction-model contract.

```txt
receive draft
  -> extract claims
  -> FactCheck Agent
  -> serialize and parse versioned evidence envelope
  -> Writer Agent
  -> emit revised draft and final result
```

The coordinator applies three observable invalidation rules:

- Initial input runs FactCheck and Writer and emits versioned evidence.
- A style-only update reuses settled fact-check evidence and reruns Writer.
- A claim-changing update marks previous evidence stale, reruns FactCheck, and
  routes the replacement evidence to Writer.

Every receive increments the coordinator input version. Async agent work may
write evidence or final output only when its captured version is still current.
A late result from an older receive is recorded as
`superseded async result`; it cannot replace current evidence or emit a final
result.

Each coordinator instance owns its sessions, evidence cache, causal version,
output, and trace collector. No module-level mutable state is used, so two
coordinators cannot reuse or invalidate one another's evidence.

Only envelopes and emitted output are JSON-serializable workflow data. The
coordinator, sessions, model functions, promises, and other live handles remain
process-local.

## Causality and diagnostics

Every envelope includes:

- `schemaVersion`
- `messageId`
- `correlationId`
- `causationId`
- `inputVersion`
- `sender`
- `recipient`
- `messageType`
- JSON-compatible `payload`

The parser accepts an optional current input version. An older incoming version
is rejected as stale before coordination code can mutate agent state. Unknown
agents and malformed envelopes also fail with deterministic diagnostics.

## Explicit non-goals

The Task 49 and Task 50 boundary does not implement or claim:

- Autonomous planning
- Dynamic team formation
- Tool selection
- Shared mutable runtime state
- LangGraph-specific coordinator
- React or Vue integration
- Real LLM quality improvement
- snapshot persistence or process recovery
- distributed delivery, retries, or exactly-once execution

Task 50 proves only the fixed FactCheck-to-Writer reference flow. It does not
provide autonomous role selection, arbitrary agent graphs, dynamic routing, or
shared mutable runtime state. Task 51 will evaluate snapshot and restore at the
owned agent-runtime boundary.
