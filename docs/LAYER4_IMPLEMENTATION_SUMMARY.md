# Layer 4: Pattern Detection Engine - Implementation Summary

## What Was Built

Layer 4 implements **5 pattern detection algorithms** that automatically analyze workflow execution data to discover:

1. **Temporal Correlation** - Events co-occurring within time windows
2. **Entity Convergence** - Multiple workflows touching the same entity
3. **Cascade Detection** - Decision chains propagating across workflows
4. **Trend Divergence** - Quality metrics deviating from baselines
5. **Gap Detection** - Missing expected patterns or low activity areas

## Files Created

### Backend Service
- **`server/services/pattern-detection.ts`** (12 KB)
  - Core detection algorithms
  - Pattern storage and retrieval
  - State management

### API Routes
- **`server/routes/pattern-detection.ts`** (4.7 KB)
  - `POST /api/patterns/detect` - Run all detectors
  - `GET /api/patterns` - List patterns with filters
  - `PUT /api/patterns/:id/status` - Update pattern status
  - `GET /api/patterns/detector-state` - Get execution state
  - `POST /api/patterns/detect/:type` - Run specific detector

### Database Schema
- **`server/db/init.ts`** (updated)
  - `detected_patterns` table - Stores discovered patterns
  - `pattern_detectors_state` table - Tracks execution schedule

### Integration
- **`server/index.ts`** (updated)
  - Registered pattern detection routes
  - Added background job (runs hourly)
  - Added initial scan (30 seconds after startup)

### Documentation
- **`docs/PATTERN_DETECTION.md`** (complete technical reference)
- **`docs/LAYER4_IMPLEMENTATION_SUMMARY.md`** (this file)

### Testing
- **`tests/pattern-detection.test.ts`** - Unit tests

## Database Schema

```sql
CREATE TABLE detected_patterns (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL,  -- 5 types
  pattern_subtype TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT DEFAULT 'info',  -- critical|warning|info|positive
  confidence REAL DEFAULT 0.5,
  supporting_data JSON NOT NULL,
  affected_entities JSON DEFAULT '[]',
  affected_workflows JSON DEFAULT '[]',
  affected_areas JSON DEFAULT '[]',
  first_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
  detection_count INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',  -- active|investigating|resolved|dismissed
  resolved_at DATETIME,
  resolved_by TEXT,
  resolution_notes TEXT
);

CREATE TABLE pattern_detectors_state (
  detector_id TEXT PRIMARY KEY,
  last_run DATETIME,
  next_run DATETIME,
  run_count INTEGER DEFAULT 0,
  config JSON,
  enabled INTEGER DEFAULT 1
);

-- Indexes for performance
CREATE INDEX idx_detected_patterns_type ON detected_patterns(pattern_type, status, last_detected DESC);
CREATE INDEX idx_detected_patterns_severity ON detected_patterns(severity, status);
```

## API Quick Reference

### Run All Detectors
```bash
POST /api/patterns/detect
Response: { success: true, patternsDetected: 12, patternsStored: 12, detectorState: {...} }
```

### Get Patterns
```bash
GET /api/patterns?severity=warning&status=active&limit=10
Response: { success: true, patterns: [...], count: 10, detectorState: {...} }
```

### Update Pattern Status
```bash
PUT /api/patterns/:id/status
Body: { status: "resolved", resolvedBy: "user", notes: "Fixed" }
Response: { success: true, message: "Pattern status updated successfully" }
```

### Get Detector State
```bash
GET /api/patterns/detector-state
Response: { success: true, state: { detector_id: "all", last_run: "...", ... } }
```

### Run Specific Detector
```bash
POST /api/patterns/detect/entity_convergence
Response: { success: true, type: "entity_convergence", patternsDetected: 3, patterns: [...] }
```

## Pattern Types

### 1. Temporal Correlation
**What:** Events frequently occurring together within time windows
**Example:** "risk_alert and compliance_review frequently co-occur"
**Threshold:** 3+ occurrences within 24 hours

### 2. Entity Convergence
**What:** Multiple workflows analyzing the same entity
**Example:** "MiCA Regulation referenced across 5 workflows"
**Threshold:** 3+ workflows within 7 days

### 3. Cascade Detection
**What:** Decision chains triggering subsequent workflows
**Example:** "Decision cascade detected across 4 workflow chains"
**Threshold:** 2+ three-step chains within 48 hours

