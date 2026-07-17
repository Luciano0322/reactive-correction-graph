import type {
  EvidenceReportApplicationScenarioTransitionViewModel,
  EvidenceReportApplicationScenarioViewModel,
  EvidenceReportScenarioViewModel,
  EvidenceReportViewModel,
} from "./createEvidenceReportViewModel.js";

export function renderEvidenceReportHtml(
  viewModel: EvidenceReportViewModel,
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(viewModel.title)}</title>
    <style>
      :root {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #17212b;
        background: #e9eef0;
        letter-spacing: 0;
      }

      * {
        box-sizing: border-box;
      }

      body {
        min-width: 320px;
        margin: 0;
        background: #e9eef0;
        color: #17212b;
        line-height: 1.6;
      }

      main {
        width: calc(100% - 2rem);
        max-width: 65rem;
        min-height: 100vh;
        margin: 0 auto;
        padding: 3rem 2.5rem 4rem;
        background: #ffffff;
      }

      h1,
      h2,
      h3 {
        margin-top: 0;
        color: #111827;
        line-height: 1.25;
        letter-spacing: 0;
      }

      h1 {
        margin-bottom: 2.5rem;
        font-size: 2rem;
      }

      h2 {
        font-size: 1.375rem;
      }

      h3 {
        font-size: 1rem;
      }

      main > section {
        padding: 2rem 0;
        border-top: 1px solid #cbd5da;
      }

      section section {
        margin: 1.5rem 0;
        padding-left: 1rem;
        border-left: 4px solid #0f766e;
      }

      p,
      li {
        max-width: 75ch;
      }

      table {
        width: 100%;
        margin-top: 1.5rem;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 0.875rem;
      }

      th,
      td {
        padding: 0.75rem;
        border-bottom: 1px solid #d8e0e4;
        text-align: left;
        vertical-align: top;
        overflow-wrap: anywhere;
      }

      thead th {
        background: #edf2f3;
        color: #24313d;
      }

      tbody th {
        color: #0f5f59;
      }

      dl {
        display: grid;
        grid-template-columns: minmax(10rem, 0.75fr) minmax(0, 1.25fr);
        gap: 0.5rem 1.5rem;
        margin: 1rem 0;
      }

      dt {
        font-weight: 700;
        color: #344451;
      }

      dd {
        margin: 0;
      }

      ul {
        margin: 1rem 0 0;
        padding-left: 1.25rem;
      }

      .skip-link {
        position: absolute;
        z-index: 1;
        top: 1rem;
        left: 1rem;
        padding: 0.75rem 1rem;
        background: #ffffff;
        color: #111827;
        border: 2px solid #111827;
        transform: translateY(-200%);
      }

      .skip-link:focus {
        transform: translateY(0);
      }

      @media (max-width: 40rem) {
        main {
          padding: 2rem 1rem 3rem;
        }

        dl {
          grid-template-columns: 1fr;
          gap: 0.25rem;
        }

        dd + dt {
          margin-top: 0.75rem;
        }

        th,
        td {
          padding: 0.625rem 0.375rem;
        }
      }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#report-content">Skip to report content</a>
    <main id="report-content" tabindex="-1">
      <h1>${escapeHtml(viewModel.title)}</h1>
      ${renderApplicationScenario(viewModel.applicationScenario)}
      ${viewModel.scenarios.map(renderScenario).join("\n      ")}
      ${renderReliability(viewModel)}
    </main>
  </body>
