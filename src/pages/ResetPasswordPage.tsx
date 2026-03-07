import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (!token) {
    return (
      <div className="min-h-screen bg-adv-dark flex items-center justify-center p-4">
        <div className="bg-adv-card border border-border rounded-2xl w-full max-w-sm p-8 text-center">
          <AlertCircle className="h-10 w-10 text-adv-red mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-adv-white mb-2">Invalid Reset Link</h1>
          <p className="text-sm text-adv-gray mb-6">This password reset link is invalid or missing.</p>
          <Link to="/?forgot=1" className="text-adv-teal hover:text-adv-teal-dark text-sm underline">
            Request a new reset link →
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-adv-dark flex items-center justify-center p-4">
        <div className="bg-adv-card border border-border rounded-2xl w-full max-w-sm p-8 text-center">
          <CheckCircle className="h-10 w-10 text-adv-green mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-adv-white mb-2">Password Updated</h1>
          <p className="text-sm text-adv-gray mb-6">Your password has been reset successfully.</p>
          <Link to="/" className="text-adv-teal hover:text-adv-teal-dark text-sm underline">
            Back to login →
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }
    if (newPassword.length < 12) {
      setErrorMsg('Password must be at least 12 characters');
      return;
    }
    setStatus('submitting');
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus('success');
      } else {
        setErrorMsg(data.error || 'Failed to reset password');
        setStatus('error');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-adv-dark flex items-center justify-center p-4">
      <div className="bg-adv-card border border-border rounded-2xl w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold text-adv-white mb-2">Reset Password</h1>
        <p className="text-sm text-adv-gray mb-6">Enter your new password below.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-adv-gray mb-1.5">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoFocus
              required
              className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2.5 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
              placeholder="Minimum 12 characters"
            />
          </div>
          <div>
            <label className="block text-xs text-adv-gray mb-1.5">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2.5 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
              placeholder="Repeat password"
            />
          </div>
          {(status === 'error' || errorMsg) && (
            <div className="flex items-start gap-2 p-3 bg-adv-red/10 border border-adv-red/30 rounded-lg">
              <AlertCircle className="h-4 w-4 text-adv-red shrink-0 mt-0.5" />
              <p className="text-xs text-adv-red">{errorMsg}</p>
            </div>
          )}
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full flex items-center justify-center gap-2 bg-adv-teal hover:bg-adv-teal-dark disabled:opacity-50 text-adv-dark font-medium text-sm rounded-lg py-2.5 transition-colors"
          >
            {status === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {status === 'submitting' ? 'Updating...' : 'Update Password'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-adv-gray">
          Link expired?{' '}
          <Link to="/?forgot=1" className="text-adv-teal hover:underline">
            Request a new one
          </Link>
        </p>
      </div>
    </div>
  );
}
