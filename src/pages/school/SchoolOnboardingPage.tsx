import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAuthHeader } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  GraduationCap,
  Globe,
  Users,
  BookOpen,
  ChevronRight,
  Check,
  Loader2,
  ArrowRight,
} from 'lucide-react';

type Step = 1 | 2 | 3 | 4 | 'complete';

interface OnboardingState {
  tier: string;
  country: string;
  classCode: string;
}

function getOnboardingKey(userId: string) {
  return `school_onboarding_complete_${userId}`;
}

export function isOnboardingComplete(userId: string): boolean {
  return localStorage.getItem(getOnboardingKey(userId)) === 'true';
}

export function markOnboardingComplete(userId: string) {
  localStorage.setItem(getOnboardingKey(userId), 'true');
}

export default function SchoolOnboardingPage() {
  const { t } = useTranslation('school');
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [step, setStep] = useState<Step>(1);
  const [state, setState] = useState<OnboardingState>({ tier: '', country: '', classCode: '' });
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinedClass, setJoinedClass] = useState<string | null>(null);

  // If onboarding already done, redirect immediately
  useEffect(() => {
    if (user && isOnboardingComplete(user.id)) {
      navigate('/school', { replace: true });
    }
  }, [user, navigate]);

  function selectTier(tier: string) {
    setState((p) => ({ ...p, tier }));
    setStep(2);
  }

  function selectCountry(country: string) {
    setState((p) => ({ ...p, country }));
    setStep(3);
  }

  async function handleJoinClass() {
    const code = state.classCode.trim().toUpperCase();
    if (!code) { setStep(4); return; }
    setIsJoining(true);
    setJoinError(null);
    try {
      const res = await fetch('/api/school/classes/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ classCode: code }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Join failed' }));
        throw new Error(err.error ?? 'Join failed');
      }
      const data = await res.json();
      setJoinedClass(data.className ?? code);
      setStep(4);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Join failed');
    } finally {
      setIsJoining(false);
    }
  }

  function skipClassJoin() {
    setStep(4);
  }

  function finishOnboarding() {
    if (user) markOnboardingComplete(user.id);
    setStep('complete');
  }

  function goToDashboard() {
    navigate('/school', { replace: true });
  }

  const progressSteps = [1, 2, 3, 4];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-adv-dark px-4 py-12">
      {/* Logo / header */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-adv-teal/10">
          <GraduationCap className="h-6 w-6 text-adv-teal" />
        </div>
        <div>
          <p className="text-lg font-bold text-adv-white">ANTON</p>
          <p className="text-xs text-adv-gray-med">{t('nav.schoolMode', 'School Mode')}</p>
        </div>
      </div>

      {/* Step progress dots */}
      {step !== 'complete' && (
        <div className="mb-8 flex items-center gap-2">
          {progressSteps.map((s) => {
            const done = typeof step === 'number' && s < step;
            const active = step === s;
            return (
              <div
                key={s}
                className={`h-2 rounded-full transition-all ${
                  done
                    ? 'w-4 bg-adv-teal'
                    : active
                    ? 'w-6 bg-adv-teal'
                    : 'w-2 bg-adv-card'
                }`}
              />
            );
          })}
        </div>
      )}

      {/* Step 1 — Tier selection */}
      {step === 1 && (
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-adv-white">
              {t('onboarding.student.step1.title', 'Welcome to ANTON School!')}
            </h1>
            <p className="mt-2 text-sm text-adv-gray">
              {t('onboarding.student.step1.subtitle', "Let's get you set up.")}
            </p>
            <p className="mt-4 text-xs font-medium uppercase tracking-widest text-adv-gray-med">
              {t('onboarding.student.step1.selectTier', 'What year are you in?')}
            </p>
          </div>
          <div className="space-y-3">
            {[
              { value: 'T2', label: t('onboarding.student.step1.tierT2', 'Years 7–9 (ages 13–15)'), icon: BookOpen },
              { value: 'T3', label: t('onboarding.student.step1.tierT3', 'Years 10–12 (ages 16–18)'), icon: BookOpen },
              { value: 'T4', label: t('onboarding.student.step1.tierT4', 'University (18+)'), icon: GraduationCap },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => selectTier(value)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-adv-card px-5 py-4 text-left transition-colors hover:border-adv-teal hover:bg-adv-teal/5 focus:outline-none focus:ring-2 focus:ring-adv-teal"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-adv-teal/10">
                  <Icon className="h-4 w-4 text-adv-teal" />
                </div>
                <span className="text-sm font-medium text-adv-off-white">{label}</span>
                <ChevronRight className="ml-auto h-4 w-4 text-adv-gray-med" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 — Country */}
      {step === 2 && (
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-adv-white">
              {t('onboarding.student.step2.title', 'Where are you?')}
            </h1>
            <p className="mt-2 text-xs font-medium uppercase tracking-widest text-adv-gray-med">
              {t('onboarding.student.step2.selectCountry', 'Select your country')}
            </p>
          </div>
          <div className="space-y-3">
            {[
              { value: 'se', label: t('onboarding.student.step2.sweden', 'Sweden (Lgr22)') },
              { value: 'gb', label: t('onboarding.student.step2.uk', 'United Kingdom') },
              { value: 'other', label: t('onboarding.student.step2.other', 'Other') },
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => selectCountry(value)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-adv-card px-5 py-4 text-left transition-colors hover:border-adv-teal hover:bg-adv-teal/5 focus:outline-none focus:ring-2 focus:ring-adv-teal"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-adv-teal/10">
                  <Globe className="h-4 w-4 text-adv-teal" />
                </div>
                <span className="text-sm font-medium text-adv-off-white">{label}</span>
                <ChevronRight className="ml-auto h-4 w-4 text-adv-gray-med" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3 — Join class */}
      {step === 3 && (
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-adv-white">
              {t('onboarding.student.step3.title', 'Join your class')}
            </h1>
            <p className="mt-2 text-sm text-adv-gray">
              {t('onboarding.student.step3.enterCode', 'Enter the class code from your teacher')}
            </p>
          </div>

          {joinedClass && (
            <div className="flex items-center gap-2 rounded-lg border border-adv-green/30 bg-adv-green/10 px-4 py-3 text-sm text-adv-green">
              <Check className="h-4 w-4 shrink-0" />
              Joined {joinedClass}!
            </div>
          )}

          <div className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-adv-teal/10">
                <Users className="h-4 w-4 text-adv-teal" />
              </div>
              <input
                type="text"
                value={state.classCode}
                onChange={(e) => setState((p) => ({ ...p, classCode: e.target.value.toUpperCase() }))}
                placeholder={t('onboarding.student.step3.codePlaceholder', 'e.g. MATH-9B-2026')}
                className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm font-mono text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && state.classCode.trim() && handleJoinClass()}
              />
            </div>

            {joinError && (
              <p className="text-sm text-adv-red">{joinError}</p>
            )}

            <button
              type="button"
              onClick={handleJoinClass}
              disabled={!state.classCode.trim() || isJoining}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-adv-teal"
            >
              {isJoining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t('onboarding.student.step3.join', 'Join class')}
            </button>
          </div>

          <button
            type="button"
            onClick={skipClassJoin}
            className="w-full text-center text-sm text-adv-gray-med hover:text-adv-gray transition-colors"
          >
            {t('onboarding.student.step3.skip', "I'll join later")}
          </button>
        </div>
      )}

      {/* Step 4 — Quick diagnostic */}
      {step === 4 && (
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-adv-white">
              {t('onboarding.student.step4.title', 'Quick maths check')}
            </h1>
            <p className="mt-2 text-sm text-adv-gray">
              {t('onboarding.student.step4.subtitle', '5 questions to help Alma understand where you are. This isn\'t graded.')}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-adv-card p-6 text-center space-y-4">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-adv-teal/10">
              <BookOpen className="h-8 w-8 text-adv-teal" />
            </div>
            <p className="text-sm text-adv-gray-med">
              The diagnostic check is a quick 5-question assessment that helps Alma personalise her teaching to your level. You can skip this and do it later.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={finishOnboarding}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors focus:outline-none focus:ring-2 focus:ring-adv-teal"
            >
              {t('onboarding.student.step4.start', 'Start check')}
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={finishOnboarding}
              className="w-full text-center text-sm text-adv-gray-med hover:text-adv-gray transition-colors"
            >
              {t('onboarding.student.step4.skip', 'Skip for now')}
            </button>
          </div>
        </div>
      )}

      {/* Complete */}
      {step === 'complete' && (
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-adv-teal/10">
            <Check className="h-10 w-10 text-adv-teal" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-adv-white">
              {t('onboarding.student.complete.title', "You're all set!")}
            </h1>
            <p className="mt-2 text-sm text-adv-gray">
              {t('onboarding.student.complete.subtitle', 'Your dashboard is ready.')}
            </p>
          </div>
          <button
            type="button"
            onClick={goToDashboard}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-adv-teal px-4 py-3 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors focus:outline-none focus:ring-2 focus:ring-adv-teal"
          >
            {t('onboarding.student.complete.goToDashboard', 'Go to my dashboard')}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
