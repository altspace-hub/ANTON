export default function EventsScreen() {
  return (
    <section className="px-5 pt-6 pb-4">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">Events</h1>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        Dinners, concerts, travel, parties, birthdays.
      </p>

      <div className="mt-8 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center">
        <p className="text-sm text-[var(--color-text-body)]">
          No upcoming events.
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-faint)]">
          Phase 2 will add event creation, invites, and RSVPs.
        </p>
      </div>
    </section>
  );
}
