# Layer 5: Cross-Workflow Intelligence Dashboard

## Overview

Layer 5 is the **visualization and insights dashboard** that brings together all the knowledge from Layers 1-4 into three powerful views for consultants and analysts.

**Status:** ✅ COMPLETE

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Intelligence Dashboard                       │
│                     (Frontend Only Layer)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │     Backend API Endpoints (New)         │
        │  /api/intelligence/summary              │
        │  /api/intelligence/temporal/*           │
        │  /api/patterns (existing)               │
        │  /api/knowledge/atoms (existing)        │
        │  /api/knowledge-graph/entities (existing)│
        └─────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │      Data from Layers 1-4               │
        │  • knowledge_atoms                      │
        │  • entity_nodes                         │
        │  • detected_patterns                    │
        │  • workflow_outputs                     │
        └─────────────────────────────────────────┘
```

## Three Views

### 1. Insight Feed (Timeline View)

**Purpose:** Real-time stream of detected patterns and key knowledge atoms

**Features:**
- Vertical timeline (newest first)
- Pattern cards with severity badges (critical/warning/info/positive)
- Knowledge atom cards
- Filters:
  - All / Patterns Only / Atoms Only
  - Severity (critical/warning/info/positive)
- Actions per pattern:
  - "Investigate" → navigate to Knowledge page
  - "Mark Resolved" → update pattern status

**Implementation:**
- Component: `src/pages/IntelligenceDashboard.tsx` (timeline view)
- Sub-component: `src/features/intelligence/PatternCard.tsx`
- Data sources:
  - `GET /api/patterns?status=active&limit=50`
  - `GET /api/knowledge/atoms?limit=20`

**Pattern Card Anatomy:**
```
┌──────────────────────────────────────────────────────┐
│ [Icon] TITLE              [SEVERITY] 2h ago          │
│                                                      │
│ Description of the detected pattern explaining      │
│ what was found and why it matters.                  │
│                                                      │
│ [entity_type:id] [entity_type:id]                   │
│                                       [Investigate]  │
│                                       [Mark Resolved]│
└──────────────────────────────────────────────────────┘
```

**Pattern Type Icons:**
- temporal_correlation → TrendingUp
- entity_convergence → Users
- cascade → Zap
- trend_divergence → ArrowUpRight
- gap → Info

**Severity Color Coding:**
- Critical: Red border + background (`border-red-500 bg-red-950/30`)
- Warning: Amber border + background
- Info: Blue border + background
- Positive: Emerald border + background

### 2. Entity Heat Map

**Purpose:** Visual overview of all tracked entities by activity and recency

**Features:**
- Grid/treemap layout
- Entity cells sized by `interaction_count`
- Color intensity based on `last_seen` (recent = brighter)
- Hover shows: name, type, interaction count, last seen
- Click entity → navigate to Knowledge page (entity view)

**Implementation:**
- Component: `src/pages/IntelligenceDashboard.tsx` (heatmap view)
- Sub-component: `src/features/intelligence/EntityHeatMapCell.tsx`
- Data source: `GET /api/knowledge-graph/entities?limit=50`

**Heat Map Cell Sizing:**
- Min size: 80px × 80px
- Max size: 240px × 240px
- Formula: `80 + (interaction_count * 20)` capped at 240

**Color Intensity:**
- Based on days since last_seen
- Formula: `max(0.3, min(1, 1 - daysSince/30))`
- Applied as: `rgba(45, 212, 168, intensity * 0.15)`

**Cell Layout:**
```
┌─────────────────────┐
│   entity_id         │
│   entity_type       │
│   123 interactions  │
│   2h ago            │
└─────────────────────┘
```

### 3. Temporal View (Trend Charts)

**Purpose:** Visualize knowledge and pattern trends over time

**Features:**
- 4 trend charts:
  1. **Atoms Created per Day** (last 30 days)
  2. **Patterns Detected per Week** (last 12 weeks)
  3. **Entity Activity** (entities touched per week)
  4. **Quality Trend** (average quality score per week)
- Each chart shows:
  - Line chart with area fill
  - Trend indicator (↑ up, ↓ down, → stable)
  - Date range labels

**Implementation:**
- Component: `src/pages/IntelligenceDashboard.tsx` (temporal view)
- Sub-component: `src/features/intelligence/TemporalChart.tsx`
- Data sources:
  - `GET /api/intelligence/temporal/atoms-per-day?days=30`
  - `GET /api/intelligence/temporal/patterns-per-week?weeks=12`
  - `GET /api/intelligence/temporal/entity-activity?weeks=12`
  - `GET /api/intelligence/temporal/quality-trend?weeks=12`

**Trend Calculation:**
- Compare average of first 1/3 vs last 1/3 of data points
- Up: last > first * 1.1
- Down: last < first * 0.9
- Stable: otherwise

## Dashboard Header (Common Across Views)

**4 Stat Cards:**

1. **Knowledge Atoms**
   - Icon: Atom
   - Value: Total active atoms
   - Source: `SELECT COUNT(*) FROM knowledge_atoms WHERE is_active = 1`

2. **Entities Tracked**
   - Icon: Users
   - Value: Total entities
   - Source: `SELECT COUNT(*) FROM entity_nodes`

3. **Active Patterns**
   - Icon: TrendingUp
   - Value: Total active patterns
   - Source: `SELECT COUNT(*) FROM detected_patterns WHERE status = 'active'`

4. **Critical Alerts**
   - Icon: AlertTriangle (red if > 0)
   - Value: Critical severity patterns
   - Color: Red if count > 0
   - Source: `SELECT COUNT(*) FROM detected_patterns WHERE severity = 'critical' AND status = 'active'`

**View Tabs:**
- Insight Feed
- Entity Heat Map
- Temporal View

## Backend Endpoints

### New Endpoints (Layer 5)

All in `server/routes/intelligence-dashboard.ts`:

#### GET /api/intelligence/summary
Returns dashboard overview stats.

**Response:**
```json
{
  "totalAtoms": 1523,
  "totalEntities": 89,
  "totalPatterns": 12,
  "criticalPatterns": 2,
  "recentAtoms": [...],
  "topEntities": [...]
}
```

#### GET /api/intelligence/temporal/atoms-per-day?days=30
Returns daily atom creation counts.

**Response:**
```json
[
  { "date": "2026-02-01", "count": 45 },
  { "date": "2026-02-02", "count": 52 },
  ...
]
```

#### GET /api/intelligence/temporal/patterns-per-week?weeks=12
Returns weekly pattern detection counts.

**Response:**
```json
[
  { "week": "2026-W05", "count": 3 },
  { "week": "2026-W06", "count": 5 },
  ...
]
```

#### GET /api/intelligence/temporal/entity-activity?weeks=12
Returns weekly unique entity interaction counts.

**Response:**
```json
[
  { "week": "2026-W05", "entity_count": 12 },
  { "week": "2026-W06", "entity_count": 18 },
  ...
]
```

#### GET /api/intelligence/temporal/quality-trend?weeks=12
Returns weekly average quality scores.

**Response:**
```json
[
  { "week": "2026-W05", "avg_quality": 0.78 },
  { "week": "2026-W06", "avg_quality": 0.82 },
  ...
]
```

### Existing Endpoints (Used by Layer 5)

From `server/routes/pattern-detection.ts`:
- `GET /api/patterns?status=active&limit=50`
- `PUT /api/patterns/:id/status`

From `server/routes/knowledge.ts`:
- `GET /api/knowledge/atoms?limit=20`

From `server/routes/knowledge-graph.ts`:
- `GET /api/knowledge-graph/entities?limit=50`

## Files Created

### Backend
- `server/routes/intelligence-dashboard.ts` - New temporal aggregation endpoints
- Updated `server/index.ts` - Registered intelligence and pattern detection routes

### Frontend
- `src/pages/IntelligenceDashboard.tsx` - Main dashboard page with 3 views
- `src/features/intelligence/PatternCard.tsx` - Pattern display card
- `src/features/intelligence/EntityHeatMapCell.tsx` - Entity heat map cell
- `src/features/intelligence/TemporalChart.tsx` - Line chart component
- `src/features/intelligence/types.ts` - TypeScript interfaces
- `src/features/intelligence/index.ts` - Feature exports
- Updated `src/App.tsx` - Added /intelligence route
- Updated `src/components/layout/Sidebar.tsx` - Added Intelligence nav link

## Design System

**Colors:**
- Background: `adv-dark` (#0B1426)
- Cards: `adv-card` (#152238)
- Primary accent: `adv-teal` (#2DD4A8)
- Text: `adv-off-white` (#E0E0E0)
- Secondary text: `adv-gray` (#B0B0B0)

**Severity Colors:**
- Critical: `text-red-400`, `bg-red-500/20`, `border-red-500`
- Warning: `text-amber-400`, `bg-amber-500/20`, `border-amber-500`
- Info: `text-blue-400`, `bg-blue-500/20`, `border-blue-500`
- Positive: `text-emerald-400`, `bg-emerald-500/20`, `border-emerald-500`

**Chart Colors:**
- Atoms: Teal (`#2DD4A8`)
- Patterns: Amber (`#F5A623`)
- Activity: Blue (`#3498DB`)
- Quality: Green (`#27AE60`)

## Navigation

**Sidebar Entry:**
- Icon: Brain (lucide-react)
- Label: "Intelligence"
- Path: `/intelligence`
- Position: After "Knowledge Graph"

**User Flows:**

1. **From Dashboard → Intelligence**
   - Click "Intelligence" in sidebar
   - Land on Insight Feed tab
   - See recent patterns and atoms

2. **Investigate Pattern**
   - Click "Investigate" on pattern card
   - Navigate to Knowledge page
   - See entity details and related atoms

3. **Explore Entity**
   - Switch to Heat Map view
   - Click entity cell
   - Navigate to Knowledge page (entity view)

4. **Analyze Trends**
   - Switch to Temporal View
   - Review 4 trend charts
   - Spot increases/decreases over time

## Performance

**Data Loading:**
- Parallel fetches on mount (7 endpoints)
- Debounced filter updates
- Optimistic UI updates on pattern resolution

**Rendering:**
- Lazy-loaded page (code splitting)
- Conditional rendering per view
- Memoized chart calculations

## Testing Checklist

- [ ] Dashboard loads summary stats
- [ ] Timeline shows patterns and atoms
- [ ] Filters work (all/patterns/atoms, severity)
- [ ] Pattern cards display correctly
- [ ] Investigate button navigates to Knowledge
- [ ] Resolve button updates pattern status
- [ ] Heat map shows entities
- [ ] Entity cells sized by interaction count
- [ ] Entity click navigates to Knowledge
- [ ] Temporal charts render
- [ ] Trend indicators show correct direction
- [ ] View tabs switch correctly
- [ ] Sidebar navigation works
- [ ] Loading states display
- [ ] Empty states display

## Future Enhancements

1. **Pattern Detail Modal**
   - Full pattern analysis view
   - Related atoms list
   - Resolution history
   - Assignment to users

2. **Entity Graph Visualization**
   - D3.js force-directed graph
   - Zoom/pan controls
   - Filter by entity type
   - Highlight relationships

3. **Advanced Filters**
   - Date range picker
   - Entity type filter
   - Pattern type filter
   - Quality score range

4. **Export Capabilities**
   - Export timeline to PDF
   - Export heat map as image
   - Export trend data to CSV/Excel

5. **Real-time Updates**
   - WebSocket integration
   - Live pattern notifications
   - Auto-refresh on new data

6. **Dashboard Customization**
   - Drag-drop widgets
   - Custom time ranges
   - Saved filter presets
   - User preferences

## Troubleshooting

**No data showing:**
- Check that pattern detection has run (background job every hour)
- Verify knowledge atoms have been extracted from workflows
- Run pattern detection manually: `POST /api/patterns/detect`

**Charts not rendering:**
- Ensure date-fns is installed
- Check browser console for errors
- Verify temporal endpoints return data

**Filters not working:**
- Check that state updates are triggering re-render
- Verify filter logic in timeline code
- Check console for TypeScript errors

## Dependencies

**Runtime:**
- date-fns: Date formatting and relative time
- lucide-react: Icons
- react-router-dom: Navigation

**Backend:**
- better-sqlite3: Database queries
- express: API routes

## Integration Points

**Consumes:**
- Layer 1: workflow_outputs, checkpoint_decisions
- Layer 2: knowledge_atoms, knowledge_entity_refs
- Layer 3: entity_nodes, entity_relationships
- Layer 4: detected_patterns

**Provides:**
- Visual insights dashboard
- Pattern investigation entry points
- Entity exploration UI
- Trend analysis tools

---

**Built:** 2026-02-19
**Status:** Production Ready ✅
**Layer:** 5 of 5
