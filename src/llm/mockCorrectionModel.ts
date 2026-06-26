import type {
  Claim,
  CorrectionPlan,
  FactCheckResult,
  StyleReviewResult,
} from "../schemas/correction.js";
import type { CorrectionRuntimeModel } from "../runtime/createCorrectionRuntime.js";

const MOCK_DELAY_MS = 20;

function delay(ms = MOCK_DELAY_MS) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function mockFactCheckClaims(
  claims: Claim[],
  signal?: AbortSignal,
): Promise<FactCheckResult> {
  await delay();
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  return {
    items: claims.map((claim) => ({
      claimId: claim.id,
      verdict: claim.text.toLowerCase().includes("maybe")
        ? "needs-review"
        : "supported",
      note: claim.text.toLowerCase().includes("maybe")
        ? "This claim is tentative and should be verified."
        : "Mock verifier accepted the claim.",
    })),
  };
}

export async function mockReviewStyle(
  input: { draft: string; styleGuide?: string },
  signal?: AbortSignal,
): Promise<StyleReviewResult> {
  await delay();
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const suggestions: string[] = [];
  if (input.draft.length > 400) {
    suggestions.push("Break long sections into shorter paragraphs.");
  }
  if (input.styleGuide) {
    suggestions.push(`Apply style guide: ${input.styleGuide}`);
  }

  return {
    tone: suggestions.length > 0 ? "needs-polish" : "clear",
    suggestions,
  };
}

export async function mockRewriteDraft(
  input: { draft: string; plan: CorrectionPlan },
  signal?: AbortSignal,
): Promise<string> {
  await delay();
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const planSummary = input.plan.actions.map((action) => `- ${action}`).join("\n");

  return `${input.draft.trim()}\n\n---\n\nMock correction notes:\n${planSummary}`;
}

export function createMockCorrectionModel(): CorrectionRuntimeModel {
  return {
    factCheckClaims: mockFactCheckClaims,
    reviewStyle: mockReviewStyle,
    rewriteDraft: mockRewriteDraft,
  };
}
