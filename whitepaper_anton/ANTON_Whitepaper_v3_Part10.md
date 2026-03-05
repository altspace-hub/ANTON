# PART 10: SECURITY, PRIVACY & DEPLOYMENT

*Professional AI platforms handling regulated data must meet the same security standards as the institutions they serve. ANTON implements enterprise-grade security with multiple layers of protection — authentication, authorization, rate limiting, audit trails, sandboxing, and compliance enforcement — all designed to satisfy the expectations of CISOs, regulators, and internal audit teams in financial services and beyond.*

---

## §35. Security Architecture

ANTON's security architecture follows defence-in-depth principles, addressing the OWASP Top 10 vulnerabilities and implementing controls appropriate for deployment in regulated industries.

### Multi-User Authentication & Authorization

**Role-Based Access Control (RBAC):**

ANTON implements three principal roles, each with granular permissions across 24 capabilities:

**Admin** — Full platform access including user management, system settings, compliance rule configuration, budget controls, and all operational data. Admins can view audit logs across all users, override budget caps, and configure security policies.

**Analyst** — Module execution, session management, workflow creation, knowledge source access, and export capabilities. Analysts can create and share custom modules, build workflows, and access the intelligence dashboard. They cannot manage other users or modify system-level settings.

**User** — View-only or restricted module access. Users can execute pre-approved modules, view their own session history, and export their own outputs. They cannot create custom modules, build workflows, or access the intelligence dashboard without analyst-level access.

**Authentication mechanisms:**

*Local accounts:* Username and password authentication with bcrypt hashing (cost factor 12). Password complexity requirements enforced (minimum 12 characters, mixed case, numeric, special characters).

*OAuth/SSO:* Google and GitHub OAuth integration (optional, configurable). Enables single sign-on for organisations already using these identity providers.

*Enterprise SSO:* SAML 2.0 and OpenID Connect integration (planned) for corporate identity systems (Azure AD, Okta, Auth0).

**Session management:**

JWT tokens stored in secure, httpOnly cookies with SameSite=Strict policy. Token expiration is configurable (default: 24 hours). Auto-logout on inactivity (configurable, default: 2 hours). Session data stored in `users` and `user_sessions` tables with full audit trail.

---

### Brute Force Protection (OWASP A07)

**Implementation:** The `login_attempts` table tracks all authentication events — username, IP address, success/failure status, and timestamp.

**Logic:**

All login attempts (successful and failed) are recorded. After 5 failed attempts within a 15-minute window, the account is locked. Admin notification is triggered on suspicious activity patterns. Accounts auto-unlock after 30 minutes, or an administrator can manually unlock them. Each failed login generates a security event with severity level "medium."

---

### Rate Limiting (DDoS Protection)

**Per-IP limits:** API calls are capped at 100 requests per 15-minute window. Login attempts are limited to 10 per 15-minute window.

**Per-user limits:** Module executions are capped at 50 per hour. Export operations are limited to 20 per hour.

**Implementation:** Express-rate-limit middleware enforces these thresholds, with configurable limits per route. Redis-backed rate limiting is planned for distributed deployments. On violation, the server returns HTTP 429 (Too Many Requests), logs a security event, and applies a temporary 15-minute ban for the offending IP.

---

### Budget Management & Enforcement

**Per-user monthly quotas** are tracked in the `user_monthly_usage` table, recording user_id, month, token_count, estimated_cost_usd, and budget_cap.

**Enforcement thresholds:**

At 80% of budget: Warning notification sent to the user and admin. At 100% of budget: Further API calls are blocked until the next billing period or admin override. Admins can increase caps or grant temporary overrides for urgent work.

**Use cases:** Cost control for multi-user organisations, fair usage allocation across teams, and prevention of accidental runaway costs from long-running batch operations or deeply nested workflows.

---

### Security Event Logging (OWASP A09)

ANTON logs seven categories of security events, each with severity classification:

**Event types:**

`failed_login` — Failed authentication attempts (Medium severity). `unauthorized_access` — Access to forbidden resources or functions (High severity). `budget_exceeded` — Monthly quota violations (Medium severity). `rate_limit` — Rate limiting threshold hits (Medium severity). `suspicious_activity` — Anomalous behavioural patterns detected (High severity). `invalid_input` — Injection attempts or malformed input (Critical severity). `ssrf_attempt` — Server-side request forgery attempts (Critical severity).

**Severity framework:**

*Critical:* Immediate action required — SSRF attempts, SQL injection attempts, path traversal attacks. These indicate active exploitation attempts. *High:* Security concern requiring prompt review — unauthorised access to restricted resources, repeated failed authentication from unusual locations. *Medium:* Potential issues for monitoring — failed logins, rate limit hits, budget threshold notifications. *Low:* Informational — valid but unusual activity patterns, such as login from a new device or access at unusual hours.

