import type { AgentIdentity } from "./agentContracts.js";

export type AgentSessionBoundary = {
  readonly identity: AgentIdentity;
  dispose(): void;
};

export type AgentSessionFactory<
  Session extends AgentSessionBoundary = AgentSessionBoundary,
> = (identity: AgentIdentity) => Session;

export type AgentCoordinatorBoundary<
  Session extends AgentSessionBoundary = AgentSessionBoundary,
> = {
  readonly coordinatorId: string;
  getAgentSession(agentId: AgentIdentity["agentId"]): Session;
  dispose(): void;
};

export type CreateAgentCoordinatorBoundaryOptions<
  Session extends AgentSessionBoundary = AgentSessionBoundary,
> = {
  coordinatorId: string;
  createAgentSession: AgentSessionFactory<Session>;
};

export function createAgentCoordinatorBoundary<
  Session extends AgentSessionBoundary,
>(
  options: CreateAgentCoordinatorBoundaryOptions<Session>,
): AgentCoordinatorBoundary<Session> {
  const sessions: Record<AgentIdentity["agentId"], Session> = {
    "fact-check-agent": options.createAgentSession({
      agentId: "fact-check-agent",
      role: "fact-check",
    }),
    "writer-agent": options.createAgentSession({
      agentId: "writer-agent",
      role: "writer",
    }),
  };
  let disposed = false;

  return {
    coordinatorId: options.coordinatorId,
    getAgentSession(agentId) {
      return sessions[agentId];
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sessions["fact-check-agent"].dispose();
      sessions["writer-agent"].dispose();
    },
  };
}
