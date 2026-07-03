import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createCorrectionSessionHttpServer } from "./createCorrectionSessionHttpServer.js";

describe("createCorrectionSessionHttpServer", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(closeServer));
  });

  it("creates an in-process correction session through HTTP", async () => {
    const server = createCorrectionSessionHttpServer({
      createSessionId: () => "session-001",
    });
    servers.push(server);
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
    });

    expect({
      status: response.status,
      contentType: response.headers.get("content-type"),
      location: response.headers.get("location"),
      body: await response.json(),
    }).toEqual({
      status: 201,
      contentType: "application/json; charset=utf-8",
      location: "/api/sessions/session-001",
      body: {
        schemaVersion: 1,
        sessionId: "session-001",
      },
    });
  });

  it("invokes the same correction session across HTTP requests", async () => {
    const server = createCorrectionSessionHttpServer({
      createSessionId: () => "session-continuous",
    });
    servers.push(server);
    const baseUrl = await listen(server);
    const draft = "Signal-kernel coordinates async correction branches.";

    await fetch(`${baseUrl}/api/sessions`, { method: "POST" });
    const firstResponse = await postJson(
      `${baseUrl}/api/sessions/session-continuous/invocations`,
      { draft },
    );
    const secondResponse = await postJson(
      `${baseUrl}/api/sessions/session-continuous/invocations`,
      { draft, styleGuide: "Use concise technical language." },
    );
    const secondBody = (await secondResponse.json()) as {
      schemaVersion?: number;
      sessionId?: string;
      viewModel?: {
        finalResult?: { summary?: string[] };
        execution?: { receiveEpoch?: number };
      };
    };

    expect({
      firstStatus: firstResponse.status,
      secondStatus: secondResponse.status,
      schemaVersion: secondBody.schemaVersion,
      sessionId: secondBody.sessionId,
      receiveEpoch: secondBody.viewModel?.execution?.receiveEpoch,
      summary: secondBody.viewModel?.finalResult?.summary,
    }).toEqual({
      firstStatus: 200,
      secondStatus: 200,
      schemaVersion: 1,
      sessionId: "session-continuous",
      receiveEpoch: 2,
      summary: expect.arrayContaining([
        "Apply style guide: Use concise technical language.",
      ]),
    });
  });

  it("returns a versioned session view model instead of raw graph state", async () => {
    const server = createCorrectionSessionHttpServer({
      createSessionId: () => "session-view-model",
    });
    servers.push(server);
    const baseUrl = await listen(server);
    const draft = "Signal-kernel coordinates async correction branches.";

    await fetch(`${baseUrl}/api/sessions`, { method: "POST" });
    const response = await postJson(
      `${baseUrl}/api/sessions/session-view-model/invocations`,
      { draft },
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect({ response, body, rawStateExposed: "state" in body }).toMatchObject({
      response: { status: 200 },
      body: {
        schemaVersion: 1,
        sessionId: "session-view-model",
        viewModel: {
          status: "settled",
          input: { draft },
          finalResult: {
            revisedDraft: expect.stringContaining(draft),
            summary: ["No major correction needed in the mock runtime."],
            unresolvedIssues: [],
          },
          resources: {
            factCheck: "success",
            styleReview: "success",
            rewriteDraft: "success",
          },
          execution: {
            receiveEpoch: 1,
            recomputed: ["factCheck", "styleReview", "rewriteDraft"],
            reused: [],
            superseded: [],
            emitted: ["finalResult"],
          },
        },
      },
      rawStateExposed: false,
    });
  });

  it("resets a session to a fresh correction runtime", async () => {
    const server = createCorrectionSessionHttpServer({
      createSessionId: () => "session-resettable",
    });
    servers.push(server);
    const baseUrl = await listen(server);
    const previousDraft = "The previous session draft should be removed.";
    const freshDraft = "The reset session owns this fresh draft.";

    await fetch(`${baseUrl}/api/sessions`, { method: "POST" });
    await postJson(
      `${baseUrl}/api/sessions/session-resettable/invocations`,
      { draft: previousDraft },
    );
    const resetResponse = await fetch(
      `${baseUrl}/api/sessions/session-resettable/reset`,
      { method: "POST" },
    );
    const invokeResponse = await postJson(
      `${baseUrl}/api/sessions/session-resettable/invocations`,
      { draft: freshDraft },
    );
    const body = (await invokeResponse.json()) as {
      viewModel?: {
        finalResult?: { revisedDraft?: string };
        execution?: { receiveEpoch?: number };
      };
    };

    expect({
      resetStatus: resetResponse.status,
      invokeStatus: invokeResponse.status,
      receiveEpoch: body.viewModel?.execution?.receiveEpoch,
      revisedDraft: body.viewModel?.finalResult?.revisedDraft,
      containsPreviousDraft:
        body.viewModel?.finalResult?.revisedDraft?.includes(previousDraft),
    }).toEqual({
      resetStatus: 204,
      invokeStatus: 200,
      receiveEpoch: 1,
      revisedDraft: expect.stringContaining(freshDraft),
      containsPreviousDraft: false,
    });
  });

  it("disposes a session and rejects later invocations", async () => {
    const server = createCorrectionSessionHttpServer({
      createSessionId: () => "session-disposable",
    });
    servers.push(server);
    const baseUrl = await listen(server);

    await fetch(`${baseUrl}/api/sessions`, { method: "POST" });
    const disposeResponse = await fetch(
      `${baseUrl}/api/sessions/session-disposable`,
      { method: "DELETE" },
    );
    const invokeResponse = await postJson(
      `${baseUrl}/api/sessions/session-disposable/invocations`,
      { draft: "This invocation must not recreate a disposed session." },
    );

    expect({
      disposeStatus: disposeResponse.status,
      invokeStatus: invokeResponse.status,
      invokeBody: await invokeResponse.json(),
    }).toEqual({
      disposeStatus: 204,
      invokeStatus: 404,
      invokeBody: {
        schemaVersion: 1,
        error: {
          code: "session-not-found",
          message: "Session not found: session-disposable",
        },
      },
    });
  });
});

function postJson(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
