# openEXPERT Test Plan
**Version:** 1.0
**Date:** 2026-02-21
**Purpose:** Comprehensive QA checklist for all features before public release

---

## Navigation & Core Pages

### Dashboard (/)
- [ ] Dashboard loads without errors
- [ ] Shows correct module count (145+)
- [ ] Shows correct area count (29+)
- [ ] Stats cards display: sessions, cost, tokens
- [ ] Recent sessions list appears (if any exist)
- [ ] Quick launch cards link to correct modules
- [ ] "Start New Session" button works
- [ ] Language selector in header works (30 languages)

### Settings (/settings)
- [ ] Settings page loads
- [ ] General settings section visible
- [ ] Model selector shows all models (Opus, Sonnet, Haiku)
- [ ] Thinking level selector shows 5 options
- [ ] Creativity slider has 3 positions (strict, balanced, creative)
- [ ] Language selector shows all 30 languages
- [ ] Budget cap input accepts numbers
- [ ] Save button persists changes
- [ ] Deployment mode toggle works (solo/team)

---

## Core Interaction Modes

### 1. Home - Dashboard (/dashboard)
- [ ] Module overview cards visible
- [ ] Quick stats display correctly
- [ ] Navigation to modules works

### 2. Brief Me (/brief)
- [ ] Page loads successfully
- [ ] Large textarea for question input
- [ ] "Ask Anton" submit button visible
- [ ] Streaming response works (requires API key)
- [ ] Response displays with Markdown formatting
- [ ] Export bar appears after response
- [ ] "Go deeper" link navigates to relevant module

### 3. Guide Me (/guide)
- [ ] Wizard step 1: "What do you need help with?" input
- [ ] Category chips display (multiple options)
- [ ] Wizard step 2: Output type selection
- [ ] Wizard step 3: Role selection
- [ ] Module recommendations appear (top 3)
- [ ] Recommendation cards show area badges
- [ ] "Use This" button redirects to correct module

### 4. Open Chat (/prompt)
- [ ] Chat interface loads
- [ ] Message input accepts text
- [ ] Send button triggers API call (requires API key)
- [ ] Streaming response works
- [ ] Conversation history persists
- [ ] Multi-turn conversation supported
- [ ] Persona selector works
- [ ] Skills attacher works

---

## Document Analysis Tools

### 5. Fill Form (/fill)
- [ ] Page loads with form interface
- [ ] File upload area visible
- [ ] Upload PDF/DOCX works
- [ ] Form field detection works
- [ ] AI fills fields with citations (requires API key)
- [ ] Uncertainty flags shown
- [ ] Export filled form works

### 6. Challenge This (/challenge)
- [ ] Page loads
- [ ] Document upload works
- [ ] Challenge analysis runs (requires API key)
- [ ] Identifies assumptions
- [ ] Highlights weak arguments
- [ ] Provides counterarguments
- [ ] Export works

### 7. Dual Interpretation (/dual)
- [ ] Page loads
- [ ] Regulatory text input accepts content
- [ ] "Industry perspective" toggle works
- [ ] "Regulator perspective" toggle works
- [ ] Dual analysis displays side-by-side (requires API key)
- [ ] Export both perspectives works

### 8. Review Engine (/review)
- [ ] Page loads with review mode selector
- [ ] 6 review modes visible: peer, red-team, legal, executive, regulatory, devil's advocate
- [ ] Document upload works
- [ ] Selected review mode applies correct analysis (requires API key)
- [ ] Critique points listed with severity
- [ ] Export review report works

---

## Personal Advisory

### 9. Sounding Board (/sounding-board)
- [ ] Page loads
- [ ] 7 advisor personas visible: strategic, legal, risk, regulatory, fincrime, hr, career
- [ ] Persona selector changes prompt
- [ ] Conversation interface works (requires API key)
- [ ] Context persists across turns
- [ ] Export conversation works

---

## Workflow & Automation

### 10. Workflows (/workflows)
- [ ] Workflows page loads
- [ ] 10+ pre-built workflows listed
- [ ] Workflow cards show description
- [ ] "Run Workflow" button works (requires API key)
- [ ] Workflow steps execute sequentially
- [ ] Progress indicator shows current step
- [ ] Results display after completion
- [ ] Scheduling toggle works (cron expressions)
- [ ] Export workflow results works

