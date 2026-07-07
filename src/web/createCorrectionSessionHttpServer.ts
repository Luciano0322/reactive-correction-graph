import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createCorrectionGraphSession } from "../graph/createCorrectionGraph.js";
import type { CorrectionRuntimeOptions } from "../runtime/createCorrectionRuntime.js";
import type { CorrectionRuntimeInput } from "../schemas/correction.js";
import { createCorrectionSessionViewModel } from "./createCorrectionSessionViewModel.js";
import { renderCorrectionSessionScreen } from "./renderCorrectionSessionScreen.js";

type CorrectionGraphSession = ReturnType<typeof createCorrectionGraphSession>;

export type CorrectionSessionHttpServerOptions = {
  createSessionId?: () => string;
  runtime?: CorrectionRuntimeOptions;
};

export function createCorrectionSessionHttpServer(
  options: CorrectionSessionHttpServerOptions = {},
) {
  const createSessionId = options.createSessionId ?? randomUUID;
  const sessions = new Map<string, CorrectionGraphSession>();

  return createServer((request, response) => {
    void handleRequest(request, response, sessions, createSessionId, options)
      .catch((error: unknown) => {
        writeJson(response, 500, {
          schemaVersion: 1,
          error: {
            code: "request-failed",
            message: error instanceof Error ? error.message : String(error),
          },
        });
      });
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, CorrectionGraphSession>,
  createSessionId: () => string,
  options: CorrectionSessionHttpServerOptions,
) {
  const pathname = new URL(
    request.url ?? "/",
    "http://127.0.0.1",
  ).pathname;

  if (request.method === "GET" && pathname === "/health") {
    writeJson(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "GET" && pathname === "/") {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
    });
    response.end(renderCorrectionSessionScreen());
    return;
  }

  if (request.method === "POST" && pathname === "/api/sessions") {
    const sessionId = createSessionId();
    sessions.set(sessionId, createCorrectionGraphSession(options.runtime));
    writeJson(
      response,
      201,
      { schemaVersion: 1, sessionId },
      { location: `/api/sessions/${sessionId}` },
    );
    return;
  }

  const eventsRoute = matchSessionRoute(pathname, "events");
  if (request.method === "GET" && eventsRoute) {
    const session = sessions.get(eventsRoute.sessionId);
    if (!session) {
      writeSessionNotFound(response, eventsRoute.sessionId);
      return;
    }

    writeServerSentEvents(request, response, session);
    return;
  }

  const invocationRoute = matchSessionRoute(pathname, "invocations");
  if (request.method === "POST" && invocationRoute) {
    const session = sessions.get(invocationRoute.sessionId);
    if (!session) {
      writeSessionNotFound(response, invocationRoute.sessionId);
      return;
    }

    const state = await session.invoke(await readCorrectionInput(request));
    writeJson(response, 200, {
      schemaVersion: 1,
      sessionId: invocationRoute.sessionId,
      viewModel: createCorrectionSessionViewModel(state),
    });
    return;
  }

  const resetRoute = matchSessionRoute(pathname, "reset");
  if (request.method === "POST" && resetRoute) {
    if (!sessions.has(resetRoute.sessionId)) {
      writeSessionNotFound(response, resetRoute.sessionId);
      return;
    }

    sessions.set(
      resetRoute.sessionId,
      createCorrectionGraphSession(options.runtime),
    );
    response.writeHead(204);
    response.end();
    return;
  }

  const sessionRoute = matchSessionRoot(pathname);
  if (request.method === "DELETE" && sessionRoute) {
    if (!sessions.delete(sessionRoute.sessionId)) {
      writeSessionNotFound(response, sessionRoute.sessionId);
      return;
    }

    response.writeHead(204);
    response.end();
    return;
  }

  writeJson(response, 404, {
    schemaVersion: 1,
    error: { code: "not-found", message: "Route not found" },
  });
}

function matchSessionRoute(pathname: string, action: string) {
  const match = new RegExp(`^/api/sessions/([^/]+)/${action}$`).exec(pathname);
  return match?.[1] ? { sessionId: decodeURIComponent(match[1]) } : null;
}

function matchSessionRoot(pathname: string) {
  const match = /^\/api\/sessions\/([^/]+)$/.exec(pathname);
  return match?.[1] ? { sessionId: decodeURIComponent(match[1]) } : null;
}

async function readCorrectionInput(
  request: IncomingMessage,
): Promise<CorrectionRuntimeInput> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;

  if (typeof value.draft !== "string") {
    throw new Error("Correction input draft must be a string");
  }
  if (value.userIntent !== undefined && typeof value.userIntent !== "string") {
    throw new Error("Correction input userIntent must be a string");
  }
  if (value.styleGuide !== undefined && typeof value.styleGuide !== "string") {
    throw new Error("Correction input styleGuide must be a string");
  }

  return {
    draft: value.draft,
    userIntent: value.userIntent,
    styleGuide: value.styleGuide,
  };
}

function writeSessionNotFound(response: ServerResponse, sessionId: string) {
  writeJson(response, 404, {
    schemaVersion: 1,
    error: {
      code: "session-not-found",
      message: `Session not found: ${sessionId}`,
    },
  });
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function writeServerSentEvents(
  request: IncomingMessage,
  response: ServerResponse,
  session: CorrectionGraphSession,
) {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  response.write(": connected\n\n");

  const unsubscribe = session.subscribe((event) => {
    response.write(`id: ${event.sequence}\n`);
    response.write("event: trace\n");
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  const cleanup = () => {
    unsubscribe();
  };

  request.once("close", cleanup);
  response.once("close", cleanup);
}
