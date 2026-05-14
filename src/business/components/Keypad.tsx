/**
 * Keypad — 4×3 numeric keypad for amount entry.
 *
 * Same layout as the Expo simple.tsx pad: 7 8 9 / 4 5 6 / 1 2 3 / . 0 ⌫.
 * Pure presentation — caller owns the state.
 */
interface Props {
  onKey: (key: string) => void;
}

const KEYS = ['7','8','9','4','5','6','1','2','3','.','0','⌫'];

export default function Keypad({ onKey }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2.5 my-4">
      {KEYS.map((k) => (
        <button
          type="button"
          key={k}
          onClick={() => onKey(k)}
          className="rounded-2xl text-3xl font-medium transition-colors active:scale-[0.97]"
          style={{
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            aspectRatio: '1.6 / 1',
          }}
        >
          {k}
        </button>
      ))}
    </div>
  );
}
