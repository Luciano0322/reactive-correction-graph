import type { Claim } from "../schemas/correction.js";
import type { CorroborationQuorumPolicy } from "../verification/corroborateClaim.js";

export type MultiModelCorroborationEnv = {
  OLLAMA_CORROBORATION_MODELS?: string;
  OLLAMA_BASE_URL?: string;
  CORROBORATION_MINIMUM_MODELS?: string;
};

export type MultiModelCorroborationConfig = {
  claim: Claim;
  models: [string, string, ...string[]];
  baseUrl?: string;
  policy: CorroborationQuorumPolicy;
};

export function parseMultiModelCorroborationConfig(
  env: MultiModelCorroborationEnv,
  args: string[],
): MultiModelCorroborationConfig {
  const models = (env.OLLAMA_CORROBORATION_MODELS ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  if (models.length < 2) {
    throw new Error(
      "OLLAMA_CORROBORATION_MODELS must contain at least two comma-separated models",
    );
  }

  const claimText = args.join(" ").trim();
  if (!claimText) {
    throw new Error(
      'Usage: pnpm run evaluate:corroboration -- "claim to verify"',
    );
  }

  const minimumIndependentModels = Number(
    env.CORROBORATION_MINIMUM_MODELS ?? models.length,
  );

  return {
    claim: {
      id: "claim-1",
      text: claimText,
    },
    models: models as [string, string, ...string[]],
    baseUrl: env.OLLAMA_BASE_URL,
    policy: {
      policyVersion: 1,
      minimumIndependentModels,
    },
  };
}
