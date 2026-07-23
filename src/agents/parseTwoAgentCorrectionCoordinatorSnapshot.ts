import {
  assertJsonValue,
  assertSnapshotDocument,
  type SnapshotDocument,
} from "@signal-kernel/snapshot";
import type {
  CorrectionRuntimeInput,
  FinalResult,
} from "../schemas/correction.js";
import type { TraceEvent, TraceEventType, TraceScope } from "../trace/types.js";
import {
  parseAgentMessageEnvelope,
  serializeAgentMessageEnvelope,
  type AgentIdentity,
  type AgentMessageEnvelope,
} from "./agentContracts.js";
import type {
  TwoAgentCorrectionCoordinatorSnapshot,
  TwoAgentCorrectionOutput,
} from "./createTwoAgentCorrectionCoordinator.js";

const SNAPSHOT_KEYS = new Set([
  "schemaVersion",
  "coordinatorId",
  "status",
  "inputVersion",
  "currentInput",
  "acceptedEvidence",
  "output",
  "trace",
  "agentSnapshots",
]);

const TRACE_SCOPES = new Set<TraceScope>([
  "cli",
  "graph",
  "runtime",
  "signal",
  "computed",
  "resource",
  "effect",
  "verification",
]);

const TRACE_EVENT_TYPES = new Set<TraceEventType>([
  "started",
  "completed",
  "changed",
  "stale",
  "pending",
  "resolved",
  "rejected",
  "skipped",
  "emitted",
]);

const FACT_CHECK_IDENTITY = {
  agentId: "fact-check-agent",
  role: "fact-check",
} as const;

const WRITER_IDENTITY = {
  agentId: "writer-agent",
  role: "writer",
} as const;

export function parseTwoAgentCorrectionCoordinatorSnapshot(
  value: unknown,
): TwoAgentCorrectionCoordinatorSnapshot {
  if (!isRecord(value)) {
    throw new Error("Two-agent coordinator snapshot must be an object");
  }

  if (value.schemaVersion !== 1) {
    throw new Error(
      `Unsupported two-agent coordinator snapshot schema version: ${String(
        value.schemaVersion,
      )}`,
    );
  }

  assertJsonValue(value, "Two-agent coordinator snapshot");
  assertSupportedKeys(value);

  const coordinatorId = readNonEmptyString(
    value.coordinatorId,
    "coordinatorId",
  );
  if (value.status !== "settled") {
    throw new Error(
      "Two-agent coordinator snapshot status must be settled",
    );
  }

  const inputVersion = readInputVersion(value.inputVersion);
  const currentInput = parseRuntimeInput(value.currentInput);
  const acceptedEvidence = parseEvidenceEnvelope(
    value.acceptedEvidence,
    coordinatorId,
    inputVersion,
  );
  const output = parseOutput(
    value.output,
    acceptedEvidence,
    inputVersion,
  );
  const trace = parseTrace(value.trace);
  const agentSnapshots = parseAgentSnapshots(
    value.agentSnapshots,
    coordinatorId,
  );

  return cloneJson({
    schemaVersion: 1,
    coordinatorId,
    status: "settled",
    inputVersion,
    currentInput,
    acceptedEvidence,
    output,
    trace,
    agentSnapshots,
  });
}

function assertSupportedKeys(value: Record<string, unknown>) {
  for (const key of Object.keys(value)) {
    if (!SNAPSHOT_KEYS.has(key)) {
      throw new Error(
        `Unsupported two-agent coordinator snapshot field: ${key}`,
      );
    }
  }
}

function parseRuntimeInput(value: unknown): CorrectionRuntimeInput {
  if (!isRecord(value) || typeof value.draft !== "string") {
    throw new Error(
      "Two-agent coordinator snapshot currentInput is invalid",
    );
  }

  const input: CorrectionRuntimeInput = {
    draft: value.draft,
  };

  if (value.userIntent !== undefined) {
    input.userIntent = readString(
      value.userIntent,
      "currentInput.userIntent",
    );
  }
  if (value.styleGuide !== undefined) {
    input.styleGuide = readString(
      value.styleGuide,
      "currentInput.styleGuide",
    );
  }

  return input;
}

function parseEvidenceEnvelope(
  value: unknown,
  coordinatorId: string,
  inputVersion: number,
): AgentMessageEnvelope {
  let envelope: AgentMessageEnvelope;
  try {
    envelope = parseAgentMessageEnvelope(JSON.stringify(value));
  } catch (error) {
    throw new Error(
      `Two-agent coordinator snapshot acceptedEvidence is invalid: ${formatError(
        error,
      )}`,
    );
  }

  if (
    envelope.correlationId !== coordinatorId ||
    envelope.sender.agentId !== "fact-check-agent" ||
    envelope.recipient.agentId !== "writer-agent" ||
    envelope.messageType !== "fact-check.evidence.ready" ||
    envelope.inputVersion > inputVersion
  ) {
    throw new Error(
      "Two-agent coordinator snapshot acceptedEvidence causality mismatch",
    );
  }

  return envelope;
}

function parseOutput(
  value: unknown,
  acceptedEvidence: AgentMessageEnvelope,
  inputVersion: number,
): TwoAgentCorrectionOutput {
  if (!isRecord(value) || value.inputVersion !== inputVersion) {
    throw new Error("Two-agent coordinator snapshot output is invalid");
  }

  let outputEvidence: AgentMessageEnvelope;
  try {
    outputEvidence = parseAgentMessageEnvelope(
      JSON.stringify(value.evidenceEnvelope),
    );
  } catch {
    throw new Error("Two-agent coordinator snapshot output is invalid");
  }

  if (
    serializeAgentMessageEnvelope(outputEvidence) !==
    serializeAgentMessageEnvelope(acceptedEvidence)
  ) {
    throw new Error(
      "Two-agent coordinator snapshot output evidence mismatch",
    );
  }

  return {
    inputVersion,
    evidenceEnvelope: outputEvidence,
    finalResult: parseFinalResult(value.finalResult),
  };
}