All events are stored in the `security_events` table and accessible through the `AuditLogPage.tsx` dashboard, with filtering by event type, severity, user, and date range.

---

### Script Execution Sandboxing

When ANTON executes user-provided or AI-generated scripts (Python, bash, Node.js) through the Coding Area or workflow steps, strict sandboxing controls apply:

**Resource limits:** Memory is capped at 512 MB (configurable). Runtime is limited to 60 seconds (configurable). Network access is configurable per-script (allow or deny, default deny). Filesystem access is restricted to designated temporary directories. Environment variables are sanitised — scripts cannot access API keys, database credentials, or system secrets.

**Implementation:** Current: Node.js VM module for JavaScript scripts, Python subprocess with resource limits for Python scripts. Planned: Docker container isolation for full sandboxing with namespaced networking and filesystem.

**Violation events:** Scripts that exceed runtime limits trigger `script_timeout` events. Memory violations generate `script_memory_exceeded` events. Unauthorised network access attempts produce `script_network_blocked` events.

---

### Input Validation & Sanitisation

All user inputs are validated and sanitised before processing:

**File uploads:** Type whitelist enforcement (PDF, DOCX, XLSX, TXT, MD, CSV). Maximum file size: 50 MB (configurable). Files are scanned for type consistency (magic bytes verification, not just extension checking).

**URLs:** Scheme whitelist (HTTPS only). SSRF protection blocks private IP ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x, 127.x.x.x). Domain validation prevents redirect-based SSRF attacks.

**Database queries:** Parameterised queries only — no string concatenation in SQL. The External Data Integration framework (§30) enforces this at the architecture level.

**File paths:** Path traversal protection blocks `../` sequences and enforces absolute path resolution. All file operations use a chroot-style restriction to designated directories.

**OWASP Top 10 coverage:**

A01 (Broken Access Control) → RBAC enforcement on every route. A02 (Cryptographic Failures) → bcrypt password hashing, JWT tokens, HTTPS enforcement. A03 (Injection) → Parameterised SQL, input sanitisation, output encoding. A04 (Insecure Design) → Secure-by-default configuration, principle of least privilege. A05 (Security Misconfiguration) → Helmet middleware (CSP, HSTS, X-Frame-Options, X-Content-Type-Options). A06 (Vulnerable Components) → Regular dependency audits via `pnpm audit`. A07 (Authentication Failures) → Failed login tracking, account lockout, session management. A08 (Software/Data Integrity) → Integrity checks, version control, signed releases (planned). A09 (Logging Failures) → Comprehensive security event logging with retention policies. A10 (SSRF) → URL whitelist, private IP blocking, redirect chain validation.

---

### Audit Trail

Every action in ANTON is logged for accountability and reproducibility:

**Table:** `audit_log`

**Captured per session:** session_id, user_id, module_id, model used, thinking level, input tokens, output tokens, estimated cost, review_status, seed value (for reproducibility), timestamp.

**Retention:** Configurable (default: 2 years). Organisations can extend retention to meet regulatory requirements (some jurisdictions require 5-7 year audit trail retention).

**Export:** CSV and XLSX formats for regulators, internal audit teams, or external auditors. Filterable by user, module, date range, model, quality score, or review status.

**Use cases in practice:**

*Regulatory audit:* "Show me all gap analyses produced in Q1 2026, who reviewed them, and what thinking level was used." *Cost analysis:* "Which users consumed the most API budget this month, and on which modules?" *Quality analysis:* "What configuration settings (model, thinking level, knowledge sources) correlate with the highest quality scores?" *Reproducibility:* Re-run an exact session with the same seed value to verify that outputs are consistent — critical for regulated environments where reproducibility matters.

---

## §36. Privacy & Data Safety

### Local-First Architecture

ANTON's architecture ensures that data stays under the user's control. Here is exactly what stays local and what leaves your environment:

**What stays local (on your machine or server):**

All documents and uploaded files (stored in the filesystem `uploads/` directory). All session history, messages, and outputs (SQLite database). Knowledge graph entities, atoms, and relationships (SQLite). User profiles, preferences, and role assignments (SQLite). Audit logs and security events (SQLite). Workflow definitions, execution logs, and checkpoint decisions (SQLite). Compliance rules and violation records (SQLite). All custom modules, skills, and area configurations (filesystem).

**What leaves your environment:**

Prompts and messages sent to external LLM APIs (Claude, GPT, Mistral) when using cloud-hosted models. Web search queries (when web search is enabled as a knowledge source). URL fetching requests (when online reference links are configured).

**What never leaves your environment:**

No telemetry data. No analytics or tracking. No usage data sent to ANTON, FutureChain, or any third party. No "phone home" functionality of any kind.

