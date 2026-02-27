# Output Versioning Diff Engine

## Overview

A semantic diff viewer that shows structured changes between two versions of text outputs. Unlike character-level diffs, this displays:
- **Added sections** (green)
- **Removed sections** (red)
- **Modified paragraphs** (red → green)
- **Semantic summary** of changes
- **Statistics**: lines added/removed/modified, similarity percentage, changed sections

## Components

### 1. Backend Service (`server/services/version-diff.ts`)

**Line-level diff algorithm** using patience-style look-ahead:
```typescript
import { computeDiff, computeStats, buildSemanticSummary } from '../services/version-diff.js';

const chunks = computeDiff(oldText, newText);
const stats = computeStats(chunks, oldText, newText);
const summary = buildSemanticSummary(stats);
```

**DiffChunk types:**
- `unchanged`: matching lines (gray)
- `added`: new lines (green)
- `removed`: deleted lines (red)
- `modified`: changed lines (red → green)

Each chunk is annotated with the markdown section title it falls under.

### 2. API Route (`server/routes/versions.ts`)

**GET /api/versions/diff?oldId=X&newId=Y**

Returns:
```json
{
  "oldVersionId": "123",
  "newVersionId": "124",
  "oldLabel": "Initial draft",
  "newLabel": "Final version",
  "oldCreatedAt": "2026-02-19T10:30:00Z",
  "newCreatedAt": "2026-02-19T14:45:00Z",
  "chunks": [...],
  "stats": {
    "linesAdded": 45,
    "linesRemoved": 12,
    "linesModified": 8,
    "linesUnchanged": 234,
    "similarity": 0.87,
    "sectionsChanged": ["Executive Summary", "Recommendations"]
  },
  "semanticSummary": "Moderate revision · 45 lines added · 12 lines removed · Sections: Executive Summary, Recommendations"
}
```

### 3. VersionDiffViewer Component

**Full-screen diff viewer with:**

#### Header Bar
- Version labels (old → new)
- Semantic summary pill
- Stats chips (lines added/removed, similarity %)
- View mode toggle (Unified | Split)
- Close button

#### View Modes

**Unified View** (single column):
- Unchanged lines: gray text, dim background
- Added lines: green text, green-tinted bg with `+` marker
- Removed lines: red text, red-tinted bg with `-` marker
- Modified blocks: red lines (old) then green lines (new) with `~` marker
- Line numbers on left

**Split View** (two columns):
- Old version (left) | New version (right)
- Unchanged: normal in both columns
- Added: empty left, green right
- Removed: red left, empty right
- Modified: red left, green right
- Column headers show version labels + timestamps

#### Footer Stats
- Similarity percentage (color-coded)
- Lines added/removed/modified counts
- Changed sections list
- Timestamp range

### 4. VersionHistoryPage

**Main page at `/versions?entityType=session&entityId=abc123`**

Features:
- Lists all versions for an entity (newest first, max 20)
- Checkbox selection (max 2 versions)
- Compare button (sticky bottom bar) appears when 2 selected
- Delete version action
- Back navigation
- Displays: version label, version number, timestamp, file size

**Usage:**
```tsx
// Navigate to version history
navigate('/versions?entityType=session&entityId=abc-123-def');

// Or from a session detail page:
<button onClick={() => navigate(`/versions?entityType=session&entityId=${sessionId}`)}>
  View Version History
</button>
```

## Integration Guide

### From a Module Output Panel

Add a "Version History" button:

```tsx
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';

function OutputPanel({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();

  return (
    <div>
      {/* Output content */}

      <button
        onClick={() => navigate(`/versions?entityType=session&entityId=${sessionId}`)}
        className="flex items-center gap-2 px-3 py-1.5 rounded border border-adv-teal/40
                   text-adv-teal hover:bg-adv-teal/10 text-sm transition-colors"
      >
        <Clock size={14} />
        Version History
      </button>
    </div>
  );
}
```

### Standalone Diff Viewer Usage

Use the VersionDiffViewer component directly:

```tsx
import { VersionDiffViewer } from '@/features/versions';

function MyComponent() {
  const [showDiff, setShowDiff] = useState(false);

  return (
    <>
      <button onClick={() => setShowDiff(true)}>Compare Versions</button>

      {showDiff && (
        <VersionDiffViewer
          oldVersionId={123}
          newVersionId={124}
          onClose={() => setShowDiff(false)}
        />
      )}
    </>
  );
}
```

### Saving a Version

When an output is generated:

```typescript
// Save version to database
await fetch(`/api/versions/session/${sessionId}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...getAuthHeader()
  },
  body: JSON.stringify({
    content: markdownOutput,
    label: 'Final revision after board review'
  })
});
```

## Design System Compliance

**Colors (openEXPERT dark theme):**
- Background: `bg-adv-dark` (#0B1426)
- Card: `bg-adv-card` (#152238)
- Teal (primary): `text-adv-teal` (#2DD4A8)
- Added lines: `#4ade80` on `#0d2a1a` background
- Removed lines: `#f87171` on `#2a0d0d` background
- Gold (warning): `text-adv-gold` (#F5A623)
- Red (error/critical): `text-adv-red` (#E74C3C)

**Typography:**
- Diff content: `font-mono text-sm` (14px monospace)
- Headers: `text-adv-white font-semibold`
- Body text: `text-adv-gray` (#B0B0B0)
- Stats: `text-xs text-adv-gray-med` (#707070)

**Accessibility:**
- Full keyboard navigation (Tab, Enter, Escape)
- ARIA labels on all interactive elements
- Focus rings on buttons
- Color-blind friendly (icons + text, not just color)
- Min 14px font size for 35-65 age group

## Algorithm Details

### Patience Diff

The diff algorithm uses a **patience-style look-ahead** approach:

1. Compare lines sequentially
2. When mismatch found, look ahead up to 10 lines in both directions
3. Find next matching non-empty line
4. Emit divergent spans as removed/added
5. Continue from match point

### Chunk Merging

Consecutive `removed` + `added` chunks → single `modified` chunk for better readability.

### Section Annotation

Walk chunks and track markdown headings (`# ... ## ...`). Tag each chunk with current section title.

### Similarity Score

`similarity = unchangedLines / totalLines`

- 95%+: "Minor changes"
- 70-95%: "Moderate revision"
- <70%: "Significant rewrite"

## Performance

- Line-based diff: O(n*m) worst case, but look-ahead limited to 10 lines
- Tested with 10,000+ line documents
- No client-side processing — all diff computation server-side
- Diff response typically <500KB even for large documents
- React virtualization not needed (max 20 versions per entity)

## Future Enhancements

- Word-level highlighting within modified lines
- Jump to next/previous change
- Filter view (show only changes)
- Export diff as PDF
- Inline commenting on specific changes
- Three-way merge for conflict resolution
- Diff on prompts (not just outputs)

## Testing

**Manual test checklist:**
1. Create 3+ versions of a session output
2. Navigate to `/versions?entityType=session&entityId=X`
3. Select 2 versions → Compare
4. Verify unified view shows +/- markers correctly
5. Switch to split view → verify columns align
6. Check header stats match footer stats
7. Close with X button or Escape key
8. Delete a version → verify removed from list
9. Test with large documents (1000+ lines)
10. Test with empty diff (identical versions)

**Edge cases:**
- Empty content (one or both versions)
- Very large diffs (10,000+ lines)
- Unicode/emoji in content
- Code blocks with special characters
- Mixed line endings (CRLF vs LF)

## License

Part of ANTON by openEXPERT platform. Internal use only.
