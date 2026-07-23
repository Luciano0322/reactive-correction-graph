import { createMockCorrectionModel } from "../llm/mockCorrectionModel.js";
import type { CorrectionRuntimeModel } from "../runtime/createCorrectionRuntime.js";
import type {
  Claim,
  CorrectionPlan,
  CorrectionRuntimeInput,
  FactCheckResult,
  FinalResult,
} from "../schemas/correction.js";
import { createTraceCollector } from "../trace/createTraceCollector.js";
import type { TraceEvent } from "../trace/types.js";
import {
  parseAgentMessageEnvelope,
  serializeAgentMessageEnvelope,
  type AgentIdentity,
  type AgentMessageEnvelope,
  type JsonValue,
} from "./agentContracts.js";
import {
  createAgentCoordinatorBoundary,
  type AgentSessionBoundary,
} from "./coordinatorContracts.js";

export type TwoAgentCorrectionOutput = {
  inputVersion: number;
  evidenceEnvelope: AgentMessageEnvelope;
  finalResult: FinalResult;
};

export type TwoAgentCorrectionCoordinator = {
  receive(input: CorrectionRuntimeInput): void;
  runUntilSettled(): Promise<void>;
  emit(): TwoAgentCorrectionOutput;
  trace(): TraceEvent[];
  dispose(): void;
};

export type TwoAgentCorrectionCoordinatorOptions = {
  coordinatorId: string;
  model?: Partial<CorrectionRuntimeModel>;
};

type FactCheckAgentIdentity = Extract<
  AgentIdentity,
  { agentId: "fact-check-agent" }
>;

type WriterAgentIdentity = Extract<
  AgentIdentity,
  { agentId: "writer-agent" }
>;

type FactCheckAgentSession = AgentSessionBoundary & {
  readonly identity: FactCheckAgentIdentity;
  verify(claims: Claim[]): Promise<FactCheckResult>;
};

type WriterAgentSession = AgentSessionBoundary & {
  readonly identity: WriterAgentIdentity;
  revise(
    input: CorrectionRuntimeInput,
    evidenceEnvelope: AgentMessageEnvelope,
  ): Promise<FinalResult>;
};

type CorrectionAgentSession = FactCheckAgentSession | WriterAgentSession;

type FactCheckEvidencePayload = {
  claims: Claim[];
  factCheckResult: FactCheckResult;
};