### 11. Projects (/projects)
- [ ] Projects page loads
- [ ] "Create Project" button visible
- [ ] Create project modal opens
- [ ] Project name input required
- [ ] Description optional
- [ ] Project creation succeeds (check console logs)
- [ ] New project appears in list
- [ ] Project workspace folder created at `/workspaces/{project-id}/`
- [ ] Project details page opens on click
- [ ] Sessions can be added to project
- [ ] Cross-area session linking works
- [ ] Project deletion works

### 12. Batch Create (/batch)
- [ ] Page loads
- [ ] CSV upload area visible
- [ ] Upload CSV file works
- [ ] Column preview shows first 5 rows
- [ ] Module selector appears
- [ ] Configure module once
- [ ] "Run Batch" executes N times (requires API key)
- [ ] Progress bar shows N/Total
- [ ] Download all outputs as .zip works

---

## Module & Skill Management

### 13. Build Module (/build-module)
- [ ] Builder page loads
- [ ] Module name input
- [ ] Description input
- [ ] System prompt editor (large textarea)
- [ ] Default config selectors (thinking, creativity, output formats)
- [ ] Save module button works
- [ ] New module appears in custom modules list
- [ ] Custom module can be used like built-in modules
- [ ] "Share This Module" toggle works (community feature)

### 14. Skills Library (/skills)
- [ ] Skills library page loads
- [ ] Pre-built skills listed (10+ skills)
- [ ] Skill cards show description
- [ ] "Attach to Session" button works
- [ ] "Submit a Skill" button opens modal
- [ ] Community skills section visible
- [ ] Skill submission form works

### 15. Exchange (/exchange)
- [ ] Exchange page loads
- [ ] .anton package import area visible
- [ ] Upload .anton file works
- [ ] Package contents preview shown
- [ ] Dependency checker runs
- [ ] Import succeeds
- [ ] Export to .anton package works
- [ ] Downloaded .anton file valid

---

## Monitoring & Analytics

### 16. Audit Log (/audit)
- [ ] Audit log page loads
- [ ] Event list displays (if any events exist)
- [ ] Filtering by date range works
- [ ] Filtering by module works
- [ ] Filtering by user works
- [ ] Filtering by session works
- [ ] Text search works
- [ ] Pagination works (limit, offset)
- [ ] Sorting by column works (timestamp, cost, tokens)
- [ ] Event details modal opens on click
- [ ] Statistics panel shows overall stats
- [ ] Cost breakdown by model visible
- [ ] Cost breakdown by module visible
- [ ] Review status workflow works (draft → reviewed → approved)
- [ ] CSV export downloads file
- [ ] Security events section visible
- [ ] Login attempts section visible

### 17. Analytics (/analytics)
- [ ] Analytics page loads
- [ ] Time series chart visible (Recharts)
- [ ] Module usage chart visible
- [ ] Cost tracking chart visible
- [ ] Date range selector works
- [ ] Charts update when date range changes
- [ ] Export analytics data works

### 18. Data Insights (/insights)
- [ ] Page loads
- [ ] Data input area visible
- [ ] Paste CSV/Excel data works
- [ ] Upload file works
- [ ] "Generate Insights" runs AI analysis (requires API key)
- [ ] Interactive charts generated
- [ ] Chart type selector works (bar, line, pie)
- [ ] Export chart as image works

---

## Additional Features (Not in Main Navigation)

### A/B Test (/ab-test)
- [ ] Page loads
- [ ] Two prompt input areas (A and B)
- [ ] "Run Both" executes both prompts (requires API key)
- [ ] Side-by-side results display
- [ ] Winner selection works
- [ ] Export comparison works

### Knowledge (/knowledge)
- [ ] Knowledge base page loads
- [ ] Document upload works
- [ ] Document indexing works (RAG)
- [ ] Search knowledge base works
- [ ] Results show relevant snippets
- [ ] Citation links work

