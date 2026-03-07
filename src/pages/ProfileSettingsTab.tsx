import { useEffect, useState } from 'react';
import { fetchProfile, saveProfile } from '@/lib/api';
import { Check } from 'lucide-react';

const INDUSTRY_OPTIONS = [
  '',
  'Financial Services',
  'Legal & Compliance',
  'Technology',
  'Healthcare',
  'Education',
  'Real Estate',
  'Manufacturing',
  'Public Sector',
  'Consulting',
  'Other',
];

const EXPERIENCE_LEVELS = ['Junior', 'Mid-level', 'Senior', 'Expert'] as const;
const ORG_SIZES = [
  { value: 'solo', label: 'Solo' },
  { value: 'sme', label: 'SME (2-50)' },
  { value: 'mid-market', label: 'Mid-market (50-500)' },
  { value: 'enterprise', label: 'Enterprise (500+)' },
] as const;

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'sv', label: 'Swedish' },
  { value: 'fi', label: 'Finnish' },
  { value: 'da', label: 'Danish' },
  { value: 'no', label: 'Norwegian' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
];

const CHIP_BASE = 'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer';
const CHIP_ACTIVE = 'border-adv-teal bg-adv-teal-dim text-adv-teal';
const CHIP_INACTIVE = 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white';

interface ProfileData {
  display_name: string;
  role_title: string;
  organisation: string;
  industry: string;
  jurisdiction: string;
  experience_level: string;
  org_size: string;
  output_language: string;
  hourly_rate_eur: number;
  // Legacy fields preserved
  name: string;
  role: string;
  company: string;
  expertise: string;
  communication_preferences: string;
  team_context: string;
  current_focus: string;
  focus_areas: string;
}

const EMPTY: ProfileData = {
  display_name: '',
  role_title: '',
  organisation: '',
  industry: '',
  jurisdiction: '',
  experience_level: 'senior',
  org_size: 'mid-market',
  output_language: 'en',
  hourly_rate_eur: 250,
  name: '',
  role: '',
  company: '',
  expertise: '',
  communication_preferences: '',
  team_context: '',
  current_focus: '',
  focus_areas: '[]',
};

export default function ProfileSettingsTab() {
  const [profile, setProfile] = useState<ProfileData>(EMPTY);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile()
      .then((data) => {
        const merged: ProfileData = { ...EMPTY };
        for (const key of Object.keys(EMPTY) as (keyof ProfileData)[]) {
          if (data[key] != null && data[key] !== '') {
            if (key === 'hourly_rate_eur') {
              merged[key] = typeof data[key] === 'number' ? (data[key] as number) : Number(data[key]) || 250;
            } else {
              merged[key] = data[key] as string;
            }
          }
        }
        setProfile(merged);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (field: keyof ProfileData, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const setNum = (field: keyof ProfileData, value: number) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      await saveProfile(profile as unknown as Record<string, string>);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      // non-fatal
    }
  };

  const labelClass = 'block text-sm text-adv-gray mb-1.5';
  const inputClass =
    'w-full bg-adv-dark border border-border text-adv-off-white rounded-lg px-3 py-2 text-sm focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 placeholder:text-adv-gray';

  if (loading) {
    return <div className="text-adv-gray text-sm py-8 text-center">Loading profile...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-adv-card p-6">
        <h2 className="text-sm font-semibold text-adv-white">This Is Me</h2>
        <p className="mt-1 text-xs text-adv-gray">
          Your professional identity. This context is injected into every prompt so outputs are
          calibrated to your expertise, role, and jurisdiction.
        </p>

        <div className="mt-5 space-y-5">
          {/* Name */}
          <div>
            <label className={labelClass} htmlFor="p-name">Name</label>
            <input
              id="p-name"
              type="text"
              className={inputClass}
              placeholder="Your name (appears in outputs)"
              value={profile.display_name}
              onChange={(e) => set('display_name', e.target.value)}
            />
          </div>

          {/* Role / Title */}
          <div>
            <label className={labelClass} htmlFor="p-role">Role / Title</label>
            <input
              id="p-role"
              type="text"
              className={inputClass}
              placeholder="e.g. Chief Compliance Officer"
              value={profile.role_title}
              onChange={(e) => set('role_title', e.target.value)}
            />
          </div>

          {/* Organisation */}
          <div>
            <label className={labelClass} htmlFor="p-org">Organisation</label>
            <input
              id="p-org"
              type="text"
              className={inputClass}
              placeholder="e.g. Nordea Bank"
              value={profile.organisation}
              onChange={(e) => set('organisation', e.target.value)}
            />
          </div>

          {/* Industry */}
          <div>
            <label className={labelClass} htmlFor="p-industry">Industry</label>
            <select
              id="p-industry"
              className={inputClass}
              value={profile.industry}
              onChange={(e) => set('industry', e.target.value)}
            >
              <option value="">Select industry...</option>
              {INDUSTRY_OPTIONS.filter(Boolean).map((ind) => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
          </div>

          {/* Jurisdiction */}
          <div>
            <label className={labelClass} htmlFor="p-jurisdiction">Jurisdiction</label>
            <input
              id="p-jurisdiction"
              type="text"
              className={inputClass}
              placeholder="e.g. Sweden / EU / United Kingdom"
              value={profile.jurisdiction}
              onChange={(e) => set('jurisdiction', e.target.value)}
            />
          </div>

          {/* Experience Level — chips */}
          <div>
            <label className={labelClass}>Experience Level</label>
            <div className="flex flex-wrap gap-2">
              {EXPERIENCE_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => set('experience_level', level.toLowerCase())}
                  className={`${CHIP_BASE} ${profile.experience_level.toLowerCase() === level.toLowerCase() ? CHIP_ACTIVE : CHIP_INACTIVE}`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Hourly Rate */}
          <div>
            <label className={labelClass} htmlFor="p-hourly-rate">Hourly Rate (€)</label>
            <p className="mb-1.5 text-xs text-adv-gray">
              Your consulting hourly rate — used for ROI calculations
            </p>
            <input
              id="p-hourly-rate"
              type="number"
              min={50}
              max={5000}
              step={25}
              className={inputClass}
              value={profile.hourly_rate_eur}
              onChange={(e) => setNum('hourly_rate_eur', Math.max(50, Math.min(5000, Number(e.target.value) || 250)))}
            />
          </div>

          {/* Organisation Size — chips */}
          <div>
            <label className={labelClass}>Organisation Size</label>
            <div className="flex flex-wrap gap-2">
              {ORG_SIZES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('org_size', opt.value)}
                  className={`${CHIP_BASE} ${profile.org_size === opt.value ? CHIP_ACTIVE : CHIP_INACTIVE}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Output Language */}
          <div>
            <label className={labelClass} htmlFor="p-lang">Output Language</label>
            <select
              id="p-lang"
              className={inputClass}
              value={profile.output_language}
              onChange={(e) => set('output_language', e.target.value)}
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSave}
              className="bg-adv-teal text-adv-dark rounded-lg px-4 py-2 text-sm font-medium hover:bg-adv-teal-dark transition-colors"
            >
              Save profile
            </button>
            {saved && (
              <div className="flex items-center gap-1.5 text-adv-green text-sm font-medium">
                <Check className="h-3.5 w-3.5" />
                Saved
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
