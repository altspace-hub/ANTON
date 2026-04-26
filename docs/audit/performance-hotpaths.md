# Performance Hot-Paths

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** F.3 (candidate list — measure before optimising)

## 1. `SELECT *` patterns

Each one is a candidate for explicit column projection (smaller payload, less network).

```
server/services/agent-service.ts:75:    return await db.get<AgentProfile>('SELECT * FROM agent_profiles WHERE id = ?', id) ?? null;
server/services/agent-service.ts:79:    return await db.get<AgentProfile>('SELECT * FROM agent_profiles WHERE slug = ?', slug) ?? null;
server/services/agent-service.ts:87:    return await db.all<AgentProfile>(`SELECT * FROM agent_profiles ${where} ORDER BY routing_priority DESC, updated_at DESC LIMIT ?`, ...args);
server/services/agent-service.ts:147:    const conversation = await db.get('SELECT * FROM agent_conversations WHERE id = ?', id);
server/services/agent-service.ts:149:    const messages = await db.all('SELECT * FROM agent_messages WHERE conversation_id = ? ORDER BY created_at ASC', id);
server/services/agent-service.ts:154:    return await db.all('SELECT * FROM agent_conversations WHERE agent_id = ? ORDER BY updated_at DESC LIMIT ?', agentId, limit);
server/services/agent-service.ts:160:    return await db.all('SELECT * FROM agent_templates ORDER BY category, name');
server/services/agent-service.ts:164:    return await db.get('SELECT * FROM agent_templates WHERE id = ?', id) ?? null;
server/services/anton-bundler.ts:423:  const session = await db.get('SELECT * FROM code_review_sessions WHERE id = ?', sessionId) as any;
server/services/anton-bundler.ts:505:  const session = await db.get('SELECT * FROM sessions WHERE id = ?', sessionId) as any;
server/services/anton-bundler.ts:591:  const session = await db.get('SELECT * FROM sessions WHERE id = ?', sessionId) as any;
server/services/anton-bundler.ts:696:  const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', projectId) as any;
server/services/anton-bundler.ts:705:  const releases = await db.all('SELECT * FROM coding_releases WHERE coding_project_id = ? ORDER BY release_number ASC', projectId) as any[];
server/services/anton-bundler.ts:707:  const tasks = await db.all('SELECT * FROM coding_tasks WHERE coding_project_id = ? ORDER BY sort_order ASC', projectId) as any[];
server/services/anton-bundler.ts:709:  const techDebt = await db.all('SELECT * FROM coding_tech_debt WHERE coding_project_id = ? ORDER BY created_at ASC', projectId) as any[];
server/services/anton-bundler.ts:711:  const reviews = await db.all('SELECT * FROM coding_reviews WHERE coding_project_id = ? ORDER BY created_at ASC', projectId) as any[];
server/services/anton-bundler.ts:834:  const project = await db.get('SELECT * FROM instruction_builder_projects WHERE id = ?', projectId) as any;
server/services/anton-bundler.ts:843:  const instructionFiles = await db.all('SELECT * FROM instruction_files WHERE instruction_builder_project_id = ? ORDER BY file_type ASC, filename ASC', projectId) as any[];
server/services/anton-bundler.ts:847:    ? await db.get('SELECT * FROM tool_profiles WHERE id = ?', project.tool_profile_id)
server/services/anton-bundler.ts:848:    : await db.get('SELECT * FROM tool_profiles WHERE tool_name = ? AND is_default = 1', project.target_tool);
server/services/anton-bundler.ts:851:  const reviews = await db.all('SELECT * FROM coding_reviews WHERE coding_project_id = ? ORDER BY created_at ASC', project.coding_project_id || project.id) as any[];
server/services/anton-bundler.ts:1237:  const index = await db.get('SELECT * FROM market_indexes WHERE id = ?', indexId) as any;
server/services/anton-bundler.ts:1241:    'SELECT * FROM market_index_holdings WHERE index_id = ? AND removed_at IS NULL ORDER BY weight DESC', indexId
server/services/anton-bundler.ts:1244:    'SELECT * FROM market_index_nav_history WHERE index_id = ? ORDER BY nav_date DESC LIMIT 365', indexId
server/services/anton-bundler.ts:1247:    'SELECT * FROM market_index_rebalances WHERE index_id = ? ORDER BY executed_at DESC', indexId
```

## 2. `await` inside `for` / `forEach` (sequential where parallel might do)

A loop with `await` per iteration is sequential. If iterations are
independent, `Promise.all(...)` is faster.

```
server/services/adapters/azureOpenaiAdapter.ts:166:    for await (const chunk of stream) {
server/services/adapters/azureOpenaiAdapter.ts:296:      for await (const chunk of stream) {
server/services/adapters/azureOpenaiAdapter.ts:382:    for await (const chunk of stream) {
--
server/services/claude-client.ts:350:    for await (const event of stream) {
--
server/services/claude-client.ts:534:  for await (const event of stream as AsyncIterable<any>) {
--
server/services/iterative-reasoning.ts:292:  for await (const event of stream as AsyncIterable<any>) {
--
server/services/iterative-reasoning.ts:504:        for await (const event of stream as AsyncIterable<any>) {
--
server/services/model-adapter.ts:204:    for await (const event of stream) {
server/services/model-adapter.ts:311:    for await (const chunk of stream) {
server/services/model-adapter.ts:392:    for await (const chunk of stream.stream) {
server/services/model-adapter.ts:453:    for await (const chunk of streamResponse) {
--
server/services/provider-router.ts:358:  for await (const event of stream) {
--
server/services/unified-llm-client.ts:247:    for await (const chunk of adapter.sendStreamRequest(unifiedReq)) {
--
server/services/unified-llm-client.ts:442:    for await (const chunk of adapter.sendStreamRequest(unifiedReq)) {
```

## 3. Token-budget enforcement points

Every prompt path should respect a token ceiling — count where `MAX_CONTEXT_TOKENS`
or `tokenBudget` is consulted vs. where `messages.create` is called.

```
Token-budget references:
  count: 15

messages.create calls in services (vs. claude-client / adapters):
server/services/atom-extractor.ts
server/services/citation-verifier.ts
server/services/extend-device-service.ts
server/services/humanitarian-service.ts
server/services/insights-generator.ts
server/services/market-atom-service.ts
server/services/market-backtest-runner.ts
server/services/market-rci-service.ts
server/services/market-thesis-service.ts
server/services/market-workflow-orchestrator.ts
```

## 4. Largest source files (>500 lines, top 15)

Big files often hide hot paths.

```
 103112 total
   2108 server/services/anton-bundler.ts
   1657 server/services/market-workflow-orchestrator.ts
   1611 server/services/orchestrator-engine.ts
   1548 server/services/discovery-engine.ts
   1281 server/services/pathfinder-engine.ts
   1218 server/services/market-index-rebalance-service.ts
   1155 server/services/app-gateway.ts
   1101 server/services/skills-manager.ts
   1101 server/services/market-data-service.ts
   1041 server/services/regulatory-pack-service.ts
    927 server/services/coding-engine.ts
    866 server/services/grow-service.ts
    810 server/services/prompt-builder.ts
    787 server/services/coding-review-engine.ts
```

## What to do

- 🔴 **`SELECT *`** in hot paths → explicit columns.
- 🟡 **Sequential await** in independent iterations → `Promise.all`.
- 🟡 **Token-budget gaps** → ensure every LLM call goes through unified-llm-client (which honours the budget).
- 🟢 **Big files** → split candidates; cross-reference with `anti-patterns.md`.

## Cadence

Quarterly via `pnpm run anton:investigate -- --pattern performance`.