### Deadlines (/deadlines)
- [ ] Deadlines page loads
- [ ] "Add Deadline" button works
- [ ] Deadline form: title, date, priority
- [ ] Urgency badge appears on urgent items
- [ ] Deadline list sorted by date
- [ ] Notification system works

### Radar (/radar)
- [ ] Regulatory radar page loads
- [ ] Live monitoring toggle works
- [ ] Alert rules configurable
- [ ] New regulation detection works (requires web search)
- [ ] Alert notifications work

### Coworkers (/coworkers)
- [ ] Coworkers page loads
- [ ] 7+ coworker templates visible
- [ ] Coworker personas: analyst, reviewer, drafter, researcher, auditor, trainer, advisor
- [ ] "Chat with Coworker" button works (requires API key)
- [ ] Conversation with AI coworker works

### Versions (/versions)
- [ ] Versions page loads
- [ ] Output version history visible (if any)
- [ ] Version diff viewer works
- [ ] Restore previous version works

### Quality (/quality)
- [ ] Quality assessment page loads
- [ ] Document upload works
- [ ] Quality scoring runs (requires API key)
- [ ] Completeness score shown
- [ ] Clarity score shown
- [ ] Compliance score shown
- [ ] Improvement suggestions listed

### Apprentice (/apprentice)
- [ ] Apprentice mode page loads
- [ ] Learning mode selector works
- [ ] Training data upload works
- [ ] Model fine-tuning placeholder visible
- [ ] Apprentice recommendations work

### Knowledge Graph (/graph)
- [ ] Knowledge graph page loads
- [ ] Graph visualization renders
- [ ] Node interactions work (click, hover)
- [ ] Edge labels visible
- [ ] Zoom/pan controls work
- [ ] Export graph as image works

### Intelligence (/intelligence)
- [ ] Intelligence dashboard loads
- [ ] Threat monitoring visible
- [ ] Risk indicators shown
- [ ] Alert feed updates
- [ ] Export intelligence report works

### Patterns (/patterns)
- [ ] Pattern detection page loads
- [ ] Document set upload works
- [ ] Pattern analysis runs (requires API key)
- [ ] Common patterns listed
- [ ] Anomalies highlighted
- [ ] Export pattern report works

### Compliance (/compliance)
- [ ] Compliance tracker loads
- [ ] Obligation list visible
- [ ] Status tracking works (pending, in progress, complete)
- [ ] Deadline reminders work
- [ ] Export compliance report works

### Knowledge Base (/knowledge-base)
- [ ] Knowledge base management page loads
- [ ] Document library visible
- [ ] Upload documents works
- [ ] Indexing status shown
- [ ] Search functionality works

### Datasets (/datasets)
- [ ] Datasets page loads
- [ ] Dataset upload works (CSV, Excel, JSON)
- [ ] Dataset preview shows first 10 rows
- [ ] Dataset statistics calculated
- [ ] Query dataset works
- [ ] Export filtered dataset works

---

## Authentication & Team Features

### Login/Logout (if DEPLOYMENT_MODE=team)
- [ ] Login page displays when in team mode
- [ ] Email/password login works
- [ ] OAuth Google login works (if configured)
- [ ] OAuth GitHub login works (if configured)
- [ ] Enterprise SSO works (if configured)
- [ ] JWT token issued on successful login
- [ ] Protected routes redirect to login when not authenticated
- [ ] Logout clears session

### User Management (team mode)
- [ ] User profile page loads
- [ ] Edit profile works
- [ ] Change password works
- [ ] User role assignment works (admin, user, viewer)
- [ ] Budget cap per user works

---

## API & Backend

### Claude API Integration
- [ ] Streaming SSE endpoint works: POST /api/claude/stream
- [ ] Sync endpoint works: POST /api/claude/message-sync
- [ ] Web search tool enabled when configured (requires API key + web search permission)
- [ ] Prompt caching works (repeated prompts return faster)
- [ ] Cost calculation accurate (per model pricing)
- [ ] Token counting accurate
- [ ] Error handling for rate limits
- [ ] Error handling for invalid API key

