export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type AgentIdentity =
  | {
      agentId: "fact-check-agent";
      role: "fact-check";
    }
  | {
      agentId: "writer-agent";
      role: "writer";
    };

export type AgentMessageEnvelope<
  Payload extends JsonValue = JsonValue,
> = {
  schemaVersion: 1;
  messageId: string;
  correlationId: string;
  causationId: string | null;
  inputVersion: number;
  sender: AgentIdentity;
  recipient: AgentIdentity;
  messageType: string;
  payload: Payload;
};

export type AgentError = {
  code: string;
  message: string;
  retryable: boolean;
  details?: JsonValue;
};

export type AgentResult<Output extends JsonValue = JsonValue> =
  | {
      status: "completed";
      agent: AgentIdentity;
      inputVersion: number;
      output: Output;
    }
  | {
      status: "failed";
      agent: AgentIdentity;
      inputVersion: number;
      error: AgentError;
    }
  | {
      status: "stale";
      agent: AgentIdentity;
      inputVersion: number;
      currentInputVersion: number;
      reason: "superseded";
    };

export type ParseAgentMessageEnvelopeOptions = {
  currentInputVersion?: number;
};

export function serializeAgentMessageEnvelope(
  envelope: AgentMessageEnvelope,
): string {
  return JSON.stringify(envelope);
}

export function parseAgentMessageEnvelope(
  serialized: string,
  options: ParseAgentMessageEnvelopeOptions = {},
): AgentMessageEnvelope {
  const value = parseJson(serialized);

  if (!isRecord(value)) {
    throw new Error("Malformed agent message envelope");
  }

  if (value.schemaVersion !== 1) {
    throw new Error(
      `Unsupported agent message schema version: ${String(value.schemaVersion)}`,
    );
  }

  assertNonEmptyString(value.messageId, "messageId");
  assertNonEmptyString(value.correlationId, "correlationId");

  if (value.causationId !== null) {
    assertNonEmptyString(value.causationId, "causationId");
  }

  assertInputVersion(value.inputVersion);
  assertAgentIdentity(value.sender, "sender");
  assertAgentIdentity(value.recipient, "recipient");
  assertNonEmptyString(value.messageType, "messageType");

  if (
    !Object.prototype.hasOwnProperty.call(value, "payload") ||
    !isJsonValue(value.payload)
  ) {
    throw new Error("Malformed agent message payload");
  }

  if (options.currentInputVersion !== undefined) {
    assertInputVersion(options.currentInputVersion, "currentInputVersion");

    if (value.inputVersion < options.currentInputVersion) {
      throw new Error(
        `Stale agent message input version: received ${value.inputVersion}, current ${options.currentInputVersion}`,
      );
    }
  }

  return value as AgentMessageEnvelope;
}

function parseJson(serialized: string): unknown {
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new Error("Malformed agent message envelope: invalid JSON");
  }
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Malformed agent message ${field}`);
  }
}

function assertInputVersion(
  value: unknown,
  field = "inputVersion",
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(`Malformed agent message ${field}`);
  }
}

function assertAgentIdentity(
  value: unknown,
  field: "sender" | "recipient",
): asserts value is AgentIdentity {
  if (!isRecord(value) || typeof value.agentId !== "string") {
    throw new Error(`Malformed agent message ${field}`);
  }

  const expectedRole = getAgentRole(value.agentId);
  if (expectedRole === undefined) {
    throw new Error(`Unknown agent ${field}: ${value.agentId}`);
  }

  if (value.role !== expectedRole) {
    throw new Error(
      `Agent ${field} role mismatch: ${value.agentId} requires ${expectedRole}`,
    );
  }
}

function getAgentRole(agentId: string): AgentIdentity["role"] | undefined {
  if (agentId === "fact-check-agent") {
    return "fact-check";
  }

  if (agentId === "writer-agent") {
    return "writer";
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isRecord(value) && Object.values(value).every(isJsonValue);
}
