# Production Deployment Security Guide

**Project:** openEXPERT by ANTON (FCP Workbench)
**Target Audience:** DevOps, System Administrators, Security Teams
**Last Updated:** 2026-02-19

This guide covers security best practices for deploying openEXPERT in production environments.

---

## Pre-Deployment Checklist

### 1. Environment Configuration

**Required Changes:**
```bash
# .env file
NODE_ENV=production
DEPLOYMENT_MODE=team  # If multi-user deployment
JWT_SECRET=<GENERATE_RANDOM_32_CHAR_STRING>  # CRITICAL
CORS_ORIGINS=https://yourdomain.com
```

**Generate Strong JWT Secret:**
```bash
# Linux/macOS
openssl rand -hex 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 2. HTTPS Configuration

**CRITICAL:** Never run in production without HTTPS.

#### Option A: nginx Reverse Proxy (Recommended)

```nginx
# /etc/nginx/sites-available/openexpert
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    # Strong SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

**Enable:**
```bash
sudo ln -s /etc/nginx/sites-available/openexpert /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### Option B: Caddy (Automatic HTTPS)

```Caddyfile
# Caddyfile
yourdomain.com {
    reverse_proxy localhost:3001

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
    }
}
```

**Run:**
```bash
caddy run --config Caddyfile
```

---

### 3. Database Security

**File Permissions:**
```bash
# Set restrictive permissions on database file
chmod 600 data/workbench.sqlite
chown www-data:www-data data/workbench.sqlite
```

**Backup Strategy:**
```bash
# Daily backup cron job
0 2 * * * /usr/bin/sqlite3 /path/to/workbench.sqlite ".backup /path/to/backups/workbench-$(date +\%Y\%m\%d).sqlite"
```

**Backup Rotation:**
```bash
# Keep last 30 days of backups
find /path/to/backups -name "workbench-*.sqlite" -mtime +30 -delete
```

---

### 4. Firewall Configuration

**Allow only required ports:**
```bash
# ufw (Ubuntu)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redirect to HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# firewalld (RHEL/CentOS)
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

**Block internal port 3001:**
Ensure port 3001 is only accessible via reverse proxy (localhost).

---

### 5. Dependency Security

**Pre-Deployment Audit:**
```bash
# Check for vulnerabilities
pnpm audit --audit-level=moderate

# Auto-fix if possible
pnpm audit --fix

# Generate report
pnpm run security:audit
```

**Pin Dependencies:**
```bash
# Use frozen lockfile in production
pnpm install --frozen-lockfile --prod
```

---

### 6. Content Security Policy

**Remove unsafe-inline (Production):**

Edit `server/index.ts`:
```typescript
// Generate nonces for inline scripts
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
        styleSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
        // ... rest of CSP
      },
    },
  })
);
```

Then use nonces in HTML:
```html
<script nonce="{{nonce}}">/* inline JS */</script>
<style nonce="{{nonce}}">/* inline CSS */</style>
```

---

### 7. Email Configuration

**For Password Resets:**

Create `server/services/email.ts` if not exists:
```typescript
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendPasswordResetEmail(
  to: string,
  token: string,
  baseUrl: string
) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: 'Password Reset Request',
    html: `
      <p>Click the link below to reset your password:</p>
      <a href="${baseUrl}/reset-password?token=${token}">
        Reset Password
      </a>
      <p>This link expires in 1 hour.</p>
    `,
  });
}
```

**.env Configuration:**
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="openEXPERT <noreply@yourdomain.com>"
```

---

### 8. Systemd Service (Linux)

**Create Service File:**
```bash
sudo nano /etc/systemd/system/openexpert.service
```

**Service Configuration:**
```ini
[Unit]
Description=openEXPERT by ANTON
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/openexpert
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node /var/www/openexpert/dist/server/index.js
Restart=on-failure
RestartSec=10

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/www/openexpert/data /var/www/openexpert/uploads