### File Upload/Processing
- [ ] PDF upload works: POST /api/files/upload
- [ ] DOCX upload works
- [ ] XLSX upload works
- [ ] CSV upload works
- [ ] Markdown upload works
- [ ] Text extraction from PDF works (pdf-parse)
- [ ] Text extraction from DOCX works (mammoth)
- [ ] Text extraction from XLSX works
- [ ] File size limit enforced (50MB default)

### Database
- [ ] SQLite database initializes on first run
- [ ] 82 tables created successfully
- [ ] Sessions persist correctly
- [ ] Messages persist correctly
- [ ] Projects persist correctly
- [ ] Audit log entries created
- [ ] Database migrations run automatically
- [ ] workspace_path column exists in projects table

### Project Workspaces
- [ ] Creating project creates workspace folder
- [ ] Workspace structure: uploads, outputs, rag, collaboration, metadata
- [ ] Session files saved to project workspace
- [ ] Deleting project removes workspace folder
- [ ] Workspace path stored in database

---

## Export & Output

### Markdown Export
- [ ] Export as .md downloads file
- [ ] Markdown formatting preserved
- [ ] Headers, lists, tables render correctly

### DOCX Export
- [ ] Export as .docx downloads file
- [ ] Advisense branding applied (header/footer)
- [ ] Heading hierarchy correct
- [ ] Tables format correctly
- [ ] Page numbers included

### XLSX Export
- [ ] Export as .xlsx downloads file
- [ ] Gap scoring matrices have conditional formatting (🟢🟡🟠🔴)
- [ ] Auto-filters enabled
- [ ] Freeze panes on header row
- [ ] Formulas work (if applicable)

### PDF Export
- [ ] Export as .pdf downloads file
- [ ] Advisense branding applied
- [ ] Professional typography
- [ ] Page numbers included
- [ ] Table of contents generated (for long documents)

---

## UI/UX & Design

### Responsive Design
- [ ] Mobile view (< 768px) layout works
- [ ] Tablet view (768-1024px) layout works
- [ ] Desktop view (> 1024px) layout works
- [ ] Sidebar collapses on mobile
- [ ] Cards stack vertically on mobile

### Accessibility
- [ ] Keyboard navigation works (Tab, Enter, Esc)
- [ ] Focus rings visible on all interactive elements
- [ ] ARIA labels present on buttons/links
- [ ] Screen reader compatible
- [ ] Color contrast meets WCAG AA (4.5:1 minimum)

