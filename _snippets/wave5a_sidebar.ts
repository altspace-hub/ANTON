// ============================================================
// Wave 5a — Sidebar Snippets
// Icon imports and AREA_COLORS entries for Sidebar.tsx
// ============================================================

// ── Additional Lucide icon imports ─────────────────────────
// Add these to existing import from 'lucide-react':

import {
  Shield,           // insurance area
  ShieldCheck,      // solvency-ii
  Search,           // claims-analysis
  PackageCheck,     // product-governance
  FileCheck,        // idd-compliance
  BarChart3,        // actuarial-comms, lean-six-sigma
  Building,         // real-estate area
  SearchCheck,      // property-due-diligence
  FileSearch,       // lease-review
  BarChart2,        // valuation-support
  MapPin,           // planning-analysis (substitution for Map)
  TrendingUp,       // investment-analysis, savings-strategy
  DollarSign,       // personal-finance area (substitution for Wallet), budget-planning, tax-optimisation
  Calendar,         // pension-planning
  TrendingDown,     // debt-management
  Activity,         // healthcare area (substitution for Heart)
  FileText,         // clinical-protocol
  GitBranch,        // regulatory-pathway
  MessageSquare,    // patient-comms
  Lock,             // healthcare-gdpr
  Scale,            // research-ethics
  Building2,        // manufacturing area (substitution for Factory)
  RefreshCw,        // process-improvement
  Network,          // supply-chain-risk
  CheckSquare,      // quality-management
  ClipboardCheck,   // operational-audit
} from 'lucide-react';

// ── AREA_COLORS entries ────────────────────────────────────
// Add to AREA_COLORS object:

'insurance': 'adv-blue',
'real-estate': 'adv-gold',
'personal-finance': 'adv-green',
'healthcare': 'adv-red',
'manufacturing': 'adv-teal',

// ── Icon mapping entries ───────────────────────────────────
// Add to icon mapping object (if applicable):

'Shield': Shield,
'ShieldCheck': ShieldCheck,
'Search': Search,
'PackageCheck': PackageCheck,
'FileCheck': FileCheck,
'BarChart3': BarChart3,
'Building': Building,
'SearchCheck': SearchCheck,
'FileSearch': FileSearch,
'BarChart2': BarChart2,
'MapPin': MapPin,
'TrendingUp': TrendingUp,
'DollarSign': DollarSign,
'Calendar': Calendar,
'TrendingDown': TrendingDown,
'Activity': Activity,
'FileText': FileText,
'GitBranch': GitBranch,
'MessageSquare': MessageSquare,
'Lock': Lock,
'Scale': Scale,
'Building2': Building2,
'RefreshCw': RefreshCw,
'Network': Network,
'CheckSquare': CheckSquare,
'ClipboardCheck': ClipboardCheck,

// ── Icon substitutions applied ─────────────────────────────
// Factory → Building2 (manufacturing area icon)
// Wallet → DollarSign (personal-finance area icon)
// Heart → Activity (healthcare area icon)
// Map → MapPin (planning-analysis module icon)
// Calculator → DollarSign (budget-planning module icon)
