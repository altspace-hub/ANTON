# Audit System Integration Guide

## Overview

The comprehensive audit backend has been expanded from minimal to production-grade. This guide shows how to integrate automatic audit logging into other routes.

## What's New

### Enhanced Files

1. **`server/routes/audit.ts`** - Expanded from 1.3KB to comprehensive implementation
   - Core audit endpoints (list, get, delete with filtering)
   - Statistics endpoints (models, modules, users, costs)
   - Export to CSV
   - Security events
   - Login attempts
   - Rate limiting for expensive queries

2. **`server/middleware/audit.ts`** - NEW
   - Automatic request logging
   - Rate limiting
   - IP address tracking
   - Response time monitoring

3. **`server/services/auditLogger.ts`** - Enhanced
   - `logSecurityEvent()` - Log security incidents
   - `logLoginAttempt()` - Track authentication
   - `logAuditEvent()` - General audit trail
   - Cost calculation helpers

## Integration Steps

### Step 1: Enable Audit Middleware (Optional)

Add to `server/index.ts` after line 137 (after `app.use(express.json(...))`)

```typescript
import { createAuditMiddleware } from './middleware/audit.js';

// Add after line 140 (after db initialization)
app.use(createAuditMiddleware(db)); // Logs all API requests
```

This will automatically log:
- All API requests
- Response times
- Status codes
- Request/response sizes
- IP addresses
- User agents

### Step 2: Add Audit Logging to Routes

#### Example: Sessions Route

Add to `server/routes/sessions.ts`:

```typescript
import { logAuditEvent } from '../services/auditLogger.js';

// After session creation
router.post('/sessions', (req, res) => {
  // ... existing code ...

  // Log the creation
  logAuditEvent(db, {
    user_id: req.user?.id,
    action: 'session_created',
    resource_type: 'session',
    resource_id: sessionId,
    new_value: JSON.stringify({ module_id: moduleId, title }),
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  });

  res.json({ id: sessionId });
});

// After session deletion
router.delete('/sessions/:id', (req, res) => {
  // ... existing code ...

  logAuditEvent(db, {
    user_id: req.user?.id,
    action: 'session_deleted',
    resource_type: 'session',
    resource_id: req.params.id,
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
  });

  res.json({ success: true });
});
```

#### Example: Auth Route

Add to `server/routes/auth.ts`:

```typescript
import { logLoginAttempt, logSecurityEvent } from '../services/auditLogger.js';

// Login endpoint
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  // ... authentication logic ...

  if (isValid) {
    // Log successful login
    logLoginAttempt(db, {
      username,
      user_id: user.id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      success: true,
    });

    res.json({ token, user });
  } else {
    // Log failed login
    logLoginAttempt(db, {
      username,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      success: false,
      failure_reason: 'Invalid credentials',
    });

    // Log security event if too many failures
    const recentFailures = db.prepare(
      'SELECT COUNT(*) as c FROM login_attempts WHERE username = ? AND success = 0 AND attempted_at > datetime("now", "-15 minutes")'
    ).get(username);

    if (recentFailures.c >= 5) {
      logSecurityEvent(db, {
        event_type: 'suspicious_activity',
        user_id: null,
        ip_address: req.ip,
        details: `5+ failed login attempts for ${username}`,
        severity: 'high',
      });
    }

    res.status(401).json({ error: 'Invalid credentials' });
  }
});
```

#### Example: Claude Route

The Claude route already logs to `audit_log` via `writeAuditEntry()`. No changes needed.

### Step 3: Use Existing Helper Functions

Import these helpers in any route:

```typescript
import {
  writeAuditEntry,        // AI model usage (already implemented)
  logSecurityEvent,       // Security incidents
  logLoginAttempt,        // Authentication attempts
  logAuditEvent,          // General audit trail
} from '../services/auditLogger.js';
```

## Available Endpoints

### Core Audit
- `GET /api/audit/events` - List with filters (pagination, date range, module, etc.)
- `GET /api/audit/events/:id` - Get specific event
- `DELETE /api/audit/events/:id` - Delete event (admin only)
- `PATCH /api/audit/:id/review` - Update review status

### Statistics
- `GET /api/audit/stats` - Overall stats
- `GET /api/audit/stats/models` - Usage by model
- `GET /api/audit/stats/modules` - Usage by module
- `GET /api/audit/stats/users` - Usage by user
- `GET /api/audit/stats/costs` - Cost trends

### Export
- `GET /api/audit/export` - Export to CSV

### Security
- `GET /api/audit/security` - Security events
- `POST /api/audit/security` - Log security event
- `GET /api/audit/login-attempts` - Login attempts
- `POST /api/audit/login-attempts` - Log login attempt

### Legacy (Backward Compatible)
- `GET /api/audit` - Legacy endpoint (still works)
- `GET /api/audit/stats` - Legacy stats

## Filter Examples

### Date Range
```bash
GET /api/audit/events?startDate=2026-02-01&endDate=2026-02-21
```

### Module Filter
```bash
GET /api/audit/events?moduleId=gap-analysis
```

### Pagination
```bash
GET /api/audit/events?limit=25&offset=50
```

