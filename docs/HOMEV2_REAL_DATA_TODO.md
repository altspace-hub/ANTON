# HomeV2 — placeholder data inventory & wiring plan

**Status (April 2026):** HomeV2 is the new default home (`/`). The old
Dashboard lives at `/home-v1` as a fallback during transition.

Three sections currently render with **mock / hardcoded data**. Everything
else is real. This doc is the source of truth for what to wire next.

---

## What's already real

| Section | Source |
|---|---|
| 5 KPI cards (Sessions, AI Responses, Output Tokens, This week, This month) | `fetchSessionStats()` → `GET /api/sessions/stats` |
| Continue Your Work | `fetchSessions({ hasOutput: true, limit: 4 })` |
| My Custom Modules | `fetchCustomModules()` → `GET /api/custom-modules` |
| Regulatory deadlines pill strip | `localStorage` (defaults baked in) |
| ROI banner numbers | Derived from real stats × heuristic (€100/hr, 1.5h/session) |
| Module catalog (grouped by area) + favourites | `MODULES` + `AREAS` constants; favourites in `localStorage` |
| Pathfinder quick search | Routes to `/pathfinder?q=…` (existing route handles it) |
| **Find the right module** intent chips | Routes to `/pathfinder?q=…` with prefixed query |

## What's placeholder (the four gaps)

### 1. Activity feed (right rail · "Activity" tab)
**Mock:** `ACTIVITY_FEED` const in `HomeV2.tsx` — 7 hardcoded items.

**Should pull from:**
- Recent sessions completed (`app_sessions` + `app_messages` for "session done" events)
- Pending checkpoints (`app_checkpoints` WHERE status='pending')
- New radar items (`radar_items` WHERE fetched_at > now()-24h AND relevance >= 0.65)
- KB updates (knowledge_packs, document_chunks reindex events)
- Workflow completions (`workflow_runs` WHERE status='success' AND completed_at > now()-24h)
- Mentions / collaboration (community-messaging events) — optional

### 2. Agent status — task cards (right rail · "Agent status" tab)
**Mock:** `AGENT_TASKS` const in `HomeV2.tsx` — 5 hardcoded tasks.

**Should pull from:**
- Live workflow runs — `workflow_runs WHERE status IN ('running', 'pending')`
- Cron job state — Markets / Radar / School / Companion catch-up scheduled crons (need a `/api/cron/state` introspection endpoint)
- Orchestrator missions — `orchestrator-engine` service active mission list
- Computed counts: `running` (status=running), `monitoring` (cron-driven, status=success), `waiting` (checkpoints pending owner action)

### 3. Session resources (right rail · footer card on Agent tab)
**Mock:** Hardcoded `€0.41 · 12,850 · 2h 40m · 08:02`.

**Should pull from:**
- API spend: `audit_log` join (input_tokens × model.input_cost) + (output_tokens × model.output_cost), grouped by today
- Tokens out: SUM(`messages.output_tokens`) for sessions today
- Time saved: `n_sessions × avg_minutes_per_session` heuristic (or instrumented per-module estimates)
- Active since: MIN(`sessions.created_at`) for today

### 4. Editorial brief
**Mock:** Hardcoded "Two things need your attention before lunch — and the AMLR RTS is finalised."

**Should pull from:** an LLM-generated 1-paragraph synthesis of:
- Top pending checkpoints (severity-ordered)
- New high-relevance radar items (last 24h)
- Recent significant session outcomes
- Cached for ~5 min so we don't burn tokens on every page load

---

## Proposed implementation plan

### Phase 1 — Agent status (the easiest real win)

**New endpoint: `GET /api/agent/status`**

Returns:
```ts
{
  tasks: Array<{
    id: string;
    title: string;
    module: string;          // 'Pathfinder', 'Doc Creation', etc.
    progress: number;        // 0-100
    eta: string;             // '~1 min', 'hourly', 'live'
    state: 'running' | 'monitoring' | 'waiting';
    started_at: string;
    deep_link?: string;
  }>;
  counts: {
    running: number;
    monitoring: number;
    waiting: number;
  };
}
```

