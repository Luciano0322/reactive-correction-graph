import { batch, computed, createEffect, signal } from "@signal-kernel/core";
import { createResource } from "@signal-kernel/async-runtime";
import { createMockCorrectionModel } from "../llm/mockCorrectionModel.js";
import type {
  Claim,
  CorrectionPlan,
  CorrectionRuntimeInput,
  CorrectionRuntimeOutput,
  FactCheckResult,
  FinalResult,
  StyleReviewResult,
} from "../schemas/correction.js";
import { createTraceCollector, type TraceCollector } from "../trace/createTraceCollector.js";
import type { TraceEvent } from "../trace/types.js";
import type { SignalNode } from "./signalNode.js";

type ResourceStatus = "idle" | "pending" | "success" | "error" | "cancelled";

export type CorrectionRuntimeSnapshot = {
  stableFinalResult?: FinalResult;
  statuses: {
    factCheck: ResourceStatus;
    styleReview: ResourceStatus;
    rewriteDraft: ResourceStatus;
  };
};

type RewriteInput =
  | {
      status: "ready";
      epoch: number;
      draft: string;
      plan: CorrectionPlan;
      planKey: string;
    }
  | {
      status: "waiting";
      reason: string;
    };

type RevisedDraftResult = {
  epoch: number;
  planKey: string;
  text: string;
};

export type CorrectionRuntime = SignalNode<
  CorrectionRuntimeInput,
  CorrectionRuntimeOutput,
  CorrectionRuntimeSnapshot
>;

export type CorrectionRuntimeModel = {
  factCheckClaims: (
    claims: Claim[],
    signal?: AbortSignal,
  ) => Promise<FactCheckResult>;
  reviewStyle: (
    input: { draft: string; styleGuide?: string },
    signal?: AbortSignal,
  ) => Promise<StyleReviewResult>;
  rewriteDraft: (
    input: { draft: string; plan: CorrectionPlan },
    signal?: AbortSignal,
  ) => Promise<string>;
};

export type CorrectionRuntimeOptions = {
  traceCollector?: TraceCollector;
  model?: Partial<CorrectionRuntimeModel>;
  settleTimeoutMs?: number;
  settlePollMs?: number;
};

type FailedResource = {
  label: string;
  error?: unknown;
};

const defaultRuntimeModel: CorrectionRuntimeModel = {
  ...createMockCorrectionModel(),
};

const DEFAULT_SETTLE_TIMEOUT_MS = 2_000;
const DEFAULT_SETTLE_POLL_MS = 10;
const DEFAULT_CLAIM_BUDGET = 6;

export function createCorrectionRuntime(
  optionsOrTraceCollector: TraceCollector | CorrectionRuntimeOptions = {},
): CorrectionRuntime {
  const { traceCollector, model, settleTimeoutMs, settlePollMs } =
    normalizeRuntimeOptions(optionsOrTraceCollector);
  let graph: RuntimeGraph | undefined;
  let expectedEmissionCount = 0;
  let previousState: CorrectionRuntimeInput | undefined;

  return {
    receive(state) {
      traceCollector.started("runtime", "receive");
      recordInputInvalidation(traceCollector, state, previousState);

      if (!graph) {
        graph = createRuntimeGraph(state, traceCollector, model);
      } else {
        graph.receive(state);
      }

      expectedEmissionCount = graph.emittedFinalResultCount() + 1;
      previousState = state;
      traceCollector.completed("runtime", "receive");
    },
    async runUntilSettled() {
      if (!graph) {
        throw new Error("Correction runtime must receive input before settling");
      }

      traceCollector.started("runtime", "runUntilSettled");

      const startedAt = Date.now();
      const deadline = startedAt + settleTimeoutMs;
      let attempts = 0;

      while (true) {
        attempts += 1;
        graph.forceReadFinalResult();

        const failedResource = graph.failedResource();
        if (failedResource) {
          const error = formatError(failedResource.error);
          traceCollector.rejected("runtime", "runUntilSettled", {
            resource: failedResource.label,
            error,
          });
          throw new Error(`${failedResource.label} failed: ${error}`);
        }

        if (
          graph.emittedFinalResultCount() >= expectedEmissionCount &&
          graph.allResourcesSettled()
        ) {
          traceCollector.completed("runtime", "runUntilSettled", {
            attempts,
          });
          return;
        }

        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          break;
        }

        await sleep(Math.min(settlePollMs, remainingMs));
      }

      traceCollector.rejected("runtime", "runUntilSettled", {
        ...graph.resourceStatuses(),
        attempts,
        timeoutMs: settleTimeoutMs,
      });
      throw new Error("Correction runtime did not settle before timeout");
    },
    emit() {
      return graph?.emit() ?? {};
    },
    snapshot() {
      return graph?.snapshot() ?? {
        statuses: {
          factCheck: "idle",
          styleReview: "idle",
          rewriteDraft: "idle",
        },
      };
    },
    trace(): TraceEvent[] {
      return traceCollector.events();
    },
  };
}

