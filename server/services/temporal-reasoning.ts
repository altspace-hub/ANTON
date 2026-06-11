import type { DatabaseAdapter } from '../db/database.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface GoalsProfile {
  id: string;
  user_id: string;
  today_focus: string[];
  this_week_goals: string[];
  this_month_goals: string[];
  this_year_goals: string[];
  this_decade_vision: string;
  created_at: string;
  updated_at: string;
}

interface DomainStrategy {
  id: string;
  user_id: string;
  domain: string;
  strategy_type: string;
  strategy_label: string | null;
  parameters: Record<string, unknown>;
  atom_weights: Record<string, number>;
  is_active: number;
}

interface ValuesConstraint {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  constraint_type: string;
  scope: string;
  value: string;
  enforcement: string;
  is_active: number;
}

interface ConflictResolutionRule {
  id: string;
  user_id: string;
  conflict_type: string;
  resolution: string;
  custom_logic: string | null;
}

interface DecisionContext {
  horizons: GoalsProfile | null;
  strategy: DomainStrategy | null;
  values: ValuesConstraint[];
  conflictRules: ConflictResolutionRule[];
  temporalPatterns: Array<{ content: string; confidence: number; horizon: string | null }>;
}

interface HorizonImpact {
  assessment: 'positive' | 'negative' | 'neutral';
  reasoning: string;
}

interface TemporalConsequenceResult {
  impacts: {
    today: HorizonImpact;
    this_week: HorizonImpact;
    this_month: HorizonImpact;
    this_year: HorizonImpact;
    this_decade: HorizonImpact;
  };
  conflicts: Array<{ horizons: string[]; description: string; severity: 'low' | 'medium' | 'high' }>;
  valuesViolations: Array<{ constraintId: string; constraintName: string; description: string }>;
  strategyAlignment: { aligned: boolean; details: string };
  recommendation: string;
}

