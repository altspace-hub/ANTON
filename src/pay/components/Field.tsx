/**
 * Field — labelled text input. Shared shape with the Business app's
 * <Field> so the forms read identically across the ANTON suite.
 */
interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: 'text' | 'numeric' | 'email' | 'tel' | 'decimal';
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
}

export default function Field({
  label, value, onChange, placeholder, inputMode = 'text', autoCapitalize = 'words',
}: Props) {
  return (
    <label className="block mb-3">
      <span className="block uppercase tracking-wider text-xs mb-1.5"
            style={{ color: 'var(--color-text-faint)' }}>
        {label}
      </span>
      <input
        type={inputMode === 'email' ? 'email' : inputMode === 'tel' ? 'tel' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        autoCorrect="off"
      />
    </label>
  );
}
