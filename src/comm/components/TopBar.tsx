import { getIdentity } from '../services/identity';

interface Props {
  onProfile: () => void;
}

export default function TopBar({ onProfile }: Props) {
  const id = getIdentity();
  const initial = (id?.displayName || '?').slice(0, 1).toUpperCase();

  return (
    <header className="safe-top">
      <div className="flex items-center justify-between h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <span className="text-base font-semibold text-[var(--color-text)]">ANTON</span>
        <button
          onClick={onProfile}
          aria-label="Open profile"
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
          style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
        >
          {initial}
        </button>
      </div>
    </header>
  );
}
