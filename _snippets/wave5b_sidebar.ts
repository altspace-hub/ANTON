// ============================================================
// Wave 5b — Sidebar.tsx snippets
// Paste these into src/components/layout/Sidebar.tsx
// ============================================================

// ─── ICON IMPORTS: Add to the lucide-react import ────────────
//
// Icons already imported (reused): FileSearch, MessageSquare, ClipboardList,
//   BarChart3, FileText, Building, Users, Shield, Scale, Layers, CheckSquare,
//   Calendar, Cpu, BookOpen, ScrollText, Activity, Handshake, FlaskConical, Building2
//
// NOTE: Icon substitutions applied:
//   - Landmark → Building2 (already imported)
//   - Gavel → Scale (already imported)
//   - Monitor → Cpu (already imported)
//
// No new icon imports needed — all icons are already imported in previous waves.


// ─── AREA_COLORS: Add these entries ──────────────────────────
//
// Add inside the AREA_COLORS record:

  'public-sector':   { dot: 'bg-adv-blue',   text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  'consumer-legal':  { dot: 'bg-adv-red',    text: 'text-adv-red',     active: 'bg-adv-red/10 text-adv-red' },
  education:         { dot: 'bg-adv-gold',   text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },


// ─── ICON MAP: No new entries needed ─────────────────────────
//
// All icons used by Wave 5b modules are already present in the iconMap:
//   FileSearch, MessageSquare, ClipboardList, BarChart3, FileText,
//   Building, Users, Shield, Scale, Layers, CheckSquare, Calendar,
//   Cpu, BookOpen, ScrollText, Activity, Handshake, FlaskConical, Building2
