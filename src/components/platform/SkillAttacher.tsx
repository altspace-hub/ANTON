import { useState, useEffect } from 'react';
import { Zap, ChevronDown, ChevronRight, X } from 'lucide-react';
import { fetchSkills } from '@/lib/api';

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
}

interface SkillAttacherProps {
  selected: string[];
  onChange: (skills: string[]) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  language: 'Language',
  communication: 'Communication',
  methodology: 'Methodology',
  domain: 'Domain',
  style: 'Style',
};

export default function SkillAttacher({ selected, onChange }: SkillAttacherProps) {
  const [expanded, setExpanded] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    fetchSkills().then(setSkills).catch(() => {});
  }, []);

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const grouped = skills.reduce<Record<string, Skill[]>>((acc, skill) => {
    const cat = skill.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(skill);
    return acc;
  }, {});

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
            <span className="rounded-full bg-adv-teal px-2 py-0.5 text-[10px] font-medium text-adv-dark">
              {selected.length}
            </span>
          )}
        </div>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-adv-gray" /> : <ChevronRight className="h-3.5 w-3.5 text-adv-gray" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <p className="mb-3 text-xs text-adv-gray-med">
            Attach skills to enhance Claude's expertise or communication style for this session.
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
            {Object.entries(grouped).map(([category, catSkills]) => (
              <div key={category}>
                <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-adv-gray-med">
                  {CATEGORY_LABELS[category] || category}
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