**Result:** Complete data sovereignty. There is no ANTON cloud service collecting your data. The only external communication is the API calls you explicitly configure and control.

---

### LLM Provider Data Policies

When using external LLM providers, users should understand each provider's data handling:

**Anthropic Claude:** API requests are processed but not used for model training (per Anthropic's commercial API terms). Data retention policies apply per Anthropic's privacy policy. This is ANTON's recommended provider for professional work.

**OpenAI GPT:** API requests are not used for model training under commercial API terms. Review OpenAI's data usage policies for current details.

**Mistral:** API requests are processed but not used for training. EU-based provider (Paris headquarters), which may satisfy EU data residency requirements. Review Mistral's privacy policy for current details.

**Local Ollama:** Maximum privacy — nothing leaves your network. All inference runs on local hardware. Zero external API calls. This is the recommended configuration for maximum data sovereignty, GDPR Article 32 compliance, and air-gapped deployments.

**Recommendation:** For the strongest privacy posture (aligned with GDPR data minimisation principles), deploy ANTON with local Ollama models. For the best quality output with acceptable privacy (commercial API terms), use Anthropic Claude via API. The choice is yours — ANTON supports both ends of the spectrum and everything in between.

---

### GDPR Support

ANTON's architecture supports GDPR compliance across the relevant articles:

**Article 5 (Data minimisation):** Only data necessary for platform functionality is collected. No telemetry, analytics, tracking, or marketing data collection. Users provide only what they choose to provide.

**Article 15 (Right of access):** Users can export all their data — sessions, audit logs, profiles, knowledge graph entries — at any time. Export formats include CSV and XLSX for structured review.

**Article 17 (Right to erasure):** Users can delete individual sessions, entire profiles, or their complete account. Cascading deletes ensure that deleting a session removes all associated messages, knowledge atoms, and audit entries.

**Article 25 (Privacy by design):** Local-first architecture means data never transits through ANTON's infrastructure. Secure defaults are enforced (encryption, authentication, RBAC enabled out of the box). The platform is designed from the ground up with privacy as a structural principle, not a retrofit.

**Article 32 (Security of processing):** Encryption in transit (HTTPS for all API communication). Optional encryption at rest (encrypt the SQLite database file). Access controls via RBAC and authentication. Comprehensive audit logging.

---

### Multi-User Data Isolation

In multi-user deployments, ANTON enforces strict data isolation:

**Session isolation:** Each user's sessions are private and invisible to other users. Admins can view all sessions for audit purposes (logged as admin access). Permission checks are enforced on every session access — no session can be retrieved without authorisation.

**Project sharing:** Sessions can be explicitly added to shared projects. Project members see shared sessions; non-members cannot. Permissions are enforced at the project level — membership is required for access.

**Knowledge graph isolation (planned):** Per-user knowledge graphs for personal insights. Shared organisational knowledge graphs for team intelligence. Configurable scoping: private (user only), team (project members), or organisation (all users).

---

### Data Backup & Recovery

**Manual backup:**

```bash
cp data/workbench.sqlite data/backup-$(date +%Y%m%d).sqlite
```

**Automated backup (enterprise deployment):**

```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR=/backups/anton
mkdir -p $BACKUP_DIR

# Backup database
cp data/workbench.sqlite $BACKUP_DIR/workbench-$DATE.sqlite

# Backup uploads
tar -czf $BACKUP_DIR/uploads-$DATE.tar.gz uploads/

# Encrypt (optional)
gpg --encrypt --recipient admin@company.com $BACKUP_DIR/workbench-$DATE.sqlite

# Upload to cloud (optional)
aws s3 cp $BACKUP_DIR/ s3://company-backups/anton/ --recursive

# Retention: delete backups older than 90 days
find $BACKUP_DIR -name "*.sqlite" -mtime +90 -delete
```

**Schedule via cron:**

```bash
# Daily backup at 2 AM
0 2 * * * /usr/local/bin/backup-anton.sh
```

**Disaster recovery:** Restore from backup by replacing the SQLite database file. The database contains all data (sessions, users, workflows, knowledge graph, audit logs). The `uploads/` directory contains all uploaded documents and must be backed up separately.

---

## §37. Deployment Models

ANTON supports five deployment models, from a consultant's laptop to an air-gapped government network. Choose based on your user count, security requirements, and infrastructure capabilities.

### 1. Local Desktop (Default)

**Who:** Individual consultants, researchers, students, small teams.

**Setup:**

```bash
git clone https://github.com/futurechain/anton
cd anton
pnpm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env
pnpm run db:init
pnpm run dev
```

**Access:** `http://localhost:3000`

**Data location:** `./data/workbench.sqlite` and `./uploads/`

**Advantages:** Complete data control. No server infrastructure required. Free (except API costs). Up and running in 10-15 minutes.

**Limitations:** Effectively single-user (unless on a shared machine). No remote access (localhost only). No redundancy or automated backups by default.

---

### 2. Docker Container

**Who:** Technical users, IT teams wanting consistent reproducible deployment.

**Setup:**

```bash
docker compose up
```

**Docker Compose configuration:**

```yaml
version: '3.8'
services:
  anton:
    build: .
    ports:
      - "3000:3000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - DB_PATH=/data/workbench.sqlite
    volumes:
      - ./data:/data
      - ./uploads:/app/uploads
```

**Advantages:** Consistent environment across machines. Easy updates (pull new image, restart). Isolated from host system. Portable across any Docker-capable infrastructure.

**Limitations:** Requires Docker knowledge. Still local unless exposed via reverse proxy.

---

### 3. Server Deployment (Multi-User)

**Who:** Consulting firms, enterprise teams (10-100 users).

**Setup:**

```bash
# On server (Linux VM, cloud instance)
git clone https://github.com/futurechain/anton
cd anton
pnpm install
pnpm run db:init

# Production environment
NODE_ENV=production
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000

# Run with PM2 (process manager)
pm2 start "pnpm start" --name anton
pm2 save
pm2 startup
```

**Reverse proxy (Nginx):**

```nginx
server {
  listen 80;
  server_name anton.yourcompany.com;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
  }
}
```

**SSL:** Use Let's Encrypt for HTTPS (required for production deployments).

**Advantages:** Multi-user access with RBAC. Remote access via company network or VPN. Centralised data (easier backups, compliance). Shared knowledge graph across users.

**Limitations:** Requires server infrastructure. IT administration for setup, monitoring, and maintenance.

---

### 4. Cloud Deployment (Scalable)

**Who:** Large enterprises, organisations with 100+ users.

**AWS deployment:** EC2 instance for application, RDS PostgreSQL for database (replacing SQLite), S3 for document storage, ALB for load balancing, CloudWatch for monitoring.

**Azure deployment:** Azure App Service for application, Azure Database for PostgreSQL, Azure Blob Storage for documents, Azure Application Insights for monitoring.

**Google Cloud deployment:** Cloud Run for application (serverless scaling), Cloud SQL for PostgreSQL, Cloud Storage for documents, Cloud Monitoring.

**Advantages:** Highly scalable (1,000+ users). Built-in backups, redundancy, and disaster recovery. Global access with CDN and edge distribution.

**Limitations:** Data resides in cloud infrastructure (not fully local). Ongoing cloud costs. Requires cloud engineering expertise.

---

### 5. Air-Gapped Deployment (Maximum Security)

**Who:** Government agencies, defence organisations, highly regulated industries with data classification requirements.

**Setup:** Deploy on internal network with no internet access. Use local Ollama models (no external API calls). Disable web search and online reference link features. Use folder integration only (load regulation texts, policies, and reference documents from local filesystem).

**Advantages:** Complete data isolation — nothing enters or leaves the network. No dependency on external services. Satisfies the strictest data sovereignty and classification requirements.

**Limitations:** Cannot use Claude, GPT, or Mistral APIs (must use local Ollama models). No web search capability (knowledge limited to model training data plus local documents). Cannot fetch online reference links.

**Quality considerations:** Local models (Mistral 7B, Llama 3.3) via Ollama produce good output for 70-80% of tasks. For the highest-stakes regulatory analysis, cloud-hosted Opus remains superior. The trade-off between quality and security is a deployment decision each organisation must make based on their risk appetite and classification requirements.

---

### Deployment Decision Matrix

| Need | Recommended Deployment |
|------|------------------------|
| Individual consultant | Local Desktop |
| Small team (2-5 users) | Docker on shared machine |
| Consulting firm (10-50 users) | Server Deployment |
| Large enterprise (100+ users) | Cloud Deployment |
| Regulated or classified environment | Air-Gapped with Ollama |

The deployment model is a configuration choice, not a feature limitation. All five deployments access the same 238 modules, the same workflow engine, the same Coding Area, the same intelligence capabilities. The only variable is which LLM providers are available and whether web search is enabled.

---

### Migration Between Deployments

ANTON's SQLite-based architecture makes migration between deployment models straightforward:

**Local → Server:** Copy the `data/workbench.sqlite` file and `uploads/` directory to the server. Update `.env` configuration. Start the server process.

**SQLite → PostgreSQL (planned):** Database migration scripts will convert the SQLite database to PostgreSQL schema, preserving all data. This enables the cloud deployment model with connection pooling, replication, and enterprise database management.

**Any → Air-Gapped:** Export all data and dependencies. Package as a self-contained deployment bundle. Import on the air-gapped network. Configure Ollama models. Disable all external connectivity features.

The key principle: your data is always portable. No lock-in to any deployment model, cloud provider, or infrastructure choice.
