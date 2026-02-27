# Layer 4: Pattern Detection Engine

## Overview

The Pattern Detection Engine is Layer 4 of the openEXPERT Cross-Workflow Intelligence system. It analyzes workflow execution data to discover meaningful patterns, correlations, and anomalies across the knowledge base.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Pattern Detection Engine                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  5 Pattern Detection Algorithms:                           │
│                                                             │
│  1. Temporal Correlation  → Events co-occurring in time    │
│  2. Entity Convergence    → Multi-workflow entity refs     │
│  3. Cascade Detection     → Propagating decision chains    │
│  4. Trend Divergence      → Metric deviation from baseline │
│  5. Gap Detection         → Missing expected patterns      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │                                        │
         │ Analyzes                               │ Stores to
         ▼                                        ▼
┌──────────────────────┐              ┌──────────────────────┐
│  Layers 1-3 Data:    │              │  detected_patterns   │
│  • workflow_outputs  │              │  pattern_detectors_  │
│  • knowledge_atoms   │              │    state             │
│  • entity_nodes      │              │                      │
│  • quality_scores    │              └──────────────────────┘
└──────────────────────┘
```

## Database Schema

### detected_patterns

Stores discovered patterns with metadata and status tracking.

```sql
CREATE TABLE detected_patterns (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL,  -- temporal_correlation | entity_convergence | cascade | trend_divergence | gap
  pattern_subtype TEXT,         -- Category-specific subtype
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT DEFAULT 'info', -- critical | warning | info | positive
  confidence REAL DEFAULT 0.5,  -- 0.0 to 1.0
  supporting_data JSON NOT NULL,
  affected_entities JSON DEFAULT '[]',
  affected_workflows JSON DEFAULT '[]',
  affected_areas JSON DEFAULT '[]',
  first_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
  detection_count INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',  -- active | investigating | resolved | dismissed
  resolved_at DATETIME,
  resolved_by TEXT,
  resolution_notes TEXT
);
```

### pattern_detectors_state

Tracks detector execution schedule and state.

```sql
CREATE TABLE pattern_detectors_state (
  detector_id TEXT PRIMARY KEY,
  last_run DATETIME,
  next_run DATETIME,
  run_count INTEGER DEFAULT 0,
  config JSON,
  enabled INTEGER DEFAULT 1
);
```

## Pattern Detection Algorithms

### 1. Temporal Correlation

**Purpose:** Identifies events that frequently occur together within time windows.

**Algorithm:**
```typescript
// Find knowledge atoms with shared entities within 24-hour windows
SELECT a1.category, a2.category, entity_name
FROM knowledge_atoms a1
JOIN knowledge_entity_refs er1 ON a1.id = er1.atom_id
JOIN knowledge_entity_refs er2 ON er1.entity_id = er2.entity_id
JOIN knowledge_atoms a2 ON er2.atom_id = a2.id
WHERE a1.id < a2.id
  AND a1.category != a2.category
  AND ABS(JULIANDAY(a1.created_at) - JULIANDAY(a2.created_at)) * 24 <= 24
GROUP BY category_pair
HAVING count(*) >= 3
```

**Example Output:**
```json
{
  "pattern_type": "temporal_correlation",
  "pattern_subtype": "risk_alert_compliance_review",
  "title": "risk_alert and compliance_review frequently co-occur",
  "description": "Detected 8 instances where risk_alert and compliance_review events happened within 24h of each other.",
  "severity": "info",
  "confidence": 0.4,
  "affected_entities": ["ACME Corp", "XYZ Bank", "Entity X"]
}
```

### 2. Entity Convergence

**Purpose:** Detects entities being analyzed by multiple workflows across different areas.

**Algorithm:**
```typescript
// Find entities referenced by 3+ workflows in last 7 days
SELECT entity_name, entity_type, COUNT(DISTINCT workflow_id) as workflow_count
FROM knowledge_entity_refs er
JOIN knowledge_atoms ka ON er.atom_id = ka.id
JOIN workflow_outputs wo ON ka.source_output_id = wo.id
WHERE wo.created_at > datetime('now', '-7 days')
GROUP BY entity_type, entity_id
HAVING workflow_count >= 3
```

**Example Output:**
```json
{
  "pattern_type": "entity_convergence",
  "pattern_subtype": "regulation",
  "title": "MiCA Regulation referenced across 5 workflows",
  "description": "Entity 'MiCA Regulation' (regulation) has been analyzed by 5 different workflows across 3 areas in the last 7 days.",
  "severity": "warning",
  "confidence": 0.5,
  "affected_entities": [{"type": "regulation", "id": "mica_2024", "name": "MiCA Regulation"}]
}
```

### 3. Cascade Detection

**Purpose:** Identifies decision chains where one checkpoint decision triggers subsequent workflow executions.

**Algorithm:**
```typescript
// Find 3-step decision chains within 48h windows
SELECT cd1.workflow_id, cd2.workflow_id, cd3.workflow_id
FROM checkpoint_decisions cd1
JOIN checkpoint_decisions cd2 ON cd2.decided_at > cd1.decided_at
JOIN checkpoint_decisions cd3 ON cd3.decided_at > cd2.decided_at
WHERE cd1.workflow_id != cd2.workflow_id
  AND cd2.workflow_id != cd3.workflow_id
  AND ABS(JULIANDAY(cd2.decided_at) - JULIANDAY(cd1.decided_at)) * 24 <= 48
  AND ABS(JULIANDAY(cd3.decided_at) - JULIANDAY(cd2.decided_at)) * 24 <= 48
