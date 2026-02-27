## PART 7: SECURITY, PRIVACY & DEPLOYMENT

## 23. Security Architecture

openEXPERT implements **enterprise-grade security** with multiple layers of protection.

### Multi-User Authentication & Authorization

**RBAC (Role-Based Access Control):**

**Three roles:**
1. **Admin** — Full access (user management, system settings, all data)
2. **Analyst** — Module execution, session access, limited admin functions
3. **User** — View-only or restricted module access

**Authentication:**
- **Local accounts:** Username/password (bcrypt hashing)
- **OAuth/SSO:** Google, GitHub OAuth (optional)
- **Enterprise SSO:** SAML/OIDC integration (planned)

**Session management:**
- JWT tokens (secure, httpOnly cookies)
- Token expiration (configurable, default 24 hours)
- Auto-logout on inactivity

**Table:** `users`, `user_sessions`

---

### Failed Login Tracking (OWASP A07)

**Purpose:** Detect brute force attacks

**Implementation:**
- **Table:** `login_attempts`
- **Fields:** username, ip_address, success, attempted_at

**Logic:**
- Track all login attempts (success and failure)
- Lock account after 5 failed attempts in 15 minutes
- Notify admin of suspicious activity
- Auto-unlock after 30 minutes or admin intervention

**Security event logged:** `failed_login` (severity: medium)

---

### Rate Limiting (DDoS Protection)

**Per-IP limits:**
- API calls: 100 requests per 15 minutes
- Login attempts: 10 per 15 minutes

**Per-user limits:**
- Module executions: 50 per hour
- Export operations: 20 per hour

**Implementation:**
- `express-rate-limit` middleware
- Redis-backed (future, for distributed deployments)
- Configurable thresholds per route

**On violation:**
- HTTP 429 (Too Many Requests)
- Security event logged
- Temporary ban (15 minutes)

---

### Budget Management & Enforcement

**Per-user monthly quotas:**
- **Table:** `user_monthly_usage`
- **Fields:** user_id, month, token_count, estimated_cost_usd, budget_cap

**Enforcement:**
- 80% threshold: Warning email
- 100% threshold: Block further API calls
- Admin can override or increase cap

**Use cases:**
- Cost control for multi-user organizations
- Fair usage across teams
- Prevent accidental runaway costs

---

### Security Event Logging (OWASP A09)

**Event types:**
- `failed_login` — Failed authentication attempts
- `unauthorized_access` — Access to forbidden resources
- `budget_exceeded` — Monthly quota exceeded
- `rate_limit` — Rate limit violations
- `suspicious_activity` — Anomalous behavior detected
- `invalid_input` — Injection attempt or malformed input
- `ssrf_attempt` — Server-side request forgery attempt

**Severity levels:**
- **Critical:** Immediate action required (SSRF, SQL injection attempt)
- **High:** Security concern (unauthorized access)
- **Medium:** Potential issue (failed login, rate limit)
- **Low:** Informational (valid but unusual activity)

**Table:** `security_events`

**Dashboard:** `AuditLogPage.tsx` — filter by event type, severity, user, date range

---

### Sandboxing (Script Execution)

**When executing user-provided scripts (Python, bash, Node.js):**

**Sandbox configuration:**
- **Memory limit:** 512 MB (configurable)
- **Runtime limit:** 60 seconds (configurable)
- **Network access:** Configurable (allow/deny)
- **Filesystem access:** Restricted to designated directories
- **Environment variables:** Sanitized (no access to API keys)

**Implementation:**
- Docker containers (future)
- Node.js VM module (current, for Node scripts)
- Python subprocess with resource limits

**Security event logged on violation:**
- `script_timeout` (runtime exceeded)
- `script_memory_exceeded`
- `script_network_blocked` (if attempted unauthorized network access)

---

### Input Validation & Sanitization

**All user inputs validated:**
- File uploads: Type whitelist (PDF, DOCX, XLSX, TXT, MD), size limit (50 MB default)
- URLs: Scheme whitelist (https only), SSRF protection (block private IP ranges)
- SQL queries: Parameterized queries only (no string concatenation)
- File paths: Path traversal protection (block `../`, absolute path only)

