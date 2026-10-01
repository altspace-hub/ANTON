/**
 * WelcomePage — /welcome#token=…, reachable without signing in.
 *
 * The page an invitation link opens (server/services/account-invitations.ts):
 * the person sees which address the account is for, chooses a password and,
 * on a demo, confirms 18+ and accepts the demo terms — then is signed in. The
 * same page takes a new link an administrator issued after a lost password.
 *
 * The token is read from the URL fragment, which the browser never sends to
 * the server, and the fragment is cleared once read so it does not linger in
 * the address bar or the history.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, type AuthUser } from '@/stores/useAuthStore';
import { useDemoStore } from '@/stores/useDemoStore';
import { safeStorage } from '@/lib/safe-storage';
import DemoBanner from '@/components/shared/DemoBanner';

interface LinkInfo {
  email: string;
  displayName: string;
  purpose: 'invite' | 'reset';
  expiresAt: string;
  termsRequired: boolean;
  termsVersion: string | null;
}

const PASSWORD_MIN = 12;

function readToken(): string {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return params.get('token') ?? '';
}

export default function WelcomePage() {
  const navigate = useNavigate();
  const demo = useDemoStore((s) => s.config);
  const [token] = useState(readToken);
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [linkProblem, setLinkProblem] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [over18, setOver18] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Out of the address bar and the history; the token stays in memory.
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    if (!token) { setLinkProblem('This link is incomplete. Open the whole link you were sent.'); return; }
    fetch('/api/auth/invitation/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({})) as LinkInfo & { error?: string };
        if (!res.ok) { setLinkProblem(data.error || 'This link does not work.'); return; }
        setInfo(data);
      })
      .catch(() => setLinkProblem('Network error. Please reload the page.'));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < PASSWORD_MIN) { setError(`Choose a password of at least ${PASSWORD_MIN} characters.`); return; }
    if (password !== repeat) { setError('The two passwords are not the same.'); return; }
    if (info?.termsRequired && !over18) { setError('Please confirm that you are 18 or over.'); return; }
    if (info?.termsRequired && !acceptTerms) { setError('Please accept the demo terms and confirm that you have read the privacy notice.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/invitation/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
          ...(info?.termsRequired ? { over18, acceptTerms, termsVersion: info.termsVersion } : {}),
        }),
      });
      const data = await res.json().catch(() => ({})) as { user?: AuthUser; token?: string; error?: string };
      if (!res.ok || !data.user || !data.token) { setError(data.error || 'Something went wrong. Please try again.'); return; }
      // Signed straight in, exactly as a password sign-in leaves it.
      safeStorage.setItem('openexpert-token', data.token);
      useAuthStore.setState({ user: data.user, token: data.token });
      navigate('/', { replace: true });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const input = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0D7D6C] focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D7D6C] focus-visible:ring-offset-1 disabled:opacity-50';
  const label = 'block mb-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-500';
  const invite = info?.purpose !== 'reset';

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <DemoBanner variant="light" />
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px]">
          <div className="flex flex-col items-center mb-8">
            <div className="w-[56px] h-[56px] rounded-2xl bg-[#0D7D6C] flex items-center justify-center mb-4">
              <span className="text-[30px] font-black text-white leading-none select-none" aria-hidden="true">A</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {invite ? 'Welcome to ANTON' : 'Choose a new password'}
            </h1>
          </div>

          {linkProblem && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {linkProblem}
            </div>
          )}

          {!linkProblem && !info && <p className="text-center text-sm text-gray-500">Checking your link…</p>}

          {info && (
            <form onSubmit={handleSubmit} className="space-y-4" aria-label={invite ? 'Choose your password' : 'Choose a new password'}>
              <p className="text-[15px] leading-relaxed text-gray-700">
                {invite
                  ? <>Your account is for <strong>{info.email}</strong>. Choose a password; from then on you sign in with this email address and that password.</>
                  : <>Choose a new password for <strong>{info.email}</strong>. Your old password stops working.</>}
              </p>
              <div>
                <label htmlFor="welcome-password" className={label}>Password</label>
                <input id="welcome-password" type="password" autoComplete="new-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} disabled={submitting} required
                  placeholder={`At least ${PASSWORD_MIN} characters`} className={input} />
              </div>
              <div>
                <label htmlFor="welcome-repeat" className={label}>Password again</label>
                <input id="welcome-repeat" type="password" autoComplete="new-password" value={repeat}
                  onChange={(e) => setRepeat(e.target.value)} disabled={submitting} required className={input} />
              </div>

              {info.termsRequired && (
                <>
                  <label className="flex items-start gap-2.5 text-sm leading-snug text-gray-700">
                    <input type="checkbox" checked={over18} onChange={(e) => setOver18(e.target.checked)}
                      disabled={submitting} className="mt-0.5 h-4 w-4 shrink-0 accent-[#0D7D6C]" />
                    <span>I am 18 or over.</span>
                  </label>
                  <label className="flex items-start gap-2.5 text-sm leading-snug text-gray-700">
                    <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)}
                      disabled={submitting} className="mt-0.5 h-4 w-4 shrink-0 accent-[#0D7D6C]" />
                    <span>
                      I accept the{' '}
                      <a href={demo.demoMode ? demo.termsPath : '/terms'} target="_blank" rel="noopener noreferrer" className="text-[#0D7D6C] underline">demo terms</a>
                      {' '}and have read the{' '}
                      <a href={demo.demoMode ? demo.privacyPath : '/privacy'} target="_blank" rel="noopener noreferrer" className="text-[#0D7D6C] underline">privacy notice</a>.
                    </span>
                  </label>
                </>
              )}

              {error && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}
              <button type="submit" disabled={submitting}
                className="w-full rounded-xl bg-[#0D7D6C] px-4 py-3.5 text-[15px] font-bold text-white transition-all hover:bg-[#06655A] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? 'Saving…' : invite ? 'Save password and start' : 'Save new password and sign in'}
              </button>
              <p className="text-center text-xs text-gray-500">
                This link works once, until {new Date(info.expiresAt).toLocaleDateString()}.
              </p>
            </form>
          )}

          <p className="mt-8 text-center text-sm">
            <a href="/" className="text-[#0D7D6C] underline">Go to the sign-in page</a>
          </p>
        </div>
      </main>
    </div>
  );
}
