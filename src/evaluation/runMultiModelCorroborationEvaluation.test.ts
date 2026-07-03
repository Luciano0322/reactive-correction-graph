import { describe, expect, it } from "vitest";
import type { Claim } from "../schemas/correction.js";
import type {
  ClaimVerifier,
  VerificationResult,
} from "../verification/corroborateClaim.js";
import {
  runMultiModelCorroborationEvaluation,
  serializeMultiModelCorroborationEvaluationReport,
} from "./runMultiModelCorroborationEvaluation.js";

describe("runMultiModelCorroborationEvaluation", () => {
  it("produces a versioned corroboration report with deterministic verifiers", async () => {
    const claim: Claim = {
      id: "claim-1",
      text: "Signal-kernel tracks reactive dependencies.",
    };
    const primaryVerifier = deterministicVerifier(
      "facts-primary",
      "facts-v1",
      "fixture-primary",
    );
    const corroboratingVerifier = deterministicVerifier(
      "facts-corroborating",
      "facts-v2",
      "fixture-corroborating",
    );

    const report = await runMultiModelCorroborationEvaluation({
      claim,
      verifiers: [primaryVerifier, corroboratingVerifier],
      policy: {
        policyVersion: 1,
        minimumIndependentModels: 2,
      },
    });

    expect({
      schemaVersion: report.schemaVersion,
      mode: report.mode,
      claim: report.claim,
      outcome: report.result.outcome,
      attempts: report.result.attempts.map((attempt) => ({
        verifierId: attempt.verifier.verifierId,
        purpose: attempt.purpose,
        verdict: attempt.result.verdict,
      })),
      trace: report.trace.map(({ scope, type, label }) => ({
        scope,
        type,
        label,
      })),
    }).toEqual({
      schemaVersion: 1,
      mode: "manual-multi-model-corroboration",
      claim,
      outcome: "agreement",
      attempts: [
        {
          verifierId: "facts-primary",
          purpose: "primary",
          verdict: "supported",
        },
        {
          verifierId: "facts-corroborating",
          purpose: "corroboration",
          verdict: "supported",
        },
      ],
      trace: [
        {
          scope: "verification",
          type: "resolved",
          label: "verificationAttempt",
        },
        {
          scope: "verification",
          type: "resolved",
          label: "verificationAttempt",
        },
        {
          scope: "verification",
          type: "completed",
          label: "corroboration",
        },
      ],
    });
  });

  it("serializes the manual report as stable JSON", () => {
    const serialized = serializeMultiModelCorroborationEvaluationReport({
      schemaVersion: 1,
      mode: "manual-multi-model-corroboration",
      claim: { id: "claim-1", text: "A claim." },
      result: {
        claimId: "claim-1",
        outcome: "agreement",
        agreedVerdict: "supported",
        attempts: [
          {
            verifier: {
              verifierId: "facts-primary",
              provider: "deterministic-mock",
              model: "facts-v1",
            },
            purpose: "primary",
            result: {
              verdict: "supported",
              note: "Supported.",
              evidenceReferences: [],
            },
          },
          {
            verifier: {
              verifierId: "facts-corroborating",
              provider: "deterministic-mock",
              model: "facts-v2",
            },
            purpose: "corroboration",
            result: {
              verdict: "supported",
              note: "Also supported.",
              evidenceReferences: [],
            },
          },
        ],
      },
      trace: [],
    });

    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized)).toMatchObject({
      schemaVersion: 1,
      mode: "manual-multi-model-corroboration",
      claim: { id: "claim-1", text: "A claim." },
      result: { outcome: "agreement" },
    });
  });
});

function deterministicVerifier(
  verifierId: string,
  model: string,
  sourceId: string,
): ClaimVerifier {
  const result: VerificationResult = {
    verdict: "supported",
    note: `${model} supports the fixture claim.`,
    evidenceReferences: [{ sourceId, locator: "claim-1" }],
  };

  return {
    identity: {
      verifierId,
      provider: "deterministic-mock",
      model,
    },
    async verify() {
      return result;
    },
  };
}
