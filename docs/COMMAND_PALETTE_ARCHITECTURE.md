# Command Palette Architecture

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER INTERACTION                             │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 │ Press Cmd+K / Ctrl+K
                                 │ or Click "Commands" button
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 FRONTEND: CommandPalette.tsx                        │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  Modal Overlay                                             │    │
│  │  ┌─────────────────────────────────────────────────────┐   │    │
│  │  │ Search Icon │ Input Field │ Execute Button          │   │    │
│  │  └─────────────────────────────────────────────────────┘   │    │
│  │                                                             │    │
│  │  ┌─────────────────────────────────────────────────────┐   │    │
│  │  │ Parsed Command Preview (if parsed)                  │   │    │
│  │  │ "Interpreted as: navigate → page: workflows"        │   │    │
│  │  └─────────────────────────────────────────────────────┘   │    │
│  │                                                             │    │
│  │  ┌─────────────────────────────────────────────────────┐   │    │
│  │  │ Result (if executed)                                │   │    │
│  │  │ ✓ "Navigating to workflows..."                      │   │    │
│  │  └─────────────────────────────────────────────────────┘   │    │
│  │                                                             │    │
│  │  ┌─────────────────────────────────────────────────────┐   │    │
│  │  │ Recent Commands (from localStorage)                 │   │    │
│  │  │ • Create gap analysis for Nordea                    │   │    │
│  │  │ • Go to workflows                                   │   │    │
│  │  └─────────────────────────────────────────────────────┘   │    │
│  │                                                             │    │
│  │  ┌─────────────────────────────────────────────────────┐   │    │
│  │  │ Example Commands                                    │   │    │
│  │  │ • Create a gap analysis workflow for [client]       │   │    │
│  │  │ • Show me all sessions about AMLR                   │   │    │
│  │  │ • Go to workflows / projects / quality              │   │    │
│  │  └─────────────────────────────────────────────────────┘   │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 │ User types command & presses Enter
                                 │ POST /api/commands/execute
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                BACKEND: routes/commands.ts                          │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ POST /api/commands/parse                                   │    │
│  │   → Parse command only (return interpretation)             │    │
│  │                                                             │    │
│  │ POST /api/commands/execute                                 │    │
│  │   → Parse AND execute command                              │    │
│  │   ├─ Call parseCommand(input, anthropic)                   │    │
│  │   └─ Call executeCommand(parsed, { db, userId })           │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                ┌────────────────┴────────────────┐
                ▼                                 ▼
┌────────────────────────────────┐  ┌────────────────────────────────┐
│ services/command-parser.ts     │  │ services/command-parser.ts     │
│                                │  │                                │
│ parseCommand()                 │  │ executeCommand()               │
│ ┌────────────────────────────┐ │  │ ┌────────────────────────────┐ │
│ │ Claude Haiku API Call      │ │  │ │ switch(parsed.action) {    │ │
│ │                            │ │  │ │   case 'create_session':   │ │
│ │ Model:                     │ │  │ │     → /module/:id          │ │
│ │ claude-haiku-4-5-20251001  │ │  │ │                            │ │
│ │                            │ │  │ │   case 'navigate_to':      │ │
│ │ Input:                     │ │  │ │     → page URL             │ │
│ │ User command + examples    │ │  │ │                            │ │
│ │                            │ │  │ │   case 'search_sessions':  │ │
│ │ Output (JSON):             │ │  │ │     → /projects?search=    │ │
│ │ {                          │ │  │ │                            │ │
│ │   commandType: "navigate", │ │  │ │   case 'rebuild_graph':    │ │
│ │   action: "navigate_to",   │ │  │ │     → graph.buildGraph()   │ │
│ │   parameters: {            │ │  │ │                            │ │
│ │     page: "workflows"      │ │  │ │   case 'run_quality_check':│ │
│ │   },                       │ │  │ │     → /quality             │ │
│ │   confidence: 0.95         │ │  │ │                            │ │
│ │ }                          │ │  │ │   case 'run_pattern_...':  │ │
│ └────────────────────────────┘ │  │ │     → engine.detect()      │ │
│                                │  │ │ }                          │ │
│ ~200-400ms latency            │  │ └────────────────────────────┘ │
│ ~$0.0001 per call             │  │                                │
└────────────────────────────────┘  └────────────────────────────────┘
                                                 │
                                                 ▼
                                    ┌────────────────────────────┐
                                    │ Return ExecutionResult     │
                                    │ {                          │
                                    │   success: true,           │
                                    │   message: "...",          │
                                    │   redirect?: "/path",      │
                                    │   data?: {...}             │
                                    │ }                          │
                                    └────────────────────────────┘
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FRONTEND: CommandPalette.tsx                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Display result                                             │    │
│  │   if (success && redirect) {                               │    │
│  │     setTimeout(() => window.location.href = redirect, 800) │    │
│  │   }                                                         │    │
│  │                                                             │    │
│  │ Save to recent commands (localStorage)                     │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                                 │
                                                 ▼
                                    ┌────────────────────────────┐
                                    │ USER SEES RESULT           │
                                    │ ✓ Success message          │
                                    │ ✓ Auto-redirect            │
                                    │ or                         │
                                    │ ✗ Error message            │
                                    └────────────────────────────┘
```

## Component Hierarchy

```
App.tsx
├── PWAInstallPrompt
├── CommandPalette ◄─── GLOBAL (accessible everywhere)
│   ├── Modal Overlay (z-index: 50)
│   ├── Input Field
│   ├── Execute Button
│   ├── Parsed Command Preview
│   ├── Result Display
│   ├── Recent Commands List
│   └── Example Commands
└── Suspense
    └── Routes
        └── MainLayout
            ├── Sidebar
            ├── Header
            │   └── "Commands ⌘K" Button ◄─── VISUAL INDICATOR
            └── Outlet (page content)
