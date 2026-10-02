/**
 * AboutLink — the "About ANTON" text link at the foot of the screens a person
 * sees before the workspace (Welcome, Join, Connections), where the More menu
 * and Settings are not yet reachable. The desktop sign-in page links /about
 * the same way. Opens AboutScreen (App.tsx).
 */
import { Ico } from './ui';

export default function AboutLink({ onClick, className = '' }: { onClick: () => void; className?: string }): JSX.Element {
  return (
    <div className={`flex justify-center ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex min-h-[44px] items-center gap-1 px-2 text-sm font-semibold transition active:opacity-60"
        style={{ color: 'var(--color-accent)' }}
      >
        <Ico name="info" size={16} />
        About ANTON
      </button>
    </div>
  );
}