### 4. Trend Divergence
**What:** Quality scores deviating from baselines
**Example:** "Quality divergence in module gap-analysis"
**Threshold:** Deviation > 1.5 points from 30-day average

### 5. Gap Detection
**What:** Missing patterns or low activity areas
**Example:** "Low activity in legal area"
**Threshold:** < 30% of average workflow output volume

## Background Execution

The pattern detection engine runs automatically:
- **Initial scan:** 30 seconds after server startup
- **Recurring scans:** Every hour (3600000 ms)

Console logs:
```
[pattern-detection] Running initial pattern detection...
[pattern-detection] Initial scan detected 8 patterns
[pattern-detection] Running background detection...
[pattern-detection] Detected 2 patterns
```

## Integration Points

**Consumes data from:**
- Layer 1: `workflow_outputs`, `checkpoint_decisions`
- Layer 2: `knowledge_atoms`, `knowledge_entity_refs`
- Layer 3: `entity_nodes`, `entity_relationships`
- Quality Ratchet: `quality_scores`

**Provides data to:**
- Intelligence Dashboard (Layer 5) - Pattern visualization
- API clients - Pattern retrieval and management
- Command system - `/run_pattern_detection` command

## Testing

### Run Tests
```bash
npm test tests/pattern-detection.test.ts
```

### Manual API Testing
```bash
# Initialize database with new tables
npm run db:init

# Start server (pattern detection auto-runs)
npm run dev

# Trigger manual detection
curl -X POST http://localhost:3001/api/patterns/detect

# View detected patterns
curl http://localhost:3001/api/patterns?status=active
```

## TypeScript Compilation

All new code compiles successfully:
```bash
npx tsc -b --noEmit
# ✓ No server-side errors
```

Pre-existing frontend errors (date-fns imports) are unrelated to Layer 4.

## Performance

**Query Optimization:**
- All queries use date range filters (7-30 days)
- Indexes on `pattern_type`, `severity`, `status`
- Cascade detection limited to 20 results
- Upsert logic prevents duplicate patterns

**Background Job Impact:**
- Runs hourly (adjustable)
- Can be disabled via `pattern_detectors_state.enabled = 0`
- Errors logged but don't crash server

## Pattern Lifecycle

```
NEW → ACTIVE → INVESTIGATING / DISMISSED / RESOLVED
```

Status transitions tracked in `detected_patterns.status` with audit fields:
- `resolved_at` - Resolution timestamp
- `resolved_by` - User who resolved
- `resolution_notes` - Resolution details

## Configuration

Pattern detection thresholds can be adjusted in `server/services/pattern-detection.ts`:

```typescript
detectTemporalCorrelation(windowHours = 24, minOccurrences = 3)
detectEntityConvergence(minWorkflows = 3, sinceDays = 7)
detectCascade(maxHoursBetween = 48, minChainLength = 3)
detectTrendDivergence(metricName = 'quality_score', thresholdStdDev = 2)
detectGaps() // 30% of area average
```

## Next Steps

Layer 4 is complete and ready for:
1. **Layer 5: Intelligence Dashboard** - Visualize detected patterns
2. **Frontend Integration** - Pattern cards, filters, status updates
3. **Alert System** - Notify users of critical patterns
4. **Custom Detectors** - User-defined pattern rules

## Files Modified

1. `server/db/init.ts` - Added pattern detection tables
2. `server/index.ts` - Registered routes and background job
3. `server/services/command-parser.ts` - Fixed pattern detection command

## Files Created

1. `server/services/pattern-detection.ts` - Core service (12 KB)
2. `server/routes/pattern-detection.ts` - API routes (4.7 KB)
3. `docs/PATTERN_DETECTION.md` - Complete technical reference
4. `docs/LAYER4_IMPLEMENTATION_SUMMARY.md` - This summary
5. `tests/pattern-detection.test.ts` - Unit tests

---

**Implementation Status:** ✅ Complete
**TypeScript Compilation:** ✅ Passing
**API Endpoints:** ✅ 5 endpoints registered
**Background Job:** ✅ Running hourly
**Documentation:** ✅ Complete
**Tests:** ✅ Created

Layer 4: Pattern Detection Engine is production-ready.
