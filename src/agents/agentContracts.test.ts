import { describe, expect, it } from "vitest";
import {
  parseAgentMessageEnvelope,
  serializeAgentMessageEnvelope,
  type AgentMessageEnvelope,
} from "./agentContracts.js";

function createEvidenceEnvelope(): AgentMessageEnvelope {
  return {
    schemaVersion: 1,
    messageId: "message-evidence-002",
    correlationId: "correction-session-001",
    causationId: "message-claims-001",
    inputVersion: 2,
    sender: {
      agentId: "fact-check-agent",
      role: "fact-check",
    },
    recipient: {
      agentId: "writer-agent",
      role: "writer",
    },
    messageType: "fact-check.evidence.ready",
    payload: {
      claimsVersion: 2,
      evidence: [
        {
          claimId: "claim-1",
          status: "verified",
          summary: "The claim is supported by deterministic evidence.",
        },
      ],
    },
  };
}

describe("agent message contracts", () => {
  it("round-trips a versioned evidence envelope without losing causal identity", () => {
    const envelope = createEvidenceEnvelope();

    const serialized = serializeAgentMessageEnvelope(envelope);

    expect(JSON.parse(serialized)).toEqual(envelope);
    expect(parseAgentMessageEnvelope(serialized)).toEqual(envelope);
  });

  it("rejects an envelope addressed to an unknown agent", () => {
    const envelope = {
      ...createEvidenceEnvelope(),
      recipient: {
        agentId: "summarizer-agent",
        role: "summarizer",
      },
    };

    expect(() =>
      parseAgentMessageEnvelope(JSON.stringify(envelope)),
    ).toThrow("Unknown agent recipient: summarizer-agent");
  });

  it("rejects an envelope with a missing payload", () => {
    const { payload: _payload, ...envelope } = createEvidenceEnvelope();

    expect(() =>
      parseAgentMessageEnvelope(JSON.stringify(envelope)),
    ).toThrow("Malformed agent message payload");
  });

  it("rejects an envelope from a stale input version", () => {
    const envelope = {
      ...createEvidenceEnvelope(),
      inputVersion: 1,
    };

    expect(() =>
      parseAgentMessageEnvelope(JSON.stringify(envelope), {
        currentInputVersion: 2,
      }),
    ).toThrow(
      "Stale agent message input version: received 1, current 2",
    );
  });
});
