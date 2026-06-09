import { computed, createEffect, signal } from "@signal-kernel/core";
import { createResource } from "@signal-kernel/async-runtime";
import {
  mockFactCheckClaims,
  mockReviewStyle,
  mockRewriteDraft,
} from "../llm/mockCorrectionModel.js";
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

type RewriteInput =
  | {
      status: "ready";
      draft: string;
      plan: CorrectionPlan;
    }
  | {
      status: "waiting";
      reason: string;
    };

export type CorrectionRuntime = SignalNode<
  CorrectionRuntimeInput,
  CorrectionRuntimeOutput
>;

export function createCorrectionRuntime(
  traceCollector: TraceCollector = createTraceCollector(),
): CorrectionRuntime {
  let graph: RuntimeGraph | undefined;

  return {
    receive(state) {
      traceCollector.started("runtime", "receive");
      recordInputInvalidation(traceCollector, state);

      if (!graph) {
        graph = createRuntimeGraph(state, traceCollector);
      } else {
        graph.receive(state);
      }

      traceCollector.completed("runtime", "receive");
    },
    async runUntilSettled() {
      if (!graph) {
        throw new Error("Correction runtime must receive input before settling");
      }

      traceCollector.started("runtime", "runUntilSettled");

      for (let attempt = 0; attempt < 200; attempt += 1) {
        graph.forceReadFinalResult();

        if (graph.hasEmittedFinalResult() && graph.allResourcesSettled()) {
          traceCollector.completed("runtime", "runUntilSettled", {
            attempts: attempt + 1,
          });
          return;
        }

        await sleep(10);
      }

      traceCollector.rejected("runtime", "runUntilSettled", graph.resourceStatuses());
      throw new Error("Correction runtime did not settle before timeout");
    },
    emit() {
      return graph?.emit() ?? {};
    },
    trace(): TraceEvent[] {
      return traceCollector.events();
    },
  };
}

type RuntimeGraph = {
  receive(state: CorrectionRuntimeInput): void;
  forceReadFinalResult(): void;
  hasEmittedFinalResult(): boolean;
  allResourcesSettled(): boolean;
  resourceStatuses(): Record<string, unknown>;
  emit(): Partial<CorrectionRuntimeOutput>;
};

function createRuntimeGraph(
  initialState: CorrectionRuntimeInput,
  traceCollector: TraceCollector,
): RuntimeGraph {
  const draftSignal = signal(initialState.draft);
  const userIntentSignal = signal<string | undefined>(initialState.userIntent);
  const styleGuideSignal = signal<string | undefined>(initialState.styleGuide);

  const claimsComputed = computed(() => {
    traceCollector.started("computed", "claims");
    const claims = extractClaims(draftSignal.get());
    traceCollector.completed("computed", "claims", {
      count: claims.length,
    });
    return claims;
  });

  const [factCheckResult, factCheckMeta] = createResource<Claim[], FactCheckResult>({
    input: () => claimsComputed.get(),
    keepPreviousValueOnPending: true,
    onEvent(event) {
      recordResourceEvent(traceCollector, "factCheck", event);
    },
    run: async (claims, ctx) => {
      if (claims.length === 0) {
        traceCollector.skipped("resource", "factCheck", {
          reason: "no claims",
        });
        return { items: [] };
      }

      return mockFactCheckClaims(claims, ctx.signal);
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
      recordResourceEvent(traceCollector, "styleReview", event);
    },
    run: async (input, ctx) => mockReviewStyle(input, ctx.signal),
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
    string | undefined,
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
        draft: draftSignal.get(),
        plan,
      };
    },
    keepPreviousValueOnPending: true,
    onEvent(event) {
      recordResourceEvent(traceCollector, "rewriteDraft", event);
    },
    run: async (input, ctx) => {
      if (input.status === "waiting") {
        traceCollector.skipped("resource", "rewriteDraft", {
          reason: input.reason,
        });
        return undefined;
      }

      return mockRewriteDraft(input, ctx.signal);
    },
  });

  const finalResultComputed = computed<FinalResult | undefined>(() => {
    traceCollector.started("computed", "finalResult");
    const plan = correctionPlanComputed.get();
    const draft = revisedDraft();
    const factCheck = factCheckResult();

    if (!plan || !draft || !factCheck) {
      traceCollector.skipped("computed", "finalResult", {
        reason: "waiting for correction plan or revised draft",
      });
      return undefined;
    }

    const unresolvedIssues = factCheck.items
      .filter((item) => item.verdict === "needs-review")
      .map((item) => item.note);

    const result: FinalResult = {
      revisedDraft: draft,
      summary: plan.actions,
      unresolvedIssues,
    };

    traceCollector.completed("computed", "finalResult", {
      unresolvedCount: unresolvedIssues.length,
    });
    return result;
  });

  let emittedFinalResult: FinalResult | undefined;

  createEffect(() => {
    const result = finalResultComputed.get();
    if (!result || result === emittedFinalResult) return;

    emittedFinalResult = result;
    traceCollector.emitted("effect", "finalResult", {
      unresolvedCount: result.unresolvedIssues.length,
    });
  });

  return {
    receive(state) {
      draftSignal.set(state.draft);
      userIntentSignal.set(state.userIntent);
      styleGuideSignal.set(state.styleGuide);
    },
    forceReadFinalResult() {
      finalResultComputed.get();
    },
    hasEmittedFinalResult() {
      return emittedFinalResult !== undefined;
    },
    allResourcesSettled,
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
        revisedDraft: revisedDraft(),
        finalResult,
      };
    },
  };

  function allResourcesSettled() {
    return [factCheckMeta.status(), styleReviewMeta.status(), rewriteMeta.status()].every(
      (status) => status === "success" || status === "error" || status === "cancelled",
    );
  }
}

function recordInputInvalidation(
  traceCollector: TraceCollector,
  state: CorrectionRuntimeInput,
) {
  traceCollector.changed("signal", "draft", {
    length: state.draft.length,
  });
  traceCollector.stale("computed", "claims");
  traceCollector.stale("resource", "factCheck");
  traceCollector.stale("resource", "styleReview");
  traceCollector.stale("computed", "correctionPlan");
  traceCollector.stale("resource", "rewriteDraft");
  traceCollector.stale("computed", "finalResult");
}

function extractClaims(draft: string): Claim[] {
  return draft
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith("#"))
    .slice(0, 6)
    .map((text, index) => ({
      id: `claim-${index + 1}`,
      text,
    }));
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

function recordResourceEvent(
  traceCollector: TraceCollector,
  label: string,
  event: { type: string; token: number; ts: number; error?: unknown; reason?: unknown },
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

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
