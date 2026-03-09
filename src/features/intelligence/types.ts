export interface IntelligenceSummary {
  totalAtoms: number;
  totalEntities: number;
  totalPatterns: number;
  criticalPatterns: number;
  recentAtoms: KnowledgeAtom[];
  topEntities: EntityNode[];
}

export interface KnowledgeAtom {
  id: string;
  content: string;
  atom_type: string;
  category: string;
  quality_score?: number;
  created_at: string;
  is_active: number;
}

export interface EntityNode {
  entity_type: string;
  entity_id: string;
  first_seen: string;
  last_seen: string;
  interaction_count: number;
  context_summary?: string;
}

export interface DetectedPattern {
  id: string;
  pattern_type: 'temporal_correlation' | 'entity_convergence' | 'cascade' | 'trend_divergence' | 'gap';
  severity: 'critical' | 'warning' | 'info' | 'positive';
  status: 'active' | 'investigating' | 'resolved' | 'dismissed';
  title: string;
  description: string;
  affected_entities: string;
  detected_at: string;
  resolved_at?: string;
  resolved_by?: string;
  resolution_notes?: string;
  evidence_count?: number;
}

export interface TemporalDataPoint {
  date?: string;
  week?: string;
  count?: number;
  entity_count?: number;
  avg_quality?: number;
  value?: number;
}

export type TimelineEntry = {
  type: 'pattern';
  data: DetectedPattern;
  timestamp: string;
} | {
  type: 'atom';
  data: KnowledgeAtom;
  timestamp: string;
};
