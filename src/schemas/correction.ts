export type Claim = {
  id: string;
  text: string;
};

export type FactCheckItem = {
  claimId: string;
  verdict: "supported" | "needs-review";
  note: string;
};

export type FactCheckResult = {
  items: FactCheckItem[];
};

export type StyleReviewResult = {
  tone: "clear" | "needs-polish";
  suggestions: string[];
};

export type CorrectionPlan = {
  actions: string[];
};

export type FinalResult = {
  revisedDraft: string;
  summary: string[];
  unresolvedIssues: string[];
};

export type CorrectionRuntimeInput = {
  draft: string;
  userIntent?: string;
  styleGuide?: string;
};

export type CorrectionRuntimeOutput = {
  claims: Claim[];
  factCheckResult: FactCheckResult;
  styleReviewResult: StyleReviewResult;
  correctionPlan: CorrectionPlan;
  revisedDraft: string;
  finalResult: FinalResult;
};