**OWASP Top 10 mitigations:**
- **A01: Broken Access Control** → RBAC enforcement
- **A02: Cryptographic Failures** → bcrypt password hashing, JWT tokens
- **A03: Injection** → Parameterized SQL, input sanitization
- **A04: Insecure Design** → Secure-by-default configuration
- **A05: Security Misconfiguration** → Helmet middleware (CSP, HSTS, etc.)
- **A06: Vulnerable Components** → Regular dependency audits (`pnpm audit`)
- **A07: Authentication Failures** → Failed login tracking, account lockout
- **A08: Software/Data Integrity** → Integrity checks, version control
- **A09: Logging Failures** → Comprehensive security event logging
- **A10: SSRF** → URL whitelist, private IP blocking

---

### Audit Trail

**Every action logged:**
- **Table:** `audit_log`
- **Captured:** session_id, user_id, module_id, model, thinking_level, input/output tokens, cost, review_status, seed (for reproducibility)

**Retention:** Configurable (default: 2 years)

**Export:** CSV/XLSX for regulators or internal audit

**Use cases:**
- Regulatory audit: "Show me all gap analyses from Q1 2024"
- Cost analysis: "Which users consumed most API budget?"
- Quality analysis: "What settings produce highest quality?"
- Reproducibility: Re-run exact session with same seed

---

## 24. Privacy & Data Safety

### Local-First Architecture

**What stays local:**
✅ All documents and uploads (filesystem)
✅ Session history and outputs (SQLite database)
✅ Knowledge graph and patterns (SQLite)
✅ User profiles and preferences (SQLite)
✅ Audit logs (SQLite)
✅ Workflow executions and checkpoint decisions (SQLite)

**What leaves your machine:**
❌ Prompts and messages sent to LLM APIs (Claude, GPT, Mistral)
❌ Web search queries (if enabled)

**Result:** Complete data control. No openEXPERT cloud service collecting data.

---

### LLM Provider Data Policies

**When using external LLM providers:**

**Anthropic Claude:**
- API requests processed, not used for training (per Anthropic policy)
- Review: https://www.anthropic.com/privacy

**OpenAI GPT:**
- API requests not used for training (per OpenAI policy)
- Review: https://openai.com/privacy

**Mistral:**
- API requests processed, not used for training
- Review: https://mistral.ai/privacy

**Local Ollama:**
- ✅ **Maximum privacy:** Nothing leaves your network
- All processing on local machine

**Recommendation:** For maximum privacy (GDPR Article 32, data minimization), use local Ollama models or deploy openEXPERT in air-gapped environment.

---

### GDPR Compliance

**openEXPERT supports GDPR compliance:**

**Article 5 (Data minimization):**
- Only data necessary for functionality is collected
- No telemetry, analytics, or tracking

**Article 15 (Right of access):**
- Users can export all their data (sessions, audit logs, profiles)

**Article 17 (Right to erasure):**
- Users can delete sessions, profiles, or entire account
- Cascading deletes (delete session → delete all messages)

**Article 25 (Privacy by design):**
- Local-first architecture (data never sent to openEXPERT servers)
- Secure defaults (encryption, authentication, RBAC)

**Article 32 (Security of processing):**
- Encryption in transit (HTTPS for API calls)
- Encryption at rest (optional: encrypt SQLite database)
- Access controls (RBAC, authentication)
- Audit logging

---

### Multi-User Data Isolation

**In multi-user environments:**

**Session isolation:**
- Each user's sessions private (not visible to other users)
- Admins can view all sessions (for audit purposes)
- User permission check on every session access

**Project sharing:**
- Sessions can be added to projects
- Project members see shared sessions
- Permissions enforced (project member vs. non-member)

**Knowledge graph isolation (future):**
- Per-user knowledge graphs (optional)
- Shared organizational knowledge graph (optional)
- Configurable: private, team, organization

---

### Data Backup & Recovery

**Manual backup:**
```bash
cp data/workbench.sqlite data/backup-$(date +%Y%m%d).sqlite
```

**Automated backup (planned):**
- Daily backups (configurable retention)
- Backup to external drive or encrypted cloud storage
- Point-in-time recovery

