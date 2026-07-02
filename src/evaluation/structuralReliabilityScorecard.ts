export type ReliabilityEvidenceStatus =
  | "passed"
  | "failed"
  | "not-evaluated";

export type StructuralReliabilityHardGates = {
  staleResultProtection: ReliabilityEvidenceStatus;
  finalResultIntegrity: ReliabilityEvidenceStatus;
  sessionIsolation: ReliabilityEvidenceStatus;
};

export type StructuralReliabilityVerdict =
  | "pass"
  | "fail"
  | "insufficient-evidence";

export type StructuralReliabilityPolicy = {
  policyVersion: 1;
  weights: {
    settlementRate: number;
    claimCoverage: number;
    unknownIdContainment: number;
    staleResultProtection: number;
    sessionIsolation: number;
  };
};

export const STRUCTURAL_RELIABILITY_POLICY_V1: StructuralReliabilityPolicy = {
  policyVersion: 1,
  weights: {
    settlementRate: 30,
    claimCoverage: 25,
    unknownIdContainment: 15,
    staleResultProtection: 20,
    sessionIsolation: 10,
  },
};

export type RuntimeSettlementEvidence = {
  settledRuns: number;
  rejectedRuns: number;
};

export type ProviderCompatibilityEvidence = {
  settledTrials: number;
  rejectedTrials: number;
};

export type ProviderCompatibilitySummary = {
  status: "evaluated" | "not-evaluated";
  settledTrials: number | null;
  rejectedTrials: number | null;
  settlementRate: number | null;
};

export type StructuralReliabilityScorecardInput = {
  policyVersion: 1;
  runtimeSettlement: RuntimeSettlementEvidence | null;
  providerCompatibility: ProviderCompatibilityEvidence | null;
  claimCoverage: {
    coveredClaims: number;
    totalClaims: number;
  } | null;
  unknownIdContainment: {
    containedUnknownIds: number;
    totalUnknownIds: number;
  } | null;
  contractEvidence: StructuralReliabilityHardGates;
  executionEfficiency: {
    savingsReportSchemaVersion: 1;
  } | null;
};

export type StructuralReliabilityDimension = {
  weight: number;
  status: "scored" | "not-evaluated";
  score: number | null;
};

export type StructuralReliabilityDimensions = {
  settlementRate: StructuralReliabilityDimension;
  claimCoverage: StructuralReliabilityDimension;
  unknownIdContainment: StructuralReliabilityDimension;
  staleResultProtection: StructuralReliabilityDimension;
  sessionIsolation: StructuralReliabilityDimension;
};

export type StructuralReliabilityCalculation = {
  score: number | null;
  dimensions: StructuralReliabilityDimensions;
};

export type StructuralReliabilityScorecard = {
  schemaVersion: 1;
  policyVersion: 1;
  structuralReliability: {
    score: number | null;
    verdict: StructuralReliabilityVerdict;
    dimensions: StructuralReliabilityDimensions;
    hardGates: StructuralReliabilityHardGates;
  };
  providerCompatibility: ProviderCompatibilitySummary;
  executionEfficiency: {
    status: "reported-separately" | "not-evaluated";
    savingsReportSchemaVersion: 1 | null;
  };
  subjectiveCorrectionQuality: "not-evaluated";
};

export function validateStructuralReliabilityPolicy(
  policy: StructuralReliabilityPolicy,
): void {
  const totalWeight = Object.values(policy.weights).reduce(
    (total, weight) => total + weight,
    0,
  );

  if (totalWeight !== 100) {
    throw new Error(
      `Structural reliability policy weights must total 100; received ${totalWeight}`,
    );
  }
}