```

## Data Flow

### 1. User Input → Parse
```
User Types: "Create gap analysis for Nordea"
    ↓
CommandPalette Component
    ↓
fetch('/api/commands/execute', {
  method: 'POST',
  body: JSON.stringify({ input: "Create gap analysis for Nordea" })
})
    ↓
Server: routes/commands.ts
    ↓
parseCommand(input, anthropic)
    ↓
Claude Haiku API
    ↓
Returns: {
  commandType: "create",
  action: "create_session",
  parameters: { moduleId: "gap-analysis", context: "Nordea" },
  confidence: 0.9
}
```

### 2. Execute Action
```
Parsed Command
    ↓
executeCommand(parsed, { db, userId })
    ↓
switch(action) → case 'create_session'
    ↓
Returns: {
  success: true,
  message: "Creating gap-analysis session...",
  redirect: "/module/gap-analysis?context=Nordea"
}
```

### 3. UI Response
```
ExecutionResult
    ↓
CommandPalette.setResult(result)
    ↓
Display success message + redirect indicator
    ↓
setTimeout(() => window.location.href = redirect, 800)
    ↓
User navigated to /module/gap-analysis?context=Nordea
```

## State Management

### Frontend State (React useState)
```typescript
const [isOpen, setIsOpen] = useState(false);           // Modal open/closed
const [input, setInput] = useState('');                // User's typed command
const [loading, setLoading] = useState(false);         // API call in progress
const [result, setResult] = useState<Result | null>(); // Execution result
const [parsed, setParsed] = useState<Parsed | null>(); // Parsed command
```

### Persistent State (localStorage)
```typescript
const [recentCommands, setRecentCommands] = useState<string[]>(() => {
  return JSON.parse(localStorage.getItem('recent-commands') || '[]');
});

// Updated on each successful command execution
localStorage.setItem('recent-commands', JSON.stringify(updated));
```

## API Endpoints

### POST /api/commands/parse
**Purpose**: Parse command without executing (for preview/debugging)

**Request**:
```json
{
  "input": "Create gap analysis for Nordea"
}
```

**Response**:
```json
{
  "commandType": "create",
  "action": "create_session",
  "parameters": {
    "moduleId": "gap-analysis",
    "context": "Nordea"
  },
  "confidence": 0.9
}
```

### POST /api/commands/execute
**Purpose**: Parse AND execute command

**Request**:
```json
{
  "input": "Go to workflows"
}
```

**Response**:
```json
{
  "parsed": {
    "commandType": "navigate",
    "action": "navigate_to",
    "parameters": { "page": "workflows" },
    "confidence": 1.0
  },
  "result": {
    "success": true,
    "message": "Navigating to workflows...",
    "redirect": "/workflows"
  }
}
```

## Security & Authentication

```
User Request
    ↓
Express Middleware Stack
    ↓
Rate Limiting (generalLimiter: 300 req/15min)
    ↓
Auth Middleware (createAuthMiddleware)
    ↓
Commands Routes (protected)
    ↓
Command Parser Service (uses user context from req.user)
```

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| Parse Latency | 200-400ms | Claude Haiku API call |
| Execute Latency | <10ms | Most actions (navigation, session creation) |
| Execute Latency | 100-500ms | Heavy actions (graph rebuild, pattern detection) |
| Bundle Impact | ~8.4 KB | CommandPalette component (pre-gzip) |
| Memory Impact | Minimal | Modal only renders when open |
| Cost per Command | ~$0.0001 | Claude Haiku pricing |

## Error Handling

```
CommandPalette
    ↓
try {
  const response = await fetch('/api/commands/execute', {...});
  const data = await response.json();

  if (data.result.success) {
    // Show success message
    // Auto-redirect if applicable
    // Save to recent commands
  } else {
    // Show error message
  }
} catch (error) {
  // Network error / API unavailable
  setResult({
    success: false,
    message: 'Command execution failed.'
  });
}
```

## Extension Points

### Adding New Command Types
1. Update `COMMAND_PARSING_PROMPT` in `command-parser.ts` with examples
2. Add new case to `executeCommand()` switch statement
3. Implement action handler

### Adding New Navigation Targets
```typescript
// In command-parser.ts → executeCommand() → case 'navigate_to'
const pageMap: Record<string, string> = {
  // ... existing pages
  'my-new-page': '/my-new-page',  // ◄─── ADD HERE
};
```

### Adding New Module Support
Module IDs are automatically supported via pattern matching. No code changes needed if module exists in MODULES constant.

## Testing Strategy

### Unit Tests (Future)
- `parseCommand()` with various inputs
- `executeCommand()` for each action type
- Edge cases: empty input, invalid JSON, low confidence

### Integration Tests (Future)
- Full flow: input → parse → execute → result
- API error handling
- Authentication/authorization
- Rate limiting

### Manual Testing (Current)
See COMMAND_PALETTE_IMPLEMENTATION.md → Testing Checklist

## Monitoring & Debugging

### Client-Side Debugging
```javascript
// Browser console
localStorage.getItem('recent-commands')  // View history
```

### Server-Side Debugging
```javascript
// server/services/command-parser.ts
console.log('[command-parser] Parse error:', error);
console.error('[commands] Execute error:', error);
```

### Audit Trail
All command executions are logged through existing Express logging middleware and can be viewed in the audit log at `/audit`.

---

**Document Version**: 1.0
**Last Updated**: 2026-02-19
**Maintainer**: openEXPERT Development Team
