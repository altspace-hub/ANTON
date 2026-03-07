import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Edit2, CheckCircle2, Loader2, BookOpen, MessageSquare, Copy, Users, Lock, Trophy, Palette } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import SchoolLayout from '@/components/school/SchoolLayout';
import AvatarDisplay, { AVATAR_CHARS, COLOR_SCHEMES, FRAMES, type AvatarConfig } from '@/components/school/AvatarDisplay';

interface DashboardStats {
  sessionsThisWeek?: number;
  messagesThisWeek?: number;
  classes?: { id: string; name: string; subject_id: string }[];
}

interface AchievementDef {
  id: string;
  label: string;
  description: string;
}

interface EarnedAchievement {
  achievement_id: string;
  earned_at: string;
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

  const [achievements, setAchievements] = useState<AchievementDef[]>([]);
  const [earned, setEarned] = useState<Set<string>>(new Set());

  // Avatar state
  const [avatar, setAvatar] = useState<AvatarConfig>({ avatarChar: '🦊', colorScheme: 'teal', frame: 'none', title: '' });
  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);

  const schoolRole = ((user as Record<string, unknown> | null)?.school_role as string | undefined) ?? 'student';

  useEffect(() => {
    const name = (user as Record<string, unknown> | null)?.display_name as string | undefined
      ?? (user as Record<string, unknown> | null)?.username as string | undefined
      ?? '';
    setDisplayName(name);
    loadStats();
    if (schoolRole === 'student') { loadAchievements(); loadAvatar(); }
  }, [user, schoolRole]);

  async function loadAvatar() {
    try {
      const res = await fetch('/api/school/avatar', { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json() as AvatarConfig;
        setAvatar(data);
      }
    } catch { /* non-fatal */ }
  }

  async function saveAvatar(updated: AvatarConfig) {
    setAvatarSaving(true);
    try {
      await fetch('/api/school/avatar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(updated),
      });
      setAvatar(updated);
    } catch { /* non-fatal */ } finally {
      setAvatarSaving(false);
    }
  }

  async function loadAchievements() {
    try {
      const res = await fetch('/api/school/achievements', { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json() as { achievements: AchievementDef[]; earned: EarnedAchievement[] };
        setAchievements(data.achievements ?? []);
        setEarned(new Set((data.earned ?? []).map(e => e.achievement_id)));
      }
    } catch { /* non-fatal */ }
  }

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
            <div className="relative shrink-0">
              <AvatarDisplay avatar={avatar} size="lg" />
              {schoolRole === 'student' && (
                <button
                  onClick={() => setShowAvatarEditor(v => !v)}
                  className="absolute -bottom-1 -right-1 p-1 rounded-full bg-adv-card border border-white/20 text-adv-gray hover:text-adv-teal transition-colors"
                  title="Edit avatar"
                >
                  <Palette className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setIsEditing(false); }}
                    className="flex-1 rounded-lg border border-adv-teal bg-adv-dark px-3 py-1.5 text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
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
              <p className="text-xs text-adv-gray">Sessions this week</p>
              <p className="mt-0.5 text-lg font-bold text-adv-white">
                {stats.sessionsThisWeek ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-adv-dark p-3 text-center">
              <BookOpen className="mx-auto mb-1 h-4 w-4 text-adv-teal" />
              <p className="text-xs text-adv-gray">Enrolled classes</p>
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
                  <span className="text-adv-gray capitalize">· {t(`subject.${cls.subject_id}`, cls.subject_id)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Achievement badges — only for students */}
        {schoolRole === 'student' && achievements.length > 0 && (
          <section className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-adv-teal" />
              <h2 className="text-sm font-semibold text-adv-off-white">Achievements</h2>
              <span className="rounded-full bg-adv-teal/10 px-2 py-0.5 text-xs text-adv-teal">
                {earned.size} / {achievements.length}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {achievements.map((ach) => {
                const isEarned = earned.has(ach.id);
                return (
                  <div
                    key={ach.id}
                    title={ach.description}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                      isEarned
                        ? 'border-adv-teal/40 bg-adv-teal/10 shadow-[0_0_12px_rgba(45,212,168,0.15)]'
                        : 'border-border bg-adv-dark opacity-50'
                    }`}
                  >
                    {isEarned
                      ? <CheckCircle2 className="h-5 w-5 text-adv-teal" />
                      : <Lock className="h-5 w-5 text-adv-gray" />
                    }
                    <span className={`text-xs font-medium leading-tight ${isEarned ? 'text-adv-off-white' : 'text-adv-gray'}`}>
                      {ach.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Avatar editor — only for students */}
        {schoolRole === 'student' && showAvatarEditor && (
          <section className="rounded-xl border border-adv-teal/30 bg-adv-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-adv-teal" />
                <h2 className="text-sm font-semibold text-adv-off-white">{t('avatar.title', 'Customise your avatar')}</h2>
              </div>
              {avatarSaving && <Loader2 className="w-4 h-4 text-adv-teal animate-spin" />}
            </div>

            {/* Emoji picker */}
            <div>
              <p className="text-xs text-adv-gray mb-2">{t('avatar.chooseEmoji', 'Choose your emoji')}</p>
              <div className="flex flex-wrap gap-2">
                {AVATAR_CHARS.map(ch => (
                  <button
                    key={ch}
                    onClick={() => saveAvatar({ ...avatar, avatarChar: ch })}
                    className={`w-9 h-9 rounded-lg text-xl flex items-center justify-center transition-colors ${avatar.avatarChar === ch ? 'bg-adv-teal/30 ring-2 ring-adv-teal' : 'bg-adv-dark hover:bg-adv-teal/10'}`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>

            {/* Colour picker */}
            <div>
              <p className="text-xs text-adv-gray mb-2">{t('avatar.chooseColor', 'Colour scheme')}</p>
              <div className="flex gap-2 flex-wrap">
                {COLOR_SCHEMES.map(cs => (
                  <button
                    key={cs.id}
                    onClick={() => saveAvatar({ ...avatar, colorScheme: cs.id })}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${avatar.colorScheme === cs.id ? 'border-adv-teal text-white' : 'border-white/10 text-adv-gray hover:text-white'}`}
                  >
                    <span className={`w-3 h-3 rounded-full ${cs.preview}`} />
                    {cs.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Frame picker */}
            <div>
              <p className="text-xs text-adv-gray mb-2">{t('avatar.chooseFrame', 'Frame')}</p>
              <div className="flex gap-2 flex-wrap">
                {FRAMES.map(fr => (
                  <button
                    key={fr.id}
                    onClick={() => saveAvatar({ ...avatar, frame: fr.id })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${avatar.frame === fr.id ? 'border-adv-teal text-white bg-adv-teal/10' : 'border-white/10 text-adv-gray hover:text-white'}`}
                  >
                    {fr.emoji ? `${fr.emoji} ` : ''}{fr.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title input */}
            <div>
              <p className="text-xs text-adv-gray mb-2">{t('avatar.title', 'Display title (optional)')}</p>
              <input
                type="text"
                value={avatar.title}
                onChange={e => setAvatar(prev => ({ ...prev, title: e.target.value }))}
                onBlur={() => saveAvatar(avatar)}
                maxLength={30}
                placeholder={t('avatar.titlePlaceholder', 'e.g. Maths Wizard, History Buff...')}
                className="w-full bg-adv-dark border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-adv-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:border-adv-teal"
              />
            </div>

            <div className="flex items-center justify-center pt-2">
              <AvatarDisplay avatar={avatar} size="xl" showTitle />
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
            <p className="text-xs text-adv-gray">
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
                <p className="text-xs text-adv-gray">This code expires in 48 hours. Generate a new one any time.</p>
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