**Disaster recovery:**
- Restore from backup
- SQLite database includes all data (sessions, users, workflows, knowledge)
- Documents in `uploads/` folder also need backup

---

## 25. Deployment Models

openEXPERT supports **multiple deployment models** to fit different needs.

### 1. Local Desktop (Default)

**Who:** Individuals, small teams, consultants

**Setup:**
```bash
git clone https://github.com/danielbardun/openexpert
cd openexpert
pnpm install
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env
pnpm run db:init
pnpm run dev
```

**Access:** http://localhost:3000

**Data location:** `./data/workbench.sqlite`, `./uploads/`

**Pros:**
- ✅ Complete data control
- ✅ No server infrastructure required
- ✅ Free (except API costs)

**Cons:**
- ❌ Single-user (unless running on shared machine)
- ❌ No remote access (localhost only)

---

### 2. Docker Container

**Who:** Technical users, IT teams, easy deployment

**Setup:**
```bash
docker compose up
```

**Docker Compose:**
```yaml
version: '3.8'
services:
  openexpert:
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

**Pros:**
- ✅ Consistent environment
- ✅ Easy updates (pull new image, restart)
- ✅ Isolated from host system

**Cons:**
- ❌ Requires Docker knowledge
- ❌ Still local (unless exposed via network)

---

### 3. Server Deployment (Multi-User)

**Who:** Consulting firms, enterprises, teams (10-100 users)

**Setup:**
```bash
# On server (Linux VM, cloud instance)
git clone https://github.com/danielbardun/openexpert
cd openexpert
pnpm install
pnpm run db:init

# Create production .env
NODE_ENV=production
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000

# Run with PM2 (process manager)
pm2 start "pnpm start" --name openexpert
pm2 save
pm2 startup
```

**Reverse proxy (Nginx):**
```nginx
server {
  listen 80;
  server_name openexpert.yourcompany.com;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
  }
}
```

**SSL:** Use Let's Encrypt for HTTPS

**Pros:**
- ✅ Multi-user access
- ✅ Remote access (via company network)
- ✅ Centralized data (easier backups)

**Cons:**
- ❌ Requires server infrastructure
- ❌ IT admin needed for setup/maintenance

---

### 4. Cloud Deployment (Scalable)

**Who:** Large enterprises, SaaS providers (100+ users)

**Options:**

**A. AWS Deployment**
- EC2 instance for application
- RDS PostgreSQL for database (replace SQLite)
- S3 for document storage
- ALB for load balancing
- CloudWatch for monitoring

**B. Azure Deployment**
- Azure App Service for application
- Azure Database for PostgreSQL
- Azure Blob Storage for documents
- Azure Application Insights for monitoring

**C. Google Cloud Deployment**
- Cloud Run for application (serverless)
- Cloud SQL for PostgreSQL
- Cloud Storage for documents
- Cloud Monitoring

**Pros:**
- ✅ Highly scalable (1000+ users)
- ✅ Built-in backups and redundancy
- ✅ Global access

**Cons:**
- ❌ Data not 100% local (cloud-based)
- ❌ Ongoing cloud costs
- ❌ Requires cloud expertise

---

### 5. Air-Gapped Deployment (Maximum Security)

**Who:** Government, defense, highly regulated industries

**Setup:**
- Deploy on internal network (no internet access)
- Use local Ollama models (no external API calls)
- Disable web search and online reference links
- Folder integration only (local regulation texts)

**Pros:**
- ✅ Complete data isolation
- ✅ No data leaves network
- ✅ Regulatory compliance (classified environments)

**Cons:**
- ❌ Cannot use Claude/GPT APIs (must use local models)
- ❌ No web search (knowledge limited to training data + local docs)
- ❌ Cannot fetch online regulation links

---

### Deployment Decision Matrix

| Need | Recommended Deployment |
|------|------------------------|
| Individual consultant | Local Desktop |
| Small team (2-5 users) | Docker on shared machine |
| Consulting firm (10-50 users) | Server Deployment |
| Large enterprise (100+ users) | Cloud Deployment |
| Regulated/classified environment | Air-Gapped with Ollama |

---

## PART 8: USAGE GUIDE

## 26. Getting Started

### Installation

**Prerequisites:**
- Node.js 18+ (https://nodejs.org/)
- pnpm (install via: `npm install -g pnpm`)
- Anthropic API key (get from https://console.anthropic.com/)

**Steps:**

**1. Clone repository:**
```bash
git clone https://github.com/danielbardun/openexpert
cd openexpert
```

**2. Install dependencies:**
```bash
pnpm install
```

**3. Configure API key:**
```bash
cp .env.example .env
# Edit .env and add:
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

