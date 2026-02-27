// ============================================================================
// Wave 3 Sidebar Snippet — AREA_COLORS entries for Sidebar.tsx
// ============================================================================

// Add these entries to the AREA_COLORS record in src/components/layout/Sidebar.tsx:

  startups:       { dot: 'bg-adv-gold',    text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },
  'personal-dev': { dot: 'bg-adv-teal',    text: 'text-adv-teal',    active: 'bg-adv-teal-dim text-adv-teal' },
  academic:       { dot: 'bg-adv-blue',    text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  'comms-pr':     { dot: 'bg-adv-green',   text: 'text-adv-green',   active: 'bg-adv-green/10 text-adv-green' },

// ============================================================================
// Additional icon imports needed in Sidebar.tsx (add to the iconMap object)
// ============================================================================
// The following icons may need to be added to the Lucide React imports and
// iconMap in Sidebar.tsx if not already present:
//
// import {
//   Rocket,         // Startups area icon
//   TrendingUp,     // Personal Dev area icon
//   GraduationCap,  // Academic area icon
//   Megaphone,      // Comms & PR area icon
//   FileText,       // Business Plan, CV Writer, Thesis Writer modules
//   Presentation,   // Pitch Deck module
//   DollarSign,     // Funding Strategy, Salary Negotiation modules
//   Target,         // MVP Scoping module
//   Handshake,      // Co-founder Agreements module
//   MessageSquare,  // Interview Prep module
//   Star,           // Personal Brand module
//   BookOpen,       // Literature Review module
//   FlaskConical,   // Research Methodology module
//   Link,           // Citation Management module
//   ScrollText,     // Research Proposal module
//   Newspaper,      // Press Release module
//   AlertTriangle,  // Crisis Comms module
//   Users,          // Internal Comms module
//   Network,        // Stakeholder Messaging module
//   Mic,            // Media Briefing module
// } from 'lucide-react';
//
// Add to iconMap:
//   Rocket, TrendingUp, GraduationCap, Megaphone,
//   FileText, Presentation, DollarSign, Target, Handshake,
//   MessageSquare, Star, BookOpen, FlaskConical, Link,
//   ScrollText, Newspaper, AlertTriangle, Users, Network, Mic,
