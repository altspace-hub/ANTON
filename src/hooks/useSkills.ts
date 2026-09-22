import { useEffect, useState } from 'react';
import { fetchSkills } from '@/lib/api';
import type { SkillSummary } from '@/lib/types';

/**
 * The skill catalogue — GET /api/skills: the built-ins plus the server/skills/
 * disk packs, without prompt bodies — fetched once per page load and shared by
 * every consumer. SkillAttacher and ModulePage's suggestion banner sit on the
 * same page; before this each fetched its own copy.
 */
let _catalogPromise: Promise<SkillSummary[]> | null = null;
let _catalog: SkillSummary[] | null = null;

export function loadSkillCatalog(): Promise<SkillSummary[]> {
  if (!_catalogPromise) {
    _catalogPromise = fetchSkills()
      .then((list: unknown) => {
        const skills = Array.isArray(list) ? (list as SkillSummary[]) : [];
        _catalog = skills;
        return skills;
      })
      .catch(() => {
        _catalogPromise = null; // let the next mount retry
        return [] as SkillSummary[];
      });
  }
  return _catalogPromise;
}

export function useSkillCatalog(): { skills: SkillSummary[]; loaded: boolean } {
  const [skills, setSkills] = useState<SkillSummary[]>(_catalog ?? []);
  const [loaded, setLoaded] = useState(_catalog !== null);

  useEffect(() => {
    let cancelled = false;
    loadSkillCatalog().then((list) => {
      if (cancelled) return;
      setSkills(list);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  return { skills, loaded };
}

/**
 * `recommendedSkills` from a module config as GET /api/modules/:id serves it
 * (module.json's own field), or [] when absent or malformed. The caller still
 * filters the ids against the catalogue: a module may only suggest a skill
 * that exists.
 */
export function readRecommendedSkills(cfg: unknown): string[] {
  if (!cfg || typeof cfg !== 'object') return [];
  const raw = (cfg as { recommendedSkills?: unknown }).recommendedSkills;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}