interface MarketAtomLike {
  id: string;
  content: string;
  atom_type: string;
  confidence: number;
  category: string;
  subcategory?: string | null;
  sentiment?: string | null;
  entities?: string | Array<{ type: string; id: string; name?: string }>;
  importance_score?: number;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createTemporalReasoningService(db: DatabaseAdapter) {

  // ── Goals Profile CRUD ──────────────────────────────────────────────────

  async function getGoalsProfile(userId = 'default'): Promise<GoalsProfile | null> {
    const row = await db.get<GoalsProfile & { today_focus: string; this_week_goals: string; this_month_goals: string; this_year_goals: string }>(
      'SELECT * FROM goals_profiles WHERE user_id = ?', userId
    );
    if (!row) return null;
    return {
      ...row,
      today_focus: typeof row.today_focus === 'string' ? JSON.parse(row.today_focus) : (row.today_focus ?? []),
      this_week_goals: typeof row.this_week_goals === 'string' ? JSON.parse(row.this_week_goals) : (row.this_week_goals ?? []),
      this_month_goals: typeof row.this_month_goals === 'string' ? JSON.parse(row.this_month_goals) : (row.this_month_goals ?? []),
      this_year_goals: typeof row.this_year_goals === 'string' ? JSON.parse(row.this_year_goals) : (row.this_year_goals ?? []),
    };
  }

  async function upsertGoalsProfile(userId: string, data: Partial<GoalsProfile>): Promise<void> {
    const existing = await db.get('SELECT id FROM goals_profiles WHERE user_id = ?', userId);
    if (existing) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (data.today_focus !== undefined) { sets.push('today_focus = ?, today_updated_at = NOW()'); vals.push(JSON.stringify(data.today_focus)); }
      if (data.this_week_goals !== undefined) { sets.push('this_week_goals = ?, week_updated_at = NOW()'); vals.push(JSON.stringify(data.this_week_goals)); }
      if (data.this_month_goals !== undefined) { sets.push('this_month_goals = ?, month_updated_at = NOW()'); vals.push(JSON.stringify(data.this_month_goals)); }
      if (data.this_year_goals !== undefined) { sets.push('this_year_goals = ?, year_updated_at = NOW()'); vals.push(JSON.stringify(data.this_year_goals)); }
      if (data.this_decade_vision !== undefined) { sets.push('this_decade_vision = ?, decade_updated_at = NOW()'); vals.push(data.this_decade_vision); }
      if (sets.length > 0) {
        sets.push('updated_at = NOW()');
        vals.push(userId);
        await db.run(`UPDATE goals_profiles SET ${sets.join(', ')} WHERE user_id = ?`, ...vals);
      }
    } else {
      const id = `gp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.run(`
        INSERT INTO goals_profiles (id, user_id, today_focus, this_week_goals, this_month_goals, this_year_goals, this_decade_vision)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, id, userId,
         JSON.stringify(data.today_focus ?? []),
         JSON.stringify(data.this_week_goals ?? []),
         JSON.stringify(data.this_month_goals ?? []),
         JSON.stringify(data.this_year_goals ?? []),
         data.this_decade_vision ?? ''
      );
    }
  }

  // ── Domain Strategies CRUD ──────────────────────────────────────────────

  async function getActiveStrategy(userId: string, domain: string): Promise<DomainStrategy | null> {
    const row = await db.get<DomainStrategy & { parameters: string; atom_weights: string }>(
      'SELECT * FROM domain_strategies WHERE user_id = ? AND domain = ? AND is_active = 1 LIMIT 1',
      userId, domain
    );
    if (!row) return null;
    return {
      ...row,
      parameters: typeof row.parameters === 'string' ? JSON.parse(row.parameters) : (row.parameters ?? {}),
      atom_weights: typeof row.atom_weights === 'string' ? JSON.parse(row.atom_weights) : (row.atom_weights ?? {}),
    };
  }

  async function listStrategies(userId: string): Promise<DomainStrategy[]> {
    const rows = await db.all<DomainStrategy & { parameters: string; atom_weights: string }>(
      'SELECT * FROM domain_strategies WHERE user_id = ? ORDER BY domain, is_active DESC', userId
    );
    return rows.map(r => ({
      ...r,
      parameters: typeof r.parameters === 'string' ? JSON.parse(r.parameters) : (r.parameters ?? {}),
      atom_weights: typeof r.atom_weights === 'string' ? JSON.parse(r.atom_weights) : (r.atom_weights ?? {}),
    }));
  }

  async function createStrategy(userId: string, data: { domain: string; strategyType: string; strategyLabel?: string; parameters?: Record<string, unknown>; atomWeights?: Record<string, number> }): Promise<string> {
    // Deactivate existing strategies for this domain
    await db.run('UPDATE domain_strategies SET is_active = 0, updated_at = NOW() WHERE user_id = ? AND domain = ? AND is_active = 1', userId, data.domain);
    const id = `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO domain_strategies (id, user_id, domain, strategy_type, strategy_label, parameters, atom_weights)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, id, userId, data.domain, data.strategyType, data.strategyLabel ?? null,
       JSON.stringify(data.parameters ?? {}), JSON.stringify(data.atomWeights ?? {}));
    return id;
  }

  // ── Values Constraints CRUD ─────────────────────────────────────────────

  async function getValuesConstraints(userId: string, scope = 'all'): Promise<ValuesConstraint[]> {
    return await db.all<ValuesConstraint>(
      "SELECT * FROM values_constraints WHERE user_id = ? AND is_active = 1 AND (scope = 'all' OR scope = ?) ORDER BY enforcement DESC, name",
      userId, scope
    );
  }

  async function createValuesConstraint(userId: string, data: { name: string; description?: string; constraintType: string; scope?: string; value: string; enforcement?: string }): Promise<string> {
    const id = `vc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO values_constraints (id, user_id, name, description, constraint_type, scope, value, enforcement)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, id, userId, data.name, data.description ?? null, data.constraintType, data.scope ?? 'all', data.value, data.enforcement ?? 'hard');
    return id;
  }

  async function deleteValuesConstraint(id: string): Promise<void> {
    await db.run('UPDATE values_constraints SET is_active = 0 WHERE id = ?', id);
  }

  // ── Conflict Resolution Rules ───────────────────────────────────────────

  async function getConflictRules(userId: string): Promise<ConflictResolutionRule[]> {
    return await db.all<ConflictResolutionRule>(
      'SELECT * FROM conflict_resolution_rules WHERE user_id = ? AND is_active = 1 ORDER BY conflict_type', userId
    );
  }

  async function updateConflictRule(id: string, resolution: string, customLogic?: string): Promise<void> {
    await db.run('UPDATE conflict_resolution_rules SET resolution = ?, custom_logic = ? WHERE id = ?', resolution, customLogic ?? null, id);
  }

  // ── Core: Decision Context ──────────────────────────────────────────────

  async function getDecisionContext(userId = 'default', domain = 'finance'): Promise<DecisionContext> {
    const [horizons, strategy, values, conflictRules, temporalPatterns] = await Promise.all([
      getGoalsProfile(userId),
      getActiveStrategy(userId, domain),
      getValuesConstraints(userId, domain),
      getConflictRules(userId),
      db.all<{ content: string; confidence: number; horizon: string | null }>(
        "SELECT content, confidence, horizon FROM market_atoms WHERE atom_type = 'temporal_pattern' AND is_active = 1 ORDER BY confidence DESC LIMIT 20"
      ),
    ]);
    return { horizons, strategy, values, conflictRules, temporalPatterns };
  }

  // ── Core: Values Filter ─────────────────────────────────────────────────

  async function applyValuesFilter(
    atoms: MarketAtomLike[], userId = 'default', scope = 'finance'
  ): Promise<{ included: MarketAtomLike[]; excluded: MarketAtomLike[]; exclusionReasons: Map<string, string> }> {
    const constraints = await getValuesConstraints(userId, scope);
    if (constraints.length === 0) return { included: atoms, excluded: [], exclusionReasons: new Map() };

    const included: MarketAtomLike[] = [];
    const excluded: MarketAtomLike[] = [];
    const exclusionReasons = new Map<string, string>();

    for (const atom of atoms) {
      let isExcluded = false;
      let reason = '';

      // Parse entities
      const entities: Array<{ type: string; id: string; name?: string }> = typeof atom.entities === 'string'
        ? JSON.parse(atom.entities || '[]')
        : (atom.entities ?? []);

      for (const constraint of constraints) {
        if (constraint.constraint_type === 'exclude_entity') {
          const match = entities.some(e =>
            e.id.toLowerCase() === constraint.value.toLowerCase() ||
            (e.name && e.name.toLowerCase() === constraint.value.toLowerCase())
          );
          if (match) {
            isExcluded = constraint.enforcement === 'hard';
            reason = `Excluded entity: ${constraint.name}`;
            if (!isExcluded) atom.confidence = (atom.confidence ?? 0.5) * 0.5; // soft: halve confidence
          }
        } else if (constraint.constraint_type === 'exclude_sector') {
          if (atom.category === constraint.value || atom.subcategory === constraint.value) {
            isExcluded = constraint.enforcement === 'hard';
            reason = `Excluded sector: ${constraint.name}`;
            if (!isExcluded) atom.confidence = (atom.confidence ?? 0.5) * 0.5;
          }
        } else if (constraint.constraint_type === 'exclude_theme') {
          if (atom.content.toLowerCase().includes(constraint.value.toLowerCase())) {
            isExcluded = constraint.enforcement === 'hard';
            reason = `Excluded theme: ${constraint.name}`;
            if (!isExcluded) atom.confidence = (atom.confidence ?? 0.5) * 0.5;
          }
        }

        if (isExcluded) break;
      }

      if (isExcluded) {
        excluded.push(atom);
        exclusionReasons.set(atom.id, reason);
      } else {
        included.push(atom);
      }
    }

    return { included, excluded, exclusionReasons };
  }

  // ── Core: Strategy Weighting ────────────────────────────────────────────

  async function applyStrategyWeighting(
    atoms: MarketAtomLike[], userId = 'default', domain = 'finance'
  ): Promise<MarketAtomLike[]> {
    const strategy = await getActiveStrategy(userId, domain);
    if (!strategy || Object.keys(strategy.atom_weights).length === 0) return atoms;

    return atoms.map(atom => {
      // Build signal key from atom_type + category (e.g. "signal_equity", "fact_macro")
      const signalKey = `${atom.atom_type}_${atom.category}`;
      const typeKey = atom.atom_type;
      const catKey = atom.category;

      // Look up weight: try specific key first, then type-only, then category-only
      const weight = strategy.atom_weights[signalKey]
        ?? strategy.atom_weights[typeKey]
        ?? strategy.atom_weights[catKey]
        ?? 1.0;

      return {
        ...atom,
        confidence: Math.max(0, Math.min(1, (atom.confidence ?? 0.5) * weight)),
      };
    });
  }

  // ── Core: Temporal Consequence Check ────────────────────────────────────

  async function checkTemporalConsequences(
    action: string, context: string, userId = 'default', domain = 'finance'
  ): Promise<TemporalConsequenceResult> {
    const decisionCtx = await getDecisionContext(userId, domain);

    // Fast path: no goals/values configured
    if (!decisionCtx.horizons && decisionCtx.values.length === 0 && !decisionCtx.strategy) {
      return {
        impacts: {
          today: { assessment: 'neutral', reasoning: 'No goals profile configured' },
          this_week: { assessment: 'neutral', reasoning: 'No goals profile configured' },
          this_month: { assessment: 'neutral', reasoning: 'No goals profile configured' },
          this_year: { assessment: 'neutral', reasoning: 'No goals profile configured' },
          this_decade: { assessment: 'neutral', reasoning: 'No goals profile configured' },
        },
        conflicts: [],
        valuesViolations: [],
        strategyAlignment: { aligned: true, details: 'No strategy configured' },
        recommendation: action,
      };
    }

    // Build prompt for LLM analysis
    let prompt = `## Temporal Consequence Analysis\n\nEvaluate this proposed action against the user's goals, strategy, and values.\n\n### Proposed Action\n${action}\n\n### Context\n${context}\n\n`;

    if (decisionCtx.horizons) {
      const h = decisionCtx.horizons;
      prompt += `### User's Time Horizons\n`;
      prompt += `- Today: ${JSON.stringify(h.today_focus)}\n`;
      prompt += `- This Week: ${JSON.stringify(h.this_week_goals)}\n`;
      prompt += `- This Month: ${JSON.stringify(h.this_month_goals)}\n`;
      prompt += `- This Year: ${JSON.stringify(h.this_year_goals)}\n`;
      prompt += `- This Decade: ${h.this_decade_vision}\n\n`;
    }

    if (decisionCtx.strategy) {
      prompt += `### Active Strategy (${domain})\n${decisionCtx.strategy.strategy_type}: ${decisionCtx.strategy.strategy_label ?? ''}\n\n`;
    }

    if (decisionCtx.values.length > 0) {
      prompt += `### Values Constraints (HARD)\n`;
      for (const v of decisionCtx.values) {
        prompt += `- ${v.name}: ${v.description ?? v.value} [${v.enforcement}]\n`;
      }
      prompt += '\n';
    }

    if (decisionCtx.temporalPatterns.length > 0) {
      prompt += `### Learned Temporal Patterns\n`;
      for (const tp of decisionCtx.temporalPatterns) {
        prompt += `- ${tp.content} (confidence: ${tp.confidence})\n`;
      }
      prompt += '\n';
    }

    prompt += `### Task\nFor EACH time horizon, assess positive/negative/neutral impact. Identify horizon conflicts. Check values violations. Assess strategy alignment. Return JSON:\n`;
    prompt += `{"impacts":{"today":{"assessment":"...","reasoning":"..."},"this_week":{...},"this_month":{...},"this_year":{...},"this_decade":{...}},"conflicts":[{"horizons":["..."],"description":"...","severity":"low|medium|high"}],"valuesViolations":[{"constraintId":"...","constraintName":"...","description":"..."}],"strategyAlignment":{"aligned":true|false,"details":"..."},"recommendation":"..."}\nReturn ONLY the JSON.`;

    try {
      const { callChat } = await import('./provider-router.js');
      const { getRoutedUtilityModel } = await import('./utility-model.js');
      const result = await callChat({
        // Provider-routed utility model (review 3.8) — previously a raw
        // Claude id that failed on non-Anthropic installs.
        model: await getRoutedUtilityModel(db),
        system: 'You are a temporal consequence analyst. Evaluate actions against goals, values, and strategies. Output only valid JSON.',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 2048,
        thinkingLevel: 'quick',
        db,
      });

      const cleaned = result.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      const parsed = JSON.parse(cleaned) as TemporalConsequenceResult;

      // Log the check
      await logTemporalCheck(parsed, null, 'recommendation', userId);

      return parsed;
    } catch (err) {
      console.error('[temporal-reasoning] Consequence check failed:', err);
      // Return neutral on failure
      const neutral: HorizonImpact = { assessment: 'neutral', reasoning: 'Analysis unavailable' };
      return {
        impacts: { today: neutral, this_week: neutral, this_month: neutral, this_year: neutral, this_decade: neutral },
        conflicts: [], valuesViolations: [],
        strategyAlignment: { aligned: true, details: 'Analysis unavailable' },
        recommendation: action,
      };
    }
  }

  // ── Core: Log Temporal Check ────────────────────────────────────────────

  async function logTemporalCheck(
    result: TemporalConsequenceResult, triggerId: string | null, triggerType: string, userId = 'default'
  ): Promise<void> {
    const id = `tcl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO temporal_consequence_log (id, user_id, trigger_type, trigger_id,
        impact_today, impact_this_week, impact_this_month, impact_this_year, impact_this_decade,
        conflicts_detected, conflict_details, values_violated, values_details,
        strategy_aligned, strategy_details, resolution)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, userId, triggerType, triggerId,
       JSON.stringify(result.impacts.today), JSON.stringify(result.impacts.this_week),
       JSON.stringify(result.impacts.this_month), JSON.stringify(result.impacts.this_year),
       JSON.stringify(result.impacts.this_decade),
       result.conflicts.length, JSON.stringify(result.conflicts),
       result.valuesViolations.length, JSON.stringify(result.valuesViolations),
       result.strategyAlignment.aligned ? 1 : 0, result.strategyAlignment.details,
       result.recommendation.slice(0, 500)
    );
  }

  // ── Core: Temporal Learning ─────────────────────────────────────────────

  async function processTemporalLearning(predictionId: string): Promise<string | null> {
    const pred = await db.get<{
      id: string; title: string; confidence: number; was_correct: number | null;
      brier_score: number | null; horizon: string | null; target_symbol: string | null;
      prediction_type: string;
    }>(
      "SELECT id, title, confidence, was_correct, brier_score, horizon, target_symbol, prediction_type FROM market_predictions WHERE id = ? AND status = 'validated'",
      predictionId
    );
    if (!pred || pred.was_correct === null) return null;

    // Check for a learnable pattern:
    // High confidence but wrong, or low confidence but right = miscalibration worth noting
    const isOverconfident = pred.confidence >= 0.7 && pred.was_correct === 0;
    const isUnderconfident = pred.confidence <= 0.4 && pred.was_correct === 1;

    if (!isOverconfident && !isUnderconfident) return null;

    const horizon = pred.horizon ?? 'this_month';
    const lesson = isOverconfident
      ? `Overconfidence detected at ${horizon} horizon: "${pred.title}" predicted with ${(pred.confidence * 100).toFixed(0)}% confidence but was incorrect. Calibrate down for similar ${pred.prediction_type} predictions.`
      : `Underconfidence detected at ${horizon} horizon: "${pred.title}" predicted with ${(pred.confidence * 100).toFixed(0)}% confidence but was correct. Consider higher confidence for similar ${pred.prediction_type} predictions.`;

    // Create a temporal_pattern atom
    try {
      const { createMarketAtomService } = await import('./market-atom-service.js');
      const atomService = await createMarketAtomService(db);
      const atomId = await atomService.createAtom({
        content: lesson,
        atomType: 'temporal_pattern',
        confidence: 0.4, // starts low, increases with more observations
        category: 'general',
        subcategory: 'calibration',
        sentiment: 'neutral',
        temporalType: 'ongoing',
        tags: ['temporal_learning', 'calibration', horizon],
        importanceScore: 60,
      });
      return atomId;
    } catch (err) {
      console.error('[temporal-reasoning] Learning atom creation failed:', err);
      return null;
    }
  }

  // ── Build Goals & Values Layer for Prompt Injection ─────────────────────

  async function buildGoalsValuesLayer(userId = 'default', domain = 'finance'): Promise<string> {
    const ctx = await getDecisionContext(userId, domain);

    if (!ctx.horizons && ctx.values.length === 0 && !ctx.strategy && ctx.temporalPatterns.length === 0) {
      return '';
    }

    let layer = '\n## Goals & Values Context\n\n';

    if (ctx.horizons) {
      const h = ctx.horizons;
      layer += '### Active Time Horizons\n';
      if (h.today_focus.length > 0) layer += `- Today: ${h.today_focus.join(', ')}\n`;
      if (h.this_week_goals.length > 0) layer += `- This Week: ${h.this_week_goals.join(', ')}\n`;
      if (h.this_month_goals.length > 0) layer += `- This Month: ${h.this_month_goals.join(', ')}\n`;
      if (h.this_year_goals.length > 0) layer += `- This Year: ${h.this_year_goals.join(', ')}\n`;
      if (h.this_decade_vision) layer += `- Long-term Vision: ${h.this_decade_vision}\n`;
      layer += '\nWhen making recommendations, consider impact across ALL horizons. Flag any conflicts between short-term actions and long-term goals.\n\n';
    }

    if (ctx.strategy) {
      layer += `### Active Strategy (${domain})\n`;
      layer += `Type: ${ctx.strategy.strategy_type}`;
      if (ctx.strategy.strategy_label) layer += ` — ${ctx.strategy.strategy_label}`;
      layer += '\n';
      if (Object.keys(ctx.strategy.atom_weights).length > 0) {
        layer += 'Signal weights: ' + Object.entries(ctx.strategy.atom_weights).map(([k, v]) => `${k}: ${v}x`).join(', ') + '\n';
      }
      layer += '\n';
    }

    if (ctx.values.length > 0) {
      layer += '### Values Constraints (HARD — override optimisation)\n';
      for (const v of ctx.values) {
        layer += `- ${v.name}: ${v.description ?? v.value} [${v.enforcement}]\n`;
      }
      layer += '\nNever recommend anything that violates these constraints. If excluded, explain why and suggest alternatives.\n\n';
    }

    if (ctx.temporalPatterns.length > 0) {
      layer += '### Learned Temporal Patterns\n';
      for (const tp of ctx.temporalPatterns.slice(0, 10)) {
        layer += `- ${tp.content} (confidence: ${tp.confidence})\n`;
      }
      layer += '\n';
    }

    return layer;
  }

  // ── Conflict Resolution ──────────────────────────────────────────────

  async function getPendingConflicts(userId = 'default') {
    return await db.all(
      `SELECT * FROM temporal_consequence_log
       WHERE user_id = ? AND resolution_status = 'pending'
       AND (conflicts_detected > 0 OR values_violated > 0)
       ORDER BY created_at DESC LIMIT 20`,
      userId
    );
  }

  async function resolveConflict(logId: string, action: string, userAction?: string): Promise<void> {
    await db.run(
      `UPDATE temporal_consequence_log
       SET resolution_status = ?, resolved_at = NOW(), user_action = ?
       WHERE id = ?`,
      action, userAction ?? null, logId
    );
  }

  async function getPendingConflictCount(userId = 'default'): Promise<number> {
    const row = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM temporal_consequence_log
       WHERE user_id = ? AND resolution_status = 'pending'
       AND (conflicts_detected > 0 OR values_violated > 0)`,
      userId
    );
    return Number(row?.count) || 0;
  }

  return {
    // CRUD
    getGoalsProfile,
    upsertGoalsProfile,
    getActiveStrategy,
    listStrategies,
    createStrategy,
    getValuesConstraints,
    createValuesConstraint,
    deleteValuesConstraint,
    getConflictRules,
    updateConflictRule,
    // Core
    getDecisionContext,
    applyValuesFilter,
    applyStrategyWeighting,
    checkTemporalConsequences,
    logTemporalCheck,
    processTemporalLearning,
    buildGoalsValuesLayer,
    // Conflict Resolution
    getPendingConflicts,
    resolveConflict,
    getPendingConflictCount,
  };
}

export type TemporalReasoningService = Awaited<ReturnType<typeof createTemporalReasoningService>>;
