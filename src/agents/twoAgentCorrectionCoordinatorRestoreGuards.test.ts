import { describe, expect, it } from "vitest";
import type { CorrectionRuntimeInput } from "../schemas/correction.js";
import {
  createTwoAgentCorrectionCoordinator,
  restoreTwoAgentCorrectionCoordinator,
  type TwoAgentCorrectionCoordinatorSnapshot,
} from "./createTwoAgentCorrectionCoordinator.js";

const initialInput: CorrectionRuntimeInput = {
  draft: "The sky maybe appears green under unusual lighting.",
  userIntent: "Clarify the tentative observation.",
  styleGuide: "Use concise language.",
};

describe("two-agent correction coordinator restore guards", () => {
  it("keeps two coordinators restored from the same snapshot isolated", async () => {
    const snapshot = await createSettledSnapshot(
      "coordinator-restored-isolation",
    );
    const first = restoreTwoAgentCorrectionCoordinator(snapshot);
    const second = restoreTwoAgentCorrectionCoordinator(snapshot);

    first.receive({
      ...initialInput,
      styleGuide: "Use short declarative sentences.",
    });
    await first.runUntilSettled();

    expect(first.emit()).toMatchObject({
      inputVersion: 2,
      evidenceEnvelope: snapshot.acceptedEvidence,
    });
    expect(second.emit()).toEqual(snapshot.output);
    expect(second.trace()).toEqual(snapshot.trace);

    first.dispose();
    second.dispose();
  });

  it("rejects a malformed top-level snapshot", () => {
    expect(() => restoreTwoAgentCorrectionCoordinator(null)).toThrow(
      "Two-agent coordinator snapshot must be an object",
    );
  });

  it("rejects an incomplete agent snapshot", async () => {
    const snapshot = await createSettledSnapshot(
      "coordinator-incomplete-snapshot",
    );
    const incomplete = cloneSnapshot(snapshot) as {
      agentSnapshots: Record<
        string,
        {
          identity: unknown;
          runtimeSnapshot?: unknown;
        }
      >;
    };

    delete incomplete.agentSnapshots["writer-agent"]
      ?.runtimeSnapshot;

    expect(() => restoreTwoAgentCorrectionCoordinator(incomplete)).toThrow(
      "Two-agent coordinator snapshot writer-agent runtime snapshot is required",
    );
  });

  it("rejects an unsupported aggregate schema version", async () => {
    const snapshot = await createSettledSnapshot(
      "coordinator-schema-mismatch",
    );
    const unsupported = {
      ...snapshot,
      schemaVersion: 2,
    };

    expect(() => restoreTwoAgentCorrectionCoordinator(unsupported)).toThrow(
      "Unsupported two-agent coordinator snapshot schema version: 2",
    );
  });

  it("rejects an agent identity mismatch", async () => {
    const snapshot = await createSettledSnapshot(
      "coordinator-agent-mismatch",
    );
    const mismatched = cloneSnapshot(snapshot) as {
      agentSnapshots: Record<
        string,
        {
          identity: unknown;
          runtimeSnapshot: unknown;
        }
      >;
    };

    mismatched.agentSnapshots["fact-check-agent"]!.identity = {
      agentId: "writer-agent",
      role: "writer",
    };

    expect(() => restoreTwoAgentCorrectionCoordinator(mismatched)).toThrow(
      "Two-agent coordinator snapshot fact-check-agent identity mismatch",
    );
  });
});

async function createSettledSnapshot(
  coordinatorId: string,
): Promise<TwoAgentCorrectionCoordinatorSnapshot> {
  const coordinator = createTwoAgentCorrectionCoordinator({
    coordinatorId,
  });

  coordinator.receive(initialInput);
  await coordinator.runUntilSettled();

  const snapshot = cloneSnapshot(coordinator.snapshot());
  coordinator.dispose();

  return snapshot;
}

function cloneSnapshot(
  snapshot: TwoAgentCorrectionCoordinatorSnapshot,
): TwoAgentCorrectionCoordinatorSnapshot {
  return JSON.parse(
    JSON.stringify(snapshot),
  ) as TwoAgentCorrectionCoordinatorSnapshot;
}