</html>
`;
}

function renderApplicationScenario(
  scenario: EvidenceReportApplicationScenarioViewModel | undefined,
): string {
  if (!scenario) {
    return "";
  }

  const headingId = `application-scenario-${scenario.key}`;

  return `<section aria-labelledby="${headingId}">
        <h2 id="${headingId}">${escapeHtml(scenario.label)}</h2>
        <p>Evidence: ${escapeHtml(
          scenario.evidence.executionSummaryArtifact,
        )} and ${escapeHtml(scenario.evidence.savingsArtifact)}</p>
        ${scenario.transitions.map(renderApplicationTransition).join("\n        ")}
        ${renderApplicationClaims(scenario)}
      </section>`;
}

function renderApplicationClaims(
  scenario: EvidenceReportApplicationScenarioViewModel,
): string {
  return `<section aria-labelledby="application-scenario-proves">
          <h3 id="application-scenario-proves">What this scenario proves</h3>
          ${renderList(scenario.proves)}
        </section>
        <section aria-labelledby="application-scenario-limits">
          <h3 id="application-scenario-limits">What this scenario does not prove</h3>
          ${renderList(scenario.limits)}
        </section>`;
}

function renderApplicationTransition(
  transition: EvidenceReportApplicationScenarioTransitionViewModel,
): string {
  const headingId = `application-transition-${transition.key}`;

  return `<section aria-labelledby="${headingId}">
          <h3 id="${headingId}">${escapeHtml(transition.label)}</h3>
          <p>${escapeHtml(transition.outcome)}</p>
          <dl>
            <dt>Changed</dt>
            <dd>${escapeHtml(transition.changed)}</dd>
            <dt>Recomputed</dt>
            <dd>${renderWorkLabels(transition.recomputed)}</dd>
            <dt>Reused</dt>
            <dd>${renderWorkLabels(transition.reused)}</dd>
            <dt>Superseded</dt>
            <dd>${renderWorkLabels(transition.superseded)}</dd>
            <dt>Emitted</dt>
            <dd>${renderWorkLabels(transition.emitted)}</dd>
            <dt>Evidence status</dt>
            <dd>${statusLabel(transition.evidenceStatus)}</dd>
            <dt>Reuse decision</dt>
            <dd>${escapeHtml(transition.reuseDecision)}</dd>
            <dt>Evidence</dt>
            <dd>${escapeHtml(transition.evidence)}</dd>
          </dl>
        </section>`;
}

function renderScenario(scenario: EvidenceReportScenarioViewModel): string {
  const headingId = `scenario-${scenario.key}`;

  return `<section aria-labelledby="${headingId}">
        <h2 id="${headingId}">${escapeHtml(scenario.label)}</h2>
        <p>${scenario.outputsMatch ? "Outputs match" : "Outputs differ"}</p>
        ${renderExecution(scenario)}
        <table aria-label="${escapeHtml(scenario.label)} operation counts">
          <thead>
            <tr>
              <th scope="col">Operation</th>
              <th scope="col">Eager calls</th>
              <th scope="col">Reactive calls</th>
              <th scope="col">Avoided calls</th>
            </tr>
          </thead>
          <tbody>
            ${scenario.operations
              .map(
                (operation) => `<tr>
              <th scope="row">${escapeHtml(operation.label)}</th>
              <td>${operation.eagerCalls}</td>
              <td>${operation.reactiveCalls}</td>
              <td>${operation.avoidedCalls ?? "Not comparable"}</td>
            </tr>`,
              )
              .join("\n            ")}
          </tbody>
        </table>
      </section>`;
}

function renderExecution(scenario: EvidenceReportScenarioViewModel): string {
  const headingId = `receive-${scenario.execution.receiveEpoch}`;

  return `<section aria-labelledby="${headingId}">
          <h3 id="${headingId}">Receive ${scenario.execution.receiveEpoch}</h3>
          <dl>
            <dt>Recomputed</dt>
            <dd>${renderWorkLabels(scenario.execution.recomputed)}</dd>
            <dt>Reused</dt>
            <dd>${renderWorkLabels(scenario.execution.reused)}</dd>
            <dt>Superseded</dt>
            <dd>${renderWorkLabels(scenario.execution.superseded)}</dd>
            <dt>Emitted</dt>
            <dd>${renderWorkLabels(scenario.execution.emitted)}</dd>
          </dl>
        </section>`;
}

function renderWorkLabels(labels: string[]): string {
  return labels.length > 0 ? labels.map(escapeHtml).join(", ") : "None";
}

function renderList(items: string[]): string {
  return `<ul>
            ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n            ")}
          </ul>`;
}

function renderReliability(viewModel: EvidenceReportViewModel): string {
  const reliability = viewModel.reliability;

  return `<section aria-labelledby="reliability-heading">
        <h2 id="reliability-heading">Reliability</h2>
        <dl>
          <dt>Structural reliability</dt>
          <dd>${statusLabel(reliability.structuralVerdict)}</dd>
          <dt>Structural score</dt>
          <dd>${reliability.structuralScore ?? "Not available"}</dd>
          <dt>Provider compatibility</dt>
          <dd>${statusLabel(reliability.providerCompatibility)}</dd>
          <dt>Subjective correction quality</dt>
          <dd>${statusLabel(reliability.subjectiveCorrectionQuality)}</dd>
        </dl>
        <h3>Hard gates</h3>
        <dl>
          ${reliability.hardGates
            .map(
              (gate) => `<dt>${escapeHtml(gate.label)}</dt>
          <dd>${statusLabel(gate.status)}</dd>`,
            )
            .join("\n          ")}
        </dl>
        <h3>Evidence limits</h3>
        ${renderList(viewModel.evidenceLimits)}
      </section>`;
}

function statusLabel(status: string): string {
  const words = status.replaceAll("-", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}
