export default function ChatListScreen() {
  return (
    <section className="px-5 pt-6 pb-4">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Chat</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        End-to-end encrypted messages with your friends.
      </p>

      <div className="mt-8 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center">
        <p className="text-sm text-[var(--color-text-body)]">
          You haven't added any contacts yet.
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-faint)]">
          Phase 1 will add identity onboarding and contact exchange via QR.
        </p>
      </div>
    </section>
  );
}
