import { getIdentity } from '../services/identity';
import Logo from './Logo';

interface Props {
  onProfile: () => void;
}

export default function TopBar({ onProfile }: Props) {
  const id = getIdentity();
  const initial = (id?.displayName || '?').slice(0, 1).toUpperCase();

  return (
    <header className="safe-top">
      <div className="flex items-center justify-between h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2">
          <Logo size={24} rounded="sm" />
          <span className="text-base font-semibold text-[var(--color-text)]">ANTON</span>
        </div>
        {/* P8-1: the visible chip stays 32 px (w-8 h-8 fits the
            12-px-tall header band) but the hit area is 44 px via
            inline padding + negative margin. The user sees a tidy
            avatar; the tap target reaches Material/iOS 44 dp. */}
        <button
          onClick={onProfile}
          aria-label="Open profile"
          className="p-1.5 -m-1.5 flex items-center justify-center"
        >
          <span
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
            style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
          >
            {initial}
          </span>
        </button>
      </div>
    </header>
  );
}
