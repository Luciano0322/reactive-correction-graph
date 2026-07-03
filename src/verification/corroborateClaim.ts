import type { Claim, FactCheckItem } from "../schemas/correction.js";
import type { TraceCollector } from "../trace/createTraceCollector.js";
import {
  getVerifierModelKey,
  type VerificationAttemptPurpose,
  type VerifierIdentity,
} from "./verifierContracts.js";

export type VerificationEvidenceReference = {
  sourceId: string;
  locator: string;
};

export type VerificationVerdict =
  | FactCheckItem["verdict"]
  | "insufficient-evidence";

export type VerificationResult = {
  verdict: VerificationVerdict;
  note: string;
  evidenceReferences: VerificationEvidenceReference[];
};

export type ClaimVerifier = {
  identity: VerifierIdentity;
  verify(claim: Claim): Promise<VerificationResult>;
};

export type VerificationAttempt = {
  verifier: VerifierIdentity;
  purpose: VerificationAttemptPurpose;
  result: VerificationResult;
};

export type CorroborationQuorumPolicy = {
  policyVersion: 1;
  minimumIndependentModels: number;
};

export type CorroborationQuorum = {
  policy: CorroborationQuorumPolicy;
  observedIndependentModels: number;
};

type VerificationAttempts = [
  VerificationAttempt,
  VerificationAttempt,
  ...VerificationAttempt[],
];

type CorroborationResultBase = {
  claimId: string;
  attempts: VerificationAttempts;
  quorum?: CorroborationQuorum;
};

export type CorroborationAgreement = CorroborationResultBase & {
  outcome: "agreement";
  agreedVerdict: FactCheckItem["verdict"];
};

export type CorroborationDisagreement = CorroborationResultBase & {
  outcome: "disagreement";
};

export type CorroborationInsufficientEvidence = CorroborationResultBase & {
  outcome: "insufficient-evidence";
  reason:
    | "shared-model-identity"
    | "quorum-not-met"
    | "verifier-reported-insufficient-evidence";
};

export type CorroborationResult =
  | CorroborationAgreement
  | CorroborationDisagreement
  | CorroborationInsufficientEvidence;

const DEFAULT_QUORUM_POLICY: CorroborationQuorumPolicy = {
  policyVersion: 1,
  minimumIndependentModels: 2,
};

export async function corroborateClaim(
  claim: Claim,
  verifiers: readonly [ClaimVerifier, ClaimVerifier, ...ClaimVerifier[]],
  policy?: CorroborationQuorumPolicy,
): Promise<CorroborationResult> {
  const results = await Promise.all(
    verifiers.map((verifier) => verifier.verify(claim)),
  );
  const attempts = verifiers.map((verifier, index) => ({
    verifier: verifier.identity,
    purpose: index === 0 ? "primary" : "corroboration",
    result: results[index],
  })) as VerificationAttempts;
  const activePolicy = policy ?? DEFAULT_QUORUM_POLICY;
  const observedIndependentModels = new Set(
    verifiers.map((verifier) => getVerifierModelKey(verifier.identity)),
  ).size;
  const quorum = policy
    ? { policy, observedIndependentModels }
    : undefined;
  const quorumOutput = quorum ? { quorum } : {};

  if (results.some((result) => result.verdict === "insufficient-evidence")) {
    return {
      claimId: claim.id,
      outcome: "insufficient-evidence",
      reason: "verifier-reported-insufficient-evidence",
      attempts,
      ...quorumOutput,
    };
  }

  const verdicts = new Set(results.map((result) => result.verdict));
  if (verdicts.size > 1) {
    return {
      claimId: claim.id,
      outcome: "disagreement",
      attempts,
      ...quorumOutput,
    };
  }

  if (observedIndependentModels < activePolicy.minimumIndependentModels) {
    return {
      claimId: claim.id,
      outcome: "insufficient-evidence",
      reason:
        observedIndependentModels === 1
          ? "shared-model-identity"
          : "quorum-not-met",
      attempts,
      ...quorumOutput,
    };
  }

  return {
    claimId: claim.id,
    outcome: "agreement",
    agreedVerdict: results[0].verdict as FactCheckItem["verdict"],
    attempts,
    ...quorumOutput,
  };
}

export function recordCorroborationTrace(
  trace: TraceCollector,
  result: CorroborationResult,
): void {
  for (const attempt of result.attempts) {
    trace.resolved("verification", "verificationAttempt", {
      claimId: result.claimId,
      verifierId: attempt.verifier.verifierId,
      provider: attempt.verifier.provider,
      model: attempt.verifier.model,
      purpose: attempt.purpose,
      verdict: attempt.result.verdict,
      evidenceReferenceCount: attempt.result.evidenceReferences.length,
    });
  }

  trace.completed("verification", "corroboration", {
    claimId: result.claimId,
    outcome: result.outcome,
    verificationAttempts: result.attempts.length,
    independentModels: new Set(
      result.attempts.map((attempt) => getVerifierModelKey(attempt.verifier)),
    ).size,
    policyVersion:
      result.quorum?.policy.policyVersion ?? DEFAULT_QUORUM_POLICY.policyVersion,
  });
}
