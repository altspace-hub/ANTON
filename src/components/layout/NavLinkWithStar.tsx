/**
 * NavLinkWithStar.tsx
 * NavLink wrapper that adds a star button for favoriting navigation items.
 */

import { NavLink } from 'react-router-dom';
import { Star } from 'lucide-react';

interface NavLinkWithStarProps {
  to: string;
  navId: string;
  title?: string;
  className: string | ((props: { isActive: boolean }) => string);
  isFavorite: boolean;
  isHidden: boolean;
  onToggleFavorite: (navId: string) => void;
  children: React.ReactNode;
  sidebarCollapsed?: boolean;
}

export default function NavLinkWithStar({
  to,
  navId,
  title,
  className,
  isFavorite,
  isHidden,
  onToggleFavorite,
  children,
  sidebarCollapsed = false,
}: NavLinkWithStarProps) {
  if (isHidden) return null;

  const handleStarClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite(navId);
  };

  return (
    <div className="group relative flex items-center">
      <NavLink to={to} title={title} className={className}>
        {children}
      </NavLink>
      {!sidebarCollapsed && (
        <button
          onClick={handleStarClick}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          className={`absolute right-2 rounded p-0.5 transition-all ${
            isFavorite
              ? 'text-adv-gold opacity-100'
              : 'text-adv-gray opacity-0 group-hover:opacity-100 hover:text-adv-gold'
          }`}
        >
          <Star className={`h-3 w-3 ${isFavorite ? 'fill-adv-gold' : ''}`} />
        </button>
      )}
    </div>
  );
}
