import { describe, expect, it } from "vitest";
import { createMockCorrectionModel } from "../llm/mockCorrectionModel.js";
import type {
  Claim,
  CorrectionRuntimeInput,
  FactCheckResult,
} from "../schemas/correction.js";
import {
  createTwoAgentCorrectionCoordinator,
  type TwoAgentCorrectionOutput,
} from "./createTwoAgentCorrectionCoordinator.js";

function createDeferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe("two-agent correction coordinator", () => {
  it("routes initial FactCheck evidence to Writer and emits a correction result", async () => {
    const coordinator = createTwoAgentCorrectionCoordinator({
      coordinatorId: "coordinator-001",
    });
    const input: CorrectionRuntimeInput = {
      draft: "The sky maybe appears green under unusual lighting.",
      userIntent: "Clarify the tentative observation.",
      styleGuide: "Use concise language.",
    };

    coordinator.receive(input);
    await coordinator.runUntilSettled();

    const output = coordinator.emit();
    const roundTripped = JSON.parse(
      JSON.stringify(output),
    ) as TwoAgentCorrectionOutput;

    expect(output).toEqual({
      inputVersion: 1,
      evidenceEnvelope: {
        schemaVersion: 1,
        messageId: expect.any(String),
        correlationId: "coordinator-001",
        causationId: null,
        inputVersion: 1,
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
          claims: [
            {
              id: "claim-1",
              text: input.draft,
            },
          ],
          factCheckResult: {
            items: [
              {
                claimId: "claim-1",
                verdict: "needs-review",
                note: "This claim is tentative and should be verified.",
              },
            ],
          },
        },
      },
      finalResult: {
        revisedDraft: expect.stringContaining("Mock correction notes:"),
        summary: [
          "Review claim claim-1: This claim is tentative and should be verified.",
          "Apply style guide: Use concise language.",
          "Respect user intent: Clarify the tentative observation.",
        ],
        unresolvedIssues: [
          "This claim is tentative and should be verified.",
        ],
      },
    });
    expect(roundTripped).toEqual(output);

    coordinator.dispose();
  });

  it("reuses FactCheck evidence and reruns Writer for a style-only update", async () => {
    const coordinator = createTwoAgentCorrectionCoordinator({
      coordinatorId: "coordinator-style-only",
    });
    const initialInput: CorrectionRuntimeInput = {
      draft: "The sky maybe appears green under unusual lighting.",
      userIntent: "Clarify the tentative observation.",
      styleGuide: "Use concise language.",
    };

    coordinator.receive(initialInput);
    await coordinator.runUntilSettled();
    const initialOutput = coordinator.emit();

    coordinator.receive({
      ...initialInput,
      styleGuide: "Use short declarative sentences.",
    });
    await coordinator.runUntilSettled();

    const styleOnlyOutput = coordinator.emit();

    expect({
      inputVersion: styleOnlyOutput.inputVersion,
      evidenceEnvelope: styleOnlyOutput.evidenceEnvelope,
      summary: styleOnlyOutput.finalResult.summary,
      revisedDraftChanged:
        styleOnlyOutput.finalResult.revisedDraft !==
        initialOutput.finalResult.revisedDraft,
    }).toEqual({
      inputVersion: 2,
      evidenceEnvelope: initialOutput.evidenceEnvelope,
      summary: [
        "Review claim claim-1: This claim is tentative and should be verified.",
        "Apply style guide: Use short declarative sentences.",
        "Respect user intent: Clarify the tentative observation.",
      ],
      revisedDraftChanged: true,
    });

    const styleOnlyTrace = coordinator.trace().filter(
      (event) => event.metadata?.inputVersion === 2,
    );

    expect(styleOnlyTrace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "runtime",
          type: "skipped",
          label: "factCheckAgent",
          metadata: expect.objectContaining({
            inputVersion: 2,
            evidenceInputVersion: 1,
            reason: "evidence reused",
          }),
        }),
        expect.objectContaining({
          scope: "runtime",
          type: "pending",
          label: "writerAgent",
          metadata: expect.objectContaining({
            inputVersion: 2,
          }),
        }),
        expect.objectContaining({
          scope: "runtime",
          type: "resolved",
          label: "writerAgent",
          metadata: expect.objectContaining({
            inputVersion: 2,
          }),
        }),
      ]),
    );

    coordinator.dispose();
  });

  it("invalidates changed claims without leaking evidence across coordinator sessions", async () => {
    const first = createTwoAgentCorrectionCoordinator({
      coordinatorId: "coordinator-claim-change",
    });
    const second = createTwoAgentCorrectionCoordinator({
      coordinatorId: "coordinator-isolated",
    });
    const initialInput: CorrectionRuntimeInput = {
      draft: "The sky maybe appears green under unusual lighting.",
      userIntent: "Clarify the tentative observation.",
      styleGuide: "Use concise language.",
    };

    first.receive(initialInput);
    second.receive(initialInput);
    await Promise.all([
      first.runUntilSettled(),
      second.runUntilSettled(),
    ]);

    const firstInitialOutput = first.emit();
    const secondInitialOutput = second.emit();

    first.receive({
      ...initialInput,
      draft: "The moon maybe appears green under unusual lighting.",
    });
    await first.runUntilSettled();

    const firstChangedOutput = first.emit();
    const secondUnchangedOutput = second.emit();
    const firstSecondEpochTrace = first.trace().filter(
      (event) => event.metadata?.inputVersion === 2,
    );
    const secondSecondEpochTrace = second.trace().filter(
      (event) => event.metadata?.inputVersion === 2,
    );

    expect({
      changedInputVersion: firstChangedOutput.inputVersion,
      changedEvidenceInputVersion:
        firstChangedOutput.evidenceEnvelope.inputVersion,
      changedClaims:
        (firstChangedOutput.evidenceEnvelope.payload as {
          claims: Claim[];
        }).claims,
      evidenceWasReplaced:
        firstChangedOutput.evidenceEnvelope.messageId !==
        firstInitialOutput.evidenceEnvelope.messageId,
      isolatedOutput: secondUnchangedOutput,
      isolatedTrace: secondSecondEpochTrace,
    }).toEqual({
      changedInputVersion: 2,
      changedEvidenceInputVersion: 2,
      changedClaims: [
        {
          id: "claim-1",
          text: "The moon maybe appears green under unusual lighting.",
        },
      ],
      evidenceWasReplaced: true,
      isolatedOutput: secondInitialOutput,
      isolatedTrace: [],
    });
    expect(firstSecondEpochTrace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "runtime",
          type: "stale",
          label: "factCheckEvidence",
          metadata: expect.objectContaining({
            inputVersion: 2,
            evidenceInputVersion: 1,
            reason: "claims changed",
          }),
        }),
        expect.objectContaining({
          scope: "runtime",
          type: "pending",
          label: "factCheckAgent",
          metadata: expect.objectContaining({
            inputVersion: 2,
          }),
        }),
        expect.objectContaining({
          scope: "runtime",
          type: "resolved",
          label: "factCheckAgent",
          metadata: expect.objectContaining({
            inputVersion: 2,
          }),
        }),
      ]),
    );

    first.dispose();
    second.dispose();
  });

  it("rejects a late FactCheck result from a superseded receive", async () => {
    const firstFactCheck = createDeferred<FactCheckResult>();
    const factCheckDrafts: string[] = [];
    const baseModel = createMockCorrectionModel();
    const coordinator = createTwoAgentCorrectionCoordinator({
      coordinatorId: "coordinator-stale-result",
      model: {
        ...baseModel,
        async factCheckClaims(claims) {
          factCheckDrafts.push(claims[0]?.text ?? "");

          if (factCheckDrafts.length === 1) {
            return firstFactCheck.promise;
          }

          return {
            items: claims.map((claim) => ({
              claimId: claim.id,
              verdict: "supported" as const,
              note: "The current claim is supported.",
            })),
          };
        },
      },
    });

    coordinator.receive({
      draft: "The first claim maybe needs review.",
      styleGuide: "Use concise language.",
    });
    const staleSettlement = coordinator.runUntilSettled();

    coordinator.receive({
      draft: "The current claim is supported.",
      styleGuide: "Use concise language.",
    });
    await coordinator.runUntilSettled();

    firstFactCheck.resolve({
      items: [
        {
          claimId: "claim-1",
          verdict: "needs-review",
          note: "This late result belongs to the first input.",
        },
      ],
    });
    await staleSettlement;

    const output = coordinator.emit();
    const staleTrace = coordinator.trace().filter(
      (event) =>
        event.type === "stale" &&
        event.metadata?.inputVersion === 1,
    );
    const emittedVersions = coordinator.trace()
      .filter(
        (event) =>
          event.type === "emitted" &&
          event.label === "twoAgentFinalResult",
      )
      .map((event) => event.metadata?.inputVersion);

    expect({
      factCheckDrafts,
      outputInputVersion: output.inputVersion,
      evidenceInputVersion: output.evidenceEnvelope.inputVersion,
      evidenceClaims:
        (output.evidenceEnvelope.payload as {
          claims: Claim[];
        }).claims,
      unresolvedIssues: output.finalResult.unresolvedIssues,
      staleTrace,
      emittedVersions,
    }).toEqual({
      factCheckDrafts: [
        "The first claim maybe needs review.",
        "The current claim is supported.",
      ],
      outputInputVersion: 2,
      evidenceInputVersion: 2,
      evidenceClaims: [
        {
          id: "claim-1",
          text: "The current claim is supported.",
        },
      ],
      unresolvedIssues: [],
      staleTrace: [
        expect.objectContaining({
          scope: "runtime",
          type: "stale",
          label: "factCheckAgent",
          metadata: {
            inputVersion: 1,
            currentInputVersion: 2,
            reason: "superseded async result",
          },
        }),
      ],
      emittedVersions: [2],
    });

    coordinator.dispose();
  });
});