**4. Initialize database:**
```bash
pnpm run db:init
```

**5. Start application:**
```bash
pnpm run dev
```

**6. Open browser:**
Navigate to http://localhost:3000

**Expected output:**
```
[server] openEXPERT by ANTON — server running on http://localhost:3001
[server] [module-loader] Loaded 29 area(s), 240 module(s)
[client] Vite dev server running on http://localhost:5173
```

---

### First Steps

**1. Create your profile** (optional but recommended)
- Click "Settings" → "Profile"
- Enter: Name, Role, Organization, Jurisdiction, Focus Areas
- Save

**2. Browse expert areas**
- Sidebar: 29 areas listed
- Click area to expand → see modules
- Click module to open

**3. Run your first module**

**Example: Quick Question (Brief Me mode)**
- Click "Brief Me" in sidebar
- Type: "What are the key requirements of AMLR Article 4?"
- Click "Ask Anton"
- Wait for streaming response (~30 seconds)
- Review output

**Example: AMLR Gap Analysis**
- Navigate to Area 1: FCP → AMLR Gap Analysis
- **Guided inputs:**
  - Entity Type: Bank
  - Jurisdiction: Sweden
  - Focus Areas: Customer Due Diligence, Transaction Monitoring
- **Configuration panel:**
  - Thinking: Investigate (default, pre-selected)
  - Creativity: Strict (default)
  - Output Formats: Executive Summary + Gap Scoring Matrix + Action Plan (default)
  - Knowledge Sources: Enable web search, upload regulation PDF or leave as default
- Click "Run Analysis"
- Wait for response (~2-5 minutes for Investigate mode)
- Review output
- Export to DOCX or XLSX

---

### Understanding Costs

**Typical session costs:**

| Module Type | Model | Thinking | Tokens (est.) | Cost (est.) |
|-------------|-------|----------|---------------|-------------|
| Quick question | Haiku | quick | 5k | $0.01 |
| Standard analysis | Sonnet | think | 40k | $0.60 |
| Gap analysis | Opus | think_hard | 120k | $2.50 |
| Regulatory submission | Opus | investigate | 180k | $5.00 |

**Cost optimization tips:**
- Use Haiku for simple tasks (10x cheaper than Opus)
- Use Sonnet for most analyses (good balance)
- Reserve Opus + Investigate for critical work (regulatory submissions, board reports)
- Enable prompt caching: run related analyses back-to-back (90% cost reduction on repeated context)

---

## 27. Power User Guide

### Custom Modules

**Create your own module:**

**1. Navigate to "Build Your Own Module"**

**2. Fill in module details:**
- Name: "Client X Sanctions Review"
- Description: "Tailored sanctions compliance review for Client X's specific risk profile"
- Icon: Shield
- Area: FCP (or custom)

**3. Configure defaults:**
- Thinking: `think_hard`
- Creativity: `strict`
- Output formats: `detailed-findings`, `action-plan`
- Knowledge sources: Enable web search + local folder (client docs)

**4. Write system prompt:**
```markdown
# Client X Sanctions Review

## Objective
Review Client X's sanctions screening program against EU Regulation 833/2014 and OFAC requirements.

## Methodology
1. Review screening rules and scenarios
2. Test sample transactions against latest sanctions lists
3. Identify false positive rates and tuning opportunities
4. Assess vendor system capabilities
5. Review governance (policies, training, escalation)

## Output Structure
- Executive summary (board-ready)
- Detailed findings (per control area)
- Action plan with priorities
- Vendor assessment (if applicable)

## Focus Areas
- Crypto asset screening (Client X handles crypto)
- Cross-border wire transfers to high-risk jurisdictions
- Beneficial ownership screening
```