export function calculateStructuralReliabilityScore(
  input: StructuralReliabilityScorecardInput,
  policy: StructuralReliabilityPolicy = STRUCTURAL_RELIABILITY_POLICY_V1,
): StructuralReliabilityCalculation {
  validateStructuralReliabilityPolicy(policy);

  const runtimeSettlement = input.runtimeSettlement;
  const dimensions: StructuralReliabilityDimensions = {
    settlementRate: ratioDimension(
      runtimeSettlement?.settledRuns ?? null,
      runtimeSettlement
        ? runtimeSettlement.settledRuns + runtimeSettlement.rejectedRuns
        : null,
      policy.weights.settlementRate,
    ),
    claimCoverage: ratioDimension(
      input.claimCoverage?.coveredClaims ?? null,
      input.claimCoverage?.totalClaims ?? null,
      policy.weights.claimCoverage,
    ),
    unknownIdContainment: ratioDimension(
      input.unknownIdContainment?.containedUnknownIds ?? null,
      input.unknownIdContainment?.totalUnknownIds ?? null,
      policy.weights.unknownIdContainment,
    ),
    staleResultProtection: evidenceDimension(
      input.contractEvidence.staleResultProtection,
      policy.weights.staleResultProtection,
    ),
    sessionIsolation: evidenceDimension(
      input.contractEvidence.sessionIsolation,
      policy.weights.sessionIsolation,
    ),
  };
  const scores = Object.values(dimensions).map((dimension) => dimension.score);
  const scoredValues = scores.filter((score): score is number => score !== null);

  return {
    score: scoredValues.length !== scores.length
      ? null
      : scoredValues.reduce((total, score) => total + score, 0),
    dimensions,
  };
}

export function summarizeProviderCompatibility(
  evidence: ProviderCompatibilityEvidence | null,
): ProviderCompatibilitySummary {
  const totalTrials = evidence
    ? evidence.settledTrials + evidence.rejectedTrials
    : 0;

  if (!evidence || totalTrials <= 0) {
    return {
      status: "not-evaluated",
      settledTrials: evidence?.settledTrials ?? null,
      rejectedTrials: evidence?.rejectedTrials ?? null,
      settlementRate: null,
    };
  }

  return {
    status: "evaluated",
    settledTrials: evidence.settledTrials,
    rejectedTrials: evidence.rejectedTrials,
    settlementRate: evidence.settledTrials / totalTrials,
  };
}

export function determineStructuralReliabilityVerdict(
  calculation: StructuralReliabilityCalculation,
  hardGates: StructuralReliabilityHardGates,
): StructuralReliabilityVerdict {
  const gateStatuses = Object.values(hardGates);

  if (gateStatuses.includes("failed")) return "fail";
  if (
    calculation.score === null ||
    gateStatuses.includes("not-evaluated")
  ) {
    return "insufficient-evidence";
  }

  return "pass";
}

export function createStructuralReliabilityScorecard(
  input: StructuralReliabilityScorecardInput,
  policy: StructuralReliabilityPolicy = STRUCTURAL_RELIABILITY_POLICY_V1,
): StructuralReliabilityScorecard {
  const calculation = calculateStructuralReliabilityScore(input, policy);

  return {
    schemaVersion: 1,
    policyVersion: policy.policyVersion,
    structuralReliability: {
      ...calculation,
      verdict: determineStructuralReliabilityVerdict(
        calculation,
        input.contractEvidence,
      ),
      hardGates: { ...input.contractEvidence },
    },
    providerCompatibility: summarizeProviderCompatibility(
      input.providerCompatibility,
    ),
    executionEfficiency: input.executionEfficiency
      ? {
          status: "reported-separately",
          savingsReportSchemaVersion:
            input.executionEfficiency.savingsReportSchemaVersion,
        }
      : {
          status: "not-evaluated",
          savingsReportSchemaVersion: null,
        },
    subjectiveCorrectionQuality: "not-evaluated",
  };
}

function ratioDimension(
  successful: number | null,
  total: number | null,
  weight: number,
): StructuralReliabilityDimension {
  if (successful === null || total === null || total <= 0) {
    return { weight, status: "not-evaluated", score: null };
  }

  return {
    weight,
    status: "scored",
    score: (successful / total) * weight,
  };
}

function evidenceDimension(
  evidence: ReliabilityEvidenceStatus,
  weight: number,
): StructuralReliabilityDimension {
  if (evidence === "not-evaluated") {
    return { weight, status: "not-evaluated", score: null };
  }

  return {
    weight,
    status: "scored",
    score: evidence === "passed" ? weight : 0,
  };
}

export function serializeStructuralReliabilityScorecard(
  scorecard: StructuralReliabilityScorecard,
): string {
  return `${JSON.stringify(scorecard, null, 2)}\n`;
}
