import type {
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
  </head>
  <body>
    <main>
      <h1>${escapeHtml(viewModel.title)}</h1>
      ${viewModel.scenarios.map(renderScenario).join("\n      ")}
    </main>
  </body>
</html>
`;
}

function renderScenario(scenario: EvidenceReportScenarioViewModel): string {
  const headingId = `scenario-${scenario.key}`;

  return `<section aria-labelledby="${headingId}">
        <h2 id="${headingId}">${escapeHtml(scenario.label)}</h2>
        <p>${scenario.outputsMatch ? "Outputs match" : "Outputs differ"}</p>
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