**5. Test module:**
- Run test session with sample input
- Review output quality
- Iterate on prompt

**6. Save and share:**
- Save as private (your use only)
- Or mark "Share with community" (make public)

---

### Workflows

**Create multi-step workflow:**

**1. Navigate to "Workflow Builder"**

**2. Design workflow:**
- Name: "Quarterly Compliance Cycle"
- Description: "Automated quarterly gap analysis + board report"

**3. Add steps:**

**Step 1: Gap Analysis**
- Type: Module Execution
- Module: AMLR Gap Analysis
- Inputs: (from guided input form or variables)
- Output variable: `${gap_analysis}`

**Step 2: Checkpoint — Review Findings**
- Type: Checkpoint
- Assigned to: ${mlro_email}
- Decision: Approve / Request Changes

**Step 3: Decision Gate**
- Type: Decision Gate
- Condition: `checkpoint_decision = "Approve"`
- True path: Continue to Step 4
- False path: Loop back to Step 1

**Step 4: Board Report**
- Type: Module Execution
- Module: Board Report Generator
- Inputs: `${gap_analysis.output.findings}`

**Step 5: Send Email**
- Type: Email
- To: board@company.com
- Subject: "Q${quarter} Compliance Report"
- Attach: `${step4.output}`

**4. Schedule workflow:**
- CRON: `0 9 1 1,4,7,10 *` (9 AM on Jan 1, Apr 1, Jul 1, Oct 1)
- Enable: ✓

**5. Monitor executions:**
- Navigate to "Workflow Monitor"
- View running/completed workflows
- Inspect step-by-step logs

---

### Skills Library

**Use pre-built skills:**

**1. Navigate to "Skills Library"**

**2. Browse by category:**
- Regulatory Frameworks (AMLR, GDPR, Basel III, etc.)
- Methodologies (RACI, SWOT, Gap Analysis, Risk Assessment)
- Templates (Board Report, Policy Document, Action Plan)

**3. Attach skill to module:**
- Open module configuration
- "Attach Skills" section
- Select: "EBA Risk Factor Guidelines"
- Skill prompt automatically added to system prompt

**4. Create custom skill:**
- Click "Create Skill"
- Name: "Client X Risk Appetite"
- Category: Governance
- Prompt: "Apply Client X's risk appetite: ML/TF risk tolerance = Medium. Sanctions risk tolerance = Low. No appetite for crypto asset exposure."
- Save
- Attach to relevant modules (gap analysis, risk assessment)

---

### Knowledge Sources

**Advanced knowledge source configuration:**

**Scenario: Complex gap analysis**

**1. Enable all 4 modes:**
- ✅ Claude Knowledge + Web Search (for latest EBA guidance)
- ✅ Online Reference: `https://eur-lex.europa.eu/eli/reg/2024/1624` (AMLR text)
- ✅ Local Folder: `/Regulations/AMLR/` (downloaded RTS, ITS, guidelines)
- ✅ Combined Mode: Priority = `merged` (cross-reference all sources)

**2. Token management:**
- Monitor: "Loaded: 145k / 180k tokens (80%)"
- If exceeds: Deselect low-priority files or switch online reference to "summary" mode

**3. Custom instructions (Combined Mode):**
```
Compare client's AML policy against AMLR Article 4 requirements.
Use EUR-Lex text for official regulation wording.
Use EBA guidelines for interpretation guidance.
Use local folder docs for client-specific context.
Where client policy is silent, identify gap.
Where client policy differs from regulation, assess materiality and flag.
```

---

### Prompt Editing

**Advanced users can edit system prompts:**

**1. Open module**

**2. Expand "System Prompt" section (collapsible)**

**3. Edit prompt:**
- Add client-specific instructions
- Adjust output structure
- Add/remove sections

**4. Save changes:**
- "Save as new module" (keeps original intact)
- Or "Update this module" (overwrites default)

**Best practice:** Always test edited prompts before using for client work

---

## 28. Enterprise Administration

### User Management

**Admin dashboard** (`/admin`):

**Add users:**
- Username, email, role (admin, analyst, user)
- Set monthly budget cap
- Assign to projects/teams