export function createTwoAgentCorrectionCoordinator(
  options: TwoAgentCorrectionCoordinatorOptions,
): TwoAgentCorrectionCoordinator {
  const model: CorrectionRuntimeModel = {
    ...createMockCorrectionModel(),
    ...options.model,
  };
  let factCheckAgent: FactCheckAgentSession | undefined;
  let writerAgent: WriterAgentSession | undefined;
  const ownership = createAgentCoordinatorBoundary<CorrectionAgentSession>({
    coordinatorId: options.coordinatorId,
    createAgentSession(identity) {
      if (identity.agentId === "fact-check-agent") {
        factCheckAgent = createFactCheckAgentSession(identity, model);
        return factCheckAgent;
      }

      writerAgent = createWriterAgentSession(identity, model);
      return writerAgent;
    },
  });

  if (!factCheckAgent || !writerAgent) {
    throw new Error("Two-agent coordinator failed to create owned sessions");
  }

  const ownedFactCheckAgent = factCheckAgent;
  const ownedWriterAgent = writerAgent;
  const traceCollector = createTraceCollector();
  let currentInput: CorrectionRuntimeInput | undefined;
  let inputVersion = 0;
  let output: TwoAgentCorrectionOutput | undefined;
  let settledEvidence:
    | {
        claims: Claim[];
        envelope: AgentMessageEnvelope;
      }
    | undefined;
  let disposed = false;

  return {
    receive(input) {
      assertActive(disposed);
      inputVersion += 1;
      currentInput = { ...input };
      output = undefined;
    },
    async runUntilSettled() {
      assertActive(disposed);
      if (!currentInput) {
        throw new Error(
          "Two-agent coordinator must receive input before settling",
        );
      }

      const settledInput = currentInput;
      const settledInputVersion = inputVersion;
      const claims = extractClaims(settledInput.draft);
      const evidenceEnvelope = await resolveEvidence({
        claims,
        inputVersion: settledInputVersion,
      });
      if (!evidenceEnvelope) {
        return;
      }

      const routedEvidence = parseAgentMessageEnvelope(
        serializeAgentMessageEnvelope(evidenceEnvelope),
        { currentInputVersion: evidenceEnvelope.inputVersion },
      );
      traceCollector.pending("runtime", "writerAgent", {
        agentId: ownedWriterAgent.identity.agentId,
        inputVersion: settledInputVersion,
        evidenceInputVersion: routedEvidence.inputVersion,
      });
      const finalResult = await ownedWriterAgent.revise(
        settledInput,
        routedEvidence,
      );
      if (settledInputVersion !== inputVersion) {
        traceCollector.stale("runtime", "writerAgent", {
          inputVersion: settledInputVersion,
          currentInputVersion: inputVersion,
          reason: "superseded async result",
        });
        return;
      }

      traceCollector.resolved("runtime", "writerAgent", {
        agentId: ownedWriterAgent.identity.agentId,
        inputVersion: settledInputVersion,
        evidenceInputVersion: routedEvidence.inputVersion,
      });

      output = {
        inputVersion: settledInputVersion,
        evidenceEnvelope: routedEvidence,
        finalResult,
      };
      traceCollector.emitted("effect", "twoAgentFinalResult", {
        inputVersion: settledInputVersion,
        evidenceInputVersion: routedEvidence.inputVersion,
      });
    },
    emit() {
      assertActive(disposed);
      if (!output) {
        throw new Error(
          "Two-agent coordinator must settle before emitting",
        );
      }

      return cloneOutput(output);
    },
    trace() {
      assertActive(disposed);
      return traceCollector.events();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ownership.dispose();
    },
  };

  async function resolveEvidence(input: {
    claims: Claim[];
    inputVersion: number;
  }): Promise<AgentMessageEnvelope | undefined> {
    if (
      settledEvidence &&
      areClaimsEqual(settledEvidence.claims, input.claims)
    ) {
      traceCollector.skipped("runtime", "factCheckAgent", {
        agentId: ownedFactCheckAgent.identity.agentId,
        inputVersion: input.inputVersion,
        evidenceInputVersion: settledEvidence.envelope.inputVersion,
        reason: "evidence reused",
      });
      return settledEvidence.envelope;
    }

    if (settledEvidence) {
      traceCollector.stale("runtime", "factCheckEvidence", {
        inputVersion: input.inputVersion,
        evidenceInputVersion: settledEvidence.envelope.inputVersion,
        reason: "claims changed",
      });
    }

    traceCollector.pending("runtime", "factCheckAgent", {
      agentId: ownedFactCheckAgent.identity.agentId,
      inputVersion: input.inputVersion,
    });
    const factCheckResult =
      await ownedFactCheckAgent.verify(input.claims);
    if (input.inputVersion !== inputVersion) {
      traceCollector.stale("runtime", "factCheckAgent", {
        inputVersion: input.inputVersion,
        currentInputVersion: inputVersion,
        reason: "superseded async result",
      });
      return undefined;
    }

    traceCollector.resolved("runtime", "factCheckAgent", {
      agentId: ownedFactCheckAgent.identity.agentId,
      inputVersion: input.inputVersion,
    });
    const envelope = createEvidenceEnvelope({
      coordinatorId: ownership.coordinatorId,
      inputVersion: input.inputVersion,
      claims: input.claims,
      factCheckResult,
    });

    settledEvidence = {
      claims: cloneClaims(input.claims),
      envelope,
    };
    traceCollector.emitted("runtime", "factCheckEvidence", {
      inputVersion: input.inputVersion,
      sender: envelope.sender.agentId,
      recipient: envelope.recipient.agentId,
      messageId: envelope.messageId,
    });

    return envelope;
  }
}

function createFactCheckAgentSession(
  identity: FactCheckAgentIdentity,
  model: CorrectionRuntimeModel,
): FactCheckAgentSession {
  let disposed = false;

  return {
    identity,
    async verify(claims) {
      assertAgentActive(disposed, identity);
      return model.factCheckClaims(claims);
    },
    dispose() {
      disposed = true;
    },
  };
}

