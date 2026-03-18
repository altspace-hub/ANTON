import type { DatabaseAdapter } from '../db/database.js';

export async function createPatternDetection(db: DatabaseAdapter) {

  // 1. TEMPORAL CORRELATION — events co-occurring within time windows
  async function detectTemporalCorrelation(windowHours = 24, minOccurrences = 3) {
    const windowMs = windowHours * 3600000;
    const now = Date.now();
    const since = new Date(now - 30 * 86400000).toISOString(); // last 30 days

    // Find atoms created within time windows that share entities
    const correlations = await db.all(`
      SELECT
        a1.id as atom1_id, a2.id as atom2_id,
        a1.category as cat1, a2.category as cat2,
        a1.created_at as time1, a2.created_at as time2,
        er1.entity_type, er1.entity_id, er1.entity_name
      FROM knowledge_atoms a1
      JOIN knowledge_entity_refs er1 ON a1.id = er1.atom_id
      JOIN knowledge_entity_refs er2 ON er1.entity_type = er2.entity_type AND er1.entity_id = er2.entity_id
      JOIN knowledge_atoms a2 ON er2.atom_id = a2.id
      WHERE a1.id < a2.id
        AND a1.category != a2.category
        AND a1.created_at > ?
        AND ABS(JULIANDAY(a1.created_at) - JULIANDAY(a2.created_at)) * 24 <= ?
    `, since, windowHours) as any[];

    // Group by category pairs
    const grouped: Record<string, any[]> = {};
    for (const c of correlations) {
      const key = [c.cat1, c.cat2].sort().join('_');
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(c);
    }

    const patterns: any[] = [];
    for (const [key, instances] of Object.entries(grouped)) {
      if (instances.length >= minOccurrences) {
        const [cat1, cat2] = key.split('_');
        const entities = [...new Set(instances.map(i => i.entity_name))];
        patterns.push({
          pattern_type: 'temporal_correlation',
          pattern_subtype: key,
          title: `${cat1} and ${cat2} frequently co-occur`,
          description: `Detected ${instances.length} instances where ${cat1} and ${cat2} events happened within ${windowHours}h of each other.`,
          severity: instances.length > 10 ? 'warning' : 'info',
          confidence: Math.min(instances.length / 20, 1.0),
          supporting_data: JSON.stringify({ instances: instances.slice(0, 5), count: instances.length }),
          affected_entities: JSON.stringify(entities.slice(0, 10)),
        });
      }
    }
    return patterns;
  }

  // 2. ENTITY CONVERGENCE — multiple workflows touching same entity
  async function detectEntityConvergence(minWorkflows = 3, sinceDays = 7) {
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString();

    const convergences = await db.all(`
      SELECT
        er.entity_type, er.entity_id, er.entity_name,
        COUNT(DISTINCT wo.workflow_id) as workflow_count,
        COUNT(DISTINCT wo.area_id) as area_count,
        STRING_AGG(DISTINCT wo.area_id, ',') as areas
      FROM knowledge_entity_refs er
      JOIN knowledge_atoms ka ON er.atom_id = ka.id
      JOIN workflow_outputs wo ON ka.source_output_id = wo.id
      WHERE wo.created_at > ?
      GROUP BY er.entity_type, er.entity_id, er.entity_name
      HAVING COUNT(DISTINCT wo.workflow_id) >= ?
    `, since, minWorkflows) as any[];

    return convergences.map(c => ({
      pattern_type: 'entity_convergence',
      pattern_subtype: c.entity_type,
      title: `${c.entity_name} referenced across ${c.workflow_count} workflows`,
      description: `Entity "${c.entity_name}" (${c.entity_type}) has been analyzed by ${c.workflow_count} different workflows across ${c.area_count} areas in the last ${sinceDays} days.`,
      severity: c.workflow_count > 5 ? 'warning' : 'info',
      confidence: Math.min(c.workflow_count / 10, 1.0),
      supporting_data: JSON.stringify({ workflow_count: c.workflow_count, areas: c.areas }),
      affected_entities: JSON.stringify([{ type: c.entity_type, id: c.entity_id, name: c.entity_name }]),
    }));
  }

  // 3. CASCADE DETECTION — pattern propagation across workflows
  async function detectCascade(maxHoursBetween = 48, minChainLength = 3) {
    // Find chains where decision A influences decision B influences decision C
    // Simplified: look for checkpoint decisions with shared entities within time windows
    const chains = await db.all(`
      SELECT
        cd1.workflow_id as wf1, cd2.workflow_id as wf2, cd3.workflow_id as wf3,
        cd1.decided_at as time1, cd2.decided_at as time2, cd3.decided_at as time3,
        cd1.human_decision as dec1, cd2.human_decision as dec2, cd3.human_decision as dec3
      FROM checkpoint_decisions cd1
      JOIN checkpoint_decisions cd2 ON cd2.decided_at > cd1.decided_at
      JOIN checkpoint_decisions cd3 ON cd3.decided_at > cd2.decided_at
      WHERE cd1.workflow_id != cd2.workflow_id
        AND cd2.workflow_id != cd3.workflow_id
        AND ABS(JULIANDAY(cd2.decided_at) - JULIANDAY(cd1.decided_at)) * 24 <= ?
        AND ABS(JULIANDAY(cd3.decided_at) - JULIANDAY(cd2.decided_at)) * 24 <= ?
      LIMIT 20
    `, maxHoursBetween, maxHoursBetween) as any[];

    if (chains.length >= 2) {
      return [{
        pattern_type: 'cascade',
        pattern_subtype: 'decision_chain',
        title: `Decision cascade detected across ${chains.length} workflow chains`,
        description: `Identified ${chains.length} instances where checkpoint decisions triggered subsequent workflow executions within ${maxHoursBetween}h.`,
        severity: chains.length > 5 ? 'warning' : 'info',
        confidence: 0.6,
        supporting_data: JSON.stringify({ chains: chains.slice(0, 3), count: chains.length }),
        affected_workflows: JSON.stringify([...new Set(chains.flatMap(c => [c.wf1, c.wf2, c.wf3]))]),
      }];
    }
    return [];
  }

  // 4. TREND DIVERGENCE — metrics deviating from baseline
  async function detectTrendDivergence(metricName = 'quality_score', thresholdStdDev = 2) {
    // Example: quality scores deviating from module baseline
    const modules = await db.all(`
      SELECT module_id, AVG(score_overall) as avg_score, COUNT(*) as n
      FROM quality_scores
      WHERE scored_at > NOW() - INTERVAL '30 days'
      GROUP BY module_id
      HAVING COUNT(*) >= 5
    `) as any[];

    const divergences: any[] = [];
    for (const m of modules) {
      const scores = await db.all(
        'SELECT score_overall FROM quality_scores WHERE module_id = ? ORDER BY scored_at DESC LIMIT 5'
      , m.module_id) as any[];
      const recent = scores.map(s => s.score_overall);
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const deviation = Math.abs(recentAvg - m.avg_score);

      if (deviation > 1.5 && scores.length >= 3) {
        divergences.push({
          pattern_type: 'trend_divergence',
          pattern_subtype: 'quality_drop',
          title: `Quality divergence in module ${m.module_id}`,
          description: `Recent quality scores (${recentAvg.toFixed(1)}) are ${deviation.toFixed(1)} points ${recentAvg < m.avg_score ? 'below' : 'above'} the 30-day average (${m.avg_score.toFixed(1)}).`,
          severity: recentAvg < m.avg_score ? 'warning' : 'positive',
          confidence: Math.min(deviation / 3, 1.0),
          supporting_data: JSON.stringify({ recent_avg: recentAvg, baseline_avg: m.avg_score, deviation }),
        });
      }
    }
    return divergences;
  }

  // 5. GAP DETECTION — missing expected patterns
  async function detectGaps() {
    // Example: areas with low activity
    const areas = await db.all(`
      SELECT area_id, COUNT(*) as output_count,
             MAX(created_at) as last_activity
      FROM workflow_outputs
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY area_id
    `) as any[];

    const avgCount = areas.reduce((sum, a) => sum + a.output_count, 0) / areas.length;
    const gaps: any[] = [];

    for (const a of areas) {
      if (a.output_count < avgCount * 0.3) {
        gaps.push({
          pattern_type: 'gap',
          pattern_subtype: 'low_activity',
          title: `Low activity in ${a.area_id} area`,
          description: `Only ${a.output_count} workflow outputs in the last 30 days (avg: ${avgCount.toFixed(0)}). Last activity: ${new Date(a.last_activity).toLocaleDateString()}.`,
          severity: 'info',
          confidence: 0.7,
          supporting_data: JSON.stringify({ output_count: a.output_count, area_avg: avgCount }),
          affected_areas: JSON.stringify([a.area_id]),
        });
      }
    }
    return gaps;
  }

  async function runAllDetectors() {
    const patterns: any[] = [
      ...(await detectTemporalCorrelation()),
      ...(await detectEntityConvergence()),
      ...(await detectCascade()),
      ...(await detectTrendDivergence()),
      ...(await detectGaps()),
    ];

    // Store detected patterns (upsert logic)
    for (const p of patterns) {
      const existing = await db.get(
        'SELECT * FROM detected_patterns WHERE pattern_type = ? AND pattern_subtype = ? AND status = ?'
      , p.pattern_type, p.pattern_subtype ?? '', 'active') as any;

      if (existing) {
        await db.run(`
          UPDATE detected_patterns
          SET last_detected = ?, detection_count = detection_count + 1, confidence = ?
          WHERE id = ?
        `, new Date().toISOString(), p.confidence, existing.id);
      } else {
        const id = `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db.run(`
          INSERT INTO detected_patterns
            (id, pattern_type, pattern_subtype, title, description, severity, confidence, supporting_data, affected_entities, affected_workflows, affected_areas)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, 
          id, p.pattern_type, p.pattern_subtype ?? null, p.title, p.description,
          p.severity, p.confidence, p.supporting_data,
          p.affected_entities ?? '[]', p.affected_workflows ?? '[]', p.affected_areas ?? '[]'
        );
      }
    }

    // Update detector state
    await db.run(`
      INSERT INTO pattern_detectors_state (detector_id, last_run, next_run, run_count)
      VALUES ('all', ?, NOW() + INTERVAL '1 hour', COALESCE((SELECT run_count FROM pattern_detectors_state WHERE detector_id = 'all'), 0) + 1)
      ON CONFLICT (detector_id) DO UPDATE SET last_run = EXCLUDED.last_run, next_run = EXCLUDED.next_run, run_count = EXCLUDED.run_count
    `, new Date().toISOString());

    return { patternsDetected: patterns.length, patternsStored: patterns.length };
  }

  async function getPatterns(filters?: { type?: string; severity?: string; status?: string; limit?: number }) {
    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (filters?.type) { where += ' AND pattern_type = ?'; params.push(filters.type); }
    if (filters?.severity) { where += ' AND severity = ?'; params.push(filters.severity); }
    if (filters?.status) { where += ' AND status = ?'; params.push(filters.status); }

    params.push(filters?.limit ?? 50);

    return await db.all(`
      SELECT * FROM detected_patterns ${where}
      ORDER BY severity DESC, last_detected DESC
      LIMIT ?
    `, ...params);
  }

  async function updatePatternStatus(id: string, status: string, resolvedBy?: string, notes?: string) {
    if (status === 'resolved') {
      await db.run(`
        UPDATE detected_patterns
        SET status = ?, resolved_at = ?, resolved_by = ?, resolution_notes = ?
        WHERE id = ?
      `, status, new Date().toISOString(), resolvedBy ?? 'user', notes ?? null, id);
    } else {
      await db.run('UPDATE detected_patterns SET status = ? WHERE id = ?', status, id);
    }
  }

  async function getDetectorState() {
    return await db.all('SELECT * FROM pattern_detectors_state WHERE detector_id = ?', 'all') as any;
  }

  return {
    detectTemporalCorrelation,
    detectEntityConvergence,
    detectCascade,
    detectTrendDivergence,
    detectGaps,
    runAllDetectors,
    getPatterns,
    updatePatternStatus,
    getDetectorState,
  };
}
