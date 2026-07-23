import { describe, expect, it } from "vitest";
import type { AgentIdentity } from "./agentContracts.js";
import {
  createAgentCoordinatorBoundary,
  type AgentSessionBoundary,
} from "./coordinatorContracts.js";

type TestAgentSession = AgentSessionBoundary & {
  received: string[];
  disposeCalls: number;
};

function createTestCoordinatorBoundary(coordinatorId: string) {
  return createAgentCoordinatorBoundary({
    coordinatorId,
    createAgentSession(identity: AgentIdentity): TestAgentSession {
      return {
        identity,
        received: [],
        disposeCalls: 0,
        dispose() {
          this.disposeCalls += 1;
        },
      };
    },
  });
}

describe("agent coordinator contracts", () => {
  it("owns isolated FactCheck and Writer sessions per coordinator", () => {
    const first = createTestCoordinatorBoundary("coordinator-001");
    const second = createTestCoordinatorBoundary("coordinator-002");
    const firstFactCheck =
      first.getAgentSession("fact-check-agent");
    const firstWriter = first.getAgentSession("writer-agent");
    const secondFactCheck =
      second.getAgentSession("fact-check-agent");
    const secondWriter = second.getAgentSession("writer-agent");

    firstFactCheck.received.push("claims-v1");
    firstWriter.received.push("evidence-v1");

    expect({
      firstCoordinatorId: first.coordinatorId,
      secondCoordinatorId: second.coordinatorId,
      firstFactCheckIdentity: firstFactCheck.identity,
      firstWriterIdentity: firstWriter.identity,
      firstFactCheckReceived: firstFactCheck.received,
      firstWriterReceived: firstWriter.received,
      secondFactCheckReceived: secondFactCheck.received,
      secondWriterReceived: secondWriter.received,
      sameFactCheckSession: firstFactCheck === secondFactCheck,
      sameWriterSession: firstWriter === secondWriter,
    }).toEqual({
      firstCoordinatorId: "coordinator-001",
      secondCoordinatorId: "coordinator-002",
      firstFactCheckIdentity: {
        agentId: "fact-check-agent",
        role: "fact-check",
      },
      firstWriterIdentity: {
        agentId: "writer-agent",
        role: "writer",
      },
      firstFactCheckReceived: ["claims-v1"],
      firstWriterReceived: ["evidence-v1"],
      secondFactCheckReceived: [],
      secondWriterReceived: [],
      sameFactCheckSession: false,
      sameWriterSession: false,
    });
  });

  it("disposes each owned session once without affecting another coordinator", () => {
    const first = createTestCoordinatorBoundary("coordinator-001");
    const second = createTestCoordinatorBoundary("coordinator-002");

    first.dispose();
    first.dispose();

    expect({
      firstFactCheckDisposeCalls:
        first.getAgentSession("fact-check-agent").disposeCalls,
      firstWriterDisposeCalls:
        first.getAgentSession("writer-agent").disposeCalls,
      secondFactCheckDisposeCalls:
        second.getAgentSession("fact-check-agent").disposeCalls,
      secondWriterDisposeCalls:
        second.getAgentSession("writer-agent").disposeCalls,
    }).toEqual({
      firstFactCheckDisposeCalls: 1,
      firstWriterDisposeCalls: 1,
      secondFactCheckDisposeCalls: 0,
      secondWriterDisposeCalls: 0,
    });
  });
});