**Manage permissions:**
- Role-based access (which modules, which areas)
- Custom permissions (view-only, execute-only, export-only)

**Monitor usage:**
- Per-user token consumption
- Per-user cost (monthly, YTD)
- Activity logs (last login, sessions created)

---

### Budget Controls

**Set organizational budget:**
- Global cap: $10,000/month
- Per-user caps: $500/user/month
- Alerts: 80% threshold (email to admin)
- Enforcement: 100% threshold (block API calls)

**Cost allocation:**
- By user
- By project
- By area/module
- Export CSV for finance team

---

### Compliance & Audit

**Audit log access:**
- Filter by: user, module, date range, model, quality score
- Export: CSV, XLSX for regulators
- Retention: Configure (default 2 years)

**Compliance rule management:**
- Enable/disable rules
- Create custom rules (firm-specific standards)
- Review violations
- Generate compliance reports

---

### Backup & Disaster Recovery

**Automated backups:**
```bash
# Daily backup cron job
0 2 * * * /usr/local/bin/backup-openexpert.sh
```

**Backup script:**
```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR=/backups/openexpert
mkdir -p $BACKUP_DIR

# Backup database
cp data/workbench.sqlite $BACKUP_DIR/workbench-$DATE.sqlite

# Backup uploads
tar -czf $BACKUP_DIR/uploads-$DATE.tar.gz uploads/

# Encrypt (optional)
gpg --encrypt --recipient admin@company.com $BACKUP_DIR/workbench-$DATE.sqlite

# Upload to cloud (optional)
aws s3 cp $BACKUP_DIR/ s3://company-backups/openexpert/ --recursive

# Retention: delete backups older than 90 days
find $BACKUP_DIR -name "*.sqlite" -mtime +90 -delete
```

---

### Integration & API

**REST API** (future):
- Programmatic module execution
- Session retrieval
- Workflow triggering

**Webhooks** (future):
- Notify external systems on workflow completion
- Integrate with Slack, Teams, Jira

**MCP Integration:**
- openEXPERT MCP server exposes modules as Claude Desktop tools
- Run: `pnpm run mcp`
- Configure in Claude Desktop settings
- Use openEXPERT modules directly from Claude.ai interface

---

## PART 9: COMMUNITY & FUTURE

## 29. Building Custom Modules

### Module Anatomy

**Every module needs:**

**1. Module Configuration** (`module.json`)
```json
{
  "id": "unique-module-id",
  "label": "Display Name",
  "shortLabel": "Short",
  "icon": "LucideIconName",
  "description": "What this module does...",
  "color": "adv-teal",
  "defaults": {
    "thinking": "think_hard",
    "creativity": "balanced",
    "outputFormats": ["executive-summary", "detailed-findings"],
    "knowledgeSources": {...}
  },
  "guidedInputs": [...]
}
```

**2. System Prompt** (`system-prompt.md`)
- Clear objective
- Step-by-step methodology
- Output structure template
- Quality criteria

**3. Area Context** (if creating new area)
- Domain background
- Key frameworks and methodologies
- Stakeholder landscape

---

### Module Design Best Practices

**1. Start with a real problem**
- Don't create modules for the sake of it
- Solve actual pain points
- Test with real scenarios

**2. Define clear scope**
- "AMLR Gap Analysis" (specific) not "AML Compliance" (too broad)
- Focused modules produce better output than generic ones

**3. Pre-configure intelligently**
- Defaults should work for 80% of use cases
- Users can override, but shouldn't need to

**4. Provide guided inputs**
- Help users provide the right context
- Select fields for common choices (entity type, jurisdiction)
- Free text for unique context

**5. Write specific prompts**
- "Compare institution's CDD process against AMLR Article 4(1)-(4) requirements, scoring each sub-requirement as Compliant/Partial/Gap"
- Not: "Analyze AML compliance"

**6. Test, iterate, improve**
- Run module 5+ times with different inputs
- Check quality scores
- Refine prompt based on weaknesses

---

## 30. Contribution & Community

### How to Contribute

openEXPERT is open source (MIT License). Contributions welcome!

**Ways to contribute:**

**1. Contribute a module**
- Write module.json + system-prompt.md
- Test with real scenarios
- Submit pull request
- Include: module purpose, target users, example outputs

