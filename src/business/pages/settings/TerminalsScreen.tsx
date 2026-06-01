/**
 * TerminalsScreen — per-business terminal authorization (QR hand-off).
 *
 * Two roles on one screen:
 *  • Every device shows "This terminal's code" (its per-terminal public
 *    key as a QR) and its authorization status, and can scan/paste an
 *    authorization to store it.
 *  • A device on the KEYED company wallet (the owner) can "Authorize a
 *    terminal": scan a terminal's code, label it, sign a certificate with
 *    the company key, and show that cert back as a QR for the terminal.
 *
 * No server, no central registry — each business is its own CA. See
 * services/terminal-cert.ts.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QrDisplay from '../../components/QrDisplay';
import CertScanOverlay from '../../components/CertScanOverlay';
import { loadWallet } from '../../services/wallet';
import {
  getTerminalPubHex, getStoredTerminalCert, storeTerminalCert, issueTerminalCert,
  verifyTerminalCert,
  encodeTerminalRequest, encodeTerminalCert, decodeTerminalCert, decodeTerminalRequest,
  type TerminalCert,
} from '../../services/terminal-cert';

interface Props { onBack: () => void; }

function shortKey(hex: string): string {
  return hex.length <= 16 ? hex : `${hex.slice(0, 10)}…${hex.slice(-6)}`;
}

export default function TerminalsScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [terminalPub, setTerminalPub] = useState('');
  const [storedCert, setStoredCert] = useState<TerminalCert | null>(null);
  const [isOwner, setIsOwner] = useState(false);   // active wallet is keyed (has the money key)
  const [companyAddr, setCompanyAddr] = useState(''); // active wallet address = this device's company anchor

  // Overlay + authorize-flow state.
  const [overlay, setOverlay] = useState<null | 'authorize' | 'receive'>(null);
  const [authPub, setAuthPub] = useState('');       // scanned terminal pubkey to authorize
  const [authLabel, setAuthLabel] = useState('');
  const [issued, setIssued] = useState<TerminalCert | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setTerminalPub(await getTerminalPubHex());
    setStoredCert(await getStoredTerminalCert());
    const meta = await loadWallet();
    setIsOwner(!!meta && !meta.watchOnly);
    setCompanyAddr(meta?.address ?? '');
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  // Terminal side: received an authorization. Validate SYNCHRONOUSLY so the
  // scanner knows whether to stop (true) or keep scanning (false); on accept
  // we store (async) + confirm. The company anchor is this device's active
  // wallet address — a cert from a different company is rejected.
  function onReceiveDecoded(raw: string): boolean {
    setNotice(null); setOkMsg(null);
    const cert = decodeTerminalCert(raw);
    if (!cert) { setNotice(t('terminals.badCode', 'That is not a valid authorization code.')); return false; }
    if (cert.terminalPub.toLowerCase() !== terminalPub.toLowerCase()) {
      setNotice(t('terminals.diffTerminal', 'That authorization is for a different terminal.')); return false;
    }
    if (!verifyTerminalCert(cert)) {
      setNotice(t('terminals.badSig', 'That authorization signature is invalid.')); return false;
    }
    if (companyAddr && cert.companyAddr !== companyAddr) {
      setNotice(t('terminals.diffCompany', 'That authorization is from a different company than this terminal is set up for.')); return false;
    }
    void (async () => {
      try {
        await storeTerminalCert(cert, companyAddr || undefined);
        setOverlay(null);
        await refresh();
        setOkMsg(t('terminals.saved', 'Authorization saved.'));
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'Could not store authorization');
      }
    })();
    return true;
  }

  // Owner side: scanned a terminal's request → hold its pubkey for signing.
  function onAuthorizeDecoded(raw: string): boolean {
    setNotice(null); setOkMsg(null);
    const pub = decodeTerminalRequest(raw);
    if (!pub) { setNotice(t('terminals.badReq', 'That is not a valid terminal code.')); return false; }
    setAuthPub(pub);
    setOverlay(null);
    return true;
  }

  async function signAuthorization() {
    setNotice(null);
    try {
      const cert = await issueTerminalCert(authPub, authLabel);
      setIssued(cert);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not sign');
    }
  }

  function resetAuthorize() {
    setAuthPub(''); setAuthLabel(''); setIssued(null); setNotice(null);
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex items-center gap-3 -ml-2 mb-5">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back')} style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('terminals.title', 'Terminals')}
          </h2>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
          {t('terminals.help', 'Each till is registered to your company by signing it with the company wallet — once, by QR. No server, no key leaves the owner device.')}
        </p>

        {notice && (
          <div className="mb-3 rounded-lg px-3 py-2 text-xs" role="alert"
               style={{ background: 'var(--color-red-dim, #FDECEA)', color: 'var(--color-red, #E74C3C)' }}>
            {notice}
          </div>
        )}
        {okMsg && (
          <div className="mb-3 rounded-lg px-3 py-2 text-xs"
               style={{ background: 'var(--color-green-dim, #E8F8EF)', color: 'var(--color-green, #27AE60)' }}>
            {okMsg}
          </div>
        )}

        {/* ── This terminal ───────────────────────────────────────── */}
        <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-faint)' }}>
            {t('terminals.thisTerminal', 'This terminal')}
          </div>
          <div className="flex flex-col items-center gap-2 mb-2">
            {terminalPub && <QrDisplay value={encodeTerminalRequest(terminalPub)} size={180} />}
            <div className="mono text-xs" style={{ color: 'var(--color-text-muted)' }}>{shortKey(terminalPub)}</div>
            <div className="mono text-[10px] break-all select-all w-full text-center px-2"
                 style={{ color: 'var(--color-text-faint)' }}>{encodeTerminalRequest(terminalPub)}</div>
          </div>
          {storedCert ? (
            <div className="text-xs text-center" style={{ color: 'var(--color-green, #27AE60)' }}>
              {t('terminals.authorizedAs', { label: storedCert.label, defaultValue: `Authorized · ${storedCert.label}` })}
              <div className="mono mt-0.5" style={{ color: 'var(--color-text-faint)' }}>
                {t('terminals.byCompany', { addr: shortKey(storedCert.companyAddr), defaultValue: `by ${shortKey(storedCert.companyAddr)}` })}
                {' · '}
                {t('terminals.key', { key: shortKey(storedCert.companyPub), defaultValue: `key ${shortKey(storedCert.companyPub)}` })}
              </div>
            </div>
          ) : (
            <div className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
              {t('terminals.notAuthorized', 'Not yet authorized. Show this code to the owner, then scan their authorization.')}
            </div>
          )}
          <button type="button" onClick={() => { setNotice(null); setOverlay('receive'); }}
                  className="w-full mt-3 py-2.5 rounded-lg text-sm font-semibold"
                  style={{ backgroundColor: 'var(--color-surface-alt, #ECECEC)', color: 'var(--color-text)' }}>
            {t('terminals.scanAuth', 'Scan / paste authorization')}
          </button>
        </div>

        {/* ── Authorize a terminal (owner only) ───────────────────── */}
        {isOwner && (
          <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-faint)' }}>
              {t('terminals.authorize', 'Authorize a terminal')}
            </div>

            {!issued ? (
              <>
                <div className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                  {t('terminals.authorizeHelp', "Scan the new till's code, give it a name, and sign it with this company wallet.")}
                </div>
                {!authPub ? (
                  <button type="button" onClick={() => { setNotice(null); setOverlay('authorize'); }}
                          className="w-full py-2.5 rounded-lg text-sm font-semibold"
                          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}>
                    {t('terminals.scanTill', "Scan a till's code")}
                  </button>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    <div className="mono text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {t('terminals.till', 'Till')}: {shortKey(authPub)}
                    </div>
                    <input
                      type="text" value={authLabel} onChange={(e) => setAuthLabel(e.target.value)}
                      placeholder={t('terminals.labelPlaceholder', 'Name (e.g. Till 3 — main bar)')}
                      className="text-sm rounded-lg px-3 py-2.5"
                      style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void signAuthorization()}
                              className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}>
                        {t('terminals.signShow', 'Sign & show code')}
                      </button>
                      <button type="button" onClick={resetAuthorize}
                              className="px-4 py-2.5 rounded-lg text-sm font-semibold"
                              style={{ backgroundColor: 'var(--color-surface-alt, #ECECEC)', color: 'var(--color-text)' }}>
                        {t('common.cancel', 'Cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
                  {t('terminals.showToTill', { label: issued.label, defaultValue: `Show this to "${issued.label}" — it scans to finish.` })}
                </div>
                <QrDisplay value={encodeTerminalCert(issued)} size={200} />
                <div className="mono text-[10px] break-all select-all w-full px-2"
                     style={{ color: 'var(--color-text-faint)' }}>{encodeTerminalCert(issued)}</div>
                <button type="button" onClick={resetAuthorize}
                        className="w-full mt-1 py-2.5 rounded-lg text-sm font-semibold"
                        style={{ backgroundColor: 'var(--color-surface-alt, #ECECEC)', color: 'var(--color-text)' }}>
                  {t('terminals.authorizeAnother', 'Authorize another')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {overlay === 'authorize' && (
        <CertScanOverlay
          title={t('terminals.scanTill', "Scan a till's code")}
          hint={t('terminals.scanTillHint', "Point at the new till's QR (Terminals → This terminal).")}
          onDecoded={onAuthorizeDecoded} onClose={() => setOverlay(null)}
        />
      )}
      {overlay === 'receive' && (
        <CertScanOverlay
          title={t('terminals.scanAuth', 'Scan / paste authorization')}
          hint={t('terminals.scanAuthHint', "Point at the owner's authorization QR.")}
          onDecoded={onReceiveDecoded} onClose={() => setOverlay(null)}
        />
      )}
    </div>
  );
}
