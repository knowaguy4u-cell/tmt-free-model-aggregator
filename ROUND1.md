# Round 1 — free-model-aggregator-02

## Built

Complete Node entry at `main.ts`, seeded from the supplied MIT starter. The deliverable is a running API aggregator, not a dashboard. The kit root was found at:

`/home/hatch/workspace/goals/wealth-pipeline/hidden_files/makefun/free-model-aggregator-02-kit/unpacked/free-model-aggregator-02-kit`

Reviewed the rules and transcript requirements, competition configuration, practice briefs/workloads, starter, sealed environment/scorer, and relevant harness lifecycle/replay code. Verified all 32 files in the kit manifest against their sizes and SHA-256 hashes: no mismatches (`artifacts/kit-integrity.json`).

The entry ranks eligible models by the brief's rating and capability requirements, maintains the exact fourteen-model catalog, implements refusal failover and logical-counter circuit backoff, reports truthful upstream failure trails, respects gateway request budgets, serves both API wires in JSON and SSE, and exits on `/work` completion. Model answers come exclusively from the supplied gateway. The code contains no local answer generator or fixture path.

The API translation preserves system prompts, images, tools and results, JSON mode, sampling options, stop sequences, and output caps. Fixed starter SSE framing when CR and LF arrive in separate chunks. Final Anthropic stream usage includes late upstream input-token information as well as output tokens.

## Actually run

- `node main.ts --list`, with no brief: succeeds and prints the contract's empty catalog.
- `--list` with each practice brief: generated catalog files in `artifacts/`; the in-memory integration suite also executes `--list` and compares it to the registered catalog.
- `node tests/wire.mjs`: passes. Covers system/image/tool/result conversion, token caps and sampling parameters, tool JSON, usage and stop reasons, single-byte UTF-8/CRLF stream splitting, model-ID rewriting, and text/tool SSE event sequencing. See `artifacts/wire-report.json`.
- `node --experimental-vm-modules tests/offline.mjs <kit-root>`: passes. Three practice trials × normal/refusal scenarios × two identical passes = 12 trial runs and 72 valid prompt deliveries. Normal trials make exactly six fixture calls and choose the highest-rated eligible model each time. Refusal trials inject two 429s and one 503, recover every prompt in nine calls, and report the failures. Corresponding state exports and request bodies match byte for byte between passes.
- The unchanged kit environment validates 6/6 prompts in every fixture trial. Its unchanged scorer reports served/wire/failover/catalog all 100. It deliberately reports **quality 0, total 40, and real_model failure** because there is no genuine gateway cassette. This is an offline protocol result, not a competition score or live model proof. See `artifacts/offline-report.json` and each trial's `export/state.json`, `requests.json`, and `scores/`.
- Official `makefun check --kit <kit-root> --repo entry --worktree --json`: attempted; stopped before checks at `git -C: spawnSync git EPERM`. Saved in `artifacts/makefun-check.stderr`.
- Official `grade-local --kit <kit-root> --bot entry --driver process --worktree --instances 3 --save entry/artifacts/official-grade --json`: attempted; refuses to start without a provider key or authenticated gateway. Saved in `artifacts/grade-local.stderr`.

## Unproven and external constraints

This workspace rejects TCP listeners even on 127.0.0.1 (`listen EPERM`). The socket integration attempt failed, so tests use an explicitly test-only virtual transport while evaluating the production entry and sealed kit programs. Real TCP operation and Node 22 specifically are unverified here; the available runtime is Node 24.22.1. The virtual adapter verifies application behavior, not container networking or deployment.

No credentials, wallets, account setup, external network, repository publication, or submission were used. Live model correctness, latency under the 30-second client timeout, provider availability, live gateway call evidence, and the official live/cassette replay remain unproven. Midstream provider failures cannot be retried after client bytes have been sent. An account-wide quota exhaustion cannot be fixed by switching models.

The submission/transcript gates have not been certified: the official check could not get past its subprocess restriction, and this work did not fabricate or export a substitute session transcript. Preserve the genuine recording of this sole code-writing session for any later authorized submission. The kit requires recorded transcripts and repository/license/ownership eligibility; its run-record requirement takes effect on 2026-11-17. A paid live entry also depends on the entrant's properly provisioned OpenRouter account/key outside this task's scope.

The source is ready for further verification in a normal kit runtime. Nothing has been submitted.
