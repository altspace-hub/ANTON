/**
 * LoadingShell — placeholder for Suspense fallbacks while a lazy screen
 * resolves. Kept deliberately minimal so it never gets noticed; the
 * chunks are small (≤80 KB ungzipped) and on-device WebView load times
 * are typically under 50 ms.
 */
export default function LoadingShell() {
  return (
    <div
      className="flex items-center justify-center min-h-dvh safe-top safe-bottom bg-[var(--color-bg)]"
      aria-busy="true"
      aria-label="Loading"
    >
      <div
        className="w-6 h-6 rounded-full border-2 animate-spin"
        style={{
          borderColor: 'var(--color-border-soft)',
          borderTopColor: 'var(--color-accent)',
        }}
      />
    </div>
  );
}
