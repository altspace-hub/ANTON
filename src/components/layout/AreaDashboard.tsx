import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface AreaDashboardProps {
  areaId: string;
  areaLabel: string;
  moduleIds: string[];
  /** Top modules from session stats (moduleId -> count) */
  topModules?: Array<{ moduleId: string; count: number }>;
  /** Total sessions in this area */
  areaSessions?: number;
}

const AREA_DESCRIPTIONS: Record<string, string> = {
  fcp: 'Financial crime prevention: AML/CFT gap analysis, sanctions, and regulatory compliance.',
  legal: 'Legal analysis: contract review, regulatory mapping, and compliance frameworks.',
  audit: 'Internal audit: gap scoring, workpaper creation, and control testing.',
  consulting: 'Management consulting: proposals, project plans, and stakeholder communications.',
  banking: 'Banking & financial services: product analysis, risk assessment, and operations.',
  risk: 'Enterprise risk management: risk registers, control frameworks, and reporting.',
  cyber: 'Cybersecurity: threat analysis, incident response, and security frameworks.',
  'data-analytics': 'Data & analytics: data quality, governance frameworks, and analytics strategy.',
};

export default function AreaDashboard({
  areaId,
  areaLabel,
  moduleIds,
  topModules = [],
  areaSessions = 0,
}: AreaDashboardProps) {
  const [open, setOpen] = useState(false);

  // Compute the most popular module in this area from topModules
  const areaModuleSet = new Set(moduleIds);
  const popularInArea = topModules
    .filter((m) => areaModuleSet.has(m.moduleId))
    .sort((a, b) => b.count - a.count)[0];

  const description =
    AREA_DESCRIPTIONS[areaId] ??
    `${areaLabel}: AI-powered tools for analysis, document creation, and advisory work.`;

  return (
    <div className="mx-1 mb-1 rounded-lg border border-border bg-adv-dark-2 text-xs">
      {/* Toggle header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-2.5 py-1.5 text-adv-gray-med hover:text-adv-off-white transition-colors"
        aria-expanded={open}
        aria-label={`${areaLabel} area overview`}
      >
        <span className="font-medium">Area overview</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
        />
      </button>

      {open && (
        <div className="space-y-2 px-2.5 pb-2.5">
          {/* Activity */}
          <div className="flex items-start gap-1.5">
            <span className="mt-0.5 shrink-0 text-adv-teal">&#9679;</span>
            <div>
              <span className="font-medium text-adv-off-white">Activity: </span>
              <span className="text-adv-gray">
                {areaSessions > 0
                  ? `${areaSessions} session${areaSessions !== 1 ? 's' : ''}`
                  : 'No sessions yet'}
                {' '}· {moduleIds.length} module{moduleIds.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Quick Start */}
          {popularInArea && (
            <div className="flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0 text-adv-teal">&#9679;</span>
              <div>
                <span className="font-medium text-adv-off-white">Most used: </span>
                <span className="text-adv-gray">
                  {popularInArea.moduleId} ({popularInArea.count} session{popularInArea.count !== 1 ? 's' : ''})
                </span>
              </div>
            </div>
          )}

          {/* About */}
          <div className="flex items-start gap-1.5">
            <span className="mt-0.5 shrink-0 text-adv-teal">&#9679;</span>
            <p className="text-adv-gray leading-relaxed">{description}</p>
          </div>
        </div>
      )}
    </div>
  );
}
