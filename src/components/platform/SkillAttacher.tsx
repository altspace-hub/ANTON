import { useState } from 'react';
import { Zap, ChevronDown, ChevronRight, X } from 'lucide-react';
import { useSkillCatalog } from '@/hooks/useSkills';
import type { SkillSummary } from '@/lib/types';

interface SkillAttacherProps {
  selected: string[];
  onChange: (skills: string[]) => void;
}

/**
 * Display order of the category groups. Mirrors SKILL_CATEGORIES in
 * server/services/skills-manager.ts; a category outside this list sorts last
 * under its raw name rather than disappearing.
 */
const CATEGORY_ORDER = ['methodology', 'domain', 'technical', 'thematic', 'jurisdiction', 'language', 'communication', 'style'];

const CATEGORY_LABELS: Record<string, string> = {
  methodology: 'Methodology',
  domain: 'Domain',
  technical: 'Technical standards',
  thematic: 'Thematic knowledge',
  jurisdiction: 'Jurisdiction',
  language: 'Language',
  communication: 'Communication',
  style: 'Style',
};

function categoryRank(category: string): number {
  const i = CATEGORY_ORDER.indexOf(category);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

export default function SkillAttacher({ selected, onChange }: SkillAttacherProps) {
  const [expanded, setExpanded] = useState(false);
  const { skills } = useSkillCatalog();

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const grouped = skills.reduce<Record<string, SkillSummary[]>>((acc, skill) => {
    const cat = skill.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(skill);
    return acc;
  }, {});

  // Fixed group order, names alphabetical inside a group — the twelve
  // jurisdiction packs read as a country list instead of load order.
  const groups = Object.entries(grouped)
    .sort(([a], [b]) => categoryRank(a) - categoryRank(b) || a.localeCompare(b))
    .map(([category, list]) => ({
      category,
      skills: [...list].sort((x, y) => x.name.localeCompare(y.name)),
    }));

  return (
    <div className="rounded-xl border border-border bg-adv-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-adv-teal" />
          <span className="text-sm font-medium text-adv-off-white">Skills</span>
          {selected.length > 0 && (
            <span className="rounded-full bg-adv-teal px-2 py-0.5 text-xs font-medium text-adv-dark">
              {selected.length}
            </span>
          )}
        </div>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-adv-gray" /> : <ChevronRight className="h-3.5 w-3.5 text-adv-gray" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <p className="mb-3 text-xs text-adv-gray">
            Attach skills to enhance the model's expertise or communication style for this session.
          </p>

          {/* Active skills */}
          {selected.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {selected.map((id) => {
                const skill = skills.find((s) => s.id === id);
                return (
                  <span
                    key={id}
                    className="flex items-center gap-1 rounded-full border border-adv-teal/40 bg-adv-teal/10 px-2.5 py-1 text-xs text-adv-teal"
                  >
                    <Zap className="h-2.5 w-2.5" />
                    {skill?.name || id}
                    <button onClick={() => toggle(id)} className="ml-0.5 hover:text-adv-white transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Skill grid by category */}
          <div className="space-y-3">
            {groups.map(({ category, skills: catSkills }) => (
              <div key={category}>
                <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-adv-gray">
                  {CATEGORY_LABELS[category] || category}
                  <span className="ml-1.5 normal-case tracking-normal opacity-60">({catSkills.length})</span>
                </div>
                <div className="space-y-1.5">
                  {catSkills.map((skill) => {
                    const isActive = selected.includes(skill.id);
                    return (
                      <button
                        key={skill.id}
                        onClick={() => toggle(skill.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left transition-all ${
                          isActive
                            ? 'border-adv-teal/40 bg-adv-teal/10 text-adv-teal'
                            : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">{skill.name}</span>
                          {isActive && <Zap className="h-3 w-3 text-adv-teal" />}
                        </div>
                        <p className="mt-0.5 text-[11px] leading-relaxed opacity-70">{skill.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
