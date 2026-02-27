import { useEffect, useState } from 'react';
import { fetchProfile, saveProfile } from '../../lib/api';

const EXPERIENCE_LEVELS = [
  { value: '', label: 'Select experience level...' },
  { value: 'Junior (0-3 years)', label: 'Junior (0-3 years)' },
  { value: 'Mid-level (3-7 years)', label: 'Mid-level (3-7 years)' },
  { value: 'Senior (7-15 years)', label: 'Senior (7-15 years)' },
  { value: 'Expert (15+ years)', label: 'Expert (15+ years)' },
];

const EMPTY_PROFILE: Record<string, string> = {
  name: '',
  role: '',
  company: '',
  industry: '',
  expertise: '',
  experience_level: '',
  communication_preferences: '',
  team_context: '',
  current_focus: '',
};

export function IdentityPanel() {
  const [profile, setProfile] = useState<Record<string, string>>(EMPTY_PROFILE);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile()
      .then((data) => {
        const normalised: Record<string, string> = {};
        for (const key of Object.keys(EMPTY_PROFILE)) {
          normalised[key] = (data[key] as string | null) ?? '';
        }
        setProfile(normalised);
      })
      .catch(() => {
        // Silently fall back to empty profile on fetch error
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (field: string, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    await saveProfile(profile);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const labelClass = 'block text-xs font-medium text-adv-off-white mb-1';
  const inputClass =
    'w-full bg-adv-dark border border-border text-adv-off-white rounded-lg px-3 py-2 text-sm focus:border-adv-teal focus:outline-none';
  const textareaClass =
    'w-full bg-adv-dark border border-border text-adv-off-white rounded-lg px-3 py-2 text-sm focus:border-adv-teal focus:outline-none resize-none';

  if (loading) {
    return (
      <div className="bg-adv-card border border-border rounded-xl p-6">
        <p className="text-adv-gray text-sm">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="bg-adv-card border border-border rounded-xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-adv-off-white">This Is Me</h2>
        <p className="text-xs text-adv-gray mt-1">
          Tell Claude who you are. This context is injected into every prompt so responses are
          calibrated to your expertise, role, and current focus.
        </p>
      </div>

      {/* Row: Name + Role */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="profile-name">
            Name
          </label>
          <input
            id="profile-name"
            type="text"
            className={inputClass}
            placeholder="Your name"
            value={profile.name}
            onChange={(e) => handleChange('name', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="profile-role">
            Role
          </label>
          <input
            id="profile-role"
            type="text"
            className={inputClass}
            placeholder="e.g., Senior AML Consultant"
            value={profile.role}
            onChange={(e) => handleChange('role', e.target.value)}
          />
        </div>
      </div>

      {/* Row: Company + Industry */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="profile-company">
            Company
          </label>
          <input
            id="profile-company"
            type="text"
            className={inputClass}
            placeholder="e.g., openEXPERT"
            value={profile.company}
            onChange={(e) => handleChange('company', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="profile-industry">
            Industry
          </label>
          <input
            id="profile-industry"
            type="text"
            className={inputClass}
            placeholder="e.g., Financial Services, Banking"
            value={profile.industry}
            onChange={(e) => handleChange('industry', e.target.value)}
          />
        </div>
      </div>

      {/* Expertise areas */}
      <div>
        <label className={labelClass} htmlFor="profile-expertise">
          Expertise areas
        </label>
        <textarea
          id="profile-expertise"
          className={textareaClass}
          rows={2}
          placeholder="e.g., AML/CFT, Sanctions, AMLR implementation, Nordic regulations"
          value={profile.expertise}
          onChange={(e) => handleChange('expertise', e.target.value)}
        />
      </div>

      {/* Experience level */}
      <div>
        <label className={labelClass} htmlFor="profile-experience-level">
          Experience level
        </label>
        <select
          id="profile-experience-level"
          className={inputClass}
          value={profile.experience_level}
          onChange={(e) => handleChange('experience_level', e.target.value)}
        >
          {EXPERIENCE_LEVELS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Communication preferences */}
      <div>
        <label className={labelClass} htmlFor="profile-comm-prefs">
          Communication preferences
        </label>
        <input
          id="profile-comm-prefs"
          type="text"
          className={inputClass}
          placeholder="e.g., Concise bullet points, detailed prose, executive summaries"
          value={profile.communication_preferences}
          onChange={(e) => handleChange('communication_preferences', e.target.value)}
        />
      </div>

      {/* Team context */}
      <div>
        <label className={labelClass} htmlFor="profile-team-context">
          Team context
        </label>
        <input
          id="profile-team-context"
          type="text"
          className={inputClass}
          placeholder="e.g., FCP practice, 6 consultants, Nordic market focus"
          value={profile.team_context}
          onChange={(e) => handleChange('team_context', e.target.value)}
        />
      </div>

      {/* Current focus */}
      <div>
        <label className={labelClass} htmlFor="profile-current-focus">
          Current focus
        </label>
        <textarea
          id="profile-current-focus"
          className={textareaClass}
          rows={2}
          placeholder="e.g., Currently implementing AMLR for Nordea. Main challenge is data quality."
          value={profile.current_focus}
          onChange={(e) => handleChange('current_focus', e.target.value)}
        />
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          className="bg-adv-teal text-adv-dark rounded-lg px-4 py-2 text-sm font-medium hover:bg-adv-teal-dark transition-colors"
        >
          Save profile
        </button>
        {saved && (
          <span className="text-adv-teal text-sm font-medium">Saved!</span>
        )}
      </div>
    </div>
  );
}
