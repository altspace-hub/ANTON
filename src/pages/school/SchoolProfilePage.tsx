import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Edit2, CheckCircle2, Loader2, BookOpen, MessageSquare, Copy, Users } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import SchoolLayout from '@/components/school/SchoolLayout';

interface DashboardStats {
  sessionsThisWeek?: number;
  messagesThisWeek?: number;
  classes?: { id: string; name: string; subject_id: string }[];
}

export default function SchoolProfilePage() {
  const { t } = useTranslation('school');
  const { user } = useAuthStore();
  const [displayName, setDisplayName] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({});

  // Guardian invite code
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const schoolRole = ((user as Record<string, unknown> | null)?.school_role as string | undefined) ?? 'student';

  useEffect(() => {
    const name = (user as Record<string, unknown> | null)?.display_name as string | undefined
      ?? (user as Record<string, unknown> | null)?.username as string | undefined
      ?? '';
    setDisplayName(name);
    loadStats();
  }, [user]);

  async function loadStats() {
    try {
      const res = await fetch('/api/school/dashboard', { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setStats({
          classes: Array.isArray(data.classes) ? data.classes : [],
        });
      }
    } catch {
      // non-fatal
    }
  }

  async function handleSaveName() {
    if (!displayName.trim()) return;
    setIsSaving(true);
    try {
      await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });
      setIsEditing(false);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch {
      // non-fatal
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerateInviteCode() {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/school/guardian/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });
      if (res.ok) {
        const data = await res.json();
        setInviteCode(data.code ?? data.invite_code ?? null);
      }
    } catch {
      // non-fatal
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopyCode() {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  function roleBadgeClass(role: string) {
    if (role === 'teacher') return 'border-adv-gold/30 bg-adv-gold/10 text-adv-gold';
    if (role === 'school_admin') return 'border-adv-red/30 bg-adv-red/10 text-adv-red';
    if (role === 'guardian') return 'border-adv-blue/30 bg-adv-blue/10 text-adv-blue';
    return 'border-adv-teal/30 bg-adv-teal/10 text-adv-teal';
  }

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-xl font-bold text-adv-white">{t('nav.myProfile', 'My Profile')}</h1>

        {/* Profile card */}
        <section className="rounded-xl border border-border bg-adv-card p-5 space-y-5">
          {/* Avatar + name */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-adv-teal/10">
              <User className="h-6 w-6 text-adv-teal" />
            </div>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setIsEditing(false); }}
                    className="flex-1 rounded-lg border border-adv-teal bg-adv-dark px-3 py-1.5 text-sm text-adv-off-white focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveName}
                    disabled={isSaving || !displayName.trim()}
                    className="flex items-center gap-1 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40"
                  >
                    {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-adv-white">{displayName || 'Student'}</span>
                  {savedOk && <CheckCircle2 className="h-4 w-4 text-adv-teal" />}
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="rounded-lg p-1 text-adv-gray hover:text-adv-off-white transition-colors"
                    aria-label="Edit display name"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="mt-1 flex items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${roleBadgeClass(schoolRole)}`}>
                  {t(`nav.role.${schoolRole}`, schoolRole)}
                </span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-adv-dark p-3 text-center">
              <MessageSquare className="mx-auto mb-1 h-4 w-4 text-adv-teal" />
              <p className="text-xs text-adv-gray-med">Sessions this week</p>
              <p className="mt-0.5 text-lg font-bold text-adv-white">
                {stats.sessionsThisWeek ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-adv-dark p-3 text-center">
              <BookOpen className="mx-auto mb-1 h-4 w-4 text-adv-teal" />
              <p className="text-xs text-adv-gray-med">Enrolled classes</p>
              <p className="mt-0.5 text-lg font-bold text-adv-white">
                {stats.classes?.length ?? 0}
              </p>
            </div>
          </div>
        </section>

        {/* Enrolled classes summary */}
        {stats.classes && stats.classes.length > 0 && (
          <section className="rounded-xl border border-border bg-adv-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-adv-off-white">Enrolled Classes</h2>
            <div className="space-y-2">
              {stats.classes.map((cls) => (
                <div key={cls.id} className="flex items-center gap-2 text-sm">
                  <BookOpen className="h-3.5 w-3.5 shrink-0 text-adv-teal" />
                  <span className="text-adv-off-white">{cls.name}</span>
                  <span className="text-adv-gray-med capitalize">· {t(`subject.${cls.subject_id}`, cls.subject_id)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Guardian invite — only for students */}
        {schoolRole === 'student' && (
          <section className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-adv-teal" />
              <h2 className="text-sm font-semibold text-adv-off-white">Guardian Access</h2>
            </div>
            <p className="text-xs text-adv-gray-med">
              Generate an invite code and share it with your parent or guardian. They can use it to view your learning progress.
            </p>

            {inviteCode ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg border border-adv-teal/30 bg-adv-teal/5 px-4 py-3">
                  <code className="flex-1 font-mono text-base font-bold tracking-widest text-adv-teal">
                    {inviteCode}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
                  >
                    {copiedCode ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-adv-green" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedCode ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-adv-gray-med">This code expires in 48 hours. Generate a new one any time.</p>
                <button
                  type="button"
                  onClick={handleGenerateInviteCode}
                  className="text-xs text-adv-gray hover:text-adv-off-white transition-colors"
                >
                  Generate new code
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGenerateInviteCode}
                disabled={isGenerating}
                className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:border-adv-teal hover:text-adv-teal disabled:opacity-40 transition-colors"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                Generate guardian invite code
              </button>
            )}
          </section>
        )}
      </div>
    </SchoolLayout>
  );
}
