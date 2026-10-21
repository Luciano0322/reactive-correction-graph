import { execFile } from "node:child_process";
import { createServer, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const vitestCli = resolve(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const prefix = "[ollama-smoke] ";

type RunResult = { code: number; output: string };

async function runManualSmoke(options: {
  timeoutMs?: number | null;
  respond?: (task: string, response: ServerResponse) => boolean;
} = {}): Promise<RunResult> {
  const server = createServer((request, response) => {
    void (async () => {
      let body = "";
      for await (const chunk of request) body += String(chunk);
      const payload = JSON.parse(body) as { prompt: string };
      const task = /^Task: (\w+)/.exec(payload.prompt)?.[1] ?? "unknown";
      if (options.respond?.(task, response)) return;
      const result = task === "factCheckClaims"
        ? JSON.stringify({ items: [{ claimId: "claim-1", verdict: "supported", note: "fixture" }] })
        : task === "reviewStyle"
          ? JSON.stringify({ tone: "clear", suggestions: [] })
          : "PRIVATE_FIXTURE_REWRITE";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ response: result }));
    })().catch(() => {
      response.writeHead(500);
      response.end();
    });
  });
  await new Promise<void>((ready, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", ready);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not bind");
  try {
    return await new Promise<RunResult>((done) => {
      execFile(process.execPath, [
        vitestCli, "run", "src/llm/ollamaCorrectionModel.manual.test.ts",
        "--reporter=verbose", "--pool=threads", "--maxWorkers=1", "--minWorkers=1",
      ], {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          OLLAMA_MODEL: "smoke-fixture",
          OLLAMA_BASE_URL: `http://127.0.0.1:${address.port}`,
          OLLAMA_SMOKE_TIMEOUT_MS: options.timeoutMs === null
            ? undefined
            : String(options.timeoutMs ?? 5_000),
          FORCE_COLOR: "0",
        },
        encoding: "utf8",
        windowsHide: true,
        timeout: 15_000,
        maxBuffer: 1_000_000,
      }, (error, stdout, stderr) => {
        done({ code: typeof error?.code === "number" ? error.code : error ? 1 : 0, output: stdout + stderr });
      });
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
}

function records(output: string): Array<Record<string, unknown>> {
  return output.split(/\r?\n/).flatMap((line) => {
    const index = line.indexOf(prefix);
    return index === -1 ? [] : [JSON.parse(line.slice(index + prefix.length)) as Record<string, unknown>];
  });
}

it("reports timed stage progress through the manual test command without logging candidate payloads", async () => {
  const result = await runManualSmoke({ timeoutMs: null });
  expect(result.code, result.output).toBe(0);
  const progress = records(result.output);
  expect(progress).toContainEqual(expect.objectContaining({
    event: "run-started", timeoutMs: 120_000, testTimeoutMs: 150_000,
  }));
  for (const stage of ["factCheck", "styleReview", "rewriteDraft"]) {
    expect(progress).toContainEqual(expect.objectContaining({ event: "stage-started", stage }));
    const completed = progress.find((record) => record.event === "stage-completed" && record.stage === stage);
    expect(completed).toMatchObject({ elapsedMs: expect.any(Number), stageElapsedMs: expect.any(Number) });
  }
  expect(progress).toContainEqual(expect.objectContaining({ event: "run-completed" }));
  expect(result.output).not.toContain("PRIVATE_FIXTURE_REWRITE");
}, 30_000);

it("reports the runtime timeout and distinguishes an active stage from rewrite work that has not started", async () => {
  const result = await runManualSmoke({
    timeoutMs: 1_000,
    respond: (task) => task === "reviewStyle",
  });
  expect(result.code).not.toBe(0);
  expect(result.output).toContain("Correction runtime did not settle before timeout");
  expect(result.output).not.toContain("Test timed out");
  const progress = records(result.output);
  expect(progress).toContainEqual(expect.objectContaining({
    event: "run-started", timeoutMs: 1_000, testTimeoutMs: 31_000,
  }));
  expect(progress).toContainEqual(expect.objectContaining({
    event: "run-failed",
    elapsedMs: expect.any(Number),
    statuses: { factCheck: "success", styleReview: "pending", rewriteDraft: "pending" },
    pendingStages: [{ stage: "styleReview", stageElapsedMs: expect.any(Number) }],
    notStartedStages: ["rewriteDraft"],
  }));
  expect(progress).not.toContainEqual(expect.objectContaining({ event: "stage-started", stage: "rewriteDraft" }));
  expect(progress).not.toContainEqual(expect.objectContaining({ event: "run-completed" }));
}, 30_000);

it("reports a failed stage and preserves provider errors instead of swallowing them", async () => {
  const result = await runManualSmoke({
    respond: (task, response) => {
      if (task !== "factCheckClaims") return false;
      response.writeHead(503);
      response.end();
      return true;
    },
  });
  expect(result.code).not.toBe(0);
  expect(result.output).toContain("Ollama generate failed with HTTP 503");
  const progress = records(result.output);
  expect(progress).toContainEqual(expect.objectContaining({
    event: "stage-failed", stage: "factCheck", stageElapsedMs: expect.any(Number),
  }));
  expect(progress).toContainEqual(expect.objectContaining({
    event: "run-failed", statuses: expect.objectContaining({ factCheck: "error" }),
  }));
  expect(progress).not.toContainEqual(expect.objectContaining({ event: "stage-started", stage: "rewriteDraft" }));
  expect(progress).not.toContainEqual(expect.objectContaining({ event: "run-completed" }));
}, 30_000);

it.each([0, Number.NaN])("rejects invalid smoke timeout %s before starting model work", async (timeoutMs) => {
  const result = await runManualSmoke({ timeoutMs });
  expect(result.code).not.toBe(0);
  expect(result.output).toContain("OLLAMA_SMOKE_TIMEOUT_MS must be a positive integer");
  expect(records(result.output)).toEqual([]);
}, 30_000);
