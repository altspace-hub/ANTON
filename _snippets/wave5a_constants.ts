// ============================================================
// Wave 5a — Constants Snippets for src/lib/constants.ts
// Copy these entries into the MODULES and AREAS arrays/objects
// ============================================================

// ── AREAS entries ──────────────────────────────────────────

// Add to AREAS array/object:

{
  id: 'insurance',
  name: 'Insurance & Actuarial',
  shortName: 'Insurance',
  description: 'Comprehensive AI-powered tools for insurance professionals, actuaries, and compliance officers. Covers Solvency II compliance, claims analysis and fraud detection, product governance, Insurance Distribution Directive (IDD) compliance, and actuarial communications.',
  icon: 'Shield',
  color: 'adv-blue',
  cluster: 'finance',
},
{
  id: 'real-estate',
  name: 'Real Estate & Property',
  shortName: 'Real Estate',
  description: 'AI-assisted tools for real estate professionals, property investors, and legal advisors. Supports property due diligence, lease agreement review, valuation analysis, planning and zoning assessments, and investment analysis.',
  icon: 'Building',
  color: 'adv-gold',
  cluster: 'property',
},
{
  id: 'personal-finance',
  name: 'Personal Finance',
  shortName: 'Personal Finance',
  description: 'Intelligent personal finance advisory tools for financial planners, wealth advisors, and individuals seeking structured financial guidance. Covers budget planning, tax optimisation, pension and retirement planning, debt management, and savings and investment strategy.',
  icon: 'Wallet',
  color: 'adv-green',
  cluster: 'personal',
},
{
  id: 'healthcare',
  name: 'Healthcare & Life Sciences',
  shortName: 'Healthcare',
  description: 'AI-powered tools for healthcare professionals, life sciences companies, and regulatory affairs specialists. Supports clinical protocol development, regulatory pathway planning, patient communication materials, healthcare data protection and GDPR compliance, and research ethics frameworks.',
  icon: 'Heart',
  color: 'adv-red',
  cluster: 'healthcare',
},
{
  id: 'manufacturing',
  name: 'Manufacturing & Operations',
  shortName: 'Manufacturing',
  description: 'AI-assisted tools for manufacturing leaders, operations managers, and quality professionals. Covers process improvement, supply chain risk assessment, quality management systems, Lean Six Sigma analysis, and operational auditing.',
  icon: 'Factory',
  color: 'adv-teal',
  cluster: 'operations',
},

// ── MODULES entries ────────────────────────────────────────

// === B10: Insurance & Actuarial ===

{ id: 'solvency-ii', areaId: 'insurance', label: 'Solvency II Compliance', shortLabel: 'Solvency II', icon: 'ShieldCheck', color: 'adv-blue' },
{ id: 'claims-analysis', areaId: 'insurance', label: 'Claims Analysis & Fraud Detection', shortLabel: 'Claims Analysis', icon: 'Search', color: 'adv-blue' },
{ id: 'product-governance', areaId: 'insurance', label: 'Insurance Product Governance', shortLabel: 'Product Governance', icon: 'PackageCheck', color: 'adv-blue' },
{ id: 'idd-compliance', areaId: 'insurance', label: 'IDD Compliance', shortLabel: 'IDD Compliance', icon: 'FileCheck', color: 'adv-blue' },
{ id: 'actuarial-comms', areaId: 'insurance', label: 'Actuarial Communications', shortLabel: 'Actuarial Comms', icon: 'BarChart3', color: 'adv-blue' },

// === B11: Real Estate & Property ===

{ id: 'property-due-diligence', areaId: 'real-estate', label: 'Property Due Diligence', shortLabel: 'Due Diligence', icon: 'SearchCheck', color: 'adv-gold' },
{ id: 'lease-review', areaId: 'real-estate', label: 'Lease Agreement Review', shortLabel: 'Lease Review', icon: 'FileSearch', color: 'adv-gold' },
{ id: 'valuation-support', areaId: 'real-estate', label: 'Property Valuation Support', shortLabel: 'Valuation Support', icon: 'BarChart2', color: 'adv-gold' },
{ id: 'planning-analysis', areaId: 'real-estate', label: 'Planning & Zoning Analysis', shortLabel: 'Planning Analysis', icon: 'MapPin', color: 'adv-gold' },
{ id: 'investment-analysis', areaId: 'real-estate', label: 'Real Estate Investment Analysis', shortLabel: 'Investment Analysis', icon: 'TrendingUp', color: 'adv-gold' },

// === B12: Personal Finance ===

{ id: 'budget-planning', areaId: 'personal-finance', label: 'Budget Planning Assistant', shortLabel: 'Budget Planning', icon: 'DollarSign', color: 'adv-green' },
{ id: 'tax-optimisation', areaId: 'personal-finance', label: 'Tax Optimisation Advisor', shortLabel: 'Tax Optimisation', icon: 'DollarSign', color: 'adv-green' },
{ id: 'pension-planning', areaId: 'personal-finance', label: 'Pension & Retirement Planning', shortLabel: 'Pension Planning', icon: 'Calendar', color: 'adv-green' },
{ id: 'debt-management', areaId: 'personal-finance', label: 'Debt Management Strategy', shortLabel: 'Debt Management', icon: 'TrendingDown', color: 'adv-green' },
{ id: 'savings-strategy', areaId: 'personal-finance', label: 'Savings & Investment Strategy', shortLabel: 'Savings Strategy', icon: 'TrendingUp', color: 'adv-green' },

// === B13: Healthcare & Life Sciences ===

{ id: 'clinical-protocol', areaId: 'healthcare', label: 'Clinical Protocol Development', shortLabel: 'Clinical Protocol', icon: 'FileText', color: 'adv-red' },
{ id: 'regulatory-pathway', areaId: 'healthcare', label: 'Regulatory Pathway Planning', shortLabel: 'Regulatory Pathway', icon: 'GitBranch', color: 'adv-red' },
{ id: 'patient-comms', areaId: 'healthcare', label: 'Patient Communication Materials', shortLabel: 'Patient Comms', icon: 'MessageSquare', color: 'adv-red' },
{ id: 'healthcare-gdpr', areaId: 'healthcare', label: 'Healthcare Data & GDPR', shortLabel: 'Healthcare GDPR', icon: 'Lock', color: 'adv-red' },
{ id: 'research-ethics', areaId: 'healthcare', label: 'Research Ethics Framework', shortLabel: 'Research Ethics', icon: 'Scale', color: 'adv-red' },

// === B14: Manufacturing & Operations ===

{ id: 'process-improvement', areaId: 'manufacturing', label: 'Process Improvement', shortLabel: 'Process Improvement', icon: 'RefreshCw', color: 'adv-teal' },
{ id: 'supply-chain-risk', areaId: 'manufacturing', label: 'Supply Chain Risk Assessment', shortLabel: 'Supply Chain Risk', icon: 'Network', color: 'adv-teal' },
{ id: 'quality-management', areaId: 'manufacturing', label: 'Quality Management System', shortLabel: 'Quality Management', icon: 'CheckSquare', color: 'adv-teal' },
{ id: 'lean-six-sigma', areaId: 'manufacturing', label: 'Lean Six Sigma Analysis', shortLabel: 'Lean Six Sigma', icon: 'BarChart3', color: 'adv-teal' },
{ id: 'operational-audit', areaId: 'manufacturing', label: 'Operational Audit', shortLabel: 'Operational Audit', icon: 'ClipboardCheck', color: 'adv-teal' },
