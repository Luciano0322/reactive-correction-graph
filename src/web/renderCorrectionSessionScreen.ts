export function renderCorrectionSessionScreen(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Reactive Correction Session</title>
    <style>
      :root {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #18212b;
        background: #eef2f3;
        letter-spacing: 0;
      }

      * { box-sizing: border-box; }

      body {
        min-width: 320px;
        margin: 0;
        background: #eef2f3;
        line-height: 1.5;
      }

      button,
      input,
      textarea { font: inherit; }

      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        min-height: 4rem;
        padding: 0 2rem;
        background: #17212b;
        color: #ffffff;
        border-bottom: 4px solid #0f766e;
      }

      h1,
      h2,
      h3,
      h4 {
        margin-top: 0;
        line-height: 1.25;
        letter-spacing: 0;
      }

      h1 {
        margin-bottom: 0;
        font-size: 1.25rem;
      }

      h2 { font-size: 1rem; }
      h3 { font-size: 0.875rem; }
      h4 {
        margin-bottom: 0.5rem;
        color: #52616d;
        font-size: 0.75rem;
        text-transform: uppercase;
      }

      .provider {
        padding: 0.25rem 0.5rem;
        color: #422006;
        background: #fef3c7;
        border: 1px solid #f59e0b;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 700;
      }

      main {
        display: grid;
        grid-template-columns: minmax(19rem, 0.8fr) minmax(0, 1.2fr);
        width: min(100% - 2rem, 80rem);
        min-height: calc(100vh - 6rem);
        margin: 1rem auto;
        background: #ffffff;
        border: 1px solid #cbd5da;
      }

      main > section {
        min-width: 0;
        padding: 1.5rem;
      }

      main > section + section {
        border-left: 1px solid #cbd5da;
      }

      form {
        display: grid;
        gap: 1rem;
      }

      label {
        display: grid;
        gap: 0.375rem;
        color: #344451;
        font-size: 0.875rem;
        font-weight: 700;
      }

      input,
      textarea {
        width: 100%;
        color: #18212b;
        background: #ffffff;
        border: 1px solid #9aabb5;
        border-radius: 4px;
        padding: 0.625rem 0.75rem;
        font-weight: 400;
      }

      textarea {
        min-height: 8rem;
        resize: vertical;
      }

      input:focus,
      textarea:focus,
      button:focus-visible {
        outline: 3px solid #f59e0b;
        outline-offset: 2px;
      }

      .form-actions {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      button {
        min-height: 2.5rem;
        padding: 0.625rem 1rem;
        color: #ffffff;
        background: #0f766e;
        border: 1px solid #0b5f59;
        border-radius: 4px;
        font-weight: 700;
        cursor: pointer;
      }

      button:hover { background: #0b5f59; }
      button:disabled { cursor: wait; opacity: 0.65; }

      [role="status"] {
        min-height: 1.5rem;
        margin: 0;
        color: #52616d;
        font-size: 0.875rem;
      }

      [role="alert"] {
        margin: 1rem 0 0;
        padding: 0.75rem;
        color: #7f1d1d;
        background: #fef2f2;
        border-left: 4px solid #dc2626;
      }

      .empty-state {
        color: #64727d;
      }

      .result-section {
        padding: 1rem 0;
        border-top: 1px solid #d8e0e4;
      }

      .result-section:first-child {
        padding-top: 0;
        border-top: 0;
      }

      pre {
        margin: 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font: inherit;
      }

      ul {
        margin: 0;
        padding-left: 1.25rem;
      }

      .execution-activity {
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid #aebdc5;
      }

      .execution-heading {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
      }

      .execution-heading h3 { margin-bottom: 0.75rem; }

      .execution-epoch {
        color: #64727d;
        font-size: 0.75rem;
      }

      .execution-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
        border-top: 1px solid #d8e0e4;
        border-left: 1px solid #d8e0e4;
      }

      .execution-group {
        min-width: 0;
        padding: 0.75rem;
        border-right: 1px solid #d8e0e4;
        border-bottom: 1px solid #d8e0e4;
      }

      .execution-group ul {
        min-height: 1.5rem;
        color: #344451;
        font-size: 0.8125rem;
      }

      .execution-group[data-state="pending"] { border-top: 3px solid #d97706; }
      .execution-group[data-state="recomputed"] { border-top: 3px solid #2563eb; }
      .execution-group[data-state="reused"] { border-top: 3px solid #15803d; }
      .execution-group[data-state="superseded"] { border-top: 3px solid #b91c1c; }

      .developer-inspector {
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid #aebdc5;
      }

      .inspector-heading {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
      }

      .inspector-heading h3 { margin-bottom: 0.75rem; }

      .inspector-source {
        color: #64727d;
        font-size: 0.75rem;
      }

      .inspector-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
        gap: 1rem;
      }

      .inspector-group {
        min-width: 0;
        padding-top: 0.75rem;
        border-top: 1px solid #d8e0e4;
      }

      .inspector-group p,
      .inspector-group ul {
        color: #344451;
        font-size: 0.8125rem;
      }

      .inspector-group p { margin: 0 0 0.5rem; }

      [hidden] { display: none !important; }

      @media (max-width: 55rem) {
        header { padding: 0 1rem; }

        main {
          grid-template-columns: 1fr;
          width: calc(100% - 1rem);
          margin: 0.5rem auto;
        }

        main > section { padding: 1rem; }

        main > section + section {
          border-top: 1px solid #cbd5da;
          border-left: 0;
        }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Reactive Correction Session</h1>
      <span class="provider">Mock provider</span>
    </header>
    <main>
      <section aria-labelledby="input-heading">
        <h2 id="input-heading">Input</h2>
        <form id="correction-form">
          <label>
            Draft
            <textarea id="draft" name="draft" required></textarea>
          </label>
          <label>
            User intent
            <input id="user-intent" name="userIntent" type="text">
          </label>
          <label>
            Style guide
            <input id="style-guide" name="styleGuide" type="text">
          </label>
          <div class="form-actions">
            <button type="submit">Run correction</button>
            <p id="session-status" role="status" aria-live="polite">Ready</p>
          </div>
        </form>
        <p id="session-error" role="alert" hidden></p>
      </section>
      <section aria-labelledby="result-heading">
        <h2 id="result-heading">Correction result</h2>
        <p id="empty-result" class="empty-state">No correction yet.</p>
        <div id="correction-result" hidden>
          <section class="result-section">
            <h3>Revised draft</h3>
            <pre id="revised-draft"></pre>
          </section>
          <section class="result-section">
            <h3>Correction summary</h3>
            <ul id="correction-summary"></ul>
          </section>
          <section class="result-section">
            <h3>Unresolved issues</h3>
            <ul id="unresolved-issues"></ul>
          </section>
        </div>
        <section class="execution-activity" aria-labelledby="execution-heading">
          <div class="execution-heading">
            <h3 id="execution-heading">Execution activity</h3>
            <span id="execution-epoch" class="execution-epoch">Not run</span>
          </div>
          <div class="execution-grid">
            <section class="execution-group" data-state="pending">
              <h4>Pending</h4>
              <ul id="pending-work" aria-label="Pending work"><li>None</li></ul>
            </section>
            <section class="execution-group" data-state="recomputed">
              <h4>Recomputed</h4>
              <ul id="recomputed-work" aria-label="Recomputed work"><li>None</li></ul>
            </section>
            <section class="execution-group" data-state="reused">
              <h4>Reused</h4>
              <ul id="reused-work" aria-label="Reused work"><li>None</li></ul>
            </section>
            <section class="execution-group" data-state="superseded">
              <h4>Superseded</h4>
              <ul id="superseded-work" aria-label="Superseded work"><li>None</li></ul>
            </section>
          </div>
        </section>
        <section
          id="developer-inspector"
          class="developer-inspector"
          aria-labelledby="developer-inspector-heading"
          hidden
        >
          <div class="inspector-heading">
            <h3 id="developer-inspector-heading">Developer inspector</h3>
            <span id="inspector-source" class="inspector-source">Not attached</span>
          </div>
          <div class="inspector-grid">
            <section class="inspector-group">
              <h4>Trace events</h4>
              <p id="inspector-trace-count">0</p>
            </section>
            <section class="inspector-group">
              <h4>Runtime intent</h4>
              <p>User intent: <span id="inspector-user-intent">None</span></p>
              <p>Style guide: <span id="inspector-style-guide">None</span></p>
            </section>
            <section class="inspector-group">
              <h4>Claims</h4>
              <ul id="inspector-claims" aria-label="Inspector claims"><li>None</li></ul>
            </section>
            <section class="inspector-group">
              <h4>Latest receive</h4>
              <p id="inspector-receive-epoch">Not run</p>
              <ul id="inspector-recomputed-work" aria-label="Inspector recomputed work"><li>None</li></ul>
              <ul id="inspector-reused-work" aria-label="Inspector reused work"><li>None</li></ul>
            </section>
            <section class="inspector-group">
              <h4>Warnings</h4>
              <ul id="inspector-warnings" aria-label="Inspector warnings"><li>None</li></ul>
            </section>
          </div>
        </section>
      </section>
    </main>
    <script>
      const form = document.querySelector("#correction-form");
      const submitButton = form.querySelector("button[type='submit']");
      const status = document.querySelector("#session-status");
      const errorOutput = document.querySelector("#session-error");
      const emptyResult = document.querySelector("#empty-result");
      const result = document.querySelector("#correction-result");
      const inspectorPanel = document.querySelector("#developer-inspector");
      const operationLabels = {
        factCheck: "Fact check",
        styleReview: "Style review",
        rewriteDraft: "Rewrite draft",
        finalResult: "Final result",
      };
      let sessionId;
      let eventSource;
      let eventStreamReady;
      let hasSettledResult = false;
      let activeReceiveEpoch;
      const livePendingWork = new Set();

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submitButton.disabled = true;
        status.textContent = "Running correction";
        errorOutput.hidden = true;
        livePendingWork.clear();
        renderActivityList(
          "#pending-work",
          hasSettledResult ? [] : Object.keys(operationLabels),
        );

        try {
          if (!sessionId) {
            const sessionResponse = await fetch("/api/sessions", {
              method: "POST",
            });
            const session = await readJson(sessionResponse);
            sessionId = session.sessionId;
            await openEventStream();
          } else {
            await openEventStream();
          }

          const formData = new FormData(form);
          const input = {
            draft: String(formData.get("draft") ?? ""),
          };
          const userIntent = String(formData.get("userIntent") ?? "").trim();
          const styleGuide = String(formData.get("styleGuide") ?? "").trim();
          if (userIntent) input.userIntent = userIntent;
          if (styleGuide) input.styleGuide = styleGuide;

          const invocationResponse = await fetch(
            "/api/sessions/" + encodeURIComponent(sessionId) + "/invocations",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(input),
            },
          );
          const invocation = await readJson(invocationResponse);
          renderResult(invocation.viewModel.finalResult);
          renderExecution(invocation.viewModel.execution);
          renderInspector(invocation.inspector);
          hasSettledResult = true;
          status.textContent = "Correction settled";
        } catch (error) {
          status.textContent = "Correction failed";
          errorOutput.textContent =
            error instanceof Error ? error.message : String(error);
          errorOutput.hidden = false;
        } finally {
          submitButton.disabled = false;
        }
      });

      function openEventStream() {
        if (eventSource) return eventStreamReady;

        eventStreamReady = new Promise((resolve) => {
          eventSource = new EventSource(
            "/api/sessions/" + encodeURIComponent(sessionId) + "/events",
          );
          eventSource.addEventListener("open", () => resolve(), { once: true });
          eventSource.addEventListener("trace", (event) => {
            applyLiveTraceEvent(JSON.parse(event.data));
          });
        });

        return eventStreamReady;
      }

      function applyLiveTraceEvent(liveEvent) {
        const traceEvent = liveEvent.event;
        if (
          traceEvent.scope === "runtime" &&
          traceEvent.type === "started" &&
          traceEvent.label === "receive"
        ) {
          activeReceiveEpoch = traceEvent.metadata?.receiveEpoch;
          livePendingWork.clear();
          document.querySelector("#execution-epoch").textContent =
            activeReceiveEpoch === undefined
              ? "Running"
              : "Running epoch " + activeReceiveEpoch;
          renderActivityList("#pending-work", [...livePendingWork]);
          return;
        }

        if (activeReceiveEpoch === undefined) return;
        if (traceEvent.scope !== "resource") return;
        if (!(traceEvent.label in operationLabels)) return;

        if (traceEvent.type === "pending") {
          livePendingWork.add(traceEvent.label);
          renderActivityList("#pending-work", [...livePendingWork]);
          return;
        }

        if (
          traceEvent.type === "resolved" ||
          traceEvent.type === "skipped" ||
          traceEvent.type === "rejected"
        ) {
          livePendingWork.delete(traceEvent.label);
          renderActivityList("#pending-work", [...livePendingWork]);
        }
      }

      async function readJson(response) {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error?.message ?? "Request failed");
        }
        return body;
      }

      function renderResult(finalResult) {
        document.querySelector("#revised-draft").textContent =
          finalResult.revisedDraft;
        renderList("#correction-summary", finalResult.summary);
        renderList("#unresolved-issues", finalResult.unresolvedIssues);
        emptyResult.hidden = true;
        result.hidden = false;
      }

      function renderExecution(execution) {
        document.querySelector("#execution-epoch").textContent =
          "Settled epoch " + execution.receiveEpoch;
        renderActivityList("#pending-work", []);
        renderActivityList("#recomputed-work", execution.recomputed);
        renderActivityList("#reused-work", execution.reused);
        renderActivityList("#superseded-work", execution.superseded);
      }

      function renderInspector(inspector) {
        if (!inspector) return;

        const diagnostics = inspector.developerDiagnostics;
        const internalState = diagnostics.internalState;
        const receives = diagnostics.execution?.receives ?? [];
        const latestReceive = receives.at(-1);

        document.querySelector("#inspector-source").textContent =
          inspector.source.type === "live-session"
            ? "Live session " + inspector.source.sessionId
            : "Artifact bundle " + inspector.source.runId;
        document.querySelector("#inspector-trace-count").textContent =
          diagnostics.trace.status === "available"
            ? String(diagnostics.trace.eventCount)
            : "Missing";
        document.querySelector("#inspector-user-intent").textContent =
          internalState?.intent.userIntent ?? "None";
        document.querySelector("#inspector-style-guide").textContent =
          internalState?.intent.styleGuide ?? "None";
        renderList(
          "#inspector-claims",
          internalState?.claims.length
            ? internalState.claims.map((claim) => claim.text)
            : ["None"],
        );
        document.querySelector("#inspector-receive-epoch").textContent =
          latestReceive
            ? "Receive epoch " + latestReceive.receiveEpoch
            : "Not run";
        renderActivityList(
          "#inspector-recomputed-work",
          latestReceive?.recomputed ?? [],
        );
        renderActivityList(
          "#inspector-reused-work",
          latestReceive?.reused ?? [],
        );
        renderList(
          "#inspector-warnings",
          diagnostics.warnings?.length
            ? diagnostics.warnings.map((warning) => warning.message)
            : ["None"],
        );
        inspectorPanel.hidden = false;
      }

      function renderActivityList(selector, operations) {
        renderList(
          selector,
          operations.length === 0
            ? ["None"]
            : operations.map((operation) => operationLabels[operation] ?? operation),
        );
      }

      function renderList(selector, items) {
        const list = document.querySelector(selector);
        list.replaceChildren(
          ...items.map((item) => {
            const listItem = document.createElement("li");
            listItem.textContent = item;
            return listItem;
          }),
        );
      }
    </script>
  </body>
</html>
`;
}