function parseFinalResult(value: unknown): FinalResult {
  if (!isRecord(value) || typeof value.revisedDraft !== "string") {
    throw new Error("Two-agent coordinator snapshot finalResult is invalid");
  }

  return {
    revisedDraft: value.revisedDraft,
    summary: parseStringArray(value.summary, "finalResult.summary"),
    unresolvedIssues: parseStringArray(
      value.unresolvedIssues,
      "finalResult.unresolvedIssues",
    ),
  };
}

function parseTrace(value: unknown): TraceEvent[] {
  if (!Array.isArray(value)) {
    throw new Error("Two-agent coordinator snapshot trace must be an array");
  }

  return value.map((event, index) => {
    if (
      !isRecord(event) ||
      typeof event.id !== "string" ||
      typeof event.at !== "number" ||
      !Number.isFinite(event.at) ||
      typeof event.scope !== "string" ||
      !TRACE_SCOPES.has(event.scope as TraceScope) ||
      typeof event.type !== "string" ||
      !TRACE_EVENT_TYPES.has(event.type as TraceEventType) ||
      typeof event.label !== "string" ||
      (event.metadata !== undefined && !isRecord(event.metadata))
    ) {
      throw new Error(
        `Two-agent coordinator snapshot trace[${index}] is invalid`,
      );
    }

    return event as TraceEvent;
  });
}

function parseAgentSnapshots(
  value: unknown,
  coordinatorId: string,
): TwoAgentCorrectionCoordinatorSnapshot["agentSnapshots"] {
  if (!isRecord(value)) {
    throw new Error(
      "Two-agent coordinator snapshot agentSnapshots must be an object",
    );
  }

  return {
    "fact-check-agent": {
      identity: FACT_CHECK_IDENTITY,
      runtimeSnapshot: parseAgentRuntimeSnapshot(
        value["fact-check-agent"],
        FACT_CHECK_IDENTITY,
        coordinatorId,
      ),
    },
    "writer-agent": {
      identity: WRITER_IDENTITY,
      runtimeSnapshot: parseAgentRuntimeSnapshot(
        value["writer-agent"],
        WRITER_IDENTITY,
        coordinatorId,
      ),
    },
  };
}

function parseAgentRuntimeSnapshot(
  value: unknown,
  expectedIdentity: AgentIdentity,
  coordinatorId: string,
): SnapshotDocument {
  const label = expectedIdentity.agentId;
  if (!isRecord(value)) {
    throw new Error(
      `Two-agent coordinator snapshot ${label} is required`,
    );
  }

  if (!matchesIdentity(value.identity, expectedIdentity)) {
    throw new Error(
      `Two-agent coordinator snapshot ${label} identity mismatch`,
    );
  }

  if (
    !Object.prototype.hasOwnProperty.call(value, "runtimeSnapshot") ||
    value.runtimeSnapshot === undefined
  ) {
    throw new Error(
      `Two-agent coordinator snapshot ${label} runtime snapshot is required`,
    );
  }

  try {
    assertSnapshotDocument(value.runtimeSnapshot);
  } catch (error) {
    throw new Error(
      `Two-agent coordinator snapshot ${label} runtime snapshot is invalid: ${formatError(
        error,
      )}`,
    );
  }

  const runtimeSnapshot = value.runtimeSnapshot;
  if (
    runtimeSnapshot.graph.id !==
      `reactive-correction-graph/${label}` ||
    runtimeSnapshot.graph.version !== "1" ||
    runtimeSnapshot.graph.instanceId !== `${coordinatorId}/${label}`
  ) {
    throw new Error(
      `Two-agent coordinator snapshot ${label} runtime snapshot graph mismatch`,
    );
  }

  const settledState = runtimeSnapshot.nodes.find(
    (node) => node.id === "settledState" && node.kind === "signal",
  );
  if (!settledState) {
    throw new Error(
      `Two-agent coordinator snapshot ${label} settled state is required`,
    );
  }

  return runtimeSnapshot;
}

function matchesIdentity(
  value: unknown,
  expected: AgentIdentity,
): boolean {
  return (
    isRecord(value) &&
    value.agentId === expected.agentId &&
    value.role === expected.role
  );
}

function parseStringArray(value: unknown, field: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new Error(`Two-agent coordinator snapshot ${field} is invalid`);
  }

  return [...value];
}

function readInputVersion(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new Error(
      "Two-agent coordinator snapshot inputVersion is invalid",
    );
  }

  return value;
}

function readNonEmptyString(value: unknown, field: string): string {
  const result = readString(value, field);
  if (result.length === 0) {
    throw new Error(
      `Two-agent coordinator snapshot ${field} must not be empty`,
    );
  }
  return result;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(
      `Two-agent coordinator snapshot ${field} must be a string`,
    );
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cloneJson(
  value: TwoAgentCorrectionCoordinatorSnapshot,
): TwoAgentCorrectionCoordinatorSnapshot {
  return JSON.parse(
    JSON.stringify(value),
  ) as TwoAgentCorrectionCoordinatorSnapshot;
}
