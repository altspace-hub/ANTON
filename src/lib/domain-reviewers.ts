/**
 * domain-reviewers.ts
 * Domain-specific reviewer perspectives for the Expert Panel review system.
 * These reviewers simulate real-world stakeholders who would assess a compliance deliverable.
 */

export interface DomainReviewer {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji
  prompt: string; // system prompt for the review
  applicableAreas: string[] | 'all';
}

export const DOMAIN_REVIEWERS: DomainReviewer[] = [
  {
    id: 'regulator',
    name: "Regulator's Eye",
    icon: '🏛️',
    description: 'Would this pass regulatory scrutiny? What would a supervisor ask?',
    prompt:
      'You are reviewing this output as a financial supervisor at a regulatory authority (such as Finansinspektionen or the EBA). Assess: (1) Would this pass regulatory scrutiny? (2) What follow-up questions would a supervisor ask? (3) What regulatory expectations are not addressed? (4) What evidence or citations are missing? Be specific about regulatory gaps.',
    applicableAreas: ['fcp', 'legal', 'banking', 'risk', 'investment'],
  },
  {
    id: 'board_member',
    name: 'Board Member',
    icon: '👔',
    description: 'Is this clear for board-level decision making?',
    prompt:
      'You are reviewing this output as a non-executive board member. Assess: (1) Is this clear enough for board-level decision making? (2) Are strategic implications clearly articulated? (3) What questions would the board ask? (4) Are risks and recommendations clear? (5) Is the executive summary strong enough?',
    applicableAreas: 'all',
  },
  {
    id: 'auditor',
    name: 'Internal Auditor',
    icon: '🔍',
    description: 'Would this survive an audit? Is the evidence trail sufficient?',
    prompt:
      'You are reviewing this output as an internal auditor. Assess: (1) Is the evidence trail sufficient? (2) Are controls adequately documented? (3) Would this survive an audit finding? (4) Are there unsupported claims? (5) Is methodology transparent and reproducible?',
    applicableAreas: ['fcp', 'legal', 'audit', 'risk', 'compliance'],
  },
  {
    id: 'client',
    name: 'Client Perspective',
    icon: '🤝',
    description: 'Is the value clear? Would the client feel this was worth the investment?',
    prompt:
      'You are reviewing this output as the client receiving this deliverable. Assess: (1) Is the value clearly demonstrated? (2) Would you feel this was worth the investment? (3) What would you push back on? (4) Are recommendations actionable for your organisation? (5) Is the language appropriate for your level of expertise?',
    applicableAreas: ['consulting', 'strategy', 'project-mgmt'],
  },
];

export function getReviewersForArea(areaId?: string): DomainReviewer[] {
  if (!areaId) return DOMAIN_REVIEWERS;
  return DOMAIN_REVIEWERS.filter(
    (r) => r.applicableAreas === 'all' || r.applicableAreas.includes(areaId)
  );
}