type RuntimeGraph = {
  receive(state: CorrectionRuntimeInput): void;
  forceReadFinalResult(): void;
  emittedFinalResultCount(): number;
  allResourcesSettled(): boolean;
  failedResource(): FailedResource | undefined;
  resourceStatuses(): Record<string, unknown>;
  emit(): Partial<CorrectionRuntimeOutput>;
  snapshot(): CorrectionRuntimeSnapshot;
};

function createRuntimeGraph(
  initialState: CorrectionRuntimeInput,
  traceCollector: TraceCollector,
  model: CorrectionRuntimeModel,
): RuntimeGraph {
  const draftSignal = signal(initialState.draft);
  const userIntentSignal = signal<string | undefined>(initialState.userIntent);
  const styleGuideSignal = signal<string | undefined>(initialState.styleGuide);
  const receiveEpochSignal = signal(1);
  let failedResource: FailedResource | undefined;

  const claimsComputed = computed(() => {
    traceCollector.started("computed", "claims");
    const candidates = extractClaimCandidates(draftSignal.get());
    const claims = applyClaimBudget(candidates);

    if (candidates.length > claims.length) {
      traceCollector.skipped("computed", "claimBudget", {
        budget: DEFAULT_CLAIM_BUDGET,
        candidateCount: candidates.length,
        extractedCount: claims.length,
        omittedCount: candidates.length - claims.length,
        factCheckScope: "extractedClaims",
      });
    }

    traceCollector.completed("computed", "claims", {
      count: claims.length,
    });
    return claims;
  }, areClaimsEqual);

  const claimsSignal = signal<Claim[]>(claimsComputed.get(), areClaimsEqual);

  createEffect(() => {
    claimsSignal.set(claimsComputed.get());
  });

  const [factCheckResult, factCheckMeta] = createResource<Claim[], FactCheckResult>({
    input: () => claimsSignal.get(),
    keepPreviousValueOnPending: true,
    onEvent(event) {
      recordGraphResourceEvent("factCheck", event);
    },
    run: async (claims, ctx) => {
      if (claims.length === 0) {
        traceCollector.skipped("resource", "factCheck", {
          reason: "no claims",
        });
        return { items: [] };
      }

      const result = await model.factCheckClaims(claims, ctx.signal);
      return normalizeFactCheckCoverage(claims, result, traceCollector);
    },
  });

  const [styleReviewResult, styleReviewMeta] = createResource<
    { draft: string; styleGuide?: string },
    StyleReviewResult
  >({
    input: () => ({
      draft: draftSignal.get(),
      styleGuide: styleGuideSignal.get(),
    }),
    keepPreviousValueOnPending: true,
    onEvent(event) {
      recordGraphResourceEvent("styleReview", event);
    },
    run: async (input, ctx) => model.reviewStyle(input, ctx.signal),
  });

  const correctionPlanComputed = computed<CorrectionPlan | undefined>(() => {
    traceCollector.started("computed", "correctionPlan");
    const factCheck = factCheckResult();
    const styleReview = styleReviewResult();

    if (!factCheck || !styleReview) {
      traceCollector.skipped("computed", "correctionPlan", {
        reason: "waiting for async resources",
      });
      return undefined;
    }

    const plan = buildCorrectionPlan({
      factCheck,
      styleReview,
      userIntent: userIntentSignal.get(),
    });

    traceCollector.completed("computed", "correctionPlan", {
      actionCount: plan.actions.length,
    });
    return plan;
  });

  const [revisedDraft, rewriteMeta] = createResource<
    RewriteInput,
    RevisedDraftResult | undefined,
    unknown
  >({
    input: () => {
      const plan = correctionPlanComputed.get();
      if (!plan) {
        return {
          status: "waiting",
          reason: "correction plan is not ready",
        };
      }

      return {
        status: "ready",
        epoch: receiveEpochSignal.get(),
        draft: draftSignal.get(),
        plan,
        planKey: correctionPlanKey(plan),
      };
    },
    keepPreviousValueOnPending: true,
    onEvent(event) {
      recordGraphResourceEvent("rewriteDraft", event);
    },
    run: async (input, ctx) => {
      if (input.status === "waiting") {
        traceCollector.skipped("resource", "rewriteDraft", {
          reason: input.reason,
        });
        return undefined;
      }

      const text = await model.rewriteDraft(input, ctx.signal);
      return {
        epoch: input.epoch,
        planKey: input.planKey,
        text,
      };
    },
  });

  const finalResultComputed = computed<FinalResult | undefined>(() => {
    traceCollector.started("computed", "finalResult");
    const plan = correctionPlanComputed.get();
    const draft = revisedDraft();
    const currentEpoch = receiveEpochSignal.get();
    const factCheck = factCheckResult();
    const resourcesSettled =
      factCheckMeta.status() === "success" &&
      styleReviewMeta.status() === "success" &&
      rewriteMeta.status() === "success";

    if (
      !plan ||
      !draft ||
      draft.epoch !== currentEpoch ||
      draft.planKey !== correctionPlanKey(plan) ||
      !factCheck ||
      !resourcesSettled
    ) {
      traceCollector.skipped("computed", "finalResult", {
        reason: "waiting for correction plan or revised draft",
      });
      return undefined;
    }

    const unresolvedIssues = factCheck.items
      .filter((item) => item.verdict === "needs-review")
      .map((item) => item.note);

    const result: FinalResult = {
      revisedDraft: draft.text,
      summary: plan.actions,
      unresolvedIssues,
    };

    traceCollector.completed("computed", "finalResult", {
      unresolvedCount: unresolvedIssues.length,
    });
    return result;
  });

  let emittedFinalResult: FinalResult | undefined;
  let emittedFinalResultCount = 0;

  createEffect(() => {
    const result = finalResultComputed.get();
    if (!result || result === emittedFinalResult) return;

    emittedFinalResult = result;
    emittedFinalResultCount += 1;
    traceCollector.emitted("effect", "finalResult", {
      unresolvedCount: result.unresolvedIssues.length,
    });
  });

  return {
    receive(state) {
      batch(() => {
        receiveEpochSignal.set((current) => current + 1);
        draftSignal.set(state.draft);
        userIntentSignal.set(state.userIntent);
        styleGuideSignal.set(state.styleGuide);
      });
    },
    forceReadFinalResult() {
      finalResultComputed.get();
    },
    emittedFinalResultCount() {
      return emittedFinalResultCount;
    },
    allResourcesSettled,
    failedResource() {
      return failedResource;
    },
    resourceStatuses() {
      return {
        factCheckStatus: factCheckMeta.status(),
        styleReviewStatus: styleReviewMeta.status(),
        rewriteStatus: rewriteMeta.status(),
      };
    },
    emit() {
      const finalResult = finalResultComputed.get();
      if (!finalResult) return {};

      return {
        claims: claimsComputed.get(),
        factCheckResult: factCheckResult(),
        styleReviewResult: styleReviewResult(),
        correctionPlan: correctionPlanComputed.get(),
        revisedDraft: revisedDraft()?.text,
        finalResult,
      };
    },
    snapshot() {
      return {
        stableFinalResult: emittedFinalResult,
        statuses: {
          factCheck: factCheckMeta.status(),
          styleReview: styleReviewMeta.status(),
          rewriteDraft: rewriteMeta.status(),
        },
      };
    },
  };

  function allResourcesSettled() {
    return [factCheckMeta.status(), styleReviewMeta.status(), rewriteMeta.status()].every(
      (status) => status === "success" || status === "error" || status === "cancelled",
    );
  }

  function recordGraphResourceEvent(label: string, event: ResourceEvent) {
    recordResourceEvent(traceCollector, label, event);

    if (event.type === "error") {
      failedResource = {
        label,
        error: event.error,
      };
    }
  }
}

