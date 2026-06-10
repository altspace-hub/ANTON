# Running ANTON on Cost-Effective Models

ANTON defaults to Anthropic Claude, but it does **not** require it. This guide
shows three budget paths — a cheap cloud API, a free local model, and
aggregator endpoints — and is honest about what works at full strength and
what degrades.

**The one rule that makes everything below work:** pick your model in
**Settings → General → Default model** (or the **Cost-effective mode** card in
the same tab). That choice is persisted server-side and governs the whole
product — module runs, missions, specialized agents, the Transform Panel
extractor and the specialty routes — not just the current session.

Precedence, highest first:

1. The model selected for an individual session/run (per-run override).
2. The Settings default-model choice (persisted in the database).
3. `DEFAULT_MODEL` in `.env`.
4. Provider key priority: Anthropic > Mistral > OpenAI > Google.

---

## Option 1 — Mistral (cheapest strong cloud API)

The strongest like-for-like stand-in for Claude. Roughly $0.10–$0.50 per
million input tokens depending on the model (vs $10+ for frontier Claude).

1. Create a key at <https://console.mistral.ai> (La Plateforme).
2. Paste it in **Settings → General → Additional AI Providers → Mistral**
   (persisted, survives restarts) — or set `MISTRAL_API_KEY` in `.env`.
3. In **Settings → General → Default model**, pick a Mistral chip:

| Model | Good for | Context |
|---|---|---|
| `mistral-medium-latest` | Best price/quality daily driver | 128k |
| `mistral-large-latest` | Hardest analytical work | 256k |
| `mistral-small-latest` | High-volume cheap runs | 128k |
| `magistral-medium-latest` | Reasoning (auto-selected at investigate+ thinking) | 128k |
| `codestral-latest` | Code | 256k |

JSON mode and function tools are sent natively to Mistral, so structured
exports (Transform Panel) and tool-using flows work.

## Option 2 — Local Ollama (free, fully private)

Zero API cost; everything stays on your machine. Needs a decent GPU or
Apple-Silicon RAM for good quality.

1. Install from <https://ollama.com>, then pull a model:

   ```bash
   ollama pull qwen2.5:14b      # recommended minimum for ANTON's structured work
   # stronger, if your hardware allows:
   ollama pull qwen2.5:32b
   ollama pull llama3.3:70b
   ```

2. ANTON auto-detects Ollama at `http://localhost:11434` (override with
   `OLLAMA_BASE_URL`). Models appear in **Settings → Local & cost-effective
   models** and the model picker as `ollama:<name>`.
3. Set one as the default model (Settings chip or the Cost-effective mode card).

**Context caveat (important):** local models have small windows. ANTON now
reads the model's trained context length from Ollama and budgets knowledge
accordingly — a 32k model gets a ~16k knowledge budget instead of being
silently handed a ~900k prompt. Large folder/document workloads will be
rejected with a clear "context too large for ollama:… " message: trim sources
or pick a larger-context model. Raise `OLLAMA_NUM_CTX` in `.env` if your
hardware can hold a bigger KV cache. Models below ~14B parameters frequently
fail ANTON's structured-output extraction — 7B models are not recommended.

## Option 3 — OpenRouter / Groq / DeepSeek (aggregators & cheap APIs)

Any endpoint that speaks the OpenAI `/v1/chat/completions` wire format works
through **Settings → Local & cost-effective models** (custom endpoints).

1. Add an endpoint: slug (e.g. `openrouter`), base URL, API key, and a
   default model. Examples:

   | Provider | Base URL | Example model |
   |---|---|---|
   | OpenRouter | `https://openrouter.ai/api/v1` | `qwen/qwen-2.5-72b-instruct` |
   | Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
   | DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
   | Together | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
   | LM Studio (local) | `http://localhost:1234/v1` | whatever you loaded |

2. Models are addressed as `compat:<slug>:<model>`, e.g.
   `compat:deepseek:deepseek-chat`.
3. Set the endpoint's **context window** field if you know it — ANTON uses it
   to budget knowledge for `compat:` models (defaults to 32k when unset).
4. Pick the model as your default (the Cost-effective mode card shows one
   chip per configured endpoint).

`response_format` (JSON mode) and tools are passed through; if an endpoint
rejects them (minimal vLLM/llama.cpp configs), ANTON retries once without and
falls back to prompt-based JSON.

---

## What works, what degrades — the honest table

| Capability | On Mistral / Ollama / compat | Notes |
|---|---|---|
| Expert module runs (all 479+) | ✅ Works | Session model is used end-to-end |
| Missions | ✅ Works | Follows the default model / mission `model_strategy` |
| Specialized agents | ✅ Works | Follow the server-side default model |
| Transform Panel / structured exports | ✅ Works | Extractor routes to your provider's small model; JSON-mode + one retry. Quality drops below ~14B local models |
| Gap Wizard, Beehive, specialty routes | ✅ Works | All resolve through the default model |
| Web search grounding | ⚠️ Degrades | Claude uses its native web_search tool. Other providers need `BING_SEARCH_API_KEY` in `.env`; without it, web-search runs are ungrounded |
| Pathfinder research | ⚠️ Basic support | Non-Claude support is improving; Claude recommended for deep mode |
| Vision / image input | ❌ Claude-only | Images are not mapped for non-Claude providers yet |
| IRE (iterative reasoning engine) | ❌ Claude-only | The deep_investigate multi-pass engine requires Claude |
| Prompt caching | ❌ Claude-only | Cost optimisation, not a feature loss |

## Recommended cheap setups

- **Best quality per euro:** Mistral key + `mistral-medium-latest` default +
  `BING_SEARCH_API_KEY` for grounded research.
- **Zero cost / maximum privacy:** Ollama + `qwen2.5:14b` (or 32b). Keep
  knowledge sources small; expect occasional extraction retries.
- **Maximum flexibility:** OpenRouter endpoint — switch between 200+ models by
  editing the default model id, one key.
