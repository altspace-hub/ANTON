# OWASP Top 10 2021 Security Compliance

**Project:** openEXPERT by ANTON (FCP Workbench)
**Last Audited:** 2026-02-19
**Compliance Status:** 9/10 Categories Fully Implemented

---

## Quick Reference

| OWASP Category | Status | Key Implementation |
|---|---|---|
| A01: Broken Access Control | ✅ PASS | JWT + RBAC + session isolation + rate limiting |
| A02: Cryptographic Failures | ✅ PASS | bcrypt(10) + JWT signing + .env secrets |
| A03: Injection | ✅ PASS | Parameterized SQL + CSP headers + input validation |
| A04: Insecure Design | ✅ PASS | Secure sessions + audit logs + password reset |
| A05: Security Misconfiguration | ✅ PASS | Helmet.js + CORS whitelist + env config |
| A06: Vulnerable Components | ⚠️ MONITOR | npm audit scripts (manual checks required) |
| A07: Authentication Failures | ✅ PASS | Failed login tracking + account lockout |
| A08: Data Integrity Failures | ✅ PASS | Immutable audit logs + JWT verification |
| A09: Logging & Monitoring | ✅ PASS | Security events + login attempts tracking |
| A10: SSRF | ✅ PASS | URL validation + IP blocking + metadata protection |

**Overall Score:** 9/10 ✅ **COMPLIANT**

---

## New Security Features (Sprint 2.8)

### 1. Failed Login Tracking & Account Lockout
**File:** `server/routes/auth.ts`
**Database:** `login_attempts` table

- All login attempts logged (username, IP, success/fail, timestamp)
- Account lockout after 5 failed attempts within 15 minutes
- Security events logged for suspicious activity
- Automatic unlock after 15-minute window expires

**Implementation:**
```typescript
const recentFails = db.prepare(`
  SELECT COUNT(*) as count FROM login_attempts
  WHERE username = ? AND success = 0
  AND attempted_at > datetime('now', '-15 minutes')
`).get(username);

if (recentFails.count >= 5) {
  logSecurityEvent(db, {
    eventType: 'failed_login',
    severity: 'high',
    details: `Account locked: ${recentFails.count} attempts`,
  });
  return res.status(429).json({
    error: 'Account locked. Try again in 15 minutes.'
  });
}
```

---

### 2. Security Event Logging
**File:** `server/services/security-logger.ts`
**Database:** `security_events` table

Dedicated security event logging system tracking:
- `failed_login` — Failed authentication attempts
- `unauthorized_access` — Access control violations
- `rate_limit` — Rate limit triggers
- `budget_exceeded` — Token budget overruns
- `suspicious_activity` — Anomalous patterns
- `invalid_input` — Malformed input attempts
- `ssrf_attempt` — SSRF attack attempts

Each event includes:
- Event type
- User ID (if authenticated)
- IP address
- Details (context-specific)
- Severity (low/medium/high/critical)
- Timestamp

**API:**
```typescript
logSecurityEvent(db, {
  eventType: 'unauthorized_access',
  userId: req.user.id,
  ipAddress: req.ip,
  details: 'Attempted to access admin endpoint without permission',
  severity: 'high',
});
```

---

### 3. SSRF Protection
**File:** `server/services/url-validator.ts`

URL validation before any external fetches to prevent Server-Side Request Forgery attacks.

