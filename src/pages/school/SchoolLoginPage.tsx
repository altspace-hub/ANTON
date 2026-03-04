/**
 * SchoolLoginPage.tsx
 *
 * School Mode SSO login page.
 * Shows Google (Workspace for Education) and Microsoft (Office 365 / Azure AD)
 * sign-in buttons prominently, with a username/password fallback for
 * schools that use local accounts.
 *
 * After OAuth the server redirects to /?from=school&auth_code=xxx
 * which is caught here (via window.location check in useEffect) and
 * exchanges the code for a JWT, then navigates to /school.
 */

import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GraduationCap, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';

/** SVG icon — Google "G" logo */
function GoogleIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

/** SVG icon — Microsoft logo */
function MicrosoftIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
      <rect x="1" y="1" width="10.5" height="10.5" fill="#F25022"/>
      <rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00"/>
      <rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF"/>
      <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900"/>
    </svg>
  );
}

export default function SchoolLoginPage() {
  const { t } = useTranslation('school');
  const navigate = useNavigate();
  const { login, user } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // OAuth availability
  const [oauthConfig, setOauthConfig] = useState({
    google: false,
    oidc: false, // Microsoft via OIDC (Azure AD)
  });

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then((d: { googleOAuthEnabled?: boolean; oidcEnabled?: boolean }) => {
        setOauthConfig({
          google: !!d.googleOAuthEnabled,
          oidc: !!d.oidcEnabled,
        });
      })
      .catch(() => {});
  }, []);

  // If already authenticated, redirect straight to /school
  useEffect(() => {
    if (user) navigate('/school', { replace: true });
  }, [user, navigate]);

  // Handle ?auth_code=xxx + ?from=school redirect after OAuth flow
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authCode = params.get('auth_code');
    const from = params.get('from');
    const authError = params.get('auth_error');

    if (authCode && from === 'school') {
      // Clean the URL immediately
      window.history.replaceState({}, '', '/school/login');
      fetch(`/api/auth/exchange/${authCode}`)
        .then(r => r.json())
        .then((data: { token?: string; error?: string }) => {
          if (data.token) {
            localStorage.setItem('openexpert-token', data.token);
            // Force a full page reload to re-initialise the auth store
            window.location.replace('/school');
          } else {
            setError(t('login.oauthFailed', { defaultValue: 'Login failed — invalid or expired auth code.' }));
          }
        })
        .catch(() => setError(t('login.oauthError', { defaultValue: 'Login failed — could not exchange auth code.' })));
    }

    if (authError) {
      setError(`${t('login.oauthFailed', { defaultValue: 'Login failed' })}: ${authError.replace(/_/g, ' ')}`);
      window.history.replaceState({}, '', '/school/login');
    }
  }, [t]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login(username, password);
      navigate('/school', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.failed', { defaultValue: 'Login failed' }));
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasOAuth = oauthConfig.google || oauthConfig.oidc;

  return (
    <div className="min-h-screen bg-adv-dark flex flex-col items-center justify-center p-4">
      {/* Card */}
      <div className="w-full max-w-sm bg-adv-card border border-white/10 rounded-2xl p-8 shadow-2xl">

        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-adv-teal/10 border border-adv-teal/20 flex items-center justify-center mb-4">
            <GraduationCap className="w-8 h-8 text-adv-teal" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            {t('login.title', { defaultValue: 'ANTON School' })}
          </h1>
          <p className="text-sm text-adv-gray mt-1 text-center">
            {t('login.subtitle', { defaultValue: 'Sign in with your school account' })}
          </p>
        </div>

        {/* SSO buttons */}
        {hasOAuth && (
          <div className="space-y-3 mb-6">
            {oauthConfig.google && (
              <a
                href="/api/auth/google?from=school"
                className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-white hover:bg-gray-50 text-gray-800 font-medium rounded-xl text-sm transition-colors shadow-sm"
              >
                <GoogleIcon />
                {t('login.googleBtn', { defaultValue: 'Continue with Google' })}
              </a>
            )}
            {oauthConfig.oidc && (
              <a
                href="/api/auth/oidc/start?from=school"
                className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-[#0078d4] hover:bg-[#106EBE] text-white font-medium rounded-xl text-sm transition-colors"
              >
                <MicrosoftIcon />
                {t('login.microsoftBtn', { defaultValue: 'Continue with Microsoft' })}
              </a>
            )}
          </div>
        )}

        {/* Divider */}
        {hasOAuth && (
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-adv-card px-3 text-adv-gray-med">
                {t('login.orLocal', { defaultValue: 'or sign in with username' })}
              </span>
            </div>
          </div>
        )}

        {/* Username / password fallback */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-xs font-semibold uppercase tracking-widest text-adv-gray-med mb-1.5"
            >
              {t('login.username', { defaultValue: 'Username' })}
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              disabled={isSubmitting}
              placeholder={t('login.usernamePlaceholder', { defaultValue: 'Enter your username' })}
              className="w-full bg-adv-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal disabled:opacity-50 transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-widest text-adv-gray-med mb-1.5"
            >
              {t('login.password', { defaultValue: 'Password' })}
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
                placeholder={t('login.passwordPlaceholder', { defaultValue: 'Enter your password' })}
                className="w-full bg-adv-dark border border-white/10 rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal disabled:opacity-50 transition-colors"
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-adv-gray-med hover:text-adv-gray transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !username || !password}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-adv-teal text-adv-dark font-bold text-sm hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>{t('login.signIn', { defaultValue: 'Sign in' })}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Back link */}
        <p className="text-center text-xs text-adv-gray-med mt-6">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="hover:text-adv-gray transition-colors underline underline-offset-2"
          >
            {t('login.backToWork', { defaultValue: 'Back to Work Mode' })}
          </button>
        </p>
      </div>

      {/* Footer note */}
      <p className="mt-6 text-xs text-adv-gray-med text-center max-w-sm">
        {t('login.privacy', { defaultValue: 'Your conversations are private and stored locally on this device.' })}
      </p>
    </div>
  );
}
