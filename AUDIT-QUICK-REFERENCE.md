# Audit System Quick Reference

## Import Helpers

```typescript
import {
  writeAuditEntry,      // AI usage
  logSecurityEvent,     // Security incidents
  logLoginAttempt,      // Authentication
  logAuditEvent,        // General audit
} from '../services/auditLogger.js';
```

## Common Patterns

### 1. Log AI Model Usage (Already Done in Claude Route)

```typescript
writeAuditEntry(db, {
  sessionId: 'session-123',
  moduleId: 'gap-analysis',
  model: 'claude-opus-4-6',
  inputTokenCount: 5000,
  outputTokenCount: 10000,
  estimatedCostUsd: 0.25,
  userId: req.user?.id,
});
```

### 2. Log Session Operations

```typescript
// Create
logAuditEvent(db, {
  user_id: req.user?.id,
  action: 'session_created',
  resource_type: 'session',
  resource_id: sessionId,
  new_value: JSON.stringify({ module_id, title }),
  ip_address: req.ip,
  user_agent: req.headers['user-agent'],
});

// Delete
logAuditEvent(db, {
  user_id: req.user?.id,
  action: 'session_deleted',
  resource_type: 'session',
  resource_id: sessionId,
  ip_address: req.ip,
  user_agent: req.headers['user-agent'],
});
```

### 3. Log Login Attempts

```typescript
// Success
logLoginAttempt(db, {
  username: 'admin',
  user_id: user.id,
  ip_address: req.ip,
  user_agent: req.headers['user-agent'],
  success: true,
});

// Failure
logLoginAttempt(db, {
  username: 'hacker',
  ip_address: req.ip,
  user_agent: req.headers['user-agent'],
  success: false,
  failure_reason: 'Invalid credentials',
});
```

### 4. Log Security Events

```typescript
// Budget exceeded
logSecurityEvent(db, {
  event_type: 'budget_exceeded',
  user_id: userId,
  details: `Monthly limit of $${limit} exceeded`,
  severity: 'high',
});

// Unauthorized access
logSecurityEvent(db, {
  event_type: 'unauthorized_access',
  user_id: userId,
  ip_address: req.ip,
  details: `Attempted to access ${req.path}`,
  severity: 'medium',
});

// Rate limit
logSecurityEvent(db, {
  event_type: 'rate_limit',
  ip_address: req.ip,
  details: 'Exceeded 100 requests/minute',
  severity: 'low',
});
```

## API Endpoints

### Query Audit Log
```bash
# Basic
GET /api/audit/events

# With filters
GET /api/audit/events?moduleId=gap-analysis&limit=50&offset=0

# Date range
GET /api/audit/events?startDate=2026-02-01&endDate=2026-02-21

# Sort
GET /api/audit/events?sortBy=estimated_cost_usd&sortOrder=DESC
```

### Statistics
```bash
GET /api/audit/stats              # Overall
GET /api/audit/stats/models       # By model
GET /api/audit/stats/modules      # By module
GET /api/audit/stats/users        # By user
GET /api/audit/stats/costs        # Cost trends
```

### Export
```bash
GET /api/audit/export?startDate=2026-02-01&endDate=2026-02-21
```

### Security
```bash
GET /api/audit/security           # List events
POST /api/audit/security          # Log event
GET /api/audit/login-attempts     # List attempts
POST /api/audit/login-attempts    # Log attempt
```

## Security Event Types

- `failed_login`
- `unauthorized_access`
- `budget_exceeded`
- `rate_limit`
- `suspicious_activity`
- `invalid_input`
- `ssrf_attempt`
- `xss_attempt`
- `sql_injection`
- `privilege_escalation`

## Severity Levels

- `low` - Info, warnings
- `medium` - Failed operations
- `high` - Security violations
- `critical` - System compromise

## Filter Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `sessionId` | string | Filter by session |
| `moduleId` | string | Filter by module |
| `areaId` | string | Filter by area |
| `userId` | string | Filter by user |
| `model` | string | Filter by model |
| `reviewStatus` | string | draft/reviewed/approved |
| `startDate` | ISO date | Start of range |
| `endDate` | ISO date | End of range |
| `searchText` | string | Search query |
| `limit` | number | Results per page (default: 50) |
| `offset` | number | Skip N results (default: 0) |
| `sortBy` | string | Column to sort |
| `sortOrder` | ASC/DESC | Sort direction |

## Review Status Workflow

1. **draft** - Initial state (auto)
2. **reviewed** - Compliance reviewed
3. **approved** - Final approval

```typescript
// Update review status
PATCH /api/audit/:id/review
Body: { status: 'reviewed', reviewedBy: 'user@example.com' }
```

## Cost Calculation

```typescript
const MODEL_PRICING = {
  'claude-opus-4-6': { input: 15, output: 75 },          // per 1M tokens
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
};

// Auto-calculated in writeAuditEntry()
const cost = (inputTokens / 1_000_000) * pricing.input +
             (outputTokens / 1_000_000) * pricing.output;
```

## Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `audit_log` | AI usage | model, tokens, cost, session_id |
| `security_events` | Security | event_type, severity, details |
| `login_attempts` | Auth | username, success, failure_reason |
| `api_requests` | API calls | endpoint, method, response_time_ms |

## Testing

```bash
# Build first
npm run build

# Run test script
node dist/test-audit.js

# Or with tsx
npx tsx test-audit.ts
```

## Common Queries

### Get today's usage
```sql
SELECT * FROM audit_log
WHERE timestamp >= date('now', 'start of day')
ORDER BY timestamp DESC;
```

### Failed logins by IP
```sql
SELECT ip_address, COUNT(*) as attempts
FROM login_attempts
WHERE success = 0 AND attempted_at > datetime('now', '-1 hour')
GROUP BY ip_address
HAVING attempts >= 5;
```

### Cost by module
```sql
SELECT module_id, SUM(estimated_cost_usd) as total_cost
FROM audit_log
WHERE timestamp >= date('now', '-30 days')
GROUP BY module_id
ORDER BY total_cost DESC;
```

### High severity security events
```sql
SELECT * FROM security_events
WHERE severity = 'high' AND resolved = 0
ORDER BY created_at DESC;
```

## Production Checklist

- [ ] Enable audit middleware in `server/index.ts`
- [ ] Add session logging in `server/routes/sessions.ts`
- [ ] Add auth logging in `server/routes/auth.ts`
- [ ] Test all endpoints
- [ ] Verify CSV export works
- [ ] Check dashboard displays correctly
- [ ] Monitor performance (indexes, query times)
- [ ] Set up alerting for high-severity events
- [ ] Document retention policy
- [ ] Schedule regular CSV exports
- [ ] Review budget tracking accuracy

## Support

For issues or questions:
1. Check `AUDIT-INTEGRATION-GUIDE.md` for detailed docs
2. Run test script to verify setup
3. Check console logs for errors
4. Verify database tables exist
5. Check API responses in browser DevTools