function normalizeRuntimeOptions(
  optionsOrTraceCollector: TraceCollector | CorrectionRuntimeOptions,
) {
  if (isTraceCollector(optionsOrTraceCollector)) {
    return {
      traceCollector: optionsOrTraceCollector,
      model: defaultRuntimeModel,
      settleTimeoutMs: DEFAULT_SETTLE_TIMEOUT_MS,
      settlePollMs: DEFAULT_SETTLE_POLL_MS,
    };
  }

  return {
    traceCollector: optionsOrTraceCollector.traceCollector ?? createTraceCollector(),
    model: {
      ...defaultRuntimeModel,
      ...optionsOrTraceCollector.model,
    },
    settleTimeoutMs: normalizePositiveMs(
      optionsOrTraceCollector.settleTimeoutMs,
      DEFAULT_SETTLE_TIMEOUT_MS,
    ),
    settlePollMs: normalizePositiveMs(
      optionsOrTraceCollector.settlePollMs,
      DEFAULT_SETTLE_POLL_MS,
    ),
  };
}

function normalizePositiveMs(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || value === undefined || value <= 0) return fallback;
  return Math.trunc(value);
}

function isTraceCollector(
  optionsOrTraceCollector: TraceCollector | CorrectionRuntimeOptions,
): optionsOrTraceCollector is TraceCollector {
  return typeof (optionsOrTraceCollector as TraceCollector).started === "function";
}

