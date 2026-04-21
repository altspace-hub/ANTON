// ── CategoryTile.tsx ────────────────────────────────────────────────────────
// One tile in the 15-category grid on the Visitor Home. Larger touch target
// than a bookmark bar entry; shows icon + label + design principle on hover.

import { Link } from 'react-router-dom';
import CategoryIcon from './CategoryIcon';
import type { CategoryConfig } from '../../lib/visitor-categories';

interface Props {
  category: CategoryConfig;
  href: string;
}

export default function CategoryTile({ category, href }: Props) {
  const { label, icon_ref, design_principle, tier } = category;
  return (
    <Link
      to={href}
      className="group flex flex-col items-center justify-center gap-2 p-6 rounded-xl border border-border bg-adv-card hover:border-adv-teal hover:bg-adv-card/80 transition aspect-square min-h-[8rem] relative"
      aria-label={`${label} category`}
    >
      <CategoryIcon name={icon_ref} size={32} className="text-adv-teal group-hover:scale-110 transition" />
      <span className="text-sm font-medium text-adv-off-white text-center">{label}</span>
      {tier === 'placeholder' && (
        <span className="absolute top-2 right-2 text-[10px] uppercase tracking-wide text-adv-gray/60">
          Soon
        </span>
      )}
      {design_principle && (
        <span className="absolute inset-x-2 bottom-2 text-[10px] text-adv-gray text-center leading-tight opacity-0 group-hover:opacity-100 transition">
          {design_principle}
        </span>
      )}
    </Link>
  );
}
