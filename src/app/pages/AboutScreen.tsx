/**
 * AboutScreen — the companion's About page: who made ANTON, what it is, which
 * AI models the paired instance offers, the app version, and that answers
 * must be checked by a qualified person. The desktop About page
 * (src/pages/AboutPage.tsx, /about) is the reference; the sentences are its
 * own (services/about.ts).
 *
 * A full-screen overlay, like VoiceMode: it opens over whatever screen the
 * person is on — the More menu, Settings, the Standard "You" tab, and before
 * pairing the Welcome, Join and Connections screens — and closing it returns
 * there with that screen's state intact (a half-typed pairing code survives).
 * Android back and Esc close it first (back-stack), before the app's own back
 * logic runs.
 *
 * It names models only from what the paired instance reports: the org's
 * /api/app/org/:orgId/models list, the one the chat's model picker shows.
 * Before an org is open, before pairing, or when that call fails, it speaks
 * generally, as the desktop page does for a server that reports no model.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PageHeader, SectionLabel, Spinner } from '../components/ui';
import Logo from '../components/Logo';
import { registerBackHandler } from '../services/back-stack';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { getActiveInstance } from '../services/instances';
import { listModels } from '../services/models';
import {
  ABOUT_CHECK_NOTICE, ABOUT_COMPANION, ABOUT_CREDIT, ABOUT_MODELS_GENERAL, ABOUT_WHAT_ANTON_IS,
  getAppVersion, modelLineup, modelsSentence, type AboutModelEntry, type AppVersion,
} from '../services/about';

interface Props {
  /** Keep it stable (useCallback): the back-stack entry is registered against it. */
  onClose: () => void;
  /** The org open in the workspace; its model list is the paired instance's. Null outside the workspace. */
  orgId?: string | null;
}

const CARD: CSSProperties = { background: 'var(--color-surface)', border: '1px solid var(--color-border)' };

export default function AboutScreen({ onClose, orgId = null }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);

  const instance = getActiveInstance();
  const instanceId = instance?.id ?? null;
  // Which instance + org the model list belongs to; null when there is none to ask.
  const modelsKey = orgId && instanceId ? `${instanceId}:${orgId}` : null;
  const [models, setModels] = useState<{ key: string; lineup: AboutModelEntry[] } | null>(null);
  const modelsLoading = modelsKey !== null && models?.key !== modelsKey;
  const lineup = modelsKey !== null && models?.key === modelsKey ? models.lineup : [];
  const [version, setVersion] = useState<AppVersion | null>(null);

  // Esc (web) and Android back close it (the back-stack runs before the app's own back logic).
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    const unregister = registerBackHandler(onClose);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      unregister();
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void getAppVersion().then((v) => { if (!cancelled) setVersion(v); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!orgId || !instanceId) return;
    const key = `${instanceId}:${orgId}`;
    let cancelled = false;
    listModels(orgId)
      .then((r) => { if (!cancelled) setModels({ key, lineup: modelLineup(r) }); })
      .catch(() => { if (!cancelled) setModels({ key, lineup: [] }); });
    return () => { cancelled = true; };
  }, [orgId, instanceId]);

  const instanceName = instance?.display_name || 'this ANTON';

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="About ANTON"
      className="safe-top safe-bottom fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--color-bg)' }}
    >
      <PageHeader title="About ANTON" onBack={onClose} />

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div
          className="mx-auto max-w-2xl space-y-6 px-4 pb-10 pt-6 text-[0.9375rem] leading-relaxed"
          style={{ color: 'var(--color-text-body)' }}
        >
          {/* Mark + name, then the credit — the desktop page's opening. */}
          <div>
            <div className="flex items-center gap-4">
              <Logo size={56} className="flex-shrink-0" />
              <div className="min-w-0">
                <p
                  style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.6px', lineHeight: 1.1, color: 'var(--color-text)' }}
                >
                  ANTON
                </p>
                <p
                  className="mt-1 font-mono uppercase"
                  style={{ color: 'var(--color-accent)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '1px' }}
                >
                  Companion · by openEXPERT
                </p>
              </div>
            </div>
            <p className="mt-6 text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
              {ABOUT_CREDIT}
            </p>
          </div>

          <section aria-labelledby="about-what">
            <SectionLabel id="about-what" role="heading" aria-level={2} className="mb-2">
              What ANTON is
            </SectionLabel>
            <div className="rounded-[var(--radius-r2)] px-4 py-3" style={CARD}>
              <p>{ABOUT_WHAT_ANTON_IS}</p>
              <p className="mt-3">{ABOUT_COMPANION}</p>
            </div>
          </section>

          <section aria-labelledby="about-models">
            <SectionLabel id="about-models" role="heading" aria-level={2} className="mb-2">
              AI models
            </SectionLabel>
            <div className="rounded-[var(--radius-r2)] px-4 py-3" style={CARD}>
              {modelsLoading ? (
                <div className="flex justify-center py-2">
                  <Spinner size="md" label="Loading the models" />
                </div>
              ) : lineup.length > 0 ? (
                <>
                  <p>{modelsSentence(instanceName, lineup)}</p>
                  <ul className="mt-3 space-y-2">
                    {lineup.map((m) => (
                      <li
                        key={m.id}
                        className="rounded-[var(--radius-r1)] px-3 py-2"
                        style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border-soft)' }}
                      >
                        <span className="block break-words font-semibold" style={{ color: 'var(--color-text)' }}>
                          {m.name}
                          {m.isDefault && <span className="font-normal" style={{ color: 'var(--color-text-muted)' }}> · default</span>}
                        </span>
                        {m.maker && (
                          <span className="block break-words text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            Made by {m.maker}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>
                  {ABOUT_MODELS_GENERAL}{' '}
                  {instance
                    ? 'Whoever runs this server chooses which models it offers, and you can pick one for each run.'
                    : 'Whoever runs the ANTON you pair with chooses which models it offers, and you can pick one for each run.'}
                </p>
              )}
            </div>
          </section>

          <div
            role="note"
            className="rounded-[var(--radius-r2)] px-4 py-3 font-medium"
            style={{
              background: 'var(--color-gold-dim)',
              border: '2px solid color-mix(in srgb, var(--color-gold) 60%, transparent)',
              color: 'var(--color-text)',
            }}
          >
            {ABOUT_CHECK_NOTICE}
          </div>

          {instance && (
            <section aria-labelledby="about-instance">
              <SectionLabel id="about-instance" role="heading" aria-level={2} className="mb-2">
                Paired with
              </SectionLabel>
              <div className="rounded-[var(--radius-r2)] px-4 py-3" style={CARD}>
                <p className="break-words font-semibold" style={{ color: 'var(--color-text)' }}>
                  {instance.display_name}
                </p>
                {instance.org && (
                  <p className="mt-1 break-words text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    {instance.org.name} · {instance.org.role}
                  </p>
                )}
                {instance.contact_hash && (
                  <p className="mt-1 break-all font-mono text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    {instance.contact_hash}
                  </p>
                )}
              </div>
            </section>
          )}

          {version && (
            <section aria-labelledby="about-version">
              <SectionLabel id="about-version" role="heading" aria-level={2} className="mb-2">
                Version
              </SectionLabel>
              <div className="rounded-[var(--radius-r2)] px-4 py-3" style={CARD}>
                <p>
                  ANTON Companion {version.version}
                  {version.build && <span style={{ color: 'var(--color-text-muted)' }}> (build {version.build})</span>}
                </p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
