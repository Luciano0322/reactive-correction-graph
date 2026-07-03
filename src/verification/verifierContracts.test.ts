import { describe, expect, it } from "vitest";
import {
  getVerifierModelKey,
  type VerificationAttemptPurpose,
  type VerifierIdentity,
} from "./verifierContracts.js";

describe("verifier contracts", () => {
  it("keeps verifier identity and attempt purpose explicit without treating aliases as independent models", () => {
    const primaryVerifier: VerifierIdentity = {
      verifierId: "facts-primary",
      provider: "deterministic-mock",
      model: "facts-v1",
    };
    const verifierAlias: VerifierIdentity = {
      verifierId: "facts-secondary-label",
      provider: "deterministic-mock",
      model: "facts-v1",
    };
    const primaryPurpose: VerificationAttemptPurpose = "primary";
    const corroborationPurpose: VerificationAttemptPurpose = "corroboration";

    expect({
      primaryVerifier,
      primaryPurpose,
      corroborationPurpose,
      primaryModelKey: getVerifierModelKey(primaryVerifier),
      aliasModelKey: getVerifierModelKey(verifierAlias),
    }).toEqual({
      primaryVerifier: {
        verifierId: "facts-primary",
        provider: "deterministic-mock",
        model: "facts-v1",
      },
      primaryPurpose: "primary",
      corroborationPurpose: "corroboration",
      primaryModelKey: '["deterministic-mock","facts-v1"]',
      aliasModelKey: '["deterministic-mock","facts-v1"]',
    });
  });
});
