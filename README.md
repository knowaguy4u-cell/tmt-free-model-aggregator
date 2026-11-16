# Free current

A dependency-free, Node 22 TypeScript entry for **free-model-aggregator-02**. Run from this directory:

```sh
node main.ts
```

The competition supplies `MAKEFUN_PROMPT_FILE`, `MAKEFUN_ENV_URL`, `OPENAI_BASE_URL`, and the gateway's dummy `OPENAI_API_KEY`. The process binds an OS-selected port on `0.0.0.0`, registers its catalog, serves the workload, polls `/work`, and exits successfully when done. It accesses only the supplied environment and gateway. No packages, compilation, wallets, or embedded credentials are needed.

```sh
MAKEFUN_PROMPT_FILE=/path/to/input/prompt.txt node main.ts --list
```

This prints the exact catalog object used during registration. Without a brief, `--list` prints `{"providers":[]}`, as the starter contract specifies.

## Routing and API behavior

- Rank eligible free models by the brief's published rating, descending, with a stable model-ID tie break. Respect tools, vision, JSON, and minimum context requirements.
- Keep the complete catalog, independently of temporary upstream health.
- Fail over on HTTP refusals. Record their actual statuses and codes in `x-makefun-upstream-failures`, at most eight rows. Transport failures are never fabricated as HTTP refusals.
- Use logical prompt counters for bounded circuit backoff and deterministic half-open probes. No clock, timing race, or randomness affects routing.
- Stop futile retries on authentication and gateway budget exhaustion. Never exceed 60 attempted model calls per trial or eight attempts per prompt.
- Translate Anthropic system prompts, images, tools, tool results, sampling parameters, stop sequences, and output limits into Chat Completions. Relay OpenAI JSON/SSE and translate Anthropic JSON/SSE, preserving provider text, tool arguments, finish reasons, and usage. Restore the actual dialed gateway model ID throughout.
- Request stream usage explicitly. Parse fragmented SSE and UTF-8 incrementally; final Anthropic usage carries the input count when upstream only supplies it at stream end.

## Local verification

```sh
node tests/wire.mjs
node --experimental-vm-modules tests/offline.mjs /path/to/kit-root
```

The second command evaluates the unchanged kit environment and scorer and the entry behind a test-only in-memory HTTP transport. This works in restricted environments that forbid loopback sockets and child processes. The fixture gateway is exclusively in `tests/`; it is never imported by the entry. Both test programs write reports in `artifacts/`.

These fixtures are **not live models**, gateway cassettes, or evidence of live completion quality. See `ROUND1.md` for results and remaining verification. Production uses normal Node HTTP and fetch; only the test evaluator substitutes transport.

The MIT starter's provider parser and API adapters are retained with improvements; see LICENSE. No submission has been made.
