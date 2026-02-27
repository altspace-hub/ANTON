// ═══════════════════════════════════════════════════════════════
// WAVE 4 — Sidebar.tsx additions
// ═══════════════════════════════════════════════════════════════

// ── Icon imports to add to lucide-react import ───────────────
// Most icons are already imported from prior waves. New ones needed:
// Calculator (for accounting area — use DollarSign if not available)
// Palette (already imported in Wave 3)
// Code (already imported in Wave 3)
// PenTool (use FileText as fallback — already imported)
// Layout (use Layers as fallback — already imported)
//
// Icons already available: Users, FileText, MessageSquare, BarChart3,
// ScrollText, GraduationCap, FileSearch, BarChart2, DollarSign, LineChart,
// GitBranch, Target, Layers, Megaphone, Network, Database, AlertTriangle,
// Handshake, TrendingUp, Code, Palette

// ── AREA_COLORS entries ──────────────────────────────────────
// Add inside AREA_COLORS object in Sidebar.tsx:

// Wave 4 areas
hr:                 { dot: 'bg-adv-blue',    text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
accounting:         { dot: 'bg-adv-gold',    text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },
branding:           { dot: 'bg-adv-red',     text: 'text-adv-red',     active: 'bg-adv-red/10 text-adv-red' },
'software-eng':     { dot: 'bg-adv-teal',    text: 'text-adv-teal',    active: 'bg-adv-teal-dim text-adv-teal' },
sales:              { dot: 'bg-adv-green',   text: 'text-adv-green',   active: 'bg-adv-green/10 text-adv-green' },

// ── iconMap entries ──────────────────────────────────────────
// Most module icons are already in the iconMap from prior waves.
// Verify these are present in the iconMap object:
//   FileText, MessageSquare, BarChart3, ScrollText, GraduationCap,
//   FileSearch, BarChart2, DollarSign, LineChart, GitBranch,
//   Target, Layers, Megaphone, Network, Database, AlertTriangle,
//   Handshake, TrendingUp, Users, Code, Palette
//
// All of these were imported in prior wave updates.
// No new icon imports are needed for Wave 4.
