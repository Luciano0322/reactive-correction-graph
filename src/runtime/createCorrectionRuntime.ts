import { createSettler, SettlementExecutionError, type ExecutionIdentity, type SettlementRevision } from "@signal-kernel/settle";
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
  /** @deprecated Settlement awaits Settle directly; polling is no longer used. */
  settlePollMs?: number;
};

const defaultRuntimeModel: CorrectionRuntimeModel = {
  ...createMockCorrectionModel(),
};

const DEFAULT_SETTLE_TIMEOUT_MS = 2_000;
const DEFAULT_CLAIM_BUDGET = 6;

export function createCorrectionRuntime(
  optionsOrTraceCollector: TraceCollector | CorrectionRuntimeOptions = {},
): CorrectionRuntime {
  const { traceCollector, model, settleTimeoutMs } =
    normalizeRuntimeOptions(optionsOrTraceCollector);
  let graph: RuntimeGraph | undefined;
  let previousState: CorrectionRuntimeInput | undefined;
  let receiveEpoch = 0;

  return {
    receive(state) {
      receiveEpoch += 1;
      const receiveMetadata = { receiveEpoch };

      traceCollector.started("runtime", "receive", receiveMetadata);
      recordInputInvalidation(traceCollector, state, previousState);

      if (!graph) {
        graph = createRuntimeGraph(state, traceCollector, model);
      } else {
        graph.receive(state);
      }

      previousState = state;
      traceCollector.completed("runtime", "receive", receiveMetadata);
    },
    async runUntilSettled() {
      if (!graph) {
        throw new Error("Correction runtime must receive input before settling");
      }

      traceCollector.started("runtime", "runUntilSettled");

      let attempts = 0;
      const activeGraph = graph;
      try {
        await withHostTimeout((async () => {
          // Following a newer revision is this legacy host facade's policy, not Settle's.
          do { attempts += 1; } while (await activeGraph.settle() === "superseded");
        })(), settleTimeoutMs);
        traceCollector.completed("runtime", "runUntilSettled", { attempts });
      } catch (error) {
        traceCollector.rejected("runtime", "runUntilSettled", {
          ...activeGraph.resourceStatuses(), attempts, timeoutMs: settleTimeoutMs, error: formatError(error),
        });
        throw error;
      }
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
    subscribe(listener) {
      return traceCollector.subscribe(listener);
    },
  };
}

type RuntimeGraph = {
  receive(state: CorrectionRuntimeInput): void;
  settle(): Promise<"settled" | "superseded">;
  resourceStatuses(): Record<string, unknown>;
  emit(): Partial<CorrectionRuntimeOutput>;
  snapshot(): CorrectionRuntimeSnapshot;
};

function createRuntimeGraph(
  initialState: CorrectionRuntimeInput,
  traceCollector: TraceCollector,
  model: CorrectionRuntimeModel,
): RuntimeGraph {
  type HostInput = CorrectionRuntimeInput & { epoch: number };
  const settler = createSettler<HostInput>();
  let currentRevision: SettlementRevision;
  let currentInput: HostInput;
  let currentWork: Promise<void>;
  let epoch = 0;
  let emittedFinalResult: FinalResult | undefined;
  let output: Partial<CorrectionRuntimeOutput> = {};

  const factCheck = settler.resource({
    id: "factCheck",
    input(state) {
      traceCollector.started("computed", "claims");
      const candidates = extractClaimCandidates(state.draft);
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
      traceCollector.completed("computed", "claims", { count: claims.length });
      return claims;
    },
    equals: areClaimsEqual,
    run: async (claims, ctx) => {
      if (claims.length === 0) {
        traceCollector.skipped("resource", "factCheck", { reason: "no claims" });
        return { items: [] };
      }
      const result = await model.factCheckClaims(claims, ctx.signal);
      return normalizeFactCheckCoverage(claims, result, traceCollector);
    },
  });
  const styleReview = settler.resource({
    id: "styleReview",
    input: (state) => ({ draft: state.draft, styleGuide: state.styleGuide }),
    equals: (left, right) => styleReviewInputKey(left) === styleReviewInputKey(right),
    run: (input, ctx) => model.reviewStyle(input, ctx.signal),
  });
  const rewriteDraft = settler.resource({
    id: "rewriteDraft",
    input(state): RewriteInput {
      traceCollector.started("computed", "correctionPlan");
      const facts = factCheck.emit();
      const style = styleReview.emit();
      if (!facts || !style) {
        traceCollector.skipped("computed", "correctionPlan", { reason: "waiting for current async resources" });
        return { status: "waiting", reason: "correction plan is not ready" };
      }
      const plan = buildCorrectionPlan({ factCheck: facts, styleReview: style, userIntent: state.userIntent });
      traceCollector.completed("computed", "correctionPlan", { actionCount: plan.actions.length });
      return {
        status: "ready", epoch: state.epoch, draft: state.draft, plan, planKey: correctionPlanKey(plan),
      };
    },
    equals: (left, right) => JSON.stringify(left) === JSON.stringify(right),
    run: async (input, ctx) => {
      if (input.status !== "ready") throw new Error("Host started rewrite before its dependencies were ready");
      const text = await model.rewriteDraft(input, ctx.signal);
      return { epoch: input.epoch, planKey: input.planKey, text };
    },
  });
  const traceTokens = new Map<ExecutionIdentity, number>();
  settler.subscribe((event) => {
    if (event.subject !== "execution" || !event.execution || !event.resourceId) return;
    let token = traceTokens.get(event.execution);
    if (token === undefined) {
      token = traceTokens.size + 1;
      traceTokens.set(event.execution, token);
    }
    const metadata = { token, executionId: event.executionId, revisionId: event.revisionId };
    if (event.type === "started") traceCollector.pending("resource", event.resourceId, metadata);
    if (event.type === "committed") traceCollector.resolved("resource", event.resourceId, metadata);
    if (event.type === "failed") traceCollector.rejected("resource", event.resourceId, { ...metadata, error: event.reason });
    if (event.type === "cancelled") traceCollector.skipped("resource", event.resourceId, { ...metadata, reason: event.reason });
  });

  // This is host orchestration, not a Settle scheduler or domain acceptance policy.
  function receive(state: CorrectionRuntimeInput) {
    currentInput = { ...state, epoch: ++epoch };
    output = {};
    const revision = settler.receive(currentInput);
    currentRevision = revision;
    const finalOutputReady = settler.require(revision);
    currentWork = drive(revision, currentInput, finalOutputReady.satisfy);
    // receive starts host work immediately; callers may begin waiting later.
    void currentWork.catch(() => {});
  }

  async function drive(revision: SettlementRevision, state: HostInput, finish: () => void) {
    await Promise.all([
      factCheck.required(revision) ? factCheck.run(revision) : undefined,
      styleReview.required(revision) ? styleReview.run(revision) : undefined,
    ]);
    if (revision !== currentRevision) return;
    await rewriteDraft.run(revision);
    if (revision !== currentRevision) return;
    const facts = factCheck.emit()!;
    const style = styleReview.emit()!;
    const draft = rewriteDraft.emit()!;
    const plan = buildCorrectionPlan({ factCheck: facts, styleReview: style, userIntent: state.userIntent });
    traceCollector.started("computed", "finalResult");
    const finalResult: FinalResult = {
      revisedDraft: draft.text, summary: plan.actions,
      unresolvedIssues: facts.items.filter((item) => item.verdict === "needs-review").map((item) => item.note),
    };
    traceCollector.completed("computed", "finalResult", { unresolvedCount: finalResult.unresolvedIssues.length });
    output = {
      claims: extractClaims(state.draft), factCheckResult: facts, styleReviewResult: style,
      correctionPlan: plan, revisedDraft: draft.text, finalResult,
    };
    emittedFinalResult = finalResult;
    traceCollector.emitted("effect", "finalResult", { unresolvedCount: finalResult.unresolvedIssues.length });
    finish();
  }

  receive(initialState);
  return {
    receive,
    async settle() {
      const revision = currentRevision;
      try {
        const outcome = await Promise.race([
          settler.settle(revision), currentWork.then(() => settler.settle(revision)),
        ]);
        return revision === currentRevision ? outcome.status : "superseded";
      } catch (error) {
        if (revision !== currentRevision) return "superseded";
        const failed = settler.inspect().resources.find((resource) => resource.status === "failed");
        const cause = error instanceof SettlementExecutionError ? error.cause : error;
        throw new Error(`${failed?.id ?? "correction"} failed: ${formatError(cause)}`);
      }
    },
    resourceStatuses() {
      return Object.fromEntries(Object.entries(resourceStatuses()).map(([label, status]) => [`${label}Status`, status]));
    },
    emit: () => output,
    snapshot() {
      return { stableFinalResult: emittedFinalResult, statuses: resourceStatuses() };
    },
  };

  function resourceStatuses(): CorrectionRuntimeSnapshot["statuses"] {
    const statuses = { factCheck: "idle", styleReview: "idle", rewriteDraft: "idle" } as CorrectionRuntimeSnapshot["statuses"];
    for (const resource of settler.inspect().resources) {
      statuses[resource.id as keyof typeof statuses] = resource.status === "valid" ? "success" : resource.status === "failed" ? "error" : "pending";
    }
    return statuses;
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

function styleReviewInputKey(input: { draft: string; styleGuide?: string }) {
  return JSON.stringify([input.draft, input.styleGuide ?? null]);
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

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function withHostTimeout<Value>(operation: Promise<Value>, timeoutMs: number): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Correction runtime did not settle before timeout")), timeoutMs);
    })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
