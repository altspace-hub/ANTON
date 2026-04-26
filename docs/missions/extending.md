# Extending Missions

> How to define a new mission template. The pattern: declare the template in `seed-templates.ts`, ship the necessary Service Pack, document the use case.

---

## The 5-step pattern

### 1. Declare the template

Add to `server/services/missions/seed-templates.ts`:

```ts
const MY_NEW_MISSION_TEMPLATE: MissionTemplate = {
  id: 'tmpl_my_mission_v1',                    // tmpl_<slug>_v<n>
  name: 'My Mission',                           // Display name
  description: '<paragraph>',                   // For the catalogue UI
  pillar: 'work',                               // work / school / life / markets / etc.
  category: 'research',                         // For filtering
  version: '1.0.0',
  author: 'ANTON',
  parameters_schema: [
    { key: '<input-id>', label: '<Label>', type: 'string|textarea|select|number',
      required: true, help: '<help text>', /* options?, default? */ },
    // …
  ],
  task_graph_template: {
    tasks: [
      {
        local_id: 't1',
        title: 'First task',
        description: '<what the task does>',
        task_type: 'llm' | 'analysis' | 'browser' | 'checkpoint' | 'delegation',
        estimated_tokens: 4000,
        sort_order: 1,
        depends_on: [],
        prompt: '<the system prompt for this task>',
      },
      // … more tasks
    ],
  },
  default_data_scope: {},
  default_budget: {
    token_budget_max: 100_000,
    time_budget_max_seconds: 24 * 60 * 60,        // 1 day elapsed
    time_active_max_seconds: 30 * 60,              // 30 min active
  },
  default_autonomy_level: 'check_in' | 'confirm_each' | 'report_only',
  success_criteria_template: '<what defines success>',
  required_modules: [],                            // module ids the mission invokes
  // Stats — leave nullable for new templates
  times_used: 0,
  avg_completion_time_seconds: null,
  avg_quality_score: null,
  avg_token_consumption: null,
  is_builtin: true,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
```

Then register it in the exported template list at the bottom of `seed-templates.ts`.

### 2. Ship the Service Pack

If the mission needs external-system access, define a Service Pack ([`service-packs.md`](service-packs.md)):

- List required credential types
- List required capability descriptors
- Provide a config template

Without a Service Pack, the mission is limited to what built-in modules can do.

### 3. Confirm trust-phase compatibility

For each task the mission can take, decide:

- **Risk tier** — register actions with the new tier in `server/services/action-risk-registry.ts` if they're not already covered
- **Auto-execute eligibility** — at which Orchestrator phase the action becomes auto-executable
- **Mandatory checkpoints** — tasks that should ALWAYS pause regardless of phase (use `task_type='checkpoint'`)

Reference: [`/docs/architecture/21-orchestrator-trust-phases.md`](../architecture/21-orchestrator-trust-phases.md).

### 4. Write the use-case page

Replace the stub at `docs/missions/use-cases/<slug>.md` (or create new) with the full structure documented in [`knowledge-synthesis.md`](use-cases/knowledge-synthesis.md):

- What it does
- Who it's for
- The workflow (table)
- Inputs the user provides
- Outputs delivered
- Trust-phase compatibility
- Budget
- Success criteria
- Real example
- Where to look

### 5. Update [`README.md`](README.md)

In the **Use Case Library** table, move the row from "📋 Coming soon" to "✅ Seeded" and link to the use-case page.

---

## Anti-patterns

- **Don't bake credentials into the template.** Always reference vault entries; never inline tokens.
- **Don't skip checkpoints for medium/high-tier actions.** Even at Autonomous, a `task_type='checkpoint'` step provides defensible review.
- **Don't reuse a template id.** Bump `_v2` suffix for material changes; old missions in flight can finish on the v1 template.
- **Don't bypass `mission-budget.ts`.** All token + time consumption must flow through the budget enforcer so runaway missions auto-pause.

---

*Maintained alongside `seed-templates.ts`. Refresh when the `MissionTemplate` interface changes or new task types ship.*
