import { useState } from 'react';
import { BookOpen, Network } from 'lucide-react';
import AtomBrowser from '../features/intelligence/AtomBrowser';
import EntityTimeline from '../features/intelligence/EntityTimeline';

type Tab = 'atoms' | 'timeline';

export default function KnowledgePage() {
  const [tab, setTab] = useState<Tab>('atoms');

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="border-b border-border bg-adv-dark-2 px-6">
        <div className="flex gap-1 pt-4">
          <button
            onClick={() => setTab('atoms')}
            className={`flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'atoms'
                ? 'border-b-2 border-adv-teal text-adv-teal'
                : 'text-adv-gray hover:text-adv-off-white'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            Atom Browser
          </button>
          <button
            onClick={() => setTab('timeline')}
            className={`flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === 'timeline'
                ? 'border-b-2 border-adv-teal text-adv-teal'
                : 'text-adv-gray hover:text-adv-off-white'
            }`}
          >
            <Network className="h-4 w-4" />
            Entity Timeline
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-adv-dark">
        {tab === 'atoms' && <AtomBrowser />}
        {tab === 'timeline' && <EntityTimeline />}
      </div>
    </div>
  );
}