function recordInputInvalidation(
  traceCollector: TraceCollector,
  state: CorrectionRuntimeInput,
  previousState: CorrectionRuntimeInput | undefined,
) {
  if (!previousState) {
    traceCollector.changed("signal", "draft", {
      length: state.draft.length,
    });
    traceCollector.stale("computed", "claims");
    traceCollector.stale("resource", "factCheck");
    traceCollector.stale("resource", "styleReview");
    traceCollector.stale("computed", "correctionPlan");
    traceCollector.stale("resource", "rewriteDraft");
    traceCollector.stale("computed", "finalResult");
    return;
  }

  const draftChanged = state.draft !== previousState.draft;
  const styleGuideChanged = state.styleGuide !== previousState.styleGuide;
  const userIntentChanged = state.userIntent !== previousState.userIntent;

  if (draftChanged) {
    const claimsChanged = !areClaimsEqual(
      extractClaims(previousState.draft),
      extractClaims(state.draft),
    );

    traceCollector.changed("signal", "draft", {
      length: state.draft.length,
    });
    traceCollector.stale("computed", "claims");
    if (claimsChanged) {
      traceCollector.stale("resource", "factCheck");
    } else {
      traceCollector.skipped("resource", "factCheck", {
        reason: "claims unchanged",
      });
    }
    traceCollector.stale("resource", "styleReview");
    traceCollector.stale("computed", "correctionPlan");
    traceCollector.stale("resource", "rewriteDraft");
    traceCollector.stale("computed", "finalResult");
    return;
  }

  if (styleGuideChanged) {
    traceCollector.changed("signal", "styleGuide");
    traceCollector.stale("resource", "styleReview");
    traceCollector.stale("computed", "correctionPlan");
    traceCollector.stale("resource", "rewriteDraft");
    traceCollector.stale("computed", "finalResult");
  }

  if (userIntentChanged) {
    traceCollector.changed("signal", "userIntent");
    traceCollector.stale("computed", "correctionPlan");
    traceCollector.stale("resource", "rewriteDraft");
    traceCollector.stale("computed", "finalResult");
  }
}

