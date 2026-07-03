import { describe, expect, it } from "vitest";
import { createTraceCollector } from "../trace/createTraceCollector.js";
import {
  corroborateClaim,
  recordCorroborationTrace,
  type ClaimVerifier,
  type VerificationResult,
} from "./corroborateClaim.js";

describe("corroborateClaim", () => {
  it("preserves agreeing results from two deterministic verifiers", async () => {
    const primaryResult: VerificationResult = {
      verdict: "supported",
      note: "Primary fixture supports the claim.",
      evidenceReferences: [
        { sourceId: "fixture-primary", locator: "claim-1" },
      ],
    };
    const corroboratingResult: VerificationResult = {
      verdict: "supported",
      note: "Corroborating fixture independently supports the claim.",
      evidenceReferences: [
        { sourceId: "fixture-corroborating", locator: "claim-1" },
      ],
    };
    const primaryVerifier = deterministicVerifier(
      "facts-primary",
      "facts-v1",
      primaryResult,
    );
    const corroboratingVerifier = deterministicVerifier(
      "facts-corroborating",
      "facts-v2",
      corroboratingResult,
    );

    const result = await corroborateClaim(
      { id: "claim-1", text: "Signal-kernel tracks reactive dependencies." },
      [primaryVerifier, corroboratingVerifier],
    );

    expect(result).toEqual({
      claimId: "claim-1",
      outcome: "agreement",
      agreedVerdict: "supported",
      attempts: [
        {
          verifier: primaryVerifier.identity,
          purpose: "primary",
          result: primaryResult,
        },
        {
          verifier: corroboratingVerifier.identity,
          purpose: "corroboration",
          result: corroboratingResult,
        },
      ],
    });
  });

  it("preserves disagreement between deterministic verifiers", async () => {
    const primaryResult: VerificationResult = {
      verdict: "supported",
      note: "Primary fixture supports the claim.",
      evidenceReferences: [
        { sourceId: "fixture-primary", locator: "claim-2" },
      ],
    };
    const corroboratingResult: VerificationResult = {
      verdict: "needs-review",
      note: "Corroborating fixture cannot support the claim.",
      evidenceReferences: [
        { sourceId: "fixture-corroborating", locator: "claim-2" },
      ],
    };
    const primaryVerifier = deterministicVerifier(
      "facts-primary",
      "facts-v1",
      primaryResult,
    );
    const corroboratingVerifier = deterministicVerifier(
      "facts-corroborating",
      "facts-v2",
      corroboratingResult,
    );

    const result = await corroborateClaim(
      { id: "claim-2", text: "This claim has conflicting evidence." },
      [primaryVerifier, corroboratingVerifier],
    );

    expect(result).toEqual({
      claimId: "claim-2",
      outcome: "disagreement",
      attempts: [
        {
          verifier: primaryVerifier.identity,
          purpose: "primary",
          result: primaryResult,
        },
        {
          verifier: corroboratingVerifier.identity,
          purpose: "corroboration",
          result: corroboratingResult,
        },
      ],
    });
  });

  it("reports insufficient evidence when verifier aliases share one model identity", async () => {
    const primaryResult: VerificationResult = {
      verdict: "supported",
      note: "First call supports the claim.",
      evidenceReferences: [
        { sourceId: "fixture-primary", locator: "claim-3" },
      ],
    };
    const repeatedResult: VerificationResult = {
      verdict: "supported",
      note: "Repeated call also supports the claim.",
      evidenceReferences: [
        { sourceId: "fixture-repeated", locator: "claim-3" },
      ],
    };
    const primaryVerifier = deterministicVerifier(
      "facts-primary",
      "facts-v1",
      primaryResult,
    );
    const verifierAlias = deterministicVerifier(
      "facts-secondary-label",
      "facts-v1",
      repeatedResult,
    );

    const result = await corroborateClaim(
      { id: "claim-3", text: "Repeated model calls are independent evidence." },
      [primaryVerifier, verifierAlias],
    );

    expect(result).toEqual({
      claimId: "claim-3",
      outcome: "insufficient-evidence",
      reason: "shared-model-identity",
      attempts: [
        {
          verifier: primaryVerifier.identity,
          purpose: "primary",
          result: primaryResult,
        },
        {
          verifier: verifierAlias.identity,
          purpose: "corroboration",
          result: repeatedResult,
        },
      ],
    });
  });

  it("preserves an explicit insufficient-evidence verifier result", async () => {
    const primaryResult: VerificationResult = {
      verdict: "supported",
      note: "Primary fixture supports the claim.",
      evidenceReferences: [
        { sourceId: "fixture-primary", locator: "claim-4" },
      ],
    };
    const insufficientResult: VerificationResult = {
      verdict: "insufficient-evidence",
      note: "Corroborating fixture has no applicable source.",
      evidenceReferences: [],
    };
    const primaryVerifier = deterministicVerifier(
      "facts-primary",
      "facts-v1",
      primaryResult,
    );
    const corroboratingVerifier = deterministicVerifier(
      "facts-corroborating",
      "facts-v2",
      insufficientResult,
    );

    const result = await corroborateClaim(
      { id: "claim-4", text: "This claim lacks corroborating evidence." },
      [primaryVerifier, corroboratingVerifier],
    );

    expect(result).toEqual({
      claimId: "claim-4",
      outcome: "insufficient-evidence",
      reason: "verifier-reported-insufficient-evidence",
      attempts: [
        {
          verifier: primaryVerifier.identity,
          purpose: "primary",
          result: primaryResult,
        },
        {
          verifier: corroboratingVerifier.identity,
          purpose: "corroboration",
          result: insufficientResult,
        },
      ],
    });
  });

  it("applies a versioned quorum policy to three independent agreeing models", async () => {
    const primaryResult: VerificationResult = {
      verdict: "supported",
      note: "Primary fixture supports the claim.",
      evidenceReferences: [
        { sourceId: "fixture-primary", locator: "claim-5" },
      ],
    };
    const secondResult: VerificationResult = {
      verdict: "supported",
      note: "Second fixture supports the claim.",
      evidenceReferences: [
        { sourceId: "fixture-second", locator: "claim-5" },
      ],
    };
    const thirdResult: VerificationResult = {
      verdict: "supported",
      note: "Third fixture supports the claim.",
      evidenceReferences: [
        { sourceId: "fixture-third", locator: "claim-5" },
      ],
    };
    const primaryVerifier = deterministicVerifier(
      "facts-primary",
      "facts-v1",
      primaryResult,
    );
    const secondVerifier = deterministicVerifier(
      "facts-second",
      "facts-v2",
      secondResult,
    );
    const thirdVerifier = deterministicVerifier(
      "facts-third",
      "facts-v3",
      thirdResult,
    );
    const policy = {
      policyVersion: 1 as const,
      minimumIndependentModels: 3,
    };

    const result = await corroborateClaim(
      { id: "claim-5", text: "Three independent models support this claim." },
      [primaryVerifier, secondVerifier, thirdVerifier],
      policy,
    );

    expect(result).toEqual({
      claimId: "claim-5",
      outcome: "agreement",
      agreedVerdict: "supported",
      quorum: {
        policy,
        observedIndependentModels: 3,
      },
      attempts: [
        {
          verifier: primaryVerifier.identity,
          purpose: "primary",
          result: primaryResult,
        },
        {
          verifier: secondVerifier.identity,
          purpose: "corroboration",
          result: secondResult,
        },
        {
          verifier: thirdVerifier.identity,
          purpose: "corroboration",
          result: thirdResult,
        },
      ],
    });
  });

  it("reports the observed model count when a versioned quorum is not met", async () => {
    const primaryResult: VerificationResult = {
      verdict: "supported",
      note: "Primary fixture supports the claim.",
      evidenceReferences: [
        { sourceId: "fixture-primary", locator: "claim-6" },
      ],
    };
    const corroboratingResult: VerificationResult = {
      verdict: "supported",
      note: "Corroborating fixture supports the claim.",
      evidenceReferences: [
        { sourceId: "fixture-corroborating", locator: "claim-6" },
      ],
    };
    const primaryVerifier = deterministicVerifier(
      "facts-primary",
      "facts-v1",
      primaryResult,
    );
    const corroboratingVerifier = deterministicVerifier(
      "facts-corroborating",
      "facts-v2",
      corroboratingResult,
    );
    const policy = {
      policyVersion: 1 as const,
      minimumIndependentModels: 3,
    };

    const result = await corroborateClaim(
      { id: "claim-6", text: "This claim requires a three-model quorum." },
      [primaryVerifier, corroboratingVerifier],
      policy,
    );

    expect(result).toEqual({
      claimId: "claim-6",
      outcome: "insufficient-evidence",
      reason: "quorum-not-met",
      quorum: {
        policy,
        observedIndependentModels: 2,
      },
      attempts: [
        {
          verifier: primaryVerifier.identity,
          purpose: "primary",
          result: primaryResult,
        },
        {
          verifier: corroboratingVerifier.identity,
          purpose: "corroboration",
          result: corroboratingResult,
        },
      ],
    });
  });

  it("records verification attempts separately from reactive recomputation trace", async () => {
    const primaryVerifier = deterministicVerifier("facts-primary", "facts-v1", {
      verdict: "supported",
      note: "Primary fixture supports the claim.",
      evidenceReferences: [
        { sourceId: "fixture-primary", locator: "claim-7" },
      ],
    });
    const corroboratingVerifier = deterministicVerifier(
      "facts-corroborating",
      "facts-v2",
      {
        verdict: "supported",
        note: "Corroborating fixture supports the claim.",
        evidenceReferences: [
          { sourceId: "fixture-corroborating", locator: "claim-7" },
        ],
      },
    );
    const result = await corroborateClaim(
      { id: "claim-7", text: "Corroboration is deliberate verification work." },
      [primaryVerifier, corroboratingVerifier],
    );
    const trace = createTraceCollector();

    recordCorroborationTrace(trace, result);

    expect(
      trace.events().map(({ scope, type, label, metadata }) => ({
        scope,
        type,
        label,
        metadata,
      })),
    ).toEqual([
      {
        scope: "verification",
        type: "resolved",
        label: "verificationAttempt",
        metadata: {
          claimId: "claim-7",
          verifierId: "facts-primary",
          provider: "deterministic-mock",
          model: "facts-v1",
          purpose: "primary",
          verdict: "supported",
          evidenceReferenceCount: 1,
        },
      },
      {
        scope: "verification",
        type: "resolved",
        label: "verificationAttempt",
        metadata: {
          claimId: "claim-7",
          verifierId: "facts-corroborating",
          provider: "deterministic-mock",
          model: "facts-v2",
          purpose: "corroboration",
          verdict: "supported",
          evidenceReferenceCount: 1,
        },
      },
      {
        scope: "verification",
        type: "completed",
        label: "corroboration",
        metadata: {
          claimId: "claim-7",
          outcome: "agreement",
          verificationAttempts: 2,
          independentModels: 2,
          policyVersion: 1,
        },
      },
    ]);
  });
});

function deterministicVerifier(
  verifierId: string,
  model: string,
  result: VerificationResult,
): ClaimVerifier {
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