### Sort Order
```bash
GET /api/audit/events?sortBy=estimated_cost_usd&sortOrder=DESC
```

### Combined
```bash
GET /api/audit/events?moduleId=gap-analysis&startDate=2026-02-01&limit=100&sortBy=timestamp&sortOrder=DESC
```

## Testing

Run the test script:

```bash
npm run build
node dist/test-audit.js
```

Or with tsx:

```bash
npx tsx test-audit.ts
```

This will:
1. Create 10 test audit entries
2. Test filtering (module, date, session)
3. Test statistics
4. Create security events
5. Create login attempts
6. Test pagination
7. Test review status updates
8. Test advanced analytics
9. Verify CSV export format

## Security Events Types

Available security event types (from `schema_enhanced.sql`):
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

## Best Practices

### 1. Log Everything Important
```typescript
// Session lifecycle
logAuditEvent(db, { action: 'session_created', ... });
logAuditEvent(db, { action: 'session_updated', ... });
logAuditEvent(db, { action: 'session_deleted', ... });

// Exports
logAuditEvent(db, { action: 'export_created', resource_type: 'docx', ... });

// Configuration changes
logAuditEvent(db, {
  action: 'config_updated',
  resource_type: 'module_config',
  old_value: JSON.stringify(oldConfig),
  new_value: JSON.stringify(newConfig),
});
```

### 2. Always Log Security Events
```typescript
// Budget exceeded
logSecurityEvent(db, {
  event_type: 'budget_exceeded',
  user_id: userId,
  details: `Monthly budget of $${limit} exceeded`,
  severity: 'high',
});

// Unauthorized access
logSecurityEvent(db, {
  event_type: 'unauthorized_access',
  user_id: userId,
  ip_address: req.ip,
  details: `Attempted to access ${req.path} without permission`,
  severity: 'medium',
});
```

### 3. Track Login Attempts
```typescript
// Always log both success and failure
logLoginAttempt(db, {
  username,
  user_id: user?.id,
  ip_address: req.ip,
  user_agent: req.headers['user-agent'],
  success: isValid,
  failure_reason: isValid ? null : 'Invalid password',
});
```

### 4. Use Proper Error Handling
```typescript
try {
  // ... operation ...
  logAuditEvent(db, { action: 'operation_completed', success: true });
} catch (error) {
  logAuditEvent(db, {
    action: 'operation_failed',
    success: false,
    error_message: String(error),
  });
  throw error;
}
```

## Database Tables

The audit system uses these tables:

1. **`audit_log`** (from `server/db/init.ts`) - AI model usage
   - Full AI interaction tracking
   - Token counts, costs, models
   - Review status workflow

2. **`security_events`** (from `schema_enhanced.sql`) - Security incidents
   - Failed logins, unauthorized access
   - Budget violations, rate limits
   - Severity levels

3. **`login_attempts`** (from `schema_enhanced.sql`) - Authentication
   - All login attempts (success/failure)
   - IP tracking, user agents
   - Failure reasons

4. **`api_requests`** (from `schema_enhanced.sql`) - API calls
   - Automatic via middleware
   - Response times, status codes
   - Request/response sizes

## Performance Notes

1. **Indexes** - All audit tables have proper indexes for fast queries
2. **Pagination** - Always use `limit` and `offset` for large datasets
3. **Date Filters** - Use indexed `timestamp`/`created_at` columns
4. **Rate Limiting** - Expensive statistics queries should use rate limiting

## CSV Export Format

The export includes these columns:
- Timestamp
- Session ID
- Module
- Area
- Model
- Provider
- Thinking Level
- Creativity
- Writing Tone
- Input Tokens
- Output Tokens
- Cached Tokens
- Estimated Cost (USD)
- Response Status
- Review Status
- Reviewed By
- Reviewed At

## Next Steps

1. **Enable middleware** - Add `createAuditMiddleware(db)` to `server/index.ts`
2. **Add session logging** - Update `server/routes/sessions.ts`
3. **Add auth logging** - Update `server/routes/auth.ts`
4. **Test everything** - Run `node dist/test-audit.js`
5. **Monitor in UI** - Check `http://localhost:5173/audit`

## Troubleshooting

### "audit_log table does not exist"
- Run `npm run db:init` to initialize tables
- Check that `server/db/init.ts` creates the table

### "Cannot read property 'id' of undefined"
- User object might not be set by auth middleware
- Use `req.user?.id || null` for optional user ID

### "Too many requests"
- Rate limiter triggered
- Check response headers for `Retry-After`
- Adjust limits in `server/middleware/audit.ts`

### CSV export fails
- Check that audit_log has data
- Verify date filters are valid
- Check file permissions in output directory

## Summary

The audit system is now production-ready with:
- ✅ Comprehensive filtering and pagination
- ✅ Statistics and analytics endpoints
- ✅ CSV export for compliance
- ✅ Security event tracking
- ✅ Login attempt monitoring
- ✅ Automatic request logging (via middleware)
- ✅ Rate limiting for expensive queries
- ✅ Full TypeScript types
- ✅ Error handling and logging
- ✅ Test coverage

All endpoints are ready to use. The frontend (`AuditLogPage.tsx`) already supports the new functionality.