function extractClaims(draft: string): Claim[] {
  return applyClaimBudget(extractClaimCandidates(draft));
}

function extractClaimCandidates(draft: string): Claim[] {
  return draft
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith("#"))
    .map((text, index) => ({
      id: `claim-${index + 1}`,
      text,
    }));
}

function applyClaimBudget(claims: Claim[]): Claim[] {
  return claims.slice(0, DEFAULT_CLAIM_BUDGET);
}

function areClaimsEqual(a: Claim[], b: Claim[]) {
  if (a.length !== b.length) return false;

  return a.every((claim, index) => {
    const other = b[index];
    return other && claim.id === other.id && claim.text === other.text;
  });
}

function buildCorrectionPlan(input: {
  factCheck: FactCheckResult;
  styleReview: StyleReviewResult;
  userIntent?: string;
}): CorrectionPlan {
  const actions = input.factCheck.items
    .filter((item) => item.verdict === "needs-review")
    .map((item) => `Review claim ${item.claimId}: ${item.note}`);

  for (const suggestion of input.styleReview.suggestions) {
    actions.push(suggestion);
  }

  if (input.userIntent) {
    actions.push(`Respect user intent: ${input.userIntent}`);
  }

  if (actions.length === 0) {
    actions.push("No major correction needed in the mock runtime.");
  }

  return { actions };
}

function normalizeFactCheckCoverage(
  claims: Claim[],
  result: FactCheckResult,
  traceCollector: TraceCollector,
): FactCheckResult {
  const validClaimIds = new Set(claims.map((claim) => claim.id));
  const validItems = result.items.filter((item) => validClaimIds.has(item.claimId));
  const unknownItems = result.items.filter(
    (item) => !validClaimIds.has(item.claimId),
  );

  for (const item of unknownItems) {
    traceCollector.skipped("resource", "factCheckCoverage", {
      claimId: item.claimId,
      reason: "unknown claim id ignored",
    });
  }

  const coveredClaimIds = new Set(validItems.map((item) => item.claimId));
  const missingItems = claims
    .filter((claim) => !coveredClaimIds.has(claim.id))
    .map((claim) => {
      traceCollector.changed("resource", "factCheckCoverage", {
        claimId: claim.id,
        reason: "missing provider result normalized",
      });

      return {
        claimId: claim.id,
        verdict: "needs-review" as const,
        note: `Provider did not return a fact-check result for ${claim.id}.`,
      };
    });

  if (missingItems.length === 0 && validItems.length === result.items.length) {
    return result;
  }

  return {
    items: [...validItems, ...missingItems],
  };
}

function correctionPlanKey(plan: CorrectionPlan) {
  return JSON.stringify(plan.actions);
}

type ResourceEvent = {
  type: string;
  token: number;
  ts: number;
  error?: unknown;
  reason?: unknown;
};

function recordResourceEvent(
  traceCollector: TraceCollector,
  label: string,
  event: ResourceEvent,
) {
  if (event.type === "start") {
    traceCollector.pending("resource", label, {
      token: event.token,
    });
    return;
  }

  if (event.type === "success") {
    traceCollector.resolved("resource", label, {
      token: event.token,
    });
    return;
  }

  if (event.type === "error") {
    traceCollector.rejected("resource", label, {
      token: event.token,
      error: String(event.error),
    });
    return;
  }

  if (event.type === "cancel") {
    traceCollector.skipped("resource", label, {
      token: event.token,
      reason: event.reason,
    });
  }
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
