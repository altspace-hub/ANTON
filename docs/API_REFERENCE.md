# openEXPERT by ANTON — REST API Reference

> **Version:** Current
> **Base URL:** `http://localhost:3001/api`
> **Protocol:** HTTP/1.1 + Server-Sent Events (SSE) for streaming endpoints
> **Content-Type:** `application/json` unless otherwise noted

---

## Table of Contents

1. [Authentication](#authentication)
2. [Auth Endpoints (`/api/auth/*`)](#auth-endpoints)
3. [Claude / LLM Endpoints (`/api/claude/*`)](#claude--llm-endpoints)
4. [File Endpoints (`/api/files/*`)](#file-endpoints)
5. [Folder Endpoints (`/api/folders/*`)](#folder-endpoints)
6. [Session Endpoints (`/api/sessions/*`)](#session-endpoints)
7. [Module Endpoints (`/api/modules/*`)](#module-endpoints)
8. [Project Endpoints (`/api/projects/*`)](#project-endpoints)
9. [Engagement Endpoints (`/api/engagements/*`)](#engagement-endpoints)
10. [Workflow Endpoints (`/api/workflows/*`)](#workflow-endpoints)
11. [Export Endpoints (`/api/export/*`)](#export-endpoints)
12. [RAG Endpoints (`/api/rag/*`)](#rag-endpoints)
13. [Admin Endpoints (`/api/admin/*`)](#admin-endpoints)
14. [Config Endpoint](#config-endpoint)
15. [MCP Endpoints (`/mcp/*`)](#mcp-endpoints)
16. [Error Responses](#error-responses)
17. [cURL Examples](#curl-examples)

---

## Authentication

Authentication behaviour is controlled by the `DEPLOYMENT_MODE` environment variable.

| Mode | Behaviour |
|---|---|
| `solo` (default) | No authentication required on any endpoint |
| `team` | JWT Bearer token required on all endpoints marked **Yes** in the Auth column |

### Sending a token

Include the token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Obtain a token via [`POST /api/auth/login`](#post-apiauthlogin).

---

## Auth Endpoints

Base path: `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Register a new user (team mode only) |
| POST | `/api/auth/login` | No | Authenticate and receive a JWT |
| POST | `/api/auth/logout` | Yes | Invalidate the current session token |
| GET | `/api/auth/me` | Yes | Return the current user profile |
| POST | `/api/auth/forgot-password` | No | Send a password-reset email |
| POST | `/api/auth/reset-password` | No | Complete password reset with token |
| GET | `/api/auth/budget` | Yes | Return budget and usage status for the current user |
| GET | `/api/auth/google` | No | Initiate Google OAuth 2.0 flow |
| GET | `/api/auth/github` | No | Initiate GitHub OAuth flow |
| GET | `/api/auth/oidc` | No | Initiate enterprise OIDC/SSO flow |

### POST /api/auth/register

Register a new user account. Only functional when `DEPLOYMENT_MODE=team`.

**Request body:**

```json
{
  "username": "daniel.bardun",
  "password": "correcthorsebatterystaple",
  "email": "daniel@advisense.com"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `username` | string | Yes | Must be unique |
| `password` | string | Yes | Minimum 12 characters |
| `email` | string | No | Used for password reset |

**Response `201`:**

```json
{
  "user": { "id": "uuid", "username": "daniel.bardun", "email": "daniel@advisense.com", "role": "user" }
}
```

---

### POST /api/auth/login

Authenticate and receive a signed JWT.

**Request body:**

```json
{
  "username": "daniel.bardun",
  "password": "correcthorsebatterystaple"
}
```

**Response `200`:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": "uuid", "username": "daniel.bardun", "role": "user" }
}
```

---

### POST /api/auth/logout

Invalidates the current token server-side. Requires a valid Bearer token.

**Response `204`:** No content.

---

### GET /api/auth/me

Returns the profile of the authenticated user.

**Response `200`:**

```json
{
  "id": "uuid",
  "username": "daniel.bardun",
  "email": "daniel@advisense.com",
  "role": "user",
  "createdAt": "2025-10-01T09:00:00Z"
}
```

---

### POST /api/auth/forgot-password

Sends a password reset link to the registered email address.

**Request body:**

```json
{ "email": "daniel@advisense.com" }
```

**Response `200`:** Always returns success to prevent user enumeration.

```json
{ "message": "If that email is registered, a reset link has been sent." }
```

---

### POST /api/auth/reset-password

Completes the password reset flow using the token from the reset email.

**Request body:**

```json
{
  "token": "<reset-token-from-email>",
  "newPassword": "newSecurePassword123!"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `token` | string | Yes | One-time token from reset email |
| `newPassword` | string | Yes | Minimum 12 characters |

**Response `200`:**

```json
{ "message": "Password updated successfully." }
```

---

### GET /api/auth/budget

Returns the current user's token and cost budget status.

**Response `200`:**

```json
{
  "tokensUsedThisMonth": 1250000,
  "tokenBudgetLimit": 5000000,
  "estimatedCostUSD": 18.75,
  "budgetLimitUSD": 100.00,
  "resetDate": "2026-03-01"
}
```

---

### OAuth / SSO Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/auth/google` | Redirects to Google OAuth 2.0 consent screen. Requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. |
| `GET /api/auth/github` | Redirects to GitHub OAuth authorisation page. Requires `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. |
| `GET /api/auth/oidc` | Redirects to the configured enterprise Identity Provider. Requires `OIDC_ISSUER_URL` and `OIDC_CLIENT_ID`. |

All OAuth flows return to the configured `OAUTH_CALLBACK_URL` with a JWT on success.

---

## Claude / LLM Endpoints

Base path: `/api/claude`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/claude/message` | Yes | Stream an AI response via SSE — primary inference endpoint |
| GET | `/api/claude/models` | Yes | List available models with capabilities and pricing |
| GET | `/api/claude/budget` | Yes | Get token budget status for the current session |

---

### POST /api/claude/message

The primary endpoint for all AI inference. Responses are streamed as [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events).

**Request body:**

```json
{
  "model": "claude-opus-4-6",
  "thinking": "think_hard",
  "creativity": "balanced",
  "messages": [
    { "role": "user", "content": "Perform a gap analysis against AMLR Article 20." }
  ],
  "systemPrompt": "You are an expert AML compliance advisor...",
  "knowledgeSources": {
    "claudeKnowledge": { "enabled": true, "webSearchEnabled": true, "description": "AMLR 2024/1624" },
    "onlineReference": { "enabled": false, "urls": [], "fetchDepth": "summary" },
    "localFolder": { "enabled": true, "folderPaths": ["/Users/daniel/Clients/Nordea"], "recursive": true },
    "combinedMode": { "enabled": false, "priority": "merged" }
  },
  "outputFormats": ["gap-scoring-matrix", "executive-summary"],
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `model` | string | Yes | See `GET /api/claude/models` for valid values |
| `thinking` | string | Yes | `quick` \| `think` \| `think_hard` \| `investigate` \| `plan_first` |
| `creativity` | string | Yes | `strict` \| `balanced` \| `creative` |
| `messages` | array | Yes | Conversation history including the new user message |
| `systemPrompt` | string | No | Overrides the module default system prompt |
| `knowledgeSources` | object | No | Knowledge source configuration (see Core System 1 in project docs) |
| `outputFormats` | array | No | Output format IDs (see Core System 2 in project docs) |
| `sessionId` | string | No | Associates the request with an existing session |

**SSE Response events:**

Each event is a JSON payload on a `data:` line. The stream ends with `data: [DONE]`.

| Event type | Payload | Description |
|---|---|---|
| `thinking` | `{ "type": "thinking", "thinking": "..." }` | Extended thinking block from the model |
| `text` | `{ "type": "text", "text": "..." }` | Streamed text chunk — append to display buffer |
| `web_search` | `{ "type": "web_search", "query": "..." }` | Web search in progress |
| `web_search_result` | `{ "type": "web_search_result", "url": "...", "title": "..." }` | Search result retrieved |
| `done` | `[DONE]` | Stream complete — no more events |

**Thinking level → API mapping:**

| Level | Opus 4.6 (effort) | Sonnet / Haiku (budget_tokens) |
|---|---|---|
| `quick` | `low` | disabled |
| `think` | `medium` | 4,096 |
| `think_hard` | `high` | 16,384 |
| `investigate` | `max` | 32,768 |
| `plan_first` | `max` | 32,768 |

---

### GET /api/claude/models

Returns all available models with capability and pricing information.

**Response `200`:**

```json
{
  "models": [
    {
      "id": "claude-opus-4-6",
      "label": "Claude Opus 4.6",
      "description": "Most capable. Recommended for all compliance work.",
      "inputCostPer1MTokens": 15.00,
      "outputCostPer1MTokens": 75.00,
      "maxTokens": 32000,
      "supportsAdaptiveThinking": true
    },
    {
      "id": "claude-sonnet-4-5-20250929",
      "label": "Claude Sonnet 4.5",
      "description": "Faster and lower cost. Good for drafting and iteration.",
      "inputCostPer1MTokens": 3.00,
      "outputCostPer1MTokens": 15.00,
      "maxTokens": 8192,
      "supportsAdaptiveThinking": false
    }
  ]
}
```

---

### GET /api/claude/budget

Returns token budget status scoped to the current session or user.

**Response `200`:**

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "tokensUsed": 45200,
  "maxContextTokens": 180000,
  "percentUsed": 25.1,
  "estimatedCostUSD": 2.10
}
```

---

## File Endpoints

Base path: `/api/files`

Supported file types: `.pdf` `.docx` `.doc` `.txt` `.md` `.xlsx` `.csv` `.html`
Maximum file size: configured by `MAX_FILE_SIZE_MB` in `.env` (default: 50 MB).

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/files/upload` | Yes | Upload a file using `multipart/form-data` |
| GET | `/api/files/:id` | Yes | Get metadata for an uploaded file |
| DELETE | `/api/files/:id` | Yes | Delete an uploaded file |
| POST | `/api/files/extract` | Yes | Extract plain text from an uploaded file |

---

### POST /api/files/upload

Upload a file for use in analysis. Use `multipart/form-data` with the field name `file`.

**Request:** `Content-Type: multipart/form-data`

**Response `201`:**

```json
{
  "id": "file-uuid",
  "name": "nordea-aml-policy-2024.pdf",
  "path": "/uploads/file-uuid-nordea-aml-policy-2024.pdf",
  "size": 524288,
  "mimeType": "application/pdf",
  "uploadedAt": "2026-02-25T10:30:00Z"
}
```

---

### GET /api/files/:id

Returns metadata for a previously uploaded file.

**Response `200`:** Same structure as upload response.

---

### DELETE /api/files/:id

Permanently removes the file from the upload directory.

**Response `204`:** No content.

---

### POST /api/files/extract

Extracts plain text from an uploaded file. Supports all file types listed above.

**Request body:**

```json
{ "fileId": "file-uuid" }
```

**Response `200`:**

```json
{
  "fileId": "file-uuid",
  "text": "1. Introduction\nThis Anti-Money Laundering Policy...",
  "wordCount": 12400,
  "tokenEstimate": 16533
}
```

---

## Folder Endpoints

Base path: `/api/folders`

> **Security:** All folder paths are validated against the `ALLOWED_FOLDER_PATHS` list in `.env`. Any request referencing a path outside the allowed bases returns `403 Forbidden`. Path traversal sequences (`../`) are rejected.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/folders/browse` | Yes | List the contents of a directory |
| POST | `/api/folders/register` | Yes | Save a folder for reuse across sessions |
| GET | `/api/folders/registered` | Yes | List all saved folders |
| DELETE | `/api/folders/registered/:id` | Yes | Remove a saved folder |
| POST | `/api/folders/index` | Yes | Full text inventory of all supported files in a folder |

---

### POST /api/folders/browse

Returns the immediate contents of a directory.

**Request body:**

```json
{ "path": "/Users/daniel/Advisense/Regulations/AMLR" }
```

**Response `200`:**

```json
{
  "path": "/Users/daniel/Advisense/Regulations/AMLR",
  "items": [
    { "name": "AMLR-2024-1624-full.pdf", "path": "/Users/daniel/Advisense/Regulations/AMLR/AMLR-2024-1624-full.pdf", "isDirectory": false, "extension": ".pdf", "isSupported": true, "sizeBytes": 2097152 },
    { "name": "RTS-drafts", "path": "/Users/daniel/Advisense/Regulations/AMLR/RTS-drafts", "isDirectory": true, "extension": null, "isSupported": false }
  ]
}
```

---

### POST /api/folders/register

Saves a folder path to SQLite so it is available across all sessions.

**Request body:**

```json
{
  "path": "/Users/daniel/Advisense/Regulations/AMLR",
  "label": "AMLR Regulation Texts"
}
```

**Response `201`:**

```json
{
  "id": "folder-uuid",
  "path": "/Users/daniel/Advisense/Regulations/AMLR",
  "label": "AMLR Regulation Texts",
  "registeredAt": "2026-02-25T10:00:00Z"
}
```

---

### GET /api/folders/registered

Returns all folders registered by the current user.

**Response `200`:**

```json
{
  "folders": [
    { "id": "folder-uuid", "path": "/Users/daniel/Advisense/Regulations/AMLR", "label": "AMLR Regulation Texts", "registeredAt": "2026-02-25T10:00:00Z" }
  ]
}
```

---

### DELETE /api/folders/registered/:id

Removes the registration record. Does not delete files from disk.

**Response `204`:** No content.

---

### POST /api/folders/index

Scans a folder, extracts text from all supported files, and returns a full inventory with token estimates. Use this before sending documents to Claude to check context size.

**Request body:**

```json
{
  "path": "/Users/daniel/Advisense/Regulations/AMLR",
  "recursive": true,
  "filter": [".pdf", ".docx"]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `path` | string | Yes | Absolute path within allowed bases |
| `recursive` | boolean | No | Include subdirectories (default: `false`) |
| `filter` | array | No | Limit to specific extensions. Omit to include all supported types. |

**Response `200`:**

```json
{
  "path": "/Users/daniel/Advisense/Regulations/AMLR",
  "files": [
    { "name": "AMLR-2024-1624-full.pdf", "path": "...", "extension": ".pdf", "sizeBytes": 2097152, "wordCount": 89000, "tokenEstimate": 118667 }
  ],
  "totalFiles": 12,
  "totalWords": 145000,
  "totalTokenEstimate": 193333,
  "extensions": { ".pdf": 9, ".docx": 3 }
}
```

---

## Session Endpoints

Base path: `/api/sessions`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/sessions` | Yes | List all sessions, most recent first |
| POST | `/api/sessions` | Yes | Create a new session |
| GET | `/api/sessions/:id` | Yes | Get a session including full message history |
| PUT | `/api/sessions/:id` | Yes | Update session title, summary, or config |
| DELETE | `/api/sessions/:id` | Yes | Delete a session and all its messages |

---

### GET /api/sessions

**Response `200`:**

```json
{
  "sessions": [
    { "id": "uuid", "moduleId": "gap-analysis", "title": "Nordea AMLR Gap Analysis", "createdAt": "2026-02-25T09:00:00Z", "updatedAt": "2026-02-25T11:30:00Z", "messageCount": 6 }
  ]
}
```

---

### POST /api/sessions

**Request body:**

```json
{
  "moduleId": "gap-analysis",
  "title": "Nordea AMLR Gap Analysis",
  "config": {
    "model": "claude-opus-4-6",
    "thinking": "investigate",
    "creativity": "strict"
  }
}
```

**Response `201`:** Full session object including generated `id`.

---

### GET /api/sessions/:id

Returns the session record with complete message history.

**Response `200`:**

```json
{
  "id": "uuid",
  "moduleId": "gap-analysis",
  "title": "Nordea AMLR Gap Analysis",
  "config": { ... },
  "messages": [
    { "id": "msg-uuid", "role": "user", "content": "Analyse the attached policy...", "createdAt": "..." },
    { "id": "msg-uuid", "role": "assistant", "content": "# Gap Scoring Matrix\n...", "createdAt": "..." }
  ],
  "summary": "Gap analysis of Nordea AML policy against AMLR Articles 15-25.",
  "createdAt": "2026-02-25T09:00:00Z"
}
```

---

### PUT /api/sessions/:id

**Request body (all fields optional):**

```json
{
  "title": "Updated session title",
  "summary": "Auto-generated or manually edited summary.",
  "config": { "thinking": "think_hard" }
}
```

**Response `200`:** Updated session object.

---

### DELETE /api/sessions/:id

Permanently deletes the session and all associated messages.

**Response `204`:** No content.

---

## Module Endpoints

Base path: `/api/modules`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/modules` | No | List all built-in modules with metadata |
| GET | `/api/modules/:id` | No | Get a single module config including its system prompt |
| GET | `/api/modules/custom` | Yes | List user-created custom modules |
| POST | `/api/modules/custom` | Yes | Create a custom module |
| PUT | `/api/modules/custom/:id` | Yes | Update a custom module |
| DELETE | `/api/modules/custom/:id` | Yes | Delete a custom module |

---

### GET /api/modules

**Response `200`:**

```json
{
  "modules": [
    {
      "id": "gap-analysis",
      "label": "AMLR Gap Analysis",
      "description": "Identify compliance gaps against AMLR requirements.",
      "defaultThinking": "investigate",
      "defaultCreativity": "strict",
      "defaultOutputFormats": ["gap-scoring-matrix", "executive-summary", "action-plan"],
      "icon": "Search"
    }
  ]
}
```

---

### GET /api/modules/:id

Returns the full module configuration, including the rendered system prompt.

**Response `200`:** Module object with additional `systemPrompt` string field.

---

### POST /api/modules/custom

**Request body:**

```json
{
  "name": "Sanctions Screening Review",
  "description": "Custom workflow for reviewing screening hits.",
  "systemPrompt": "You are a sanctions specialist...",
  "defaults": {
    "thinking": "think_hard",
    "creativity": "strict",
    "outputFormats": ["decision-memo"]
  }
}
```

**Response `201`:** Created custom module object with generated `id`.

---

## Project Endpoints

Base path: `/api/projects`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/projects` | Yes | List all projects |
| POST | `/api/projects` | Yes | Create a project |
| GET | `/api/projects/:id` | Yes | Get project details |
| PUT | `/api/projects/:id` | Yes | Update a project |
| DELETE | `/api/projects/:id` | Yes | Archive a project |
| GET | `/api/projects/:id/files` | Yes | List files associated with the project |
| POST | `/api/projects/:id/members` | Yes | Add a team member to the project (team mode) |

---

### POST /api/projects

**Request body:**

```json
{
  "name": "Nordea AMLR Implementation 2026",
  "description": "End-to-end AMLR readiness programme for Nordea.",
  "templateId": "amlr-implementation"
}
```

**Response `201`:** Project object with `id`, `name`, `description`, `createdAt`, `status: "active"`.

---

### POST /api/projects/:id/members

Add a user to the project. Only available in `team` mode.

**Request body:**

```json
{ "userId": "user-uuid", "role": "contributor" }
```

**Response `200`:** Updated project members list.

---

## Engagement Endpoints

Base path: `/api/engagements`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/engagements` | Yes | List all engagements |
| POST | `/api/engagements` | Yes | Create an engagement |
| GET | `/api/engagements/:id` | Yes | Get engagement with deliverables |
| PUT | `/api/engagements/:id` | Yes | Update an engagement |
| DELETE | `/api/engagements/:id` | Yes | Delete an engagement |
| POST | `/api/engagements/:id/parse-scope` | Yes | Parse scope text into structured deliverables |

---

### POST /api/engagements

**Request body:**

```json
{
  "title": "AMLR Readiness Assessment — Nordea",
  "scope": "Assess compliance gaps across all AMLR Chapters relevant to a credit institution.",
  "projectId": "project-uuid"
}
```

**Response `201`:** Engagement object with `id`, `title`, `scope`, `projectId`, `deliverables: []`, `status: "scoping"`.

---

### POST /api/engagements/:id/parse-scope

Sends the engagement's scope text to Claude to generate a structured list of deliverables automatically.

**Request body:** Empty — uses the engagement's existing `scope` field.

**Response `200`:**

```json
{
  "deliverables": [
    { "title": "Gap Scoring Matrix", "outputFormat": "gap-scoring-matrix", "estimatedEffort": "high" },
    { "title": "Executive Summary for Board", "outputFormat": "executive-summary", "estimatedEffort": "medium" }
  ]
}
```

---

## Workflow Endpoints

Base path: `/api/workflows`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/workflows` | Yes | List all workflows |
| POST | `/api/workflows` | Yes | Create a workflow |
| GET | `/api/workflows/:id` | Yes | Get a workflow definition |
| PUT | `/api/workflows/:id` | Yes | Update a workflow |
| DELETE | `/api/workflows/:id` | Yes | Delete a workflow |
| POST | `/api/workflows/:id/execute` | Yes | Execute a workflow — returns SSE stream of step results |

---

### POST /api/workflows

**Request body:**

```json
{
  "name": "Gap Analysis → Board Report Pipeline",
  "steps": [
    { "moduleId": "gap-analysis", "prompt": "Perform a gap analysis against AMLR Chapter III." },
    { "moduleId": "document-creation", "prompt": "Convert the gap analysis findings into a board-ready executive summary." }
  ]
}
```

**Response `201`:** Workflow object.

---

### POST /api/workflows/:id/execute

Executes all steps sequentially. Each step's output is automatically passed as context to the next step.

**Response:** SSE stream. Events follow the same format as `POST /api/claude/message`, with an additional `step` event:

```
data: {"type":"step","stepIndex":0,"stepTitle":"Gap Analysis"}
data: {"type":"text","text":"# Gap Scoring Matrix..."}
data: {"type":"step","stepIndex":1,"stepTitle":"Board Report"}
data: {"type":"text","text":"# Executive Summary..."}
data: [DONE]
```

---

## Export Endpoints

Base path: `/api/export`

All export endpoints accept a JSON body and return a file download with appropriate `Content-Disposition` and MIME headers.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/export/docx` | Yes | Convert Markdown to DOCX with Advisense styling |
| POST | `/api/export/xlsx` | Yes | Convert structured data to formatted XLSX |
| POST | `/api/export/pdf` | Yes | Convert Markdown to branded PDF via Puppeteer |
| POST | `/api/export/pptx` | Yes | Convert a presentation outline to PPTX |

---

### POST /api/export/docx

**Request body:**

```json
{
  "content": "# Executive Summary\n\nThis analysis identifies 14 gaps...",
  "title": "Nordea AMLR Gap Analysis",
  "sessionId": "session-uuid"
}
```

**Response:** Binary DOCX file.
`Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
`Content-Disposition: attachment; filename="Nordea-AMLR-Gap-Analysis.docx"`

---

### POST /api/export/xlsx

Accepts structured data (arrays of objects) and produces a formatted spreadsheet with conditional formatting (RAG colours), auto-filters, and frozen header rows.

**Request body:**

```json
{
  "data": [
    { "Article": "Art. 20", "Requirement": "CDD on customers", "CurrentState": "Partial", "RAGScore": "Amber", "Priority": "High" }
  ],
  "title": "AMLR Gap Scoring Matrix"
}
```

**Response:** Binary XLSX file.
`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

### POST /api/export/pdf

**Request body:**

```json
{
  "content": "# Executive Summary\n\nThis analysis...",
  "title": "Nordea AMLR Gap Analysis"
}
```

**Response:** Binary PDF file.
`Content-Type: application/pdf`

---

### POST /api/export/pptx

Converts a slide-by-slide outline (from the `stakeholder-presentation` output format) into a PPTX file.

**Request body:**

```json
{
  "outline": "## Slide 1: Executive Overview\n- Key finding 1\n- Key finding 2\n\n## Slide 2: Gap Summary\n...",
  "title": "AMLR Readiness — Board Presentation"
}
```

**Response:** Binary PPTX file.
`Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation`

---

## RAG Endpoints

Base path: `/api/rag`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/rag/collections` | Yes | List all RAG collections |
| POST | `/api/rag/collections` | Yes | Create a new collection |
| POST | `/api/rag/collections/:id/documents` | Yes | Add a document to a collection |
| POST | `/api/rag/search` | Yes | Semantic search across one or all collections |

---

### GET /api/rag/collections

**Response `200`:**

```json
{
  "collections": [
    { "id": "col-uuid", "name": "AMLR Reference Texts", "description": "Full AMLR and associated RTS.", "documentCount": 7, "createdAt": "2026-01-10T00:00:00Z" }
  ]
}
```

---

### POST /api/rag/collections

**Request body:**

```json
{
  "name": "AMLR Reference Texts",
  "description": "Full AMLR regulation and associated RTS consultation papers."
}
```

**Response `201`:** Collection object.

---

### POST /api/rag/collections/:id/documents

Adds a previously uploaded file to a RAG collection. The server chunks, embeds, and indexes the document.

**Request body:**

```json
{ "fileId": "file-uuid" }
```

**Response `202`:**

```json
{ "status": "indexing", "message": "Document queued for embedding. Check collection status for completion." }
```

---

### POST /api/rag/search

**Request body:**

```json
{
  "query": "What are the CDD obligations for high-risk third countries under AMLR?",
  "collectionId": "col-uuid",
  "topK": 5
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `query` | string | Yes | Natural language search query |
| `collectionId` | string | No | Scope to a specific collection. Omit to search all collections. |
| `topK` | integer | No | Number of results to return (default: `5`) |

**Response `200`:**

```json
{
  "results": [
    { "text": "Article 20(3): Obliged entities shall apply enhanced due diligence measures...", "score": 0.94, "source": "AMLR-2024-1624-full.pdf", "page": 47 }
  ]
}
```

---

## Admin Endpoints

Base path: `/api/admin`

> All admin endpoints require an authenticated user with `role: "admin"`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/users` | List all registered users |
| POST | `/api/admin/users` | Create a user |
| PUT | `/api/admin/users/:id` | Update user role or status |
| DELETE | `/api/admin/users/:id` | Delete a user |
| GET | `/api/admin/audit` | Retrieve the security audit log |
| GET | `/api/admin/stats` | Usage statistics across all users |

---

### GET /api/admin/audit

Returns the security audit log. Supports query parameter filtering.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `from` | ISO 8601 date | Start of date range |
| `to` | ISO 8601 date | End of date range |
| `type` | string | Event type filter (e.g., `login`, `export`, `api_call`) |
| `severity` | string | `info` \| `warning` \| `critical` |

**Example:** `GET /api/admin/audit?from=2026-02-01&severity=warning`

**Response `200`:**

```json
{
  "events": [
    { "id": "evt-uuid", "type": "login_failed", "severity": "warning", "userId": null, "ip": "192.168.1.1", "detail": "Unknown username", "timestamp": "2026-02-25T08:14:00Z" }
  ],
  "total": 1
}
```

---

### GET /api/admin/stats

**Response `200`:**

```json
{
  "totalUsers": 14,
  "activeSessionsToday": 5,
  "totalApiCallsThisMonth": 3840,
  "totalTokensThisMonth": 12500000,
  "estimatedCostThisMonthUSD": 187.50
}
```

---

## Config Endpoint

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/config` | No | Returns deployment configuration for the frontend |

### GET /api/config

Returns non-sensitive deployment configuration used by the frontend to determine which features to show.

**Response `200`:**

```json
{
  "deploymentMode": "solo",
  "version": "1.4.0",
  "googleOAuthEnabled": false,
  "githubOAuthEnabled": false,
  "oidcEnabled": false
}
```

---

## MCP Endpoints

> MCP routes are mounted at `/mcp` — **not** under `/api`. Rate limit: **10 requests per minute per IP**.

| Method | Path | Description |
|---|---|---|
| GET | `/mcp` | Health check and server info |
| GET | `/mcp/tools` | List all available MCP tools |
| POST | `/mcp/execute` | Execute an MCP tool |

---

### GET /mcp

**Response `200`:**

```json
{
  "status": "ok",
  "server": "openEXPERT ANTON MCP Server",
  "version": "1.4.0",
  "toolCount": 8
}
```

---

### GET /mcp/tools

**Response `200`:**

```json
{
  "tools": [
    { "name": "score_quality", "description": "Score a compliance document for quality and completeness.", "parameters": { "content": "string", "rubric": "string" } },
    { "name": "extract_requirements", "description": "Extract structured requirements from a regulatory text.", "parameters": { "text": "string", "jurisdiction": "string" } }
  ]
}
```

---

### POST /mcp/execute

**Request body:**

```json
{
  "tool": "score_quality",
  "params": {
    "content": "1. Introduction\nThis AML Policy...",
    "rubric": "AMLR Chapter III"
  }
}
```

**Response `200`:** Tool-specific output object. Structure varies by tool.

---

## Error Responses

All errors return a consistent JSON body:

```json
{ "error": "Human-readable error message." }
```

In development (`NODE_ENV=development`), error objects may include a `detail` field with a stack trace or additional context. This field is suppressed in production.

| Status | Meaning |
|---|---|
| `400` | Bad request — missing required fields or validation failure |
| `401` | Unauthorized — missing or expired Bearer token |
| `403` | Forbidden — insufficient role permissions, or folder path outside allowed bases |
| `404` | Not found — resource does not exist |
| `429` | Rate limited — slow down requests |
| `500` | Internal server error |

---

## cURL Examples

### 1. Login and obtain a token

```bash
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "daniel.bardun", "password": "correcthorsebatterystaple"}' \
  | jq '.token'
```

Store the token: `TOKEN=$(curl -s ... | jq -r '.token')`

---

### 2. Stream an AI message

```bash
curl -N -X POST http://localhost:3001/api/claude/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "claude-opus-4-6",
    "thinking": "think_hard",
    "creativity": "balanced",
    "messages": [{"role": "user", "content": "Summarise Article 20 of AMLR 2024/1624."}],
    "outputFormats": ["quick-briefing"]
  }'
```

The `-N` flag disables output buffering so SSE events print as they arrive.

---

### 3. Upload a file

```bash
curl -X POST http://localhost:3001/api/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/Users/daniel/Clients/Nordea/aml-policy-2024.pdf"
```

---

### 4. Browse a local folder

```bash
curl -X POST http://localhost:3001/api/folders/browse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"path": "/Users/daniel/Advisense/Regulations/AMLR"}'
```

---

### 5. Export output to DOCX

```bash
curl -X POST http://localhost:3001/api/export/docx \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "content": "# Executive Summary\n\nThis analysis identifies 14 compliance gaps...",
    "title": "Nordea AMLR Gap Analysis"
  }' \
  --output "Nordea-AMLR-Gap-Analysis.docx"
```

---

*This document covers all REST endpoints implemented in the openEXPERT by ANTON Express server. For SSE streaming details, see the Claude client implementation in `server/services/claude-client.ts`. For output format definitions, see `src/lib/output-format-definitions.ts`.*
