export type VerifierIdentity = {
  verifierId: string;
  provider: string;
  model: string;
};

export type VerificationAttemptPurpose = "primary" | "corroboration";

export function getVerifierModelKey(identity: VerifierIdentity): string {
  return JSON.stringify([identity.provider, identity.model]);
}
