/**
 * PortalHelpSheet — step-by-step "how do I publish my own portal?" guide.
 *
 * Opened from the "?" button in PortalsBrowseScreen's header. Wraps
 * BottomSheet so dismissal, hardware-back, and Esc all behave
 * consistently with every other sheet in the app.
 *
 * The content is intentionally static — there's no network call or
 * deep-link out to localhost. Portals are built in *desktop* ANTON
 * (the LLM-driven 8-phase walkthrough lives there); the Comm App is
 * for visitors, so the help text is a pointer to the right place,
 * not a launcher for it.
 */
import BottomSheet from './BottomSheet';
import { Ico } from './Ico';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Step {
  n: number;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    n: 1,
    title: 'Open ANTON on your computer',
    body: 'Portals are built in desktop ANTON, not in the Comm App. Open the ANTON instance you signed in with on your phone (usually http://localhost:3001 in your browser).',
  },
  {
    n: 2,
    title: 'Go to the Portals pillar',
    body: 'In the left sidebar, click Portals. You\'ll see a list of any portals you\'ve already built plus a button to create a new one.',
  },
  {
    n: 3,
    title: 'Start the walkthrough',
    body: 'Click "Build a new portal." ANTON walks you through 8 phases with a guided AI conversation — answer in plain language, edit anything you don\'t like.',
  },
  {
    n: 4,
    title: 'The 8 phases',
    body: 'Intent (what problem) → Identity (name, title, category) → Capabilities (what visitors can do: contact, book, order, …) → Operations (pricing, delivery) → Surface (managed or external) → Trust (KYC details) → Content (your pages, with a live mobile preview) → Review (AI quality check).',
  },
  {
    n: 5,
    title: 'Use the live mobile preview',
    body: 'The Content phase shows your portal exactly as Comm App visitors will see it — phone frame, mobile CSS, capability bar. Make it look good there before publishing.',
  },
  {
    n: 6,
    title: 'Publish to the relay',
    body: 'When you\'re ready, click Publish. Your descriptor is signed by your ANTON\'s Ed25519 key and submitted to the relay with the KYC details from phase 6.',
  },
  {
    n: 7,
    title: 'Wait for operator review',
    body: 'A relay operator checks the KYC and the descriptor for abuse / impersonation. Usually approved within a day. You\'ll see the status in your portal list in desktop ANTON.',
  },
  {
    n: 8,
    title: 'Live!',
    body: 'Once approved, anyone running the Comm App can find your portal here by searching its name, tags, or service area — and tap a capability to send you a message, order, or book.',
  },
];

export default function PortalHelpSheet({ open, onClose }: Props) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Publish your own portal"
      icon="helpCircle"
      ariaLabel="How to publish a portal"
      maxHeight="85dvh"
    >
      <div className="px-5 overflow-y-auto pb-2">
        <p className="text-sm text-[var(--color-text-muted)] mb-5">
          A portal is a small public space on the ANTON network — pages
          + capabilities (actions visitors can take). Anyone with desktop
          ANTON can publish one.
        </p>

        <ol className="space-y-4">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-3">
              <span
                aria-hidden="true"
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold"
                style={{
                  backgroundColor: 'var(--color-accent-dim)',
                  color: 'var(--color-accent-dark)',
                }}
              >
                {s.n}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-[var(--color-text)] leading-tight">
                  {s.title}
                </h3>
                <p className="mt-1 text-sm text-[var(--color-text-body)] leading-snug">
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div
          className="mt-6 rounded-2xl p-4 text-xs"
          style={{
            backgroundColor: 'var(--color-surface-alt)',
            color: 'var(--color-text-muted)',
          }}
        >
          <p className="font-medium text-[var(--color-text-body)] flex items-center gap-1.5">
            <Ico name="lock" size={14} color="var(--color-text-muted)" />
            Why the KYC step?
          </p>
          <p className="mt-1.5 leading-snug">
            The relay is operated under EU DSA rules. Portal operators
            must be identifiable so the network stays open without
            becoming a phishing or impersonation surface. Your KYC isn\'t
            shared with visitors — only the relay operator sees it.
          </p>
        </div>

        <div className="mt-3 text-[11px] text-[var(--color-text-faint)] text-center">
          The Comm App is for visiting portals — building one happens on
          your desktop ANTON.
        </div>
      </div>
    </BottomSheet>
  );
}
