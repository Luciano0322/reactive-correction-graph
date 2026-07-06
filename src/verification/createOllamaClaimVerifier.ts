import {
  createOllamaCorrectionModel,
  type FetchLike,
} from "../llm/ollamaCorrectionModel.js";
import type { ClaimVerifier } from "./corroborateClaim.js";

export type OllamaClaimVerifierOptions = {
  verifierId?: string;
  model: string;
  baseUrl?: string;
  fetch?: FetchLike;
};

export function createOllamaClaimVerifier(
  options: OllamaClaimVerifierOptions,
): ClaimVerifier {
  const correctionModel = createOllamaCorrectionModel(options);

  return {
    identity: {
      verifierId: options.verifierId ?? `ollama:${options.model}`,
      provider: "ollama",
      model: options.model,
    },
    async verify(claim) {
      const result = await correctionModel.factCheckClaims([claim]);
      const item = result.items.find((candidate) => candidate.claimId === claim.id);

      if (!item) {
        return {
          verdict: "insufficient-evidence",
          note: `Ollama model ${options.model} returned no result for ${claim.id}.`,
          evidenceReferences: [],
        };
      }

      return {
        verdict: item.verdict,
        note: item.note,
        evidenceReferences: [],
      };
    },
  };
}
