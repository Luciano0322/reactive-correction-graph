# Reactive Correction Graph

Reactive Correction Graph is a reference pattern for correcting long-form
technical writing with an agent workflow. The workflow drafts a result, extracts
claims, reviews those claims, applies a style guide, creates a correction plan,
and rewrites the draft.

The important part is not that the model always produces perfect prose. The
important part is that the runtime can tell which work has become stale and
which work can be reused. If a user changes only the style guide, the factual
claims have not changed, so the settled fact-check result should remain useful.
If a user edits the draft and changes the claims, fact-check work should run
again.

This demo uses deterministic local fixtures first. Optional Ollama evaluation
can show how a real local model behaves, but provider drift is not treated as a
semantic quality score. The reference application exists to make recomputation,
reuse, and traceability visible.
