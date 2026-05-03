# Eval fixtures

Each fixture captures one input/expected-output snapshot for a pipeline stage.
The Epic 12 eval harness will replay them against live models to detect regressions.

## Fixture format

```json
{
  "input": { ...stage-specific input fields... },
  "expected": {
    "schemaRef": "<stageExport>.outputSchema",
    "snapshot": { ...expected output matching the stage's outputSchema... }
  }
}
```

The `schemaRef` field names the exported stage constant and its `outputSchema` property so
the harness knows which Zod schema to validate the snapshot against.

## Captured fixtures

| Stage | File |
|---|---|
| `clarifyBrief` | `fixtures/clarify_brief/habr-longread-1.json` |
| `proposeAngles` | `fixtures/propose_angles/habr-longread-1.json` |
| `buildPlan` | `fixtures/build_plan/habr-longread-1.json` |
| `planSearchHypotheses` | `fixtures/plan_search_hypotheses/habr-longread-1.json` |
| `formulateQueries` | `fixtures/formulate_queries/habr-longread-1.json` |
| `webSearch` | `fixtures/web_search/habr-longread-1.json` |
| `summarizeSource` | `fixtures/summarize_source/habr-longread-1.json` |
| `draftSection` | `fixtures/draft_section/habr-longread-1.json` |
| `runCritic` | `fixtures/run_critic/habr-longread-1.json` |
| `extractClaims` | `fixtures/extract_claims/habr-longread-1.json` |
| `verifyClaim` | `fixtures/verify_claim/habr-longread-1.json` |
| `adjudicateClaim` | `fixtures/adjudicate_claim/habr-longread-1.json` |

All twelve use the same Habr long-read profile (3 000–6 000 words, Russian-speaking backend engineers)
and a prompt-caching topic so the inputs chain naturally across stages.

## Running fixture smoke-tests

The fixture inputs and snapshots are exercised by the unit tests in
`tests/unit/pipeline/{clarify-brief,propose-angles,build-plan,plan-search-hypotheses,formulate-queries,web-search,summarize-source,draft-section,run-critic,extract-claims,verify-claim,adjudicate-claim}.test.ts`.
Each test loads its fixture, stubs `routeJsonChat` to return `expected.snapshot`,
and asserts the stage returns the snapshot unchanged — proving the snapshot is
schema-valid and the stage passes it through correctly.

```
pnpm test tests/unit/pipeline
```