**Implementation:** ~60-line service `server/services/agent-status-service.ts` that:
1. Reads `workflow_runs` WHERE status IN ('running', 'pending') AND started_at > now()-1h — these are `running`
2. Reads cron-job registry from a new `cron_state` table (or in-memory snapshot from `node-cron`) — these are `monitoring`
3. Reads `app_checkpoints` WHERE status='pending' — these are `waiting`
4. Maps each to the task shape

**Frontend:** swap the `AGENT_TASKS` const for a `useEffect`-driven fetch with 30s refresh interval.

### Phase 2 — Session resources

**New endpoint: `GET /api/session/resources/today`**

Returns:
```ts
{
  api_spend_eur: number;     // 0.41
  tokens_out: number;        // 12850
  tokens_in: number;
  time_saved_minutes: number; // 160 → "2h 40m"
  active_since: string;      // ISO
}
```

**Implementation:** small service that reads `audit_log` + `messages` + uses a model-cost lookup table. ~40 lines.

**Frontend:** small read-once on mount; refresh every 60s.

### Phase 3 — Activity feed

**New endpoint: `GET /api/activity?limit=20&filter=all|mentions|reviews|radar`**

Returns:
```ts
{
  items: Array<{
    id: string;
    when: string;            // ISO
    title: string;
    sub: string;
    icon_kind: 'shield' | 'compass' | 'users' | 'radar' | 'sparkles' | 'check' | 'book';
    tone: 'accent' | 'gold' | 'red' | 'green' | 'blue';
    deep_link?: string;
    filter: 'mentions' | 'reviews' | 'radar' | 'system';
  }>;
}
```

**Implementation:** ~80-line aggregator service that runs 5 small queries in parallel and merges results. Cached for 30s.

**Frontend:** swap `ACTIVITY_FEED` const for a fetch + filter chip drives the `?filter=` param.

### Phase 4 — Editorial brief

**New endpoint: `GET /api/brief/today`**

Returns:
```ts
{
  headline: string;          // 1 line, ~14 words
  body: string;              // 2-3 sentences
  generated_at: string;
  source_summary: { checkpoints: number; radar: number; sessions: number };
}
```

**Implementation:** Haiku call with structured-JSON output. Inputs: top 5 pending checkpoints + top 5 new radar items + 3 most recent assistant outputs. Cache key = hash of inputs; TTL 5 min.

Per-render cost ~€0.001. Cached so repeat loads are free.

**Frontend:** swap the static text for a fetch + skeleton loader. If endpoint fails, fall back to a generic "Welcome back" line.

---

## Order to ship

1. **Agent status** — most visible "is the system actually doing anything?" signal
2. **Session resources** — small, satisfies "where's my money going?"
3. **Activity feed** — biggest visual win but most plumbing
4. **Editorial brief** — last; needs prompt design + cache layer

Each is independent; can ship in any order. None require new tables for v1
(everything reads from existing tables — workflow_runs, app_checkpoints,
radar_items, audit_log, messages, app_sessions).

---

## Files to touch when wiring

| Phase | Frontend | Backend |
|---|---|---|
| Agent status | `src/pages/HomeV2.tsx` (swap `AGENT_TASKS` const for fetch) | `server/services/agent-status-service.ts` (new), `server/routes/agent-status.ts` (new), wire in `server/index.ts` |
| Session resources | `src/pages/HomeV2.tsx` (swap hardcoded values) | `server/services/session-resources-service.ts` (new), `server/routes/session-resources.ts` (new) |
| Activity feed | `src/pages/HomeV2.tsx` (swap `ACTIVITY_FEED` const + wire filter chips to API) | `server/services/activity-aggregator.ts` (new) |
| Editorial brief | `src/pages/HomeV2.tsx` (swap static text + add skeleton loader) | `server/services/today-brief-service.ts` (new) |

---

## Notes / decisions made

- Right-rail collapse handle: at the **bottom** (matches left-nav convention)
- Right rail: 380 px expanded / 40 px collapsed, persisted to `localStorage` (`anton-home-v2-rail-collapsed`)
- Editorial brief is OK to be hardcoded for v1 — it's at-a-glance content, not action-driving
- The Agent status `monitoring` state needs a cron-introspection mechanism that doesn't exist yet — could be an in-memory snapshot updated by each cron's start/end, or a new `cron_state` table updated on each cron tick