**2. Contribute a persona**
- Create expert persona profile
- Describe: role, expertise, analytical approach, red flags
- Submit as JSON file

**3. Contribute a skill**
- Package domain knowledge (framework, methodology, template)
- Write skill prompt
- Tag appropriately
- Submit pull request

**4. Translate**
- Add language to `src/i18n/locales/`
- Translate UI strings
- Submit pull request

**5. Report issues**
- Found a bug? Module producing poor output? Missing feature?
- Open GitHub issue with details
- Include: module, configuration, example output, expected vs. actual

**6. Improve prompts**
- Module quality = prompt quality
- See a module that could be better? Improve the prompt
- Test thoroughly, submit pull request

---

### Quality Standards

**All contributions must:**
- Be written by someone with professional experience in the domain
- Include clear, specific prompts (not generic)
- Specify appropriate defaults (thinking depth, creativity, output formats)
- Include at least 3 guided input fields
- Produce output that professionals would find credible
- Be tested against 2+ real-world scenarios

---

### Community Guidelines

**We value:**
- Domain expertise
- Clarity and accessibility
- Constructive feedback
- Professional standards

**We do not accept:**
- Modules promoting harm, discrimination, or illegal activity
- Medical, legal, or financial advice without appropriate disclaimers
- Plagiarized or copyrighted content
- Prompts that violate LLM provider policies

---

## 31. Roadmap & Future Vision

### Completed (v2.0 — February 2026)

✅ 240 modules across 29 areas
✅ All 14 transformative features
✅ Multi-LLM support (4 providers)
✅ Enterprise security (RBAC, audit, budget)
✅ Advanced intelligence (knowledge graph, pattern detection)
✅ Workflow automation
✅ Local-first architecture
✅ 80+ database tables
✅ 41 API routes
✅ 36 React pages

---

### In Progress (Q1-Q2 2026)

🔄 Mobile responsive UI (final polish)
🔄 Advanced analytics dashboards
🔄 Cloud deployment templates (AWS, Azure, Google Cloud)
🔄 API documentation (REST API for integrations)
🔄 Additional language support (Swedish, Finnish, Norwegian, Danish)

---

### Planned (Q3-Q4 2026)

📅 **Community marketplace:**
- Module sharing platform
- Skill library expansion
- User ratings and reviews

📅 **Enterprise features:**
- PostgreSQL adapter (replace SQLite for large deployments)
- Advanced RBAC (custom permissions per user)
- SSO integrations (SAML, OIDC for corporate SSO)

📅 **Mobile app:**
- iOS and Android companion apps
- Review outputs on mobile
- Voice input (dictate queries)

📅 **Advanced automation:**
- Webhook integrations (Slack, Teams, Jira)
- Zapier/Make.com connectors
- API for programmatic execution

📅 **AI enhancements:**
- Multi-modal inputs (images, screenshots, diagrams)
- Vision support (analyze charts, tables from PDFs)
- Audio transcription (meeting notes → modules)

---

### Long-Term Vision (2027+)

🔮 **Open ecosystem:**
- Marketplace for premium modules (creators monetize expertise)
- Certification program (verified domain experts)
- Partner network (consultancies offering openEXPERT-based services)

🔮 **SaaS offering:**
- Hosted version (for users who prefer cloud)
- Multi-tenant architecture
- Enterprise support and SLAs

🔮 **Advanced intelligence:**
- Predictive analytics (forecast compliance risks)
- Anomaly detection (flag unusual patterns proactively)
- Benchmarking (compare quality scores across organizations)

🔮 **Global expansion:**
- Modules for non-EU jurisdictions (US, APAC, MENA)
- Localized regulatory knowledge
- Multi-language prompts

---

## 32. FAQ

**Q: Is openEXPERT free?**
A: Yes. The software is free and open source (MIT License). You pay only for AI API usage (Claude, GPT, Mistral). Typical costs: $0.05-$5 per session depending on complexity.

**Q: Can I use it commercially?**
A: Yes. MIT License permits commercial use. Use it for client work, internal operations, or as part of a commercial service.

