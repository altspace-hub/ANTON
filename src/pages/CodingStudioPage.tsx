import { useSearchParams, useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft, MessageSquare, FolderGit2 } from 'lucide-react';
import CodingBreadcrumb from '@/components/coding/CodingBreadcrumb';
import type { StudioMode } from './CodingLandingPage';

// ANTON Studio — kickoff shell (P0 placeholder).
// P1 fills the kickoff workshop, P2 the 7-expert panel, P3 the scoped
// workspace + DB, P4 the project-atom loop. For now this is the real
// entry point that carries the `studio_mode` concept (ask | project) via
// the URL so the later phases plug straight in.
export default function CodingStudioPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const rawMode = params.get('mode');
  const studioMode: StudioMode = rawMode === 'ask' ? 'ask' : 'project';

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <CodingBreadcrumb items={[{ label: 'Studio' }]} />

      <div className="rounded-2xl border-2 border-adv-teal bg-adv-card p-8 text-center shadow-lg shadow-adv-teal/10">
        <div className="mx-auto mb-4 inline-flex rounded-xl bg-adv-teal-dim p-4">
          <Sparkles className="h-9 w-9 text-adv-teal" />
        </div>
        <h1 className="text-2xl font-bold text-adv-white">ANTON Studio</h1>
        <p className="mt-2 text-sm text-adv-gray">
          Kickoff coming soon. The guided studio — workshop, 7-expert panel,
          scoped workspace, and project learning — is being assembled phase by phase.
        </p>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-adv-dark px-4 py-1.5 text-sm font-medium text-adv-off-white">
          {studioMode === 'ask' ? (
            <>
              <MessageSquare className="h-4 w-4 text-adv-teal" /> Ask mode
            </>
          ) : (
            <>
              <FolderGit2 className="h-4 w-4 text-adv-teal" /> Project mode
            </>
          )}
        </div>

        <div className="mt-8">
          <button
            onClick={() => navigate('/coding')}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-adv-dark px-4 py-2 text-sm font-medium text-adv-off-white transition-colors hover:text-adv-teal"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Coding
          </button>
        </div>
      </div>
    </div>
  );
}
