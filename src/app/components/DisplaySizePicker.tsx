/**
 * DisplaySizePicker — screen-size adaptation control (auto-fit + override).
 *
 * Lets the user fit the app to any device (it was laid out for a tall phone):
 * Auto / Compact / Standard / Large / Tablet. Drives --app-scale / --app-max-width
 * via <html data-display="…"> (personalization.ts). Reused in the Pro (SettingsPage)
 * and Standard (StdSettingsScreen) settings so it's reachable in either mode.
 */
import { DISPLAY_SIZES } from '../services/personalization';
import { usePersonalization } from './ui/PersonalizationContext';
import { Ico } from './ui';

export default function DisplaySizePicker(): JSX.Element {
  const { display, setDisplay } = usePersonalization();
  return (
    <div className="flex flex-col gap-1.5">
      {DISPLAY_SIZES.map((d) => {
        const active = display === d.id;
        return (
          <button
            key={d.id}
            onClick={() => setDisplay(d.id)}
            className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left"
            style={{
              background: active ? 'var(--color-accent-dim)' : 'var(--color-surface)',
              border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[0.875rem] font-semibold text-[var(--color-text)]">{d.label}</div>
              <div className="text-[0.6875rem] text-[var(--color-text-muted)]">{d.sub}</div>
            </div>
            {active && <Ico name="check" size={16} color="var(--color-accent)" />}
          </button>
        );
      })}
    </div>
  );
}
