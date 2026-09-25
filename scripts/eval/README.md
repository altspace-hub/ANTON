# Showcase model test run (`openrouter-eval.ts`)

Before the public showcase goes live, this script checks how the candidate
OpenRouter models handle real ANTON work. It runs ten representative Work
modules, each with a fixed synthetic input, against each candidate model. It
records what a visitor would get: the answer, input, output and reasoning
tokens, the cost OpenRouter billed (`usage.cost`), latency (total and time to
first text), `finish_reason` and the provider that served the call. It writes a
Markdown report and a JSON file.

It uses the system prompt ANTON would compose for a fresh Work run of each
module. `prompt-composer.ts` gets the module's own defaults: output formats,
creativity, the first recommended persona, transparency, the format-driven
skills and the framework-text grounding. Guided inputs are rendered into the
same "Module Settings" block the route builds. The script only reads. It needs
no database and no running ANTON server.

OpenRouter is called directly with `fetch`, not through ANTON's compat adapter.
The results therefore do not change while that adapter is being reworked. The
flip side is that the reasoning setting sent is this script's own (see
`--effort`), not the adapter's.

## Run it

```bash
# Plan and cost estimate. No model is called, no key is needed, nothing is written.
npx tsx scripts/eval/openrouter-eval.ts --dry-run

# The real run, capped at $2 (the default cap)
OPENROUTER_API_KEY=sk-or-... npx tsx scripts/eval/openrouter-eval.ts --max-usd 2

# Also grade every answer on this machine's subscription engine (sdk:claude-opus-5-5)
OPENROUTER_API_KEY=sk-or-... npx tsx scripts/eval/openrouter-eval.ts --judge

# Continue a run that stopped part-way: finished answers are reused, only the rest is called
OPENROUTER_API_KEY=sk-or-... npx tsx scripts/eval/openrouter-eval.ts --resume not_to_github/eval/2026-09-25/openrouter-eval-155401.json --judge

# Grade an earlier run later, without calling OpenRouter again
npx tsx scripts/eval/openrouter-eval.ts --rejudge not_to_github/eval/2026-09-25/openrouter-eval-101500.json
```

In PowerShell, set the key with `$env:OPENROUTER_API_KEY = 'sk-or-...'` first.
Use a separate key with its own credit limit for this run, not the showcase
server's key.

Output goes to `not_to_github/eval/<date>/openrouter-eval-<time>.md` and `.json`,
which git ignores. The JSON is rewritten after every call, so a run that stops
part-way keeps what it already paid for. The key is never written to either file.

## What runs

| Case | Stands for | Module |
|---|---|---|
| `fcp-gap` | FCP gap analysis | `gap-analysis` (AMLR) |
| `bwra` | BWRA | `business-wide-risk-assessment` |
| `hr-policy` | Policy drafting | `hr-policy` (remote work, Sweden) |
| `contract-review` | Contract review | `contract-review` (cloud contract against DORA Art. 30) |
| `board-summary` | Executive summary | `board-legal-summary` |
| `op-risk` | Risk assessment | `operational-risk` (RCSA) |
| `legal-memo` | Legal research memo | `legal-brief` (BNPL under Directive (EU) 2023/2225) |
| `variance` | Data-heavy | `budget-variance-analyzer` (an 18-line budget table) |
| `press-release` | Short task | `press-release` |
| `sv-dsar` | Swedish language | `gdpr-dsar-handler`, Swedish input and output |

Every organisation and person in the inputs is invented.

| Key | Model | Routing |
|---|---|---|
| `glm-eu` | `z-ai/glm-5.3-flash` | `provider: {"only":["inceptron","nextbit"],"allow_fallbacks":false,"zdr":true,"data_collection":"deny"}` (the showcase default) |
| `glm-default` | `z-ai/glm-5.3-flash` | OpenRouter's default routing |
| `ling-vl` | `inclusionai/ling-3.0-flash-vl` | OpenRouter's default routing, `max_tokens` capped at 32,768 |
| `reference` | any, via `--reference <id>` | default routing, no `reasoning` field |

With `--models glm-eu,reference --reference <id>` you can compare the showcase
default with a stronger model. Pass `--reference-price <in>,<out>` (USD per
million tokens) to include the reference model in the estimate and the budget
guard.

## Options that change what is sent

- `--effort low` (default) sends `reasoning: {effort: "low"}`. GLM's reasoning
  is mandatory and accepts only low/high/max, so other values are moved to the
  nearest one it accepts. `none` asks GLM for `low` and switches Ling's
  reasoning off (`{enabled: false}`). `auto` follows each module's default
  thinking level (quick → none, think → medium, deep_investigate → max, other
  levels → high).
- `--max-tokens 16384` (default). Reasoning counts against it. An answer cut
  off at the limit is flagged as "cut off". An answer with only reasoning and no
  text counts as an error.
- `--temperature 0.5` (default), the value ANTON sends compat models today.

## Spending

- `--max-usd` (default 2) stops the run once that much has been spent. Before
  each call the script also works out the call's worst case at list price
  (input plus the full `max_tokens`). If that would cross the cap, the call is
  not started.
- Spend is the `usage.cost` OpenRouter reports. When a streamed call reports
  none, the script prices its tokens at list price and marks the cost "(est.)".
- A 402 for the key's limit or credits stops the run. A 402 for the in-flight
  budget, a 429 or a 5xx is retried up to twice, after `Retry-After`.
- The dry-run estimate uses the list prices in the 2026-09-25 findings. The
  current promotional prices are lower. The full 30-call run is estimated at
  about $0.10 at low effort ($0.23 if every call used its full `max_tokens`).

## The judge

`--judge` grades each answer from 1 to 5 against the case's rubric plus three
generic criteria: format, no made-up facts, and the provenance section. The
judge does not see which model wrote the answer. It runs through ANTON's router
(`callChat`) on `--judge-model`, which defaults to `sdk:claude-opus-5-5`, this
machine's Claude Code login. There is no database here, so the Settings toggle
for the subscription engine cannot be read. The script sets
`SDK_ENGINE_ENABLED=true` for its own process unless you set it yourself. The
judge's grades are a first pass, not a replacement for reading the answers.

## What it does not cover

- One run per model and module. It shows fitness and cost, not variance between
  runs.
- Prompt layers that need the database are left out: knowledge packs,
  organisation context, goals and values, project and resume context, and
  memory atoms (which are off in demo mode anyway). On a server with knowledge
  packs installed, FCP prompts are somewhat longer than measured here.
- No web search, uploads or images. Those follow the compat adapter's rules,
  not this script's.

## Tests

`tests/scripts/openrouter-eval.test.ts` runs everything against a fake
OpenAI-compatible server and a mocked router. It makes no paid calls.
