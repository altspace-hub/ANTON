# Claude Prompt Caching

## Overview

Claude API's prompt caching feature allows repeated system prompts to be cached server-side, reducing costs by 90% for cached tokens. The FCP Workbench prompt composer naturally segments prompts into static and dynamic layers, making it ideal for caching.

## How It Works

When using Claude models (Opus 4.6, Sonnet 4.5), the system automatically splits the system prompt into two blocks:

1. **Static block (cached)**: Foundation prompt + Area context + Module system prompt
   - These layers don't change between follow-up messages in the same session
   - Marked with `cache_control: { type: "ephemeral" }`
   - Cached by Anthropic for 5 minutes

2. **Dynamic block (not cached)**: User profile + Creativity settings + Output formats + Personas + Skills + Knowledge additions + Reference documents
   - Changes per request based on user selections
   - Not cached to ensure fresh, context-appropriate responses

## Cost Impact

### Without Caching
- System prompt: ~3,000-5,000 tokens per call
- Cost (Opus 4.6): 4,000 tokens × $15/1M = **$0.060** per call
- Cost (Sonnet 4.5): 4,000 tokens × $3/1M = **$0.012** per call

### With Caching (after first call)
- First call: Same cost (creates cache)
- Subsequent calls: 4,000 cached tokens × $1.50/1M (Opus) = **$0.006** per call (90% savings)
- Subsequent calls: 4,000 cached tokens × $0.30/1M (Sonnet) = **$0.0012** per call (90% savings)

### Real-World Savings

On a typical session with 10 follow-up messages:
- **Opus 4.6**: ~$0.54 saved per session
- **Sonnet 4.5**: ~$0.11 saved per session

On 100 sessions per month:
- **Opus 4.6**: ~$54/month saved
- **Sonnet 4.5**: ~$11/month saved

## Implementation Details

### Static vs Dynamic Layers

The prompt composer splits prompts as follows:

**Static (cacheable)**:
- Layer 2: Foundation prompt (identity, principles, quality standards)
- Layer 3: Area context (domain landscape, regulatory framework)
- Layer 4: Module system prompt (analytical framework)

**Dynamic (not cached)**:
- Layer 0: User profile (This Is Me personalisation)
- Layer 1: Creativity + Tone + Emoji settings
- Layer 5: Expert personas
- Layer 6: Skills attachments
- Layer 6b: Output format instructions
- Layer 7: Transparency, reasoning, structure reference
- Layer 8: Knowledge source system additions
- Layer 9: Reference documents (uploaded files, fetched URLs, local folders)

### Cache Lifetime

- **Type**: Ephemeral cache
- **Duration**: 5 minutes of inactivity
- **Behaviour**:
  - Cache persists across API calls within the same 5-minute window
  - After 5 minutes without a request, cache expires
  - Next request recreates the cache (first-call cost)

### Model Support

| Model | Supports Caching | Implementation |
|-------|-----------------|----------------|
| Claude Opus 4.6 | ✅ Yes | Automatic two-block split |
| Claude Sonnet 4.5 | ✅ Yes | Automatic two-block split |
| Claude Haiku 4.5 | ✅ Yes | Automatic two-block split |
| GPT-4o / GPT-4o Mini | ❌ No | Single-block prompt (no cache control) |
| Gemini 2.0 Flash | ❌ No | Single-block prompt (no cache control) |
| Mistral Large | ❌ No | Single-block prompt (no cache control) |

## Cache Metrics in the UI

The StatusIndicator component displays cache metrics when available:

```
┌────────────────────────────────────────────────┐
│  Tokens: 4.5k in · 2.1k out                   │
│  Cost: $0.08                                   │
│  ─────────────────────────────────────────     │
│  ⚡ Cached: 3.8k tokens (saved ~$0.05)        │
│  Cache created: 4.2k tokens                    │
│  (subsequent calls will be faster + cheaper)   │
└────────────────────────────────────────────────┘
```

- **Cached**: Tokens read from cache (90% discount applied)
- **Cache created**: Tokens written to cache on first call (subsequent calls benefit)

## API Response Fields

The Claude API returns cache metrics in the `usage` field:

```typescript
{
  "usage": {
    "input_tokens": 1500,              // New tokens (not cached)
    "cache_creation_input_tokens": 4000, // First call — cache created
    "cache_read_input_tokens": 4000,    // Subsequent calls — cache hit
    "output_tokens": 800
  }
}
```

## Audit Log

Cache metrics are stored in the audit log for cost analysis:

```sql
SELECT
  model,
  COUNT(*) as calls,
  SUM(cached_tokens) as total_cached,
  SUM(cache_creation_tokens) as total_created,
  SUM(estimated_cost_usd) as total_cost
FROM audit_log
WHERE model IN ('claude-opus-4-6', 'claude-sonnet-4-5-20250929')
  AND timestamp >= date('now', '-30 days')
GROUP BY model;
```

## Limitations

1. **Minimum cache size**: Cache blocks must be at least 1,024 tokens (our static layers easily meet this)
2. **Maximum breakpoints**: 4 cache breakpoints per request (we use 1)
3. **Model support**: Only Claude models support caching
4. **Cache expiry**: 5-minute TTL means low-frequency sessions don't benefit as much
5. **Dynamic content**: Frequently changing dynamic layers (e.g., switching output formats every turn) reduce cache efficiency

## Best Practices

### For Maximum Cache Benefit

1. **Minimise dynamic layer changes**: Once you've selected output formats, personas, and skills, keep them consistent across follow-up messages
2. **Group work sessions**: Complete related work within 5-minute windows to leverage cache
3. **Avoid unnecessary overrides**: Don't edit the system prompt mid-session unless required
4. **Use session continuation**: Follow-up messages in the same session share the cached static prompt

### Cache-Unfriendly Patterns

- Switching modules every message (different static prompts)
- Editing system prompt after every response (breaks static block)
- Changing output formats on every turn (modifies dynamic block, but doesn't break cache)
- Long breaks between messages (>5 minutes = cache expires)

## Monitoring Cache Performance

Check the audit log to see cache efficiency:

```typescript
// Example: Calculate cache hit rate
const stats = db.prepare(`
  SELECT
    COUNT(*) as total_calls,
    SUM(CASE WHEN cached_tokens > 0 THEN 1 ELSE 0 END) as cache_hits,
    SUM(CASE WHEN cache_creation_tokens > 0 THEN 1 ELSE 0 END) as cache_creates,
    AVG(cached_tokens) as avg_cached_per_call
  FROM audit_log
  WHERE model = 'claude-opus-4-6'
    AND timestamp >= date('now', '-7 days')
`).get();

console.log(`Cache hit rate: ${((stats.cache_hits / stats.total_calls) * 100).toFixed(1)}%`);
```

## Technical Implementation

### Code Locations

- **Prompt splitting**: `server/services/prompt-composer.ts` → `composeSystemPromptSplit()`
- **Cache control injection**: `server/services/claude-client.ts` → `streamToResponse()`
- **Response parsing**: `server/services/claude-client.ts` → usage event handling
- **Frontend display**: `src/components/shared/StatusIndicator.tsx`
- **State management**: `src/stores/useSessionStore.ts` → `lastCachedTokens`, `lastCacheCreationTokens`
- **Audit persistence**: `server/services/auditLogger.ts` → `writeAuditEntry()`

### Cache Control Format

```typescript
const systemBlocks = [
  {
    type: 'text',
    text: staticPrompt,
    cache_control: { type: 'ephemeral' }, // 👈 Cache this block
  },
  {
    type: 'text',
    text: dynamicPrompt,
    // No cache_control — this block changes per request
  },
];
```

## Future Enhancements

Potential improvements for cache optimization:

1. **Cache warming**: Pre-create caches for frequently used module combinations
2. **Cache analytics dashboard**: Visual cache hit rate trends, savings over time
3. **Smart cache suggestions**: Detect low cache efficiency and suggest workflow changes
4. **Multi-level caching**: Cache area context separately from module prompts for cross-module sessions

---

> **Note**: Prompt caching is **automatic** for Claude models. No configuration required. The system handles static/dynamic splitting transparently.
