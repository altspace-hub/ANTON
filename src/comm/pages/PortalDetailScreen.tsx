import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchPortalDescriptor,
  invokeCapability,
  type PortalDescriptor,
  type CapabilitySpec,
  type InvokeResponse,
} from '../services/portals';
import PortalPageScreen from './PortalPageScreen';

interface Props {
  portalAddress: string;
  onBack: () => void;
}

export default function PortalDetailScreen({ portalAddress, onBack }: Props) {
  const { t } = useTranslation();
  const [descriptor, setDescriptor] = useState<PortalDescriptor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCap, setActiveCap] = useState<CapabilitySpec | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPortalDescriptor(portalAddress)
      .then((d) => { if (!cancelled) { setDescriptor(d); setLoading(false); } })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t('portals.errLoadFailed'));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [portalAddress]);

  // Decide which sub-screen to render. The page-view branch uses a fixed
  // flex layout (iframe + sticky capability bar), so it needs an
  // overflow-hidden wrapper. The overview/form branches scroll vertically.
  const inPageView = !!descriptor?.portal.originEndpoint && !activeCap;
  const bodyClass = inPageView ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 overflow-y-auto';

  return (
    <section className="flex flex-col h-dvh safe-top safe-bottom bg-[var(--color-bg)]">
      <header className="flex items-center justify-between h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)] flex-shrink-0">
        <button onClick={activeCap ? () => setActiveCap(null) : onBack} className="text-sm text-[var(--color-text-muted)]">
          ← {t('common.back')}
        </button>
        <h1 className="text-base font-semibold text-[var(--color-text)] truncate px-2">
          {activeCap ? activeCap.title : descriptor?.portal.displayTitle ?? t('portals.portal')}
        </h1>
        <span className="w-12" />
      </header>

      <div className={bodyClass}>
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--color-text-faint)]">{t('common.loading')}</div>
        ) : error ? (
          <div className="mx-5 mt-6 rounded-xl bg-[var(--color-red-dim)] px-4 py-3 text-sm text-[var(--color-red)]">{error}</div>
        ) : !descriptor ? (
          <div className="px-5 mt-6">
            <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center">
              <p className="text-sm text-[var(--color-text-body)]">{t('portals.portalNotAvailable')}</p>
              <p className="mt-1 text-xs text-[var(--color-text-faint)]">{portalAddress}</p>
            </div>
          </div>
        ) : activeCap ? (
          <CapabilityForm descriptor={descriptor} capability={activeCap} onClose={() => setActiveCap(null)} />
        ) : descriptor.portal.originEndpoint ? (
          <PortalPageScreen descriptor={descriptor} onSelectCapability={setActiveCap} />
        ) : (
          <PortalOverview descriptor={descriptor} portalAddress={portalAddress} onSelectCapability={setActiveCap} />
        )}
      </div>
    </section>
  );
}