### Theming
- [ ] Dark theme (default) loads correctly
- [ ] Teal accent color (#2DD4A8) used for CTAs
- [ ] Card backgrounds (#152238) consistent
- [ ] Text colors readable (white, off-white, gray)
- [ ] Light mode toggle works (if implemented)

### Performance
- [ ] Initial page load < 2 seconds
- [ ] Route transitions smooth (< 300ms)
- [ ] Large lists paginate (no rendering 1000+ items at once)
- [ ] Lazy loading for heavy components works
- [ ] No console errors on any page
- [ ] No console warnings on any page

---

## Internationalization (i18n)

### Translation Coverage
- [ ] English (en) - 890 strings
- [ ] Swedish (sv) - 890 strings
- [ ] French (fr) - 890 strings
- [ ] German (de) - 890 strings
- [ ] Italian (it) - 890 strings
- [ ] Spanish (es) - 890 strings
- [ ] Hindi (hi) - 890 strings
- [ ] Portuguese (pt) - 890 strings
- [ ] Polish (pl) - 890 strings
- [ ] Urdu (ur) - 890 strings
- [ ] Chinese (zh) - 890 strings
- [ ] Arabic (ar) - 890 strings (RTL layout)
- [ ] Bengali (bn) - 890 strings
- [ ] Ukrainian (uk) - 890 strings
- [ ] Indonesian (id) - 890 strings
- [ ] Japanese (ja) - 890 strings
- [ ] Turkish (tr) - 890 strings
- [ ] Vietnamese (vi) - 890 strings
- [ ] Korean (ko) - 890 strings
- [ ] Thai (th) - 890 strings
- [ ] Persian (fa) - 890 strings (RTL layout)
- [ ] Dutch (nl) - 890 strings
- [ ] Romanian (ro) - 890 strings
- [ ] Greek (el) - 890 strings
- [ ] Czech (cs) - 890 strings
- [ ] Hungarian (hu) - 890 strings
- [ ] Hebrew (he) - 890 strings (RTL layout)
- [ ] Finnish (fi) - 890 strings
- [ ] Norwegian (no) - 890 strings
- [ ] Danish (da) - 890 strings

### RTL Layout
- [ ] Arabic layout mirrors correctly (text-align: right)
- [ ] Hebrew layout mirrors correctly
- [ ] Urdu layout mirrors correctly
- [ ] Persian layout mirrors correctly
- [ ] Sidebar position flips in RTL
- [ ] Icons flip appropriately in RTL

---

## Security

### Input Validation
- [ ] SQL injection attempts blocked (prepared statements)
- [ ] XSS attempts sanitized
- [ ] Path traversal blocked (folder access restricted)
- [ ] File upload types validated
- [ ] MIME type checking works

### Authentication (team mode)
- [ ] JWT tokens validated on protected routes
- [ ] Expired tokens rejected
- [ ] Invalid tokens rejected
- [ ] CSRF protection enabled

### Rate Limiting
- [ ] API rate limit enforced (100 req/min default)
- [ ] Rate limit violations logged to security_events
- [ ] 429 status returned when limit exceeded

### Data Protection
- [ ] Sensitive connection credentials encrypted (ENCRYPTION_KEY)
- [ ] API keys never sent to client
- [ ] Passwords hashed (bcrypt)
- [ ] Session tokens secure (httpOnly cookies in team mode)

---

## Error Handling

### User-Facing Errors
- [ ] 404 page displays for unknown routes
- [ ] 500 error page displays for server errors
- [ ] API errors show user-friendly messages
- [ ] Network errors show "Connection lost" message
- [ ] Invalid file uploads show clear error

### Developer Errors
- [ ] Console logs errors with context
- [ ] Stack traces visible in development
- [ ] Error boundaries prevent full app crash
- [ ] Sentry/error tracking placeholder visible (if implemented)

---

## CI/CD & DevOps

### Build Process
- [ ] `pnpm install` completes without errors
- [ ] `pnpm run build` compiles TypeScript successfully
- [ ] `pnpm run build` builds React production bundle
- [ ] `pnpm run start` serves production build
- [ ] `pnpm run dev` starts development server

### Docker
- [ ] `docker-compose up -d` builds and starts containers
- [ ] App accessible at http://localhost:3001
- [ ] Database persists between container restarts
- [ ] Uploads/outputs persist between restarts

### Environment Variables
- [ ] .env.example contains all required variables
- [ ] .env file not committed to git (.gitignore)
- [ ] Missing ANTHROPIC_API_KEY shows clear error
- [ ] Invalid API key handled gracefully

---

## MCP Integration

### MCP Server
- [ ] `pnpm run mcp:build` compiles MCP server
- [ ] MCP server runs: `node dist/server/mcp/openexpert-mcp.js`
- [ ] list_areas tool works
- [ ] list_modules tool works
- [ ] run_module tool works (requires openEXPERT running + API key)
- [ ] quick_analysis tool works
- [ ] Claude Desktop integration works (if configured)

---

## Documentation

### README.md
- [ ] Installation instructions clear
- [ ] Prerequisites listed
- [ ] Quick start guide works
- [ ] Screenshots/demos included
- [ ] License specified
- [ ] Contributing guidelines present

### API Documentation
- [ ] All endpoints documented
- [ ] Request/response examples provided
- [ ] Authentication requirements clear
- [ ] Error codes documented

### Code Quality
- [ ] TypeScript: zero compilation errors
- [ ] ESLint: zero linting errors
- [ ] Prettier: code formatted consistently
- [ ] Comments on complex functions
- [ ] No hardcoded secrets in code

---

## Total Checklist Items: 350+
**Pass Criteria:** 95%+ passing (< 18 failures acceptable for non-blocking issues)

---

**Notes:**
- ⚠ Items marked "(requires API key)" will fail without valid ANTHROPIC_API_KEY in .env
- ⚠ OAuth features require provider credentials (Google, GitHub, OIDC)
- ⚠ Team mode features require DEPLOYMENT_MODE=team and JWT_SECRET configured