**Q: Is my data safe?**
A: Yes. openEXPERT runs locally. Documents, sessions, and outputs stored in SQLite on your machine. Only API requests to Claude/GPT/Mistral leave your environment. Review provider privacy policies for details.

**Q: Can I use different AI models?**
A: Yes. Supports Anthropic Claude, OpenAI GPT, Mistral, and local Ollama models. Switch models per session.

**Q: How accurate are the outputs?**
A: openEXPERT produces professional-quality output for structured analytical work. However, AI can make errors. **Always review outputs before using them for decisions**, especially in regulated contexts.

**Q: Can I create custom modules?**
A: Yes. "Build Your Own Module" feature lets you create custom modules with visual editor. Keep them private or share with community.

**Q: Does it work offline?**
A: Partially. UI and database work offline. But AI models require API calls (unless using local Ollama). For full offline capability, deploy with Ollama in air-gapped environment.

**Q: What about data residency (GDPR)?**
A: Data stored locally (GDPR Article 5 — data minimization). For strict data residency, use Mistral (EU-based provider) or local Ollama (nothing leaves network).

**Q: Can multiple users collaborate?**
A: Yes. Multi-user support with RBAC. Collaborative Canvas enables team workflows with step assignment, parallel reviews, and SLA tracking.

**Q: How do I get help?**
A: Open an issue on GitHub repository. Community and maintainers are active. For enterprise support, contact via GitHub.

**Q: Who created this?**
A: Daniel Bardun (14+ years in banking, FCP, regulatory consulting at SEB, Sveriges Riksbank, EY, Advisense). Built with passion for making AI accessible and professional.

**Q: What's the catch?**
A: No catch. Open source = transparent. We believe this capability should power-charge every sector and enable more people. When more people can do valuable work, everyone benefits.

---

## Conclusion

openEXPERT by ANTON is more than software — it's a **new way of working with AI**.

**What makes it different:**
- ✅ **Expert training built-in:** 240 modules with professional-grade prompts
- ✅ **Complete transparency:** See exactly how AI thinks (3 transparency levels)
- ✅ **Local-first:** Your data never leaves your machine
- ✅ **Enterprise-ready:** RBAC, audit trails, budget controls, compliance rules
- ✅ **Intelligent:** Learns from your work (cross-workflow intelligence, pattern detection, institutional memory)
- ✅ **Collaborative:** Multi-human workflows with SLA tracking and consensus
- ✅ **Open source:** Free, transparent, community-driven

**Who it's for:**
- 👤 Individuals (students, job seekers, personal finance)
- 🏢 Small businesses (startups, SMBs navigating compliance)
- 🏛️ Corporates (regulated industries, professional services)
- 🏦 Financial institutions (banks, FIs, payment providers)
- 💼 Consultants (Big 4, boutique firms, independent consultants)

**The mission:**
**Democratize access to expert-level AI assistance.** A student deserves the same analytical frameworks as a Fortune 500 compliance officer. A small business deserves the same structured guidance as a Big4 client.

**The result:**
**More people doing more valuable work.** AI time savings → creative freedom. Mundane tasks automated → focus on strategy. Quality consistency → regulatory confidence.

---

**Ready to start?**

```bash
git clone https://github.com/danielbardun/openexpert
cd openexpert
pnpm install
cp .env.example .env
# Add your ANTHROPIC_API_KEY
pnpm run db:init
pnpm run dev
```

**Welcome to openEXPERT. Welcome to the future of knowledge work.**

---

**openEXPERT by ANTON**
Open Source · Expert-Grade AI · For Everyone
Version 2.0.0 — February 20, 2026

**Created by:** Daniel Bardun & FutureChain AB
**License:** MIT
**Website:** https://github.com/danielbardun/openexpert
**Support:** Open an issue on GitHub

---

> *"Everyone talks about AI changing work. But between the promise and the reality, there's a gap — a gap of knowledge, a gap of time, a gap of training. openEXPERT closes all three. We gave the AI a proper professional education, so you don't have to be an AI expert to get expert results. The time you save isn't just efficiency — it's creative freedom."*
>
> — Daniel Bardun, Creator of openEXPERT by ANTON

---

**END OF WHITEPAPER**
