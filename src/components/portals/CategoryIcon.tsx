// ── CategoryIcon.tsx ────────────────────────────────────────────────────────
// Thin Lucide-icon indirection so category configs can reference icons by
// name (`icon_ref: 'ChefHat'`) and this component resolves to the component.
// Lets starter packs stay pure data.

import {
  Compass, Briefcase, Store, Users, Video, Music, ChefHat, ShoppingBag,
  Trophy, Newspaper, Wallet, Plane, HeartPulse, MapPin, GraduationCap,
  BookOpen, Palette, Gamepad2, School, Telescope, User, Globe,
  type LucideIcon,
} from 'lucide-react';

const REGISTRY: Record<string, LucideIcon> = {
  Compass, Briefcase, Store, Users, Video, Music, ChefHat, ShoppingBag,
  Trophy, Newspaper, Wallet, Plane, HeartPulse, MapPin, GraduationCap,
  BookOpen, Palette, Gamepad2, School, Telescope, User, Globe,
};

interface Props {
  name?: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export default function CategoryIcon({ name, size = 20, className, strokeWidth = 1.75 }: Props) {
  const Icon = (name && REGISTRY[name]) || Globe;
  return <Icon size={size} className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}