function PortalOverview({ descriptor, portalAddress, onSelectCapability }: {
  descriptor: PortalDescriptor;
  portalAddress: string;
  onSelectCapability: (c: CapabilitySpec) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="pb-8">
      <div className="px-6 py-6 text-center" style={{ backgroundColor: 'var(--color-accent-soft)' }}>
        <div
          className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl font-semibold"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
        >
          {descriptor.portal.displayTitle.slice(0, 1).toUpperCase()}
        </div>
        <h2 className="mt-3 text-xl font-semibold text-[var(--color-text)]">{descriptor.portal.displayTitle}</h2>
        {descriptor.portal.category && (
          <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">{descriptor.portal.category}</p>
        )}
        {descriptor.portal.description && (
          <p className="mt-3 text-sm text-[var(--color-text-body)] max-w-prose mx-auto">
            {descriptor.portal.description}
          </p>
        )}
        <p className="mt-3 text-[10px] font-mono text-[var(--color-text-faint)] break-all">{portalAddress}</p>
      </div>

      <div className="px-5 py-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-3">
          {t('portals.actions')}
        </h3>
        {!descriptor.capabilities || descriptor.capabilities.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('portals.noCapabilities')}</p>
        ) : (
          <ul className="space-y-2">
            {descriptor.capabilities.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => onSelectCapability(c)}
                  className="w-full text-left p-3 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] active:bg-[var(--color-surface-muted)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-medium text-[var(--color-text)] truncate">{c.title}</span>
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded flex-shrink-0"
                          style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}>
                      {c.verb}
                    </span>
                  </div>
                  {c.description && (
                    <p className="mt-1 text-xs text-[var(--color-text-muted)] line-clamp-2">{c.description}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CapabilityForm({ descriptor, capability, onClose }: {
  descriptor: PortalDescriptor;
  capability: CapabilitySpec;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fields = extractFields(capability.inputSchema);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InvokeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleInvoke() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const input: Record<string, unknown> = {};
      for (const f of fields) {
        const v = values[f.name];
        if (v !== undefined && v !== '') input[f.name] = v;
      }
      const r = await invokeCapability(descriptor, capability.id, input);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('portals.errInvokeFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 py-5">
      <p className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">{capability.verb}</p>
      <h2 className="text-xl font-semibold text-[var(--color-text)] mt-1">{capability.title}</h2>
      {capability.description && (
        <p className="mt-2 text-sm text-[var(--color-text-body)]">{capability.description}</p>
      )}

      <div className="mt-6 space-y-4">
        {fields.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('portals.noInputRequired')}</p>
        ) : (
          fields.map((f) => (
            <div key={f.name}>
              <label className="block text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] mb-1.5">
                {f.label}{f.required && <span className="text-[var(--color-red)] ml-0.5">*</span>}
              </label>
              {f.kind === 'long' ? (
                <textarea
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-base text-[var(--color-text)] resize-none"
                />
              ) : (
                <input
                  type={f.kind === 'email' ? 'email' : f.kind === 'url' ? 'url' : f.kind === 'tel' ? 'tel' : 'text'}
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-base text-[var(--color-text)]"
                />
              )}
            </div>
          ))
        )}
      </div>

      {error && <p className="mt-3 text-xs text-[var(--color-red)]">{error}</p>}

      {result && (
        <div className="mt-5 p-4 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-surface)]">
          {result.kind === 'invoke_response' ? (
            <>
              <p className="text-sm font-medium text-[var(--color-green)]">{t('portals.submitted')}</p>
              {result.inboxId && (
                <p className="mt-1 text-xs font-mono text-[var(--color-text-faint)] break-all">{result.inboxId}</p>
              )}
              {result.output && (
                <pre className="mt-2 text-[11px] font-mono text-[var(--color-text-body)] whitespace-pre-wrap break-words">
                  {JSON.stringify(result.output, null, 2)}
                </pre>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--color-text-body)]">
              {result.kind === 'capability_not_found' ? t('portals.capabilityNotFound')
                : result.kind === 'portal_offline' ? t('portals.portalOffline')
                : result.kind === 'invalid_input' ? t('portals.invalidInput', { message: result.message ?? '' })
                : result.kind === 'rate_limited' ? t('portals.rateLimited')
                : t('portals.responseKind', { kind: result.kind })}
            </p>
          )}
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-3 rounded-2xl text-sm font-medium border border-[var(--color-border)] text-[var(--color-text-body)]"
        >
          {t('common.close')}
        </button>
        <button
          onClick={() => void handleInvoke()}
          disabled={busy}
          className="flex-1 py-3 rounded-2xl text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
        >
          {busy ? t('portals.sending') : t('portals.send')}
        </button>
      </div>
    </div>
  );
}

// ── Schema → form field shim ───────────────────────────────────────────
// Best-effort: walk a JSON-Schema's `properties` and emit a flat field list.
// Falls back to a single 'message' field if the schema is missing or
// structured in a way we don't yet understand.

interface FormField {
  name: string;
  label: string;
  kind: 'short' | 'long' | 'email' | 'url' | 'tel';
  required: boolean;
}

function extractFields(schema?: Record<string, unknown>): FormField[] {
  if (!schema || typeof schema !== 'object') return [{ name: 'message', label: 'Message', kind: 'long', required: false }];
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  const requiredList = (schema as { required?: string[] }).required ?? [];
  if (!props || typeof props !== 'object') return [{ name: 'message', label: 'Message', kind: 'long', required: false }];

  const out: FormField[] = [];
  for (const [name, spec] of Object.entries(props)) {
    const s = spec as { type?: string; format?: string; description?: string; title?: string };
    let kind: FormField['kind'] = 'short';
    if (s.format === 'email') kind = 'email';
    else if (s.format === 'uri' || s.format === 'url') kind = 'url';
    else if (s.format === 'tel') kind = 'tel';
    else if (name.toLowerCase().includes('message') || name.toLowerCase().includes('description')) kind = 'long';
    out.push({
      name,
      label: s.title ?? humanize(name),
      kind,
      required: requiredList.includes(name),
    });
  }
  return out.length > 0 ? out : [{ name: 'message', label: 'Message', kind: 'long', required: false }];
}

function humanize(s: string): string {
  return s.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}