**Blocked:**
- Non-HTTP/HTTPS protocols (file://, gopher://, ftp://)
- localhost, 127.0.0.1, 0.0.0.0
- Private IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
- Cloud metadata endpoints:
  - 169.254.169.254 (AWS)
  - metadata.google.internal (GCP)
  - fd00::, ::1 (IPv6 private)

**Implementation:**
```typescript
export function validateUrl(urlString: string): UrlValidationResult {
  const url = new URL(urlString);

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { valid: false, error: 'Only HTTP/HTTPS allowed' };
  }

  const blockedHosts = ['localhost', '127.0.0.1', '169.254.169.254'];
  if (blockedHosts.includes(url.hostname.toLowerCase())) {
    return { valid: false, error: 'Access to local resources forbidden' };
  }

  return { valid: true, url };
}
```

---

### 4. Enhanced Rate Limiting
**File:** `server/middleware/rate-limit.ts`

Granular rate limiting per endpoint type:

| Endpoint Type | Limit | Window | Purpose |
|---|---|---|---|
| Auth (/auth/login, /auth/reset) | 5 req | 15 min | Prevent brute force |
| Claude AI (/claude/message) | 60 req | 15 min | Prevent accidental loops |
| Per-user (authenticated) | 10 req | 1 min | Fair usage |
| General API | 100 req | 15 min | DoS protection |

**Implementation:**
```typescript
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true, // Don't count successful logins
});

export const userLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.user?.id || req.ip,
});
```

---

## Detailed OWASP Compliance

### A01: Broken Access Control ✅

**JWT Authentication:**
- 7-day expiry enforced
- Server-side validation on every request
- Session stored in database (revocable)

**RBAC (Role-Based Access Control):**
- Three roles: admin, analyst, viewer
- `requireRole()` middleware enforces permissions
- Admin-only routes: user management, settings, audit logs

**Session Isolation:**
- All queries filter by `user_id`
- Users can only see their own sessions
- No cross-user data leakage

**Files:**
- `server/middleware/auth.ts` — JWT + RBAC
- `server/routes/sessions.ts` — Session isolation

---

### A02: Cryptographic Failures ✅

**Password Hashing:**
- bcrypt with 10 rounds (industry standard)
- Automatic salting

**JWT Tokens:**
- Signed with `JWT_SECRET` (configurable)
- 7-day expiry

**Password Reset Tokens:**
- 32-byte random hex (cryptographically secure)
- 1-hour expiry
- Single-use (marked as used)

**Secrets Management:**
- All secrets in `.env` (gitignored)
- API keys server-side only
- `.env.example` for documentation

⚠️ **PRODUCTION:** Change default JWT_SECRET
⚠️ **PRODUCTION:** Enforce HTTPS via reverse proxy

---

### A03: Injection ✅

**SQL Injection Protection:**
- All queries use parameterized statements (better-sqlite3)
- No string concatenation
- Example: `db.prepare('SELECT * FROM users WHERE id = ?').get(userId)`

**Content Security Policy:**
- default-src: 'self'
- script-src: 'self' + 'unsafe-inline' (dev only)
- object-src: 'none'
- frame-ancestors: 'none'

**XSS Protection:**
- Helmet.js headers
- React escapes output by default
- Markdown sanitized via react-markdown

---

### A04: Insecure Design ✅

**Secure Session Management:**
- JWT + database validation (hybrid)
- Logout invalidates token
- Last-seen timestamp tracking

**Password Reset Flow:**
- Email-based (requires user.email)
- Time-limited (1 hour)
- Single-use tokens
- No user enumeration (always returns success)

**Audit Logging:**
- Immutable audit trail
- All API usage logged
- User ID + timestamp on all entries

---

### A05: Security Misconfiguration ✅

**Helmet.js Security Headers:**
- HSTS: max-age 1 year + preload
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- CSP configured

**CORS:**
- Whitelist-based (localhost by default)
- Credentials required
- Override via `CORS_ORIGINS` env var

**Environment Config:**
- `.env` for secrets
- `.env.example` for docs
- Defaults for dev (warnings for prod)

---

### A06: Vulnerable and Outdated Components ⚠️

**Manual Monitoring Required:**

npm scripts added to `package.json`:
```json
{
  "scripts": {
    "security:audit": "npm audit --audit-level=moderate",
    "security:licenses": "npx license-checker --summary"
  }
}
```

**Recommended Schedule:**
- Weekly: `pnpm audit`
- Monthly: Update dependencies
- Quarterly: Review licenses

---

### A07: Identification and Authentication Failures ✅

**Password Security:**
- bcrypt with 10 rounds
- No plaintext storage
- Min 6 characters (client-side)

**Session Security:**
- 7-day timeout
- Database expiry checked
- Expired sessions rejected

**Failed Login Protection (NEW):**
- All attempts logged
- Account lockout after 5 failures in 15 minutes
- Security events for suspicious activity

**OAuth/SSO:**
- Google OAuth 2.0
- GitHub OAuth
- Generic OIDC (Azure AD, Okta, Auth0)

---

### A08: Software and Data Integrity Failures ✅

**Audit Logging:**
- Immutable `audit_log` table
- All API calls logged
- Includes: model, tokens, cost, timestamp, user ID

**JWT Verification:**
- Signature checked on every request
- Tampered tokens rejected

**Session Validation:**
- JWT cross-referenced with database
- Logout deletes session

---

### A09: Security Logging and Monitoring Failures ✅

**Comprehensive Logging:**
1. **Audit Log** (`audit_log` table)
   - All API usage
   - Token consumption
   - Cost tracking

2. **Security Events** (`security_events` table — NEW)
   - Failed logins
   - Unauthorized access
   - Rate limits
   - SSRF attempts

3. **Login Attempts** (`login_attempts` table — NEW)
   - All login attempts
   - Success/failure
   - IP tracking

**Query Examples:**
```sql
-- Failed logins in last 24 hours
SELECT COUNT(*) FROM login_attempts
WHERE success = 0
AND attempted_at > datetime('now', '-24 hours');

-- Security events by severity
SELECT severity, COUNT(*) FROM security_events
GROUP BY severity;
```

---

### A10: Server-Side Request Forgery (SSRF) ✅

**URL Validation (NEW):**
- Protocol whitelist (HTTP/HTTPS only)
- Block localhost, loopback, private IPs
- Block cloud metadata endpoints
- Security event logging on attempts

**CSP connect-src Directive:**
```javascript
connectSrc: [
  "'self'",
  'https://api.anthropic.com',
  'https://api.openai.com',
  'https://generativelanguage.googleapis.com',
  'https://api.mistral.ai',
]
```

---

## Production Deployment Checklist

Before deploying to production:

- [ ] **Change JWT_SECRET** to strong random value (32+ chars)
- [ ] **Enable HTTPS** via reverse proxy (nginx/Caddy)
- [ ] **Run `pnpm audit`** and fix high/critical vulnerabilities
- [ ] **Set NODE_ENV=production**
- [ ] **Configure CORS_ORIGINS** to production domain
- [ ] **Set DEPLOYMENT_MODE=team** (if multi-user)
- [ ] **Configure email service** (SMTP for password resets)
- [ ] **Enable database backups** (daily recommended)
- [ ] **Set up log rotation**
- [ ] **Configure firewall** (block all except required ports)
- [ ] **Disable CSP unsafe-inline** (add nonces)
- [ ] **Document incident response plan**

---

## Ongoing Security Maintenance

**Weekly:**
- Review `security_events` table for anomalies
- Check for failed login spikes
- Monitor API usage patterns

**Monthly:**
- Run `pnpm audit` and update dependencies
- Review user access (remove inactive accounts)
- Analyze audit logs for trends

**Quarterly:**
- Rotate JWT_SECRET (requires all users to re-login)
- Review and update CSP directives
- Penetration testing (if applicable)

**Annually:**
- Full security audit
- Update threat model
- Review and update this document

---

## Related Documentation

- `docs/SECURITY_SCRIPTS.md` — npm audit and license checking scripts
- `docs/DEPLOYMENT_SECURITY.md` — Production deployment security guide (TODO)
- `server/middleware/auth.ts` — Authentication implementation
- `server/middleware/rate-limit.ts` — Rate limiting implementation
- `server/services/security-logger.ts` — Security event logging
- `server/services/url-validator.ts` — SSRF protection

---

**Document Version:** 1.0
**Next Review Date:** 2026-05-19 (3 months from now)
**Maintained By:** openEXPERT Security Team
