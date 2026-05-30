# Building a Specialized Agent

> Two paths: through the Agent Hub UI (`/agents`) or programmatically via `agent-builder.ts`. Both produce the same `agent_profiles` row.

---

## Agent profile shape

```ts
interface AgentProfile {
  id: string;
  name: string;                   // 'Compliance Officer', 'Travel Planner', etc.
  system_prompt: string;          // The defining prompt — voice, role, behaviour
  default_model: string;          // 'claude-opus-4-8' / 'gpt-4o' / etc.
  capabilities: string[];         // 12-verb capability ids exposed
  connectors: string[];           // External systems this agent may call
  visibility: 'private' | 'team' | 'public-aap';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
```

The `system_prompt` is the most important field — it defines the agent's persona, its decision rules, its constraints. Per CLAUDE.md prompt-builder conventions, this is **Layer 3 module-equivalent** content: opinionated, specific, behavioural.

---

## Through the UI

`/agents` → "Create new agent". The wizard collects:

1. **Identity** — name, short description, avatar (optional)
2. **System prompt** — the persona + behavioural definition
3. **Model + thinking** — default model selection (cost-aware)
4. **Capabilities** — pick which 12-verb capabilities the agent exposes
5. **Connectors** — bind to existing Service Pack connectors (per [`connector-executor.md`](connector-executor.md))
6. **Visibility** — private (you only) / team / public-AAP (peer ANTONs can discover + invoke)
7. **Review + sign** — instance Ed25519 signature seals the profile; published to the local + (if public-AAP) registry

Total time to first agent: ~5 minutes for a simple persona.

---

## Programmatically

```ts
import { createAgentBuilder } from './services/agent-builder.js';

const builder = await createAgentBuilder(db);
const agent = await builder.create({
  name: 'FCP Researcher',
  system_prompt: `You are an FCP-domain research analyst...`,
  default_model: 'claude-opus-4-8',
  capabilities: ['search', 'render', 'submit'],
  connectors: ['roaring-entity', 'dowjones-screening'],
  visibility: 'team',
});
console.log(agent.id);
```

`builder.create()` validates the profile, signs it, persists it, and returns the row.

For bulk import (e.g. seeding agents from a `.anton skill-pack` bundle), use `builder.importBatch(profiles)`.

---

## What makes a good system prompt

The same rules as ANTON's Module system prompts apply:

- **Define the role specifically.** "You are a senior FCP analyst at a Nordic bank" beats "You are a helpful AI."
- **Describe the decision rules.** "Always cite the AMLR article when invoked" not "Be accurate."
- **Constrain the output shape.** "Respond as a 3-paragraph briefing with sources at the end" not "Reply in a useful way."
- **Specify what the agent will NOT do.** "Never recommend a specific vendor; surface comparison criteria instead."
- **Mention the audience.** "The user is a regulator preparing an inspection."

The agent's `system_prompt` is concatenated into the prompt builder's Layer 3 slot when the agent is invoked.

---

## Editing + versioning

Agents are mutable — owners can edit `system_prompt`, swap `default_model`, add/remove capabilities. Each edit:

1. Bumps `updated_at`.
2. Re-signs the descriptor.
3. Invalidates the descriptor cache on peer instances (they'll refetch on next AAP discovery).

For high-stakes agents (especially `public-aap` ones), record material changes in a CHANGELOG section of `metadata.changelog` so peers can see version history.

---

## Where to look

- **Code:** `server/services/agent-builder.ts`, `agent-service.ts`
- **UI:** `src/pages/agents/AgentHubPage.tsx`
- **Schema:** migration 111 (`agent_profiles`, `agent_capabilities`, `agent_connectors`)
