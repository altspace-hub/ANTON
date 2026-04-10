import { useState, FormEvent, useEffect } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { Eye, EyeOff, ArrowRight, Send, Building2 } from 'lucide-react';

interface Props {
  /** Provided in solo mode — clicking "Enter Anton" calls this instead of logging in */
  onEnterWithoutLogin?: () => void;
}

const ROBOT_IMAGES = [
  '/robots/pexels-kindelmedia-8566449.jpg', // front-facing (default)
  '/robots/pexels-kindelmedia-8566428.jpg', // close-up face
  '/robots/pexels-kindelmedia-8566454.jpg', // with desk/window
  '/robots/pexels-kindelmedia-8566437.jpg', // plant background
  '/robots/pexels-kindelmedia-8566456.jpg', // held in hand
  '/robots/pexels-kindelmedia-8566423.jpg', // pens scene
];

const IMAGE_CAPTIONS = [
  'Clear thinking, every time.',
  'Eyes on every detail.',
  'Intelligence meets workflow.',
  'Always ready to work.',
  'Expert analysis, in your hands.',
  'Precision at your desk.',
];

export default function LoginPage({ onEnterWithoutLogin }: Props) {
  const { login } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeImage] = useState(0); // Always show the default image

  const isSoloMode = !!onEnterWithoutLogin;

  // OAuth availability (fetched from /api/config)
  const [oauthConfig, setOauthConfig] = useState({ google: false, github: false, oidc: false });

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then((d: { googleOAuthEnabled?: boolean; githubOAuthEnabled?: boolean; oidcEnabled?: boolean }) => {
        setOauthConfig({
          google: !!d.googleOAuthEnabled,
          github: !!d.githubOAuthEnabled,
          oidc: !!d.oidcEnabled,
        });
      })
      .catch(() => {});
  }, []);

  // Handle ?auth_code=xxx redirect after OAuth flow (C2 fix — JWT is never in the URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authCode = params.get('auth_code');
    const authError = params.get('auth_error');
    const fromParam = params.get('from');
    if (authCode) {
      // Exchange the one-time code for a JWT — clean the URL immediately
      window.history.replaceState({}, '', '/');
      fetch(`/api/auth/exchange/${authCode}`)
        .then((r) => r.json())
        .then((data: { token?: string; error?: string }) => {
          if (data.token) {
            localStorage.setItem('openexpert-token', data.token);
            // If the OAuth was initiated from School Mode, navigate there after auth
            if (fromParam === 'school') {
              window.location.replace('/school');
            } else {
              window.location.reload();
            }
          } else {
            setError('OAuth login failed: invalid or expired auth code');
          }
        })
        .catch(() => setError('OAuth login failed: could not exchange auth code'));
    }
    if (authError) {
      setError(`OAuth login failed: ${authError.replace(/_/g, ' ')}`);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // Forgot-password inline form state
  const [showForgotForm, setShowForgotForm] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [forgotError, setForgotError] = useState('');

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setForgotStatus('sending');
    setForgotError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      if (res.ok) {
        setForgotStatus('sent');
      } else {
        const data = await res.json() as { error?: string };
        setForgotError(data.error || 'Something went wrong.');
        setForgotStatus('error');
      }
    } catch {
      setForgotError('Network error. Please try again.');
      setForgotStatus('error');
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-white">

      {/* ── LEFT PANEL — robot image ──────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden select-none">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${ROBOT_IMAGES[activeImage]})` }}
        />

        {/* Top-left brand mark */}
        <div className="absolute top-8 left-8 z-10">
          <span className="text-[11px] font-bold tracking-[0.25em] uppercase text-white drop-shadow-sm"
            style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
            openEXPERT
          </span>
        </div>

        {/* Bottom-left caption */}
        <div className="absolute bottom-8 left-8 right-16 z-10">
          <p className="text-gray-800 text-xl font-semibold leading-snug">
            {IMAGE_CAPTIONS[activeImage]}
          </p>
          <p className="mt-1 text-gray-500 text-sm">
            AI-powered experts helping the world become a better place.
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL — white login panel ───────────────────────────── */}
      <div className="flex-1 lg:w-1/2 flex flex-col bg-white">

        {/* Top bar */}
        <div className="flex items-center justify-between px-10 pt-7">
          <span className="lg:hidden text-[11px] font-bold tracking-[0.2em] uppercase text-[#0D7D6C]">
            openEXPERT
          </span>
          <div className="flex-1" />
          <span className="text-xs text-gray-300 font-medium">v1.0</span>
        </div>

        {/* Centred content */}
        <div className="flex-1 flex flex-col items-center justify-center px-10 pb-10">
          <div className="w-full max-w-[360px]">

            {/* ── Logo + name ── */}
            <div className="flex flex-col items-center mb-8">
              {/* "A" badge */}
              <div
                className="w-[72px] h-[72px] rounded-2xl bg-[#0D7D6C] flex items-center justify-center mb-5"
                style={{ boxShadow: '0 8px 32px rgba(13,125,108,0.35)' }}
              >
                <span className="text-[40px] font-black text-white leading-none select-none">
                  A
                </span>
              </div>
              <h1 className="text-[40px] font-bold text-gray-900 tracking-tight leading-none">
                Anton
              </h1>
              <p className="mt-2 text-[12px] font-bold tracking-[0.22em] uppercase text-[#0D7D6C]">
                by openEXPERT
              </p>
            </div>

            {/* ── Tagline ── */}
            <div className="text-center mb-8">
              <p className="text-gray-600 text-[15px] leading-relaxed">
                Expert-grade AI assistance —<br />
                structured, sourced, and ready to deliver.
              </p>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-gray-100 mb-7" />

            {/* ── SOLO MODE ── */}
            {isSoloMode ? (
              <div className="space-y-4">
                <button
                  onClick={onEnterWithoutLogin}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-adv-teal px-4 py-3.5 text-[15px] font-bold text-white transition-all hover:bg-adv-teal-dark active:scale-[0.98]"
                  style={{ boxShadow: '0 4px 20px rgba(13,125,108,0.30)' }}
                >
                  <span>Enter Anton</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-center text-xs text-gray-400">
                  Running in solo mode &mdash; no sign-in required
                </p>
              </div>
            ) : (
              /* ── TEAM MODE — login form + optional OAuth ── */
              <>
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Username */}
                <div>
                  <label
                    htmlFor="username"
                    className="block mb-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-400"
                  >
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    disabled={isSubmitting}
                    placeholder="Enter your username"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-300 focus:border-adv-teal focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D7D6C] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal/20 disabled:opacity-50 transition-all"
                  />
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="password"
                      className="text-[11px] font-bold uppercase tracking-widest text-gray-400"
                    >
                      Password
                    </label>
                    <button
                      type="button"
                      tabIndex={-1}
                      className="text-xs text-gray-400 hover:text-adv-teal transition-colors"
                      onClick={() => {
                        setShowForgotForm((v) => !v);
                        setForgotStatus('idle');
                        setForgotError('');
                        setForgotEmail('');
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isSubmitting}
                      placeholder="Enter your password"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 pr-11 text-sm text-gray-900 placeholder:text-gray-300 focus:border-adv-teal focus:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D7D6C] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal/20 disabled:opacity-50 transition-all"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-adv-teal transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Forgot password inline panel */}
                {showForgotForm && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    {forgotStatus === 'sent' ? (
                      <p className="text-sm text-green-600">
                        Check your inbox — we've sent a reset link.
                      </p>
                    ) : (
                      <form onSubmit={handleForgotPassword} className="space-y-3">
                        <label
                          htmlFor="forgot-email"
                          className="block text-[11px] font-bold uppercase tracking-widest text-gray-400"
                        >
                          Enter your email address
                        </label>
                        <input
                          id="forgot-email"
                          type="email"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          required
                          disabled={forgotStatus === 'sending'}
                          placeholder="you@example.com"
                          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-300 focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D7D6C] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal/20 disabled:opacity-50 transition-all"
                        />
                        {forgotError && (
                          <p className="text-xs text-red-500">{forgotError}</p>
                        )}
                        <button
                          type="submit"
                          disabled={forgotStatus === 'sending' || !forgotEmail}
                          className="flex items-center gap-2 rounded-xl bg-adv-teal px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-adv-teal-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {forgotStatus === 'sending' ? (
                            <span>Sending…</span>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              <span>Send reset link</span>
                            </>
                          )}
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                {/* Sign in */}
                <button
                  type="submit"
                  disabled={isSubmitting || !username || !password}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-adv-teal px-4 py-3.5 text-[15px] font-bold text-white transition-all hover:bg-adv-teal-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    boxShadow: username && password ? '0 4px 20px rgba(13,125,108,0.30)' : 'none',
                  }}
                >
                  {isSubmitting ? (
                    <span>Signing in…</span>
                  ) : (
                    <>
                      <span>Sign in</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* OAuth buttons — only shown in team mode when configured */}
              {(oauthConfig.google || oauthConfig.github || oauthConfig.oidc) && (
                <div className="mt-4">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-white px-2 text-gray-400">or continue with</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    {oauthConfig.google && (
                      <a
                        href="/api/auth/google"
                        className="w-full flex items-center justify-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Continue with Google
                      </a>
                    )}
                    {oauthConfig.github && (
                      <a
                        href="/api/auth/github"
                        className="w-full flex items-center justify-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                        </svg>
                        Continue with GitHub
                      </a>
                    )}
                    {oauthConfig.oidc && (
                      <a
                        href="/api/auth/oidc/start"
                        className="w-full flex items-center justify-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Building2 className="w-4 h-4 text-gray-500" />
                        Enterprise SSO (Azure AD / Okta)
                      </a>
                    )}
                  </div>
                  {oauthConfig.oidc && (
                    <p className="mt-3 text-center text-[11px] text-gray-300">
                      SSO configured via{' '}
                      <code className="rounded bg-gray-100 px-1 text-gray-400">OIDC_ISSUER_URL</code>{' '}
                      in your <code className="rounded bg-gray-100 px-1 text-gray-400">.env</code> file.
                    </p>
                  )}
                </div>
              )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-10 pb-7 text-center">
          <p className="text-[11px] text-gray-300">
            Created by Daniel Bardun &amp; FutureChain &mdash; Enhanced by You
          </p>
        </div>
      </div>
    </div>
  );
}
