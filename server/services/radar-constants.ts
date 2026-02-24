// Radar category definitions — expanded beyond regulatory/compliance

export const RADAR_CATEGORIES = {
  regulatory: {
    label: 'Regulatory & Compliance',
    icon: 'Shield',
    color: '#3498DB',
    description: 'Regulations, guidelines, enforcement actions',
  },
  competitors: {
    label: 'Competitors & Market',
    icon: 'Users',
    color: '#E74C3C',
    description: 'Competitor moves, market shifts, M&A',
  },
  products: {
    label: 'Products & Technology',
    icon: 'Cpu',
    color: '#27AE60',
    description: 'New products, tech releases, innovations',
  },
  government: {
    label: 'Government & Procurement',
    icon: 'Landmark',
    color: '#F5A623',
    description: 'RFPs, RFIs, government tenders, policy',
  },
  threats: {
    label: 'Threats & Scams',
    icon: 'AlertTriangle',
    color: '#E74C3C',
    description: 'Fraud schemes, scams, cyber threats targeting your sectors',
  },
  trends: {
    label: 'Industry Trends',
    icon: 'TrendingUp',
    color: '#2DD4A8',
    description: 'Market trends, research reports, industry analysis',
  },
  misc: {
    label: 'Miscellaneous',
    icon: 'Layers',
    color: '#B0B0B0',
    description: 'Other items of interest',
  },
} as const;

export type RadarCategory = keyof typeof RADAR_CATEGORIES;

// Subcategory type keywords — finer-grained classification within categories
export const SUBCATEGORY_KEYWORDS: Record<string, { keywords: string[]; category: RadarCategory }> = {
  product_launch: { keywords: ['launch', 'new product', 'release', 'introducing', 'unveil', 'rollout'], category: 'products' },
  tech_update: { keywords: ['update', 'upgrade', 'patch', 'version', 'migration', 'integration'], category: 'products' },
  rfp: { keywords: ['request for proposal', 'rfp', 'tender', 'procurement', 'bid invitation'], category: 'government' },
  rfi: { keywords: ['request for information', 'rfi', 'market sounding'], category: 'government' },
  government_policy: { keywords: ['government policy', 'national strategy', 'public consultation', 'legislative proposal'], category: 'government' },
  competitor_move: { keywords: ['acquisition', 'merger', 'partnership', 'market entry', 'expansion', 'hiring'], category: 'competitors' },
  market_report: { keywords: ['market report', 'industry report', 'forecast', 'outlook', 'benchmark'], category: 'competitors' },
  scam_alert: { keywords: ['scam', 'fraud', 'phishing', 'social engineering', 'impersonation', 'money mule'], category: 'threats' },
  cyber_threat: { keywords: ['cyber', 'ransomware', 'data breach', 'vulnerability', 'malware', 'attack'], category: 'threats' },
  trend_analysis: { keywords: ['trend', 'emerging', 'innovation', 'disruption', 'digital transformation'], category: 'trends' },
  research: { keywords: ['research', 'study', 'whitepaper', 'white paper', 'survey results'], category: 'trends' },
};

// Score prompt templates per category
export const CATEGORY_SCORE_PROMPTS: Record<RadarCategory, string> = {
  regulatory: 'Score this regulatory item for relevance to financial crime prevention (AML/CFT), sanctions compliance, and prudential regulation.',
  competitors: 'Score this item for competitive intelligence value. Consider market positioning, service overlap, and strategic threat/opportunity.',
  products: 'Score this product/technology item for relevance to compliance technology, regtech, and financial services operations.',
  government: 'Score this government/procurement item for business opportunity relevance. Consider RFP alignment, bid feasibility, and strategic value.',
  threats: 'Score this threat/scam item for risk to financial services clients. Consider impact severity, likelihood, and mitigation urgency.',
  trends: 'Score this industry trend for strategic relevance. Consider business impact, client implications, and advisory opportunity.',
  misc: 'Score this item for general relevance to financial services advisory and compliance consulting.',
};
