# Command Palette

## Overview

The Command Palette is a natural language command interface for openEXPERT. It allows users to quickly navigate, create sessions, search, and execute tasks using plain English commands instead of clicking through menus.

## Activation

- **Keyboard Shortcut**: `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux)
- **Header Button**: Click the "Commands" button in the header (desktop only)

## How It Works

1. **Press Cmd+K / Ctrl+K** to open the command palette
2. **Type a natural language command** (e.g., "Create gap analysis for Nordea")
3. **Press Enter or click Execute**
4. The system uses Claude Haiku to parse your intent and execute the appropriate action

## Supported Command Types

### 1. Navigation
Navigate to any page in openEXPERT.

**Examples:**
- "Go to workflows"
- "Show me the dashboard"
- "Open quality page"
- "Navigate to intelligence dashboard"
- "Show knowledge graph"

**Supported Pages:**
dashboard, workflows, projects, settings, quality, knowledge, deadlines, radar, analytics, skills, exchange, audit, apprentice, coworkers, graph, intelligence, brief, guide, fill, challenge, dual, batch, prompt, review, sounding-board, ab-test, versions

### 2. Create Session
Create a new module session with optional context.

**Examples:**
- "Create gap analysis for Nordea"
- "Create sanctions advisory session"
- "Start document creation for client XYZ"
- "New risk assessment"

**Available Modules:**
- gap-analysis
- document-creation
- sanctions-advisory
- regulatory-monitor
- training-content
- data-management
- risk-assessment
- investigation-support

### 3. Search
Search for sessions, outputs, or entities.

**Examples:**
- "Show me all sessions about AMLR"
- "Search for compliance sessions"
- "Find Nordea projects"

### 4. Execute Tasks
Run background tasks and operations.

**Examples:**
- "Rebuild knowledge graph"
- "Run quality check on document-creation"
- "Run pattern detection"

### 5. Export (context-dependent)
Export outputs in specific formats. Requires an active session context.

**Examples:**
- "Export as PDF"
- "Export to Excel"

## Features

### Recent Commands
The palette remembers your last 5 commands and displays them as quick suggestions. Click on any recent command to use it again.

### Confidence Scoring
The AI parser provides a confidence score for each command interpretation. Low-confidence commands (< 0.7) are flagged with a warning.

### Parsed Command Preview
Before execution, you can see how the system interpreted your command, including the action and parameters.

### Success/Error Feedback
Clear visual feedback shows whether the command succeeded or failed, with descriptive messages.

### Auto-Redirect
For navigation and session creation commands, the palette automatically redirects you to the target page after a brief success message.

## Technical Architecture

### Backend Components

**Command Parser Service** (`server/services/command-parser.ts`)
- Uses Claude Haiku (`claude-haiku-4-5-20251001`) for natural language understanding
- Returns structured JSON with command type, action, parameters, and confidence
- Fast and cost-effective (Haiku is optimized for quick classification tasks)

**API Routes** (`server/routes/commands.ts`)
- `POST /api/commands/parse` - Parse command only (returns interpretation)
- `POST /api/commands/execute` - Parse and execute command

### Frontend Component

**CommandPalette** (`src/components/shared/CommandPalette.tsx`)
- Modal overlay with keyboard activation
- LocalStorage integration for recent commands
- Loading states and error handling
- Smooth animations and transitions

### Integration

The CommandPalette component is globally available via `App.tsx`, making it accessible from any page in the application.

## Extending the Command Palette

### Adding New Command Types

1. Update the parsing prompt in `command-parser.ts` with examples
2. Add a new case to the `executeCommand` function
3. Implement the action handler

### Adding New Navigation Targets

Update the `pageMap` object in the `navigate_to` case handler:

```typescript
const pageMap: Record<string, string> = {
  // ... existing pages
  'my-new-page': '/my-new-page',
};
```

### Adding New Module Support

Module IDs are automatically supported. Just ensure the module is registered in the MODULES constant.

## Performance

- **Parse time**: ~200-400ms (Claude Haiku API call)
- **Execute time**: Varies by action (instant for navigation, longer for graph rebuild)
- **Cost per command**: ~$0.0001 (Haiku pricing)

## Keyboard Accessibility

- **Cmd+K / Ctrl+K**: Open palette
- **Escape**: Close palette
- **Enter**: Execute command
- Full keyboard navigation support

## Future Enhancements

Potential improvements for future iterations:

- [ ] Fuzzy matching for typos
- [ ] Command history with up/down arrow navigation
- [ ] Command aliases (e.g., "gap" → "gap-analysis")
- [ ] Multi-step commands with confirmation
- [ ] Context-aware suggestions based on current page
- [ ] Export command context awareness
- [ ] Batch command execution
- [ ] Command macros (saved command sequences)
- [ ] Voice input support
- [ ] Command scheduling ("Run quality check every Monday")

## Troubleshooting

**Command palette doesn't open**
- Ensure Cmd+K / Ctrl+K isn't captured by browser/OS shortcuts
- Check browser console for JavaScript errors

**Commands fail to execute**
- Verify ANTHROPIC_API_KEY is configured
- Check network tab for API errors
- Ensure user has necessary permissions

**Low confidence warnings**
- Rephrase command more explicitly
- Use exact module/page names when possible
- Check examples in the palette UI

**Recent commands not persisting**
- Check browser localStorage is enabled
- Verify no privacy mode blocking storage

## Support

For issues or feature requests related to the Command Palette, please check the audit log (`/audit`) for detailed execution traces.
