import { memo } from 'react';
import { Search, Database, FolderOpen, Brain, Link, Combine } from 'lucide-react';
import type { KnowledgeSourceConfig } from '@/lib/types';

interface ContextPanelProps {
  knowledgeSources: KnowledgeSourceConfig;
}

function ContextPanel({ knowledgeSources }: ContextPanelProps) {
  const { claudeKnowledge, onlineReference, localFolder, combinedMode } = knowledgeSources.modes;
  const ragMode = knowledgeSources.ragMode;

  const activeSources: Array<{ icon: React.ReactNode; label: string; detail: string }> = [];

  if (claudeKnowledge.enabled) {
    const details: string[] = ['Built-in knowledge'];
    if (claudeKnowledge.webSearchEnabled) details.push('web search enabled');
    if (claudeKnowledge.description) details.push(`focus: ${claudeKnowledge.description}`);
    activeSources.push({
      icon: <Brain className="h-3 w-3 text-adv-teal" />,
      label: 'Claude Knowledge',
      detail: details.join(' · '),
    });
  }

  if (onlineReference.enabled && onlineReference.urls.length > 0) {
    activeSources.push({
      icon: <Link className="h-3 w-3 text-adv-teal" />,
      label: 'Online References',
      detail: `${onlineReference.urls.length} URL${onlineReference.urls.length > 1 ? 's' : ''} (${onlineReference.fetchDepth})`,
    });
  }

  if (localFolder.enabled && localFolder.folderPaths.length > 0) {
    activeSources.push({
      icon: <FolderOpen className="h-3 w-3 text-adv-teal" />,
      label: 'Local Folders',
      detail: `${localFolder.folderPaths.length} folder${localFolder.folderPaths.length > 1 ? 's' : ''} — full text injection`,
    });
  }

  if (combinedMode.enabled) {
    activeSources.push({
      icon: <Combine className="h-3 w-3 text-adv-teal" />,
      label: 'Combined Mode',
      detail: `Priority: ${combinedMode.priority.replace('_', ' ')}`,
    });
  }

  if (ragMode?.enabled) {
    const folderCount = ragMode.folderPaths.length;
    activeSources.push({
      icon: <Search className="h-3 w-3 text-adv-teal" />,
      label: 'Indexed Knowledge Base',
      detail: folderCount > 0
        ? `Will retrieve up to ${ragMode.topK} relevant passages from ${folderCount} indexed folder${folderCount > 1 ? 's' : ''}`
        : `Will retrieve up to ${ragMode.topK} passages — no folders selected yet`,
    });
  }

  if (activeSources.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-adv-card px-3 py-2">
        <div className="text-xs text-adv-gray-med">No knowledge sources active</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-adv-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <Database className="h-3.5 w-3.5 text-adv-teal" />
        <span className="text-xs font-medium text-adv-off-white">Active Context Sources</span>
        <span className="ml-auto text-[10px] text-adv-gray-med">
          {activeSources.length} source{activeSources.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        {activeSources.map((source, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="mt-0.5 shrink-0">{source.icon}</div>
            <div className="min-w-0">
              <div className="text-xs text-adv-off-white">{source.label}</div>
              <div className="text-[10px] text-adv-gray-med">{source.detail}</div>
            </div>
          </div>
        ))}

        {/* RAG pre-query indicator */}
        {ragMode?.enabled && ragMode.folderPaths.length > 0 && (
          <div className="mt-2 rounded bg-adv-teal-dim/30 px-2 py-1.5 border border-adv-teal/10">
            <div className="flex items-center gap-1.5 text-[10px] text-adv-teal">
              <Search className="h-3 w-3" />
              Mode 5 active — passages retrieved at query time
            </div>
            <div className="mt-1 text-[10px] text-adv-gray-med">
              {ragMode.folderPaths.map((p, i) => (
                <div key={i} className="truncate">· {p}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(ContextPanel);
