import { describe, expect, it } from "vitest";
import {
  STRUCTURAL_RELIABILITY_POLICY_V1,
  calculateStructuralReliabilityScore,
  createStructuralReliabilityScorecard,
  determineStructuralReliabilityVerdict,
  serializeStructuralReliabilityScorecard,
  summarizeProviderCompatibility,
  validateStructuralReliabilityPolicy,
  type StructuralReliabilityScorecard,
  type StructuralReliabilityScorecardInput,
} from "./structuralReliabilityScorecard.js";

describe("structuralReliabilityScorecard", () => {
  it("round-trips versioned input and output contracts as JSON", () => {
    const input = completeScorecardInput();
    const scorecard: StructuralReliabilityScorecard = {
      schemaVersion: 1,
      policyVersion: 1,
      structuralReliability: {
        score: 87.5,
        verdict: "pass",
        dimensions: {
          settlementRate: {
            weight: 30,
            status: "scored",
            score: 22.5,
          },
          claimCoverage: {
            weight: 25,
            status: "scored",
            score: 20,
          },
          unknownIdContainment: {
            weight: 15,
            status: "scored",
            score: 15,
          },
          staleResultProtection: {
            weight: 20,
            status: "scored",
            score: 20,
          },
          sessionIsolation: {
            weight: 10,
            status: "scored",
            score: 10,
          },
        },
        hardGates: {
          staleResultProtection: "passed",
          finalResultIntegrity: "passed",
          sessionIsolation: "passed",
        },
      },
      providerCompatibility: {
        status: "evaluated",
        settledTrials: 3,
        rejectedTrials: 1,
        settlementRate: 0.75,
      },
      executionEfficiency: {
        status: "reported-separately",
        savingsReportSchemaVersion: 1,
      },
      subjectiveCorrectionQuality: "not-evaluated",
    };

    const serialized = serializeStructuralReliabilityScorecard(scorecard);

    expect({
      inputRoundTrip: JSON.parse(JSON.stringify(input)),
      scorecardRoundTrip: JSON.parse(serialized),
      endsWithNewline: serialized.endsWith("\n"),
    }).toEqual({
      inputRoundTrip: input,
      scorecardRoundTrip: scorecard,
      endsWithNewline: true,
    });
  });

  it("validates that the versioned policy weights total 100", () => {
    const totalWeight = Object.values(
      STRUCTURAL_RELIABILITY_POLICY_V1.weights,
    ).reduce((total, weight) => total + weight, 0);
    const invalidPolicy = {
      ...STRUCTURAL_RELIABILITY_POLICY_V1,
      weights: {
        ...STRUCTURAL_RELIABILITY_POLICY_V1.weights,
        settlementRate: 29,
      },
    };

    expect(totalWeight).toBe(100);
    expect(() => validateStructuralReliabilityPolicy(invalidPolicy)).toThrow(
      /weights must total 100; received 99/,
    );
  });

  it("calculates a deterministic weighted score from complete evidence", () => {
    expect(calculateStructuralReliabilityScore(completeScorecardInput())).toEqual({
      score: 87.5,
      dimensions: {
        settlementRate: {
          weight: 30,
          status: "scored",
          score: 22.5,
        },
        claimCoverage: {
          weight: 25,
          status: "scored",
          score: 20,
        },
        unknownIdContainment: {
          weight: 15,
          status: "scored",
          score: 15,
        },
        staleResultProtection: {
          weight: 20,
          status: "scored",
          score: 20,
        },
        sessionIsolation: {
          weight: 10,
          status: "scored",
          score: 10,
        },
      },
    });
  });

  it("fails a hard gate even when the weighted score remains high", () => {
    const input = completeScorecardInput();
    input.contractEvidence.finalResultIntegrity = "failed";
    const calculation = calculateStructuralReliabilityScore(input);

    expect({
      score: calculation.score,
      verdict: determineStructuralReliabilityVerdict(
        calculation,
        input.contractEvidence,
      ),
    }).toEqual({
      score: 87.5,
      verdict: "fail",
    });
  });

  it("passes when the score and every hard gate are complete", () => {
    const input = completeScorecardInput();
    const calculation = calculateStructuralReliabilityScore(input);

    expect(
      determineStructuralReliabilityVerdict(
        calculation,
        input.contractEvidence,
      ),
    ).toBe("pass");
  });

  it("reports provider compatibility without changing the structural score", () => {
    const input = completeScorecardInput();
    input.providerCompatibility = {
      settledTrials: 1,
      rejectedTrials: 3,
    };
    const calculation = calculateStructuralReliabilityScore(input);

    expect({
      structuralScore: calculation.score,
      settlementDimension: calculation.dimensions.settlementRate,
      providerCompatibility: summarizeProviderCompatibility(
        input.providerCompatibility,
      ),
    }).toEqual({
      structuralScore: 87.5,
      settlementDimension: {
        weight: 30,
        status: "scored",
        score: 22.5,
      },
      providerCompatibility: {
        status: "evaluated",
        settledTrials: 1,
        rejectedTrials: 3,
        settlementRate: 0.25,
      },
    });
  });

  it("keeps missing evidence and correction quality explicitly unevaluated", () => {
    const scorecard = createStructuralReliabilityScorecard({
      policyVersion: 1,
      runtimeSettlement: null,
      providerCompatibility: null,
      claimCoverage: null,
      unknownIdContainment: null,
      contractEvidence: {
        staleResultProtection: "not-evaluated",
        finalResultIntegrity: "not-evaluated",
        sessionIsolation: "not-evaluated",
      },
      executionEfficiency: null,
    });

    expect(scorecard).toEqual({
      schemaVersion: 1,
      policyVersion: 1,
      structuralReliability: {
        score: null,
        verdict: "insufficient-evidence",
        dimensions: {
          settlementRate: {
            weight: 30,
            status: "not-evaluated",
            score: null,
          },
          claimCoverage: {
            weight: 25,
            status: "not-evaluated",
            score: null,
          },
          unknownIdContainment: {
            weight: 15,
            status: "not-evaluated",
            score: null,
          },
          staleResultProtection: {
            weight: 20,
            status: "not-evaluated",
            score: null,
          },
          sessionIsolation: {
            weight: 10,
            status: "not-evaluated",
            score: null,
          },
        },
        hardGates: {
          staleResultProtection: "not-evaluated",
          finalResultIntegrity: "not-evaluated",
          sessionIsolation: "not-evaluated",
        },
      },
      providerCompatibility: {
        status: "not-evaluated",
        settledTrials: null,
        rejectedTrials: null,
        settlementRate: null,
      },
      executionEfficiency: {
        status: "not-evaluated",
        savingsReportSchemaVersion: null,
      },
      subjectiveCorrectionQuality: "not-evaluated",
    });
  });

  it("does not treat execution evidence as correction quality", () => {
    const scorecard = createStructuralReliabilityScorecard(
      completeScorecardInput(),
    );

    expect({
      structuralScore: scorecard.structuralReliability.score,
      executionEfficiency: scorecard.executionEfficiency,
      subjectiveCorrectionQuality: scorecard.subjectiveCorrectionQuality,
    }).toEqual({
      structuralScore: 87.5,
      executionEfficiency: {
        status: "reported-separately",
        savingsReportSchemaVersion: 1,
      },
      subjectiveCorrectionQuality: "not-evaluated",
    });
  });
});

function completeScorecardInput(): StructuralReliabilityScorecardInput {
  return {
    policyVersion: 1,
    runtimeSettlement: {
      settledRuns: 3,
      rejectedRuns: 1,
    },
    providerCompatibility: {
      settledTrials: 3,
      rejectedTrials: 1,
    },
    claimCoverage: {
      coveredClaims: 8,
      totalClaims: 10,
    },
    unknownIdContainment: {
      containedUnknownIds: 2,
      totalUnknownIds: 2,
    },
    contractEvidence: {
      staleResultProtection: "passed",
      finalResultIntegrity: "passed",
      sessionIsolation: "passed",
    },
    executionEfficiency: {
      savingsReportSchemaVersion: 1,
    },
  };
}