```

**Example Output:**
```json
{
  "pattern_type": "cascade",
  "pattern_subtype": "decision_chain",
  "title": "Decision cascade detected across 4 workflow chains",
  "description": "Identified 4 instances where checkpoint decisions triggered subsequent workflow executions within 48h.",
  "severity": "info",
  "confidence": 0.6,
  "affected_workflows": ["wf_001", "wf_002", "wf_003"]
}
```

### 4. Trend Divergence

**Purpose:** Detects quality score trends diverging from established baselines.

**Algorithm:**
```typescript
// Compare recent 5 scores to 30-day average
const modules = db.query(`
  SELECT module_id, AVG(score_overall) as baseline
  FROM quality_scores
  WHERE scored_at > datetime('now', '-30 days')
  GROUP BY module_id
`);

for (const module of modules) {
  const recent = last5Scores(module.module_id);
  const recentAvg = average(recent);
  const deviation = abs(recentAvg - module.baseline);

  if (deviation > 1.5) {
    reportDivergence(module, deviation);
  }
}
```

**Example Output:**
```json
{
  "pattern_type": "trend_divergence",
  "pattern_subtype": "quality_drop",
  "title": "Quality divergence in module gap-analysis",
  "description": "Recent quality scores (6.2) are 2.3 points below the 30-day average (8.5).",
  "severity": "warning",
  "confidence": 0.77,
  "supporting_data": {"recent_avg": 6.2, "baseline_avg": 8.5, "deviation": 2.3}
}
```

### 5. Gap Detection

**Purpose:** Identifies missing patterns or low activity areas.

**Algorithm:**
```typescript
// Find areas with <30% of average workflow output volume
SELECT area_id, COUNT(*) as output_count
FROM workflow_outputs
WHERE created_at > datetime('now', '-30 days')
GROUP BY area_id
HAVING output_count < (SELECT AVG(cnt) * 0.3 FROM
  (SELECT COUNT(*) as cnt FROM workflow_outputs GROUP BY area_id))
```

**Example Output:**
```json
{
  "pattern_type": "gap",
  "pattern_subtype": "low_activity",
  "title": "Low activity in legal area",
  "description": "Only 3 workflow outputs in the last 30 days (avg: 12). Last activity: 2026-02-10.",
  "severity": "info",
  "confidence": 0.7,
  "affected_areas": ["legal"]
}
```

## API Endpoints

### POST /api/patterns/detect

Runs all pattern detection algorithms.

**Request:**
```bash
POST /api/patterns/detect
```

**Response:**
```json
{
  "success": true,
  "patternsDetected": 12,
  "patternsStored": 12,
  "detectorState": {
    "detector_id": "all",
    "last_run": "2026-02-19T20:30:00Z",
    "next_run": "2026-02-19T21:30:00Z",
    "run_count": 45,
    "enabled": 1
  }
}
```

### GET /api/patterns

Retrieves detected patterns with optional filters.

**Query Parameters:**
- `type` - Filter by pattern type (temporal_correlation, entity_convergence, cascade, trend_divergence, gap)
- `severity` - Filter by severity (critical, warning, info, positive)
- `status` - Filter by status (active, investigating, resolved, dismissed)
- `limit` - Max results (default: 50)

**Request:**
```bash
GET /api/patterns?severity=warning&status=active&limit=10
```

**Response:**
```json
{
  "success": true,
  "patterns": [
    {
      "id": "pat_1234567890_abc123",
      "pattern_type": "entity_convergence",
      "pattern_subtype": "regulation",
      "title": "MiCA Regulation referenced across 5 workflows",
      "description": "...",
      "severity": "warning",
      "confidence": 0.5,
      "supporting_data": "{...}",
      "affected_entities": "[...]",
      "affected_workflows": "[...]",
      "affected_areas": "[...]",
      "first_detected": "2026-02-15T10:00:00Z",
      "last_detected": "2026-02-19T20:30:00Z",
      "detection_count": 4,
      "status": "active"
    }
  ],
  "count": 10,
  "detectorState": {...}
}
```

### PUT /api/patterns/:id/status

Updates pattern status.

**Request:**
```bash
PUT /api/patterns/pat_1234567890_abc123/status
Content-Type: application/json

