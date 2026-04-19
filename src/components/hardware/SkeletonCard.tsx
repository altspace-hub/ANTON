/**
 * SkeletonCard — shimmer placeholder for list-view loading states.
 *
 * Use 3× of these where a list is loading to avoid the layout shift that
 * happens with a single spinner. Render `<SkeletonCard variant="grid" />`
 * inside a grid `<section>` exactly as the real card lives.
 */

interface Props {
  variant?: 'grid' | 'row';
  count?: number;
}

export default function SkeletonCard({ variant = 'grid', count = 1 }: Props) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={
            variant === 'grid'
              ? 'p-4 rounded border border-adv-gray/20 bg-adv-card animate-pulse'
              : 'p-3 rounded border border-adv-gray/20 bg-adv-card animate-pulse'
          }
        >
          <div className="space-y-2">
            <div className="h-3 w-1/3 bg-adv-gray/20 rounded" />
            <div className="h-5 w-3/4 bg-adv-gray/20 rounded" />
            <div className="h-3 w-full bg-adv-gray/15 rounded" />
            <div className="h-3 w-5/6 bg-adv-gray/15 rounded" />
            <div className="flex items-center gap-2 pt-2">
              <div className="h-4 w-12 bg-adv-gray/20 rounded" />
              <div className="h-4 w-16 bg-adv-gray/20 rounded" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
