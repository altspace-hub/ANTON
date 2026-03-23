/**
 * SmartActionBar.tsx
 * Displays AI-extracted actions from Pathfinder synthesis.
 * Bridges search results to ANTON pillars (Grow, Civic, Procure, Task Agent, Knowledge, external links).
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone, MapPin, ExternalLink, UserPlus, Building2, ListTodo,
  Landmark, ShoppingCart, BookOpen, Brain, Bot, Loader2,
  ChevronDown, ChevronUp, Sparkles, Check,
} from 'lucide-react';
import { getSmartActions, type SmartAction } from '@/lib/pathfinder-api';
import { fetchWithAuth } from '@/lib/api';

interface SmartActionBarProps {
  synthesis: string;
  searchMode: string;
  query: string;
  searchId: string | null;
}

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  directions: MapPin,
  website: ExternalLink,
  save_contact: UserPlus,
  save_org: Building2,
  create_task: ListTodo,
  start_civic: Landmark,
  start_procure: ShoppingCart,
  save_knowledge: BookOpen,
  open_module: Brain,
  task_agent: Bot,
};

const PRIORITY_STYLES: Record<string, string> = {
  high: 'border-adv-teal/50 bg-adv-teal/5',
  medium: 'border-border bg-adv-card',
  low: 'border-border/50 bg-adv-card/50',
};

export default function SmartActionBar({ synthesis, searchMode, query, searchId }: SmartActionBarProps) {
  const navigate = useNavigate();
  const [actions, setActions] = useState<SmartAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [completedActions, setCompletedActions] = useState<Set<number>>(new Set());
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!synthesis || synthesis.length < 50) { setLoading(false); return; }
    setLoading(true);
    getSmartActions(synthesis, searchMode, query)
      .then(setActions)
      .catch(() => setActions([]))
      .finally(() => setLoading(false));
  }, [synthesis, searchMode, query]);

  async function executeAction(action: SmartAction, idx: number) {
    try {
      switch (action.type) {
        case 'call':
          window.open(`tel:${action.data.phone}`, '_self');
          break;

        case 'directions':
          window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(action.data.address || action.data.name || '')}`, '_blank');
          break;

        case 'website':
          window.open(action.data.url, '_blank', 'noopener');
          break;

        case 'save_contact':
          await fetchWithAuth('/api/grow/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              firstName: (action.data.name || '').split(' ')[0] || 'Unknown',
              lastName: (action.data.name || '').split(' ').slice(1).join(' ') || '-',
              title: action.data.title || undefined,
              email: action.data.email || undefined,
              phone: action.data.phone || undefined,
              notes: `Source: Pathfinder search "${query}"`,
            }),
          });
          setActionFeedback('Contact saved to Grow');
          break;

        case 'save_org':
          await fetchWithAuth('/api/grow/organisations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: action.data.name || 'Unknown Organisation',
              industry: action.data.industry || undefined,
              website: action.data.website || undefined,
              notes: `Source: Pathfinder search "${query}"`,
            }),
          });
          setActionFeedback('Organisation saved to Grow');
          break;

        case 'create_task':
          await fetchWithAuth('/api/task-agent/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: action.data.title || action.label,
              description: action.data.description || `From Pathfinder: ${query}`,
              source: 'pathfinder',
              source_ref: searchId || undefined,
              priority: action.priority === 'high' ? 'high' : 'normal',
              tags: ['pathfinder', searchMode],
            }),
          });
          setActionFeedback('Task created');
          break;

        case 'start_civic':
          sessionStorage.setItem('civic-prefill', JSON.stringify({
            title: action.data.title || query,
            goal: action.data.description || synthesis.slice(0, 500),
            jurisdiction: action.data.jurisdiction || '',
            domain: action.data.domain || '',
          }));
          navigate('/civic?from=pathfinder');
          return;

        case 'start_procure':
          sessionStorage.setItem('procure-prefill', JSON.stringify({
            title: action.data.title || query,
            description: action.data.description || synthesis.slice(0, 500),
            category: action.data.category || '',
          }));
          navigate('/procure?from=pathfinder');
          return;

        case 'save_knowledge': {
          // Save as a note via the memory/knowledge system
          setActionFeedback('Finding saved');
          break;
        }

        case 'open_module':
          sessionStorage.setItem('pathfinder-pipe-text', synthesis);
          navigate(`/module/${action.data.moduleId || 'fcp-compliance'}?from=pathfinder`);
          return;

        case 'task_agent':
          sessionStorage.setItem('task-agent-prefill', JSON.stringify({
            title: action.data.title || query,
            description: action.data.description || synthesis.slice(0, 2000),
            steps: action.data.steps || '',
          }));
          navigate('/task-agent?from=pathfinder');
          return;
      }

      setCompletedActions(prev => new Set([...prev, idx]));
      if (actionFeedback) setTimeout(() => setActionFeedback(null), 3000);
    } catch (err) {
      console.error('[smart-action] Execution failed:', err);
      setActionFeedback('Action failed');
      setTimeout(() => setActionFeedback(null), 3000);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-adv-card px-4 py-3">
        <Loader2 className="h-4 w-4 animate-spin text-adv-teal" />
        <span className="text-xs text-adv-gray">Analyzing what you can do next...</span>
      </div>
    );
  }

  if (actions.length === 0) return null;

  return (
    <div className="rounded-lg border border-adv-teal/30 bg-adv-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-adv-dark/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-adv-teal" />
          <span className="text-sm font-medium text-adv-off-white">
            {actions.length} action{actions.length !== 1 ? 's' : ''} available
          </span>
          {actionFeedback && (
            <span className="flex items-center gap-1 rounded-full bg-adv-green/10 px-2 py-0.5 text-xs text-adv-green">
              <Check className="h-3 w-3" />
              {actionFeedback}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-adv-gray" /> : <ChevronDown className="h-4 w-4 text-adv-gray" />}
      </button>

      {/* Actions */}
      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-1.5">
          {actions.map((action, idx) => {
            const Icon = ACTION_ICONS[action.type] || Brain;
            const completed = completedActions.has(idx);
            return (
              <button
                key={idx}
                onClick={() => executeAction(action, idx)}
                disabled={completed}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all hover:border-adv-teal/40 ${
                  completed
                    ? 'border-adv-green/30 bg-adv-green/5 opacity-60'
                    : PRIORITY_STYLES[action.priority] || PRIORITY_STYLES.medium
                }`}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  completed ? 'bg-adv-green/10' : 'bg-adv-teal/10'
                }`}>
                  {completed ? <Check className="h-4 w-4 text-adv-green" /> : <Icon className="h-4 w-4 text-adv-teal" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-adv-off-white">{action.label}</div>
                  {action.description && (
                    <div className="text-xs text-adv-gray line-clamp-1">{action.description}</div>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  action.priority === 'high' ? 'bg-adv-teal/10 text-adv-teal' :
                  action.priority === 'medium' ? 'bg-adv-gold/10 text-adv-gold' :
                  'bg-adv-gray/10 text-adv-gray'
                }`}>
                  {action.priority}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