{
  "status": "resolved",
  "resolvedBy": "user@example.com",
  "notes": "Pattern investigated and documented in wiki."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Pattern status updated successfully"
}
```

### GET /api/patterns/detector-state

Retrieves detector execution state.

**Request:**
```bash
GET /api/patterns/detector-state
```

**Response:**
```json
{
  "success": true,
  "state": {
    "detector_id": "all",
    "last_run": "2026-02-19T20:30:00Z",
    "next_run": "2026-02-19T21:30:00Z",
    "run_count": 45,
    "enabled": 1
  }
}
```

### POST /api/patterns/detect/:type

Runs a specific detector algorithm.

**Request:**
```bash
POST /api/patterns/detect/entity_convergence
```

**Response:**
```json
{
  "success": true,
  "type": "entity_convergence",
  "patternsDetected": 3,
  "patterns": [...]
}
```

## Background Execution

The pattern detection engine runs automatically:

1. **Initial scan** - 30 seconds after server startup
2. **Hourly scans** - Every 3600 seconds (1 hour)

Logs:
```
[pattern-detection] Running initial pattern detection...
[pattern-detection] Initial scan detected 8 patterns
[pattern-detection] Running background detection...
[pattern-detection] Detected 2 patterns
```

## Pattern Lifecycle

```
┌─────────┐
│  NEW    │  Pattern detected by algorithm
└────┬────┘
     │
     ▼
┌─────────┐
│ ACTIVE  │  Awaiting human review
└────┬────┘
     │
     ├──────────────┬──────────────┐
     ▼              ▼              ▼
┌──────────────┐ ┌────────────┐ ┌──────────┐
│INVESTIGATING │ │ DISMISSED  │ │ RESOLVED │
└──────────────┘ └────────────┘ └──────────┘
```

## Configuration

Pattern detection parameters can be adjusted in the service:

```typescript
// Temporal Correlation
detectTemporalCorrelation(windowHours = 24, minOccurrences = 3)

// Entity Convergence
detectEntityConvergence(minWorkflows = 3, sinceDays = 7)

// Cascade Detection
detectCascade(maxHoursBetween = 48, minChainLength = 3)

// Trend Divergence
detectTrendDivergence(metricName = 'quality_score', thresholdStdDev = 2)

// Gap Detection
detectGaps() // Uses 30% of area average as threshold
```

## Integration with Other Layers

**Consumes:**
- Layer 1: `workflow_outputs`, `checkpoint_decisions`
- Layer 2: `knowledge_atoms`, `knowledge_entity_refs`
- Layer 3: `entity_nodes`, `entity_relationships`
- Quality Ratchet: `quality_scores`, `quality_baselines`

**Produces:**
- `detected_patterns` - Pattern insights for Intelligence Dashboard
- `pattern_detectors_state` - Execution tracking

**Used by:**
- Intelligence Dashboard (Layer 5) - Visualizes patterns
- Command System - `/run_pattern_detection` command
- API clients - Pattern retrieval and management

## Performance Considerations

**Indexing:**
```sql
CREATE INDEX idx_detected_patterns_type ON detected_patterns(pattern_type, status, last_detected DESC);
CREATE INDEX idx_detected_patterns_severity ON detected_patterns(severity, status);
```

**Query Optimization:**
- Temporal queries use JULIANDAY for date math
- Entity convergence uses GROUP_CONCAT for efficient aggregation
- Cascade detection limits results to 20 chains to prevent long queries
- All queries filter by date ranges (7-30 days) to limit dataset

**Scalability:**
- Patterns are upserted (update if exists, insert if new)
- Detection count increments on re-detection
- Background job runs hourly to avoid performance impact
- Can be disabled by setting `enabled = 0` in `pattern_detectors_state`

## Future Enhancements

1. **Machine Learning Integration** - Train models on historical pattern data
2. **Anomaly Scoring** - Statistical anomaly detection using z-scores
3. **Graph-based Patterns** - Leverage entity relationships for deeper insights
4. **Predictive Patterns** - Forecast future events based on historical patterns
5. **Custom Detectors** - User-defined pattern detection rules
6. **Alert System** - Email/webhook notifications for critical patterns
7. **Pattern Correlation** - Detect meta-patterns across pattern types
8. **Time Series Analysis** - Advanced trend analysis with seasonality detection

## Troubleshooting

**No patterns detected:**
- Verify Layers 1-3 have sufficient data
- Check `pattern_detectors_state.last_run` timestamp
- Review algorithm thresholds (may be too strict)
- Check server logs for errors

**Too many patterns:**
- Increase `minOccurrences` and `minWorkflows` thresholds
- Reduce time windows (`windowHours`, `sinceDays`)
- Filter by severity (focus on `warning` and `critical`)

**Performance issues:**
- Verify indexes are created
- Reduce background job frequency
- Add date range filters to queries
- Consider archiving old patterns

## Testing

Run pattern detection tests:

```bash
npm test tests/pattern-detection.test.ts
```

Manual API testing:

```bash
# Run all detectors
curl -X POST http://localhost:3001/api/patterns/detect

# Get all active patterns
curl http://localhost:3001/api/patterns?status=active

# Update pattern status
curl -X PUT http://localhost:3001/api/patterns/pat_123/status \
  -H "Content-Type: application/json" \
  -d '{"status":"resolved","notes":"Fixed"}'
```

---

**Built for ANTON by openEXPERT**
Cross-Workflow Intelligence Layer 4: Pattern Detection Engine