function createWriterAgentSession(
  identity: WriterAgentIdentity,
  model: CorrectionRuntimeModel,
): WriterAgentSession {
  let disposed = false;

  return {
    identity,
    async revise(input, evidenceEnvelope) {
      assertAgentActive(disposed, identity);
      if (evidenceEnvelope.recipient.agentId !== identity.agentId) {
        throw new Error(
          `Writer Agent cannot receive message for ${evidenceEnvelope.recipient.agentId}`,
        );
      }

      const evidence = readEvidencePayload(evidenceEnvelope);
      const styleReview = await model.reviewStyle({
        draft: input.draft,
        styleGuide: input.styleGuide,
      });
      const plan = buildCorrectionPlan({
        factCheckResult: evidence.factCheckResult,
        styleSuggestions: styleReview.suggestions,
        userIntent: input.userIntent,
      });
      const revisedDraft = await model.rewriteDraft({
        draft: input.draft,
        plan,
      });

      return {
        revisedDraft,
        summary: plan.actions,
        unresolvedIssues: evidence.factCheckResult.items
          .filter((item) => item.verdict === "needs-review")
          .map((item) => item.note),
      };
    },
    dispose() {
      disposed = true;
    },
  };
}

function createEvidenceEnvelope(input: {
  coordinatorId: string;
  inputVersion: number;
  claims: Claim[];
  factCheckResult: FactCheckResult;
}): AgentMessageEnvelope {
  const payload: JsonValue = {
    claims: input.claims.map((claim) => ({
      id: claim.id,
      text: claim.text,
    })),
    factCheckResult: {
      items: input.factCheckResult.items.map((item) => ({
        claimId: item.claimId,
        verdict: item.verdict,
        note: item.note,
      })),
    },
  };

  return {
    schemaVersion: 1,
    messageId: `fact-check-evidence-${input.inputVersion}`,
    correlationId: input.coordinatorId,
    causationId: null,
    inputVersion: input.inputVersion,
    sender: {
      agentId: "fact-check-agent",
      role: "fact-check",
    },
    recipient: {
      agentId: "writer-agent",
      role: "writer",
    },
    messageType: "fact-check.evidence.ready",
    payload,
  };
}

function readEvidencePayload(
  envelope: AgentMessageEnvelope,
): FactCheckEvidencePayload {
  if (envelope.messageType !== "fact-check.evidence.ready") {
    throw new Error(
      `Writer Agent received unsupported message: ${envelope.messageType}`,
    );
  }

  return envelope.payload as unknown as FactCheckEvidencePayload;
}

function extractClaims(draft: string): Claim[] {
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

function areClaimsEqual(left: Claim[], right: Claim[]): boolean {
  return (
    left.length === right.length &&
    left.every((claim, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        claim.id === other.id &&
        claim.text === other.text
      );
    })
  );
}

function cloneClaims(claims: Claim[]): Claim[] {
  return claims.map((claim) => ({ ...claim }));
}

function buildCorrectionPlan(input: {
  factCheckResult: FactCheckResult;
  styleSuggestions: string[];
  userIntent?: string;
}): CorrectionPlan {
  const actions = input.factCheckResult.items
    .filter((item) => item.verdict === "needs-review")
    .map((item) => `Review claim ${item.claimId}: ${item.note}`);

  actions.push(...input.styleSuggestions);

  if (input.userIntent) {
    actions.push(`Respect user intent: ${input.userIntent}`);
  }

  if (actions.length === 0) {
    actions.push("No major correction needed in the mock runtime.");
  }

  return { actions };
}

function assertActive(disposed: boolean) {
  if (disposed) {
    throw new Error("Two-agent coordinator has been disposed");
  }
}

function assertAgentActive(
  disposed: boolean,
  identity: AgentIdentity,
) {
  if (disposed) {
    throw new Error(`${identity.agentId} session has been disposed`);
  }
}

function cloneOutput(
  output: TwoAgentCorrectionOutput,
): TwoAgentCorrectionOutput {
  return JSON.parse(JSON.stringify(output)) as TwoAgentCorrectionOutput;
}