[Install]
WantedBy=multi-user.target
```

**Enable and Start:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable openexpert
sudo systemctl start openexpert
sudo systemctl status openexpert
```

**View Logs:**
```bash
sudo journalctl -u openexpert -f
```

---

### 9. Monitoring and Alerting

**Log Rotation:**
```bash
# /etc/logrotate.d/openexpert
/var/log/openexpert/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        systemctl reload openexpert
    endscript
}
```

**Security Event Monitoring:**

Query `security_events` table regularly:
```sql
-- Failed logins in last 24 hours
SELECT COUNT(*) as count, ip_address
FROM login_attempts
WHERE success = 0 AND attempted_at > datetime('now', '-24 hours')
GROUP BY ip_address
HAVING count > 3
ORDER BY count DESC;

-- Critical security events
SELECT * FROM security_events
WHERE severity = 'critical'
AND created_at > datetime('now', '-24 hours')
ORDER BY created_at DESC;
```

**Automated Alerts (Optional):**

Create script `/usr/local/bin/check-security-events.sh`:
```bash
#!/bin/bash
CRITICAL_COUNT=$(sqlite3 /var/www/openexpert/data/workbench.sqlite \
  "SELECT COUNT(*) FROM security_events WHERE severity='critical' \
   AND created_at > datetime('now', '-1 hour')")

if [ "$CRITICAL_COUNT" -gt 0 ]; then
  echo "ALERT: $CRITICAL_COUNT critical security events in last hour" | \
    mail -s "openEXPERT Security Alert" security@yourdomain.com
fi
```

**Cron Job:**
```bash
# Check every hour
0 * * * * /usr/local/bin/check-security-events.sh
```

---

### 10. Regular Maintenance Schedule

**Weekly:**
- [ ] Review `security_events` table
- [ ] Check for failed login spikes
- [ ] Run `pnpm audit`
- [ ] Review disk space (database + uploads)

**Monthly:**
- [ ] Update dependencies (`pnpm update`)
- [ ] Review user access (remove inactive accounts)
- [ ] Analyze audit logs for patterns
- [ ] Test backup restoration

**Quarterly:**
- [ ] Rotate JWT_SECRET (requires all users to re-login)
- [ ] Review CSP directives
- [ ] Update SSL certificates (if not using Let's Encrypt auto-renewal)
- [ ] Penetration testing

**Annually:**
- [ ] Full security audit
- [ ] Review and update incident response plan
- [ ] Update this documentation

---

## Incident Response

### Security Event Response Procedures

**1. Failed Login Spike**
- Check `login_attempts` table for IP patterns
- Block malicious IPs at firewall level
- Review `security_events` for related activity
- Notify affected users if accounts compromised

**2. Unauthorized Access Attempt**
- Check `security_events` for details
- Review audit logs for session activity
- Invalidate suspicious sessions
- Force password reset for affected accounts

**3. SSRF Attempt**
- Check `security_events` for target URLs
- Review application logs for exploitation attempts
- Update URL blocklist if needed
- Investigate source IP

**4. Rate Limit Triggers**
- Check if legitimate traffic or attack
- Adjust rate limits if false positive
- Block abusive IPs if attack
- Monitor for distributed attacks

---

## Security Contact

**Report security vulnerabilities:**
- Email: security@yourdomain.com
- PGP Key: [Link to public key]
- Expected response: 48 hours
- Public disclosure: 90 days after patch

---

## Compliance Standards

This deployment guide implements security controls for:
- **OWASP Top 10 2021** — See `docs/OWASP_COMPLIANCE.md`
- **GDPR** — Data minimization, encryption at rest
- **ISO 27001** — Access control, audit logging, incident management
- **SOC 2 Type II** — Security monitoring, change management

---

**Document Version:** 1.0
**Next Review:** 2026-05-19
**Maintained By:** openEXPERT Security Team
