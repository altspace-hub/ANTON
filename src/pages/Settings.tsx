import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { Circle, RefreshCw, Check, Globe, Server, Key, Users, Trash2, Plus, Edit2, Bell, DollarSign, Upload, FileText, Building2, Plug, Palette, RotateCcw, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import type { ModelId, ThinkingLevel, CreativityLevel } from '@/lib/types';
import { IdentityPanel } from '@/components/platform/IdentityPanel';
import ProfileSettingsTab from './ProfileSettingsTab';
import { ConnectionManager } from '@/features/connections/ConnectionManager';
import { ScriptLibrary } from '@/features/connections/ScriptLibrary';
import { ChannelBridgeManager } from '@/features/connections/ChannelBridgeManager';
import NavItemConfig from '@/components/layout/NavItemConfig';
import { KnowledgeLibraryManager } from '@/features/knowledge/KnowledgeLibraryManager';

interface BrandTemplate {
  id: string;
  name: string;
  type: 'docx' | 'pptx';
  file_size: number;
  created_at: string;
}

interface TeamUser {
  id: string;
  username: string;
  role: string;
  display_name: string;
  monthly_token_budget: number;
  last_login: string | null;
  tokens_this_month: number;
}

interface UsageRow {
  username: string;
  display_name: string;
  role: string;
  monthly_token_budget: number;
  input_tokens: number;
  output_tokens: number;
}

const CHIP_BASE = 'rounded-lg border px-2.5 py-1 text-xs transition-colors';
const CHIP_ACTIVE = 'border-adv-teal bg-adv-teal-dim text-adv-teal';
const CHIP_INACTIVE = 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white';

const MODEL_OPTIONS: { value: ModelId; label: string }[] = [
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
];

const THINKING_OPTIONS: { value: ThinkingLevel; label: string }[] = [
  { value: 'quick', label: 'Quick' },
  { value: 'think', label: 'Think' },
  { value: 'think_hard', label: 'Think Hard' },
  { value: 'investigate', label: 'Investigate' },
  { value: 'plan_first', label: 'Plan First' },
];

const CREATIVITY_OPTIONS: { value: CreativityLevel; label: string }[] = [
  { value: 'strict', label: 'Strict' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'creative', label: 'Creative' },
];

const THEME_OPTIONS: { value: 'dark' | 'light' | 'corporate'; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'corporate', label: 'Corporate' },
];

const BASE_TABS = [
  { id: 'profile', labelKey: 'settings.myProfile' },
  { id: 'general', labelKey: 'settings.general' },
  { id: 'navigation', labelKey: 'settings.navigation' },
  { id: 'knowledge', labelKey: 'settings.knowledge' },
] as const;

type BaseTabId = (typeof BASE_TABS)[number]['id'];
type TabId = BaseTabId | 'team' | 'connections';

const TAB_BASE = 'px-4 py-2 text-sm font-medium transition-colors rounded-t-lg border-b-2';
const TAB_ACTIVE = 'border-adv-teal text-adv-teal';
const TAB_INACTIVE = 'border-transparent text-adv-gray hover:text-adv-off-white';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const {
    health,
    isLoading,
    checkHealth,
    defaultModel,
    defaultThinking,
    defaultCreativity,
    setDefaultModel,
    setDefaultThinking,
    setDefaultCreativity,
    theme,
    setTheme,
    deploymentMode,
    fetchDeploymentConfig,
    emailNotificationsEnabled,
    setEmailNotificationsEnabled,
  } = useSettingsStore();

  const { user: authUser, isTeamMode } = useAuthStore();
  const isAdmin = authUser?.role === 'admin' && isTeamMode;

  // Team tab state
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'analyst' | 'viewer' | 'admin'>('analyst');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newBudget, setNewBudget] = useState(0);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [teamError, setTeamError] = useState('');
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [editBudgetValue, setEditBudgetValue] = useState(0);

  // Brand Templates state
  const [templates, setTemplates] = useState<BrandTemplate[]>([]);
  const [templateUploading, setTemplateUploading] = useState(false);

  async function loadTemplates() {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) setTemplates(await res.json() as BrandTemplate[]);
    } catch {
      // non-fatal
    }
  }

  async function handleTemplateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTemplateUploading(true);
    try {
      const formData = new FormData();
      formData.append('template', file);
      formData.append('name', file.name.replace(/\.[^.]+$/, ''));
      const res = await fetch('/api/templates/upload', { method: 'POST', body: formData });
      if (res.ok) {
        await loadTemplates();
        flash();
      }
    } catch {
      // non-fatal
    } finally {
      setTemplateUploading(false);
      // Reset the input so the same file can be re-uploaded if needed
      e.target.value = '';
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return;
    try {
      await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      await loadTemplates();
    } catch {
      // non-fatal
    }
  }

  // Brand Style config
  interface BrandFontEntry { family: string; size: string; color: string }
  interface BrandConfig {
    fonts: { body: BrandFontEntry; h1: BrandFontEntry; h2: BrandFontEntry; h3: BrandFontEntry; h4: BrandFontEntry };
    palette: string[];
  }
  const DEFAULT_BRAND_CONFIG: BrandConfig = {
    fonts: {
      body: { family: 'Calibri', size: '11pt', color: '#333333' },
      h1:   { family: 'Calibri', size: '24pt', color: '#1F4E79' },
      h2:   { family: 'Calibri', size: '18pt', color: '#2E75B6' },
      h3:   { family: 'Calibri', size: '14pt', color: '#2E75B6' },
      h4:   { family: 'Calibri', size: '12pt', color: '#44546A' },
    },
    palette: ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'],
  };
  const [brandConfig, setBrandConfig] = useState<BrandConfig>(DEFAULT_BRAND_CONFIG);
  const [brandSaved, setBrandSaved] = useState(false);

  async function loadBrandConfig() {
    try {
      const res = await fetch('/api/profile');
      if (!res.ok) return;
      const data = await res.json() as Record<string, unknown>;
      if (data.brand_config && typeof data.brand_config === 'string') {
        const parsed = JSON.parse(data.brand_config) as BrandConfig;
        setBrandConfig(parsed);
      }
    } catch { /* non-fatal */ }
  }

  async function saveBrandConfig() {
    try {
      const res = await fetch('/api/profile');
      if (!res.ok) return;
      const current = await res.json() as Record<string, string>;
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...current, brand_config: JSON.stringify(brandConfig) }),
      });
      setBrandSaved(true);
      setTimeout(() => setBrandSaved(false), 1500);
    } catch { /* non-fatal */ }
  }

  function updateFont(key: keyof BrandConfig['fonts'], field: keyof BrandFontEntry, value: string) {
    setBrandConfig((prev) => ({
      ...prev,
      fonts: { ...prev.fonts, [key]: { ...prev.fonts[key], [field]: value } },
    }));
  }

  function updatePaletteColor(index: number, value: string) {
    setBrandConfig((prev) => {
      const palette = [...prev.palette];
      palette[index] = value;
      return { ...prev, palette };
    });
  }

  // SSO status state
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [ssoTestStatus, setSsoTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [ssoTestResult, setSsoTestResult] = useState<{ ok: boolean; issuer?: string; error?: string } | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d: { oidcEnabled?: boolean }) => setOidcEnabled(!!d.oidcEnabled))
      .catch(() => {});
  }, []);

  async function testSsoConnection() {
    setSsoTestStatus('testing');
    setSsoTestResult(null);
    try {
      const res = await fetch('/api/auth/oidc/test');
      const data = await res.json() as { ok: boolean; issuer?: string; error?: string };
      setSsoTestResult(data);
      setSsoTestStatus(data.ok ? 'ok' : 'error');
    } catch {
      setSsoTestResult({ ok: false, error: 'Network error — server may be unreachable' });
      setSsoTestStatus('error');
    }
  }

  // E5: Budget cap state
  const [budgetCap, setBudgetCap] = useState<number>(0);
  const [budgetCapInput, setBudgetCapInput] = useState<string>('0');
  const [spendingData, setSpendingData] = useState<{ spent: number; cap: number; month: string } | null>(null);
  const [budgetSaving, setBudgetSaving] = useState(false);

  const getToken = () => localStorage.getItem('openexpert-token') || '';

  async function loadSpending() {
    try {
      const res = await fetch('/api/analytics/spending', { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) {
        const data = await res.json() as { spent: number; cap: number; month: string };
        setSpendingData(data);
        setBudgetCap(data.cap);
        setBudgetCapInput(String(data.cap));
      }
    } catch {
      // non-fatal
    }
  }

  async function saveBudgetCap() {
    setBudgetSaving(true);
    try {
      const cap = parseFloat(budgetCapInput) || 0;
      await fetch('/api/analytics/budget-cap', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cap }),
      });
      setBudgetCap(cap);
      await loadSpending();
      flash();
    } catch {
      // non-fatal
    } finally {
      setBudgetSaving(false);
    }
  }

  async function loadTeamData() {
    if (!isAdmin) return;
    setTeamLoading(true);
    try {
      const [usersRes, usageRes] = await Promise.all([
        fetch('/api/admin/users', { headers: { Authorization: `Bearer ${getToken()}` } }),
        fetch('/api/admin/usage', { headers: { Authorization: `Bearer ${getToken()}` } }),
      ]);
      if (usersRes.ok) setTeamUsers(await usersRes.json() as TeamUser[]);
      if (usageRes.ok) setUsageRows(await usageRes.json() as UsageRow[]);
    } catch {
      // non-fatal
    } finally {
      setTeamLoading(false);
    }
  }

  async function handleAddUser() {
    setTeamError('');
    if (!newUsername || !newPassword) { setTeamError('Username and password are required.'); return; }
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole, display_name: newDisplayName || newUsername, monthly_token_budget: newBudget }),
      });
      if (!res.ok) { const e = await res.json() as { error?: string }; setTeamError(e.error || 'Failed'); return; }
      setShowAddUser(false);
      setNewUsername(''); setNewPassword(''); setNewRole('analyst'); setNewDisplayName(''); setNewBudget(0);
      await loadTeamData();
    } catch { setTeamError('Network error'); }
  }

  async function handleDeleteUser(id: string) {
    if (!confirm('Delete this user?')) return;
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
    await loadTeamData();
  }

  async function handleResetPassword(id: string) {
    if (!editPassword) return;
    await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: editPassword }),
    });
    setEditingUser(null);
    setEditPassword('');
  }

  async function handleUpdateBudget(id: string) {
    try {
      await fetch(`/api/admin/users/${id}/budget`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyTokenBudget: editBudgetValue, alertThreshold: 0.8 }),
      });
      setEditingBudget(null);
      await loadTeamData();
      flash();
    } catch {
      // non-fatal
    }
  }

  async function handleResetUsage(id: string) {
    if (!confirm('Reset monthly usage for this user? This will clear their usage counter for the current month.')) return;
    try {
      await fetch(`/api/admin/users/${id}/reset-usage`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      await loadTeamData();
      flash();
    } catch {
      // non-fatal
    }
  }

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabId) || 'profile';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const [saved, setSaved] = useState(false);
  const [language, setLanguageState] = useState<'en' | 'sv' | 'fr' | 'de' | 'it' | 'es' | 'hi' | 'pt' | 'pl' | 'ur' | 'zh' | 'ar' | 'bn' | 'uk' | 'id' | 'ja' | 'tr' | 'vi' | 'ko' | 'th' | 'fa' | 'nl' | 'ro' | 'el' | 'cs' | 'hu' | 'he' | 'fi' | 'no' | 'da'>(
    () => (localStorage.getItem('openexpert-language') as 'en' | 'sv' | 'fr' | 'de' | 'it' | 'es' | 'hi' | 'pt' | 'pl' | 'ur' | 'zh' | 'ar' | 'bn' | 'uk' | 'id' | 'ja' | 'tr' | 'vi' | 'ko' | 'th' | 'fa' | 'nl' | 'ro' | 'el' | 'cs' | 'hu' | 'he' | 'fi' | 'no' | 'da') ?? 'en'
  );

  // Provider API key state
  const [providerStatus, setProviderStatus] = useState<Record<string, boolean>>({});
  const [openaiKey, setOpenaiKey] = useState('');
  const [googleKey, setGoogleKey] = useState('');
  const [mistralKey, setMistralKey] = useState('');

  // Custom models state
  interface CustomModelSlot {
    enabled: boolean;
    displayName: string;
    modelId: string;
    provider: 'anthropic' | 'openai' | 'google' | 'mistral';
    apiKeySource: 'provider' | 'custom';
    apiKeyOverride: string;
    contextWindow: number;
    maxOutputTokens: number;
    inputCostPer1M: number;
    outputCostPer1M: number;
    costTier: 0 | 1 | 2 | 3;
    supportsThinking: boolean;
    supportsJsonMode: boolean;
  }
  const emptySlot: CustomModelSlot = {
    enabled: false, displayName: '', modelId: '', provider: 'anthropic',
    apiKeySource: 'provider', apiKeyOverride: '',
    contextWindow: 200000, maxOutputTokens: 8192,
    inputCostPer1M: 0, outputCostPer1M: 0, costTier: 2,
    supportsThinking: false, supportsJsonMode: false,
  };
  const [customSlot1, setCustomSlot1] = useState<CustomModelSlot>({ ...emptySlot });
  const [customSlot2, setCustomSlot2] = useState<CustomModelSlot>({ ...emptySlot });
  const [customSlot1Open, setCustomSlot1Open] = useState(false);
  const [customSlot2Open, setCustomSlot2Open] = useState(false);
  const [customSaving, setCustomSaving] = useState<1 | 2 | null>(null);

  async function loadCustomModels() {
    try {
      const res = await fetch('/api/settings/custom-models');
      if (!res.ok) return;
      const data = await res.json() as { slot1: any; slot2: any };
      if (data.slot1) {
        setCustomSlot1({
          ...emptySlot,
          ...data.slot1,
          apiKeySource: data.slot1.apiKeyOverride ? 'custom' : 'provider',
        });
        setCustomSlot1Open(data.slot1.enabled);
      }
      if (data.slot2) {
        setCustomSlot2({
          ...emptySlot,
          ...data.slot2,
          apiKeySource: data.slot2.apiKeyOverride ? 'custom' : 'provider',
        });
        setCustomSlot2Open(data.slot2.enabled);
      }
    } catch { /* non-fatal */ }
  }

  async function saveCustomSlot(slot: 1 | 2) {
    setCustomSaving(slot);
    const slotData = slot === 1 ? customSlot1 : customSlot2;
    try {
      const config = slotData.modelId ? {
        enabled: slotData.enabled,
        displayName: slotData.displayName,
        modelId: slotData.modelId,
        provider: slotData.provider,
        ...(slotData.apiKeySource === 'custom' && slotData.apiKeyOverride ? { apiKeyOverride: slotData.apiKeyOverride } : {}),
        contextWindow: slotData.contextWindow,
        maxOutputTokens: slotData.maxOutputTokens,
        inputCostPer1M: slotData.inputCostPer1M,
        outputCostPer1M: slotData.outputCostPer1M,
        costTier: slotData.costTier,
        supportsThinking: slotData.supportsThinking,
        supportsJsonMode: slotData.supportsJsonMode,
      } : null;

      await fetch('/api/settings/custom-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, config }),
      });
      flash();
    } catch { /* non-fatal */ }
    finally { setCustomSaving(null); }
  }

  useEffect(() => {
    fetch('/api/settings/provider-status')
      .then((r) => r.json())
      .then((data) => setProviderStatus(data))
      .catch(() => {});
  }, []);

  async function saveProviderKey(key: string, value: string, clearFn: (v: string) => void) {
    try {
      await fetch('/api/settings/set-env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      setProviderStatus((prev) => ({ ...prev, [key]: !!value }));
      clearFn('');
      flash();
    } catch {
      // non-fatal
    }
  }

  function handleSetLanguage(lang: 'en' | 'sv' | 'fr' | 'de' | 'it' | 'es' | 'hi' | 'pt' | 'pl' | 'ur' | 'zh' | 'ar' | 'bn' | 'uk' | 'id' | 'ja' | 'tr' | 'vi' | 'ko' | 'th' | 'fa' | 'nl' | 'ro' | 'el' | 'cs' | 'hu' | 'he' | 'fi' | 'no' | 'da') {
    setLanguageState(lang);
    localStorage.setItem('openexpert-language', lang);
    i18n.changeLanguage(lang);
    flash();
  }

  useEffect(() => {
    checkHealth();
    fetchDeploymentConfig();
    loadSpending();
    loadTemplates();
    loadBrandConfig();
    loadCustomModels();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkHealth, fetchDeploymentConfig]);

  useEffect(() => {
    if (activeTab === 'team' && isAdmin) {
      loadTeamData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAdmin]);

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function handleSetModel(model: ModelId) {
    setDefaultModel(model);
    flash();
  }

  function handleSetThinking(thinking: ThinkingLevel) {
    setDefaultThinking(thinking);
    flash();
  }

  function handleSetCreativity(creativity: CreativityLevel) {
    setDefaultCreativity(creativity);
    flash();
  }

  function handleSetTheme(themeValue: 'dark' | 'light' | 'corporate') {
    setTheme(themeValue);
    flash();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-adv-white">{t('settings.title')}</h1>
        {saved && (
          <div className="flex items-center gap-1.5 rounded-lg bg-adv-green/10 border border-adv-green/30 px-3 py-1.5 text-xs text-adv-green">
            <Check className="h-3 w-3" />
            {t('settings.saved')}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-border">
        {BASE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`${TAB_BASE} ${activeTab === tab.id ? TAB_ACTIVE : TAB_INACTIVE}`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
        {isAdmin && (
          <button
            onClick={() => handleTabChange('team')}
            className={`${TAB_BASE} ${activeTab === 'team' ? TAB_ACTIVE : TAB_INACTIVE}`}
          >
            {t('settings.teamTab')}
          </button>
        )}
        <button
          onClick={() => handleTabChange('connections')}
          className={`${TAB_BASE} ${activeTab === 'connections' ? TAB_ACTIVE : TAB_INACTIVE} flex items-center gap-1.5`}
        >
          <Plug className="h-3.5 w-3.5" />
          Connections
        </button>
      </div>

      {/* My Profile tab */}
      {activeTab === 'profile' && <ProfileSettingsTab />}

      {/* Navigation tab */}
      {activeTab === 'navigation' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-adv-card p-6">
            <NavItemConfig />
          </div>
        </div>
      )}

      {/* Knowledge Library tab */}
      {activeTab === 'knowledge' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-adv-off-white">Knowledge Library</h3>
            <p className="mt-1 text-sm text-adv-gray">Register named document corpora for use across all modules. Index them once, reuse everywhere.</p>
          </div>
          <KnowledgeLibraryManager />
        </div>
      )}

      {/* Team tab — admin only, team mode only */}
      {activeTab === 'team' && isAdmin && (
        <div className="space-y-6">
          {/* Users table */}
          <div className="rounded-xl border border-border bg-adv-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-adv-teal" />
                <h2 className="text-sm font-semibold text-adv-white">{t('settings.teamMembers')}</h2>
              </div>
              <button
                onClick={() => setShowAddUser((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal-dim px-3 py-1.5 text-xs text-adv-teal hover:bg-adv-teal/20 transition-colors"
              >
                <Plus className="h-3 w-3" />
                {t('settings.addUser')}
              </button>
            </div>

            {/* Add user form */}
            {showAddUser && (
              <div className="mb-4 rounded-lg border border-adv-teal/30 bg-adv-dark/50 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-adv-off-white">{t('settings.newUser')}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-adv-gray">{t('settings.username')} *</label>
                    <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="username"
                      className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-adv-gray">{t('settings.password')} *</label>
                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="password"
                      className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-adv-gray">{t('settings.displayName')}</label>
                    <input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="Full Name"
                      className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-adv-gray">{t('settings.role')}</label>
                    <select value={newRole} onChange={(e) => setNewRole(e.target.value as 'analyst' | 'viewer' | 'admin')}
                      className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none">
                      <option value="analyst">Analyst</option>
                      <option value="viewer">Viewer</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-adv-gray">{t('settings.monthlyTokenBudget')}</label>
                    <input type="number" min={0} value={newBudget} onChange={(e) => setNewBudget(Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none" />
                  </div>
                </div>
                {teamError && <p className="text-xs text-adv-red">{teamError}</p>}
                <div className="flex gap-2">
                  <button onClick={handleAddUser} className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">{t('settings.createUser')}</button>
                  <button onClick={() => { setShowAddUser(false); setTeamError(''); }} className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors">{t('settings.cancel')}</button>
                </div>
              </div>
            )}

            {teamLoading ? (
              <p className="text-xs text-adv-gray-med">{t('settings.loading')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left text-adv-gray font-medium">{t('settings.usernameCol')}</th>
                      <th className="pb-2 text-left text-adv-gray font-medium">{t('settings.displayNameCol')}</th>
                      <th className="pb-2 text-left text-adv-gray font-medium">{t('settings.roleCol')}</th>
                      <th className="pb-2 text-right text-adv-gray font-medium">Budget</th>
                      <th className="pb-2 text-right text-adv-gray font-medium">Used / %</th>
                      <th className="pb-2 text-right text-adv-gray font-medium">{t('settings.lastLoginCol')}</th>
                      <th className="pb-2 text-right text-adv-gray font-medium">{t('settings.actionsCol')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {teamUsers.map((u) => {
                      const pct = u.monthly_token_budget > 0 ? Math.min((u.tokens_this_month / u.monthly_token_budget) * 100, 100) : 0;
                      const isOverBudget = u.monthly_token_budget > 0 && u.tokens_this_month >= u.monthly_token_budget;
                      const isNearLimit = u.monthly_token_budget > 0 && pct >= 80;
                      return (
                        <tr key={u.id}>
                          <td className="py-2.5 text-adv-off-white font-mono">{u.username}</td>
                          <td className="py-2.5 text-adv-off-white">{u.display_name || '—'}</td>
                          <td className="py-2.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${u.role === 'admin' ? 'bg-adv-blue/20 text-adv-blue' : u.role === 'analyst' ? 'bg-adv-teal/20 text-adv-teal' : 'bg-adv-gray-med/20 text-adv-gray'}`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-2.5 text-right">
                            {editingBudget === u.id ? (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  value={editBudgetValue}
                                  onChange={(e) => setEditBudgetValue(Number(e.target.value))}
                                  className="w-28 rounded border border-border bg-adv-dark px-2 py-1 text-xs text-adv-off-white text-right focus:border-adv-teal focus:outline-none"
                                />
                                <button onClick={() => handleUpdateBudget(u.id)} className="rounded px-2 py-1 text-xs text-adv-teal hover:bg-adv-teal/10 transition-colors">{t('settings.save2')}</button>
                                <button onClick={() => setEditingBudget(null)} className="rounded px-2 py-1 text-xs text-adv-gray hover:text-adv-off-white transition-colors">{t('settings.cancel')}</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setEditingBudget(u.id); setEditBudgetValue(u.monthly_token_budget); }}
                                className="text-adv-gray hover:text-adv-teal transition-colors"
                                title="Click to edit budget"
                              >
                                {u.monthly_token_budget === 0 ? '∞' : u.monthly_token_budget.toLocaleString()}
                              </button>
                            )}
                          </td>
                          <td className="py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className={`text-xs ${isOverBudget ? 'text-adv-red' : isNearLimit ? 'text-adv-gold' : 'text-adv-gray'}`}>
                                {u.tokens_this_month.toLocaleString()}
                                {u.monthly_token_budget > 0 && ` / ${Math.round(pct)}%`}
                              </span>
                              {u.tokens_this_month > 0 && (
                                <button
                                  onClick={() => handleResetUsage(u.id)}
                                  className="rounded p-1 text-adv-gray hover:text-adv-gold transition-colors"
                                  title="Reset usage"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 text-right text-adv-gray-med">{u.last_login ? new Date(u.last_login).toLocaleDateString() : t('settings.never')}</td>
                          <td className="py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {editingUser === u.id ? (
                                <>
                                  <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="new password"
                                    className="w-28 rounded border border-border bg-adv-dark px-2 py-1 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none" />
                                  <button onClick={() => handleResetPassword(u.id)} className="rounded px-2 py-1 text-xs text-adv-teal hover:bg-adv-teal/10 transition-colors">{t('settings.save2')}</button>
                                  <button onClick={() => { setEditingUser(null); setEditPassword(''); }} className="rounded px-2 py-1 text-xs text-adv-gray hover:text-adv-off-white transition-colors">{t('settings.cancel')}</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => setEditingUser(u.id)} className="rounded p-1 text-adv-gray hover:text-adv-off-white transition-colors" title={t('settings.resetPassword')}>
                                    <Edit2 className="h-3 w-3" />
                                  </button>
                                  {u.id !== authUser?.id && (
                                    <button onClick={() => handleDeleteUser(u.id)} className="rounded p-1 text-adv-gray hover:text-adv-red transition-colors" title={t('settings.deleteUser')}>
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Usage this month */}
          <div className="rounded-xl border border-border bg-adv-card p-6">
            <h2 className="mb-4 text-sm font-semibold text-adv-white">{t('settings.usageThisMonth')}</h2>
            {usageRows.length === 0 ? (
              <p className="text-xs text-adv-gray-med">{t('settings.noUsageRecorded')}</p>
            ) : (
              <div className="space-y-3">
                {usageRows.map((row) => {
                  const total = row.input_tokens + row.output_tokens;
                  const pct = row.monthly_token_budget > 0 ? Math.min((total / row.monthly_token_budget) * 100, 100) : 0;
                  return (
                    <div key={row.username}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs text-adv-off-white">{row.display_name || row.username}</span>
                        <span className="text-xs text-adv-gray-med">
                          {total.toLocaleString()} tokens
                          {row.monthly_token_budget > 0 && ` / ${row.monthly_token_budget.toLocaleString()}`}
                        </span>
                      </div>
                      {row.monthly_token_budget > 0 && (
                        <div className="h-1.5 rounded-full bg-adv-dark">
                          <div
                            className={`h-1.5 rounded-full transition-all ${pct >= 100 ? 'bg-adv-red' : pct >= 80 ? 'bg-adv-gold' : 'bg-adv-teal'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connections tab */}
      {activeTab === 'connections' && (
        <div className="space-y-8">
          <ConnectionManager />
          <div className="border-t border-border pt-8">
            <ScriptLibrary />
          </div>
          <div className="border-t border-border pt-8">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-adv-gray-med">
                  Channel Bridges — Mobile &amp; Messaging Pipelines
                </span>
              </div>
              <p className="text-xs text-adv-gray-med">
                Generate secure HTTP endpoints for WhatsApp bots, SMS gateways, Telegram bots, and
                other messaging integrations. Partners call ANTON's bridge endpoint; ANTON handles
                Claude and returns plain-text responses.
              </p>
            </div>
            <ChannelBridgeManager />
          </div>
        </div>
      )}

      {/* General tab */}
      {activeTab === 'general' && <>

      {/* API Status */}
      <div className="mb-6 rounded-xl border border-border bg-adv-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-adv-white">{t('settings.apiConnection')}</h2>
          <button
            onClick={checkHealth}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-lg bg-adv-card px-3 py-1.5 text-xs text-adv-gray hover:bg-adv-dark-2 hover:text-adv-off-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            {t('settings.refresh')}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-adv-gray">{t('settings.anthropicApiKey')}</span>
            <div className="flex items-center gap-2">
              <Circle
                className={`h-2 w-2 ${
                  health?.apiKeyConfigured
                    ? 'fill-adv-green text-adv-green'
                    : 'fill-adv-red text-adv-red'
                }`}
              />
              <span className="text-xs text-adv-gray-med">
                {health?.apiKeyConfigured ? t('settings.configured') : t('settings.notConfigured')}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-adv-gray">{t('settings.database')}</span>
            <div className="flex items-center gap-2">
              <Circle
                className={`h-2 w-2 ${
                  health?.database
                    ? 'fill-adv-green text-adv-green'
                    : 'fill-adv-red text-adv-red'
                }`}
              />
              <span className="text-xs text-adv-gray-med">
                {health?.database ? t('settings.connected') : t('settings.notConnected')}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-adv-gray">{t('settings.version')}</span>
            <span className="text-xs text-adv-gray-med">{health?.version || '-'}</span>
          </div>
        </div>

        {!health?.apiKeyConfigured && (
          <div className="mt-4 rounded-lg bg-adv-gold/10 border border-adv-gold/20 p-3 text-xs text-adv-gold">
            Add your Anthropic API key to the <code className="rounded bg-adv-dark px-1">.env</code> file:
            <pre className="mt-2 rounded bg-adv-dark p-2 text-adv-off-white">
              ANTHROPIC_API_KEY=sk-ant-...
            </pre>
          </div>
        )}
      </div>

      {/* Additional AI Providers */}
      <div className="mb-6 rounded-xl border border-border bg-adv-card p-6">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-adv-teal" />
          <h2 className="text-sm font-semibold text-adv-white">{t('settings.additionalProviders')}</h2>
        </div>
        <p className="mt-1 text-xs text-adv-gray-med">
          {t('settings.additionalProvidersDesc')}
        </p>

        <div className="mt-4 space-y-4">
          {/* OpenAI */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-adv-gray">{t('settings.openai')}</label>
              <input
                type="password"
                placeholder="sk-..."
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Circle className={`h-2 w-2 ${providerStatus.OPENAI_API_KEY ? 'fill-adv-green text-adv-green' : 'fill-adv-gray-med text-adv-gray-med'}`} />
              <button
                onClick={() => saveProviderKey('OPENAI_API_KEY', openaiKey, setOpenaiKey)}
                className="rounded-lg bg-adv-teal-dim px-3 py-1.5 text-xs text-adv-teal hover:bg-adv-teal/20 transition-colors"
              >
                {t('settings.save')}
              </button>
            </div>
          </div>

          {/* Google AI */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-adv-gray">{t('settings.googleAi')}</label>
              <input
                type="password"
                placeholder="AIza..."
                value={googleKey}
                onChange={(e) => setGoogleKey(e.target.value)}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Circle className={`h-2 w-2 ${providerStatus.GOOGLE_API_KEY ? 'fill-adv-green text-adv-green' : 'fill-adv-gray-med text-adv-gray-med'}`} />
              <button
                onClick={() => saveProviderKey('GOOGLE_API_KEY', googleKey, setGoogleKey)}
                className="rounded-lg bg-adv-teal-dim px-3 py-1.5 text-xs text-adv-teal hover:bg-adv-teal/20 transition-colors"
              >
                {t('settings.save')}
              </button>
            </div>
          </div>

          {/* Mistral */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-adv-gray">{t('settings.mistral')}</label>
              <input
                type="password"
                placeholder="..."
                value={mistralKey}
                onChange={(e) => setMistralKey(e.target.value)}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Circle className={`h-2 w-2 ${providerStatus.MISTRAL_API_KEY ? 'fill-adv-green text-adv-green' : 'fill-adv-gray-med text-adv-gray-med'}`} />
              <button
                onClick={() => saveProviderKey('MISTRAL_API_KEY', mistralKey, setMistralKey)}
                className="rounded-lg bg-adv-teal-dim px-3 py-1.5 text-xs text-adv-teal hover:bg-adv-teal/20 transition-colors"
              >
                {t('settings.save')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Models */}
      <div className="mb-6 rounded-xl border border-border bg-adv-card p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <h2 className="text-sm font-semibold text-adv-white">Custom Models</h2>
        </div>
        <p className="mt-1 text-xs text-adv-gray-med">
          Add up to 2 custom models. They appear in the model selector across all modules. Use any model ID from a supported provider.
        </p>

        <div className="mt-4 space-y-3">
          {([
            { slot: 1 as const, state: customSlot1, setter: setCustomSlot1, isOpen: customSlot1Open, setOpen: setCustomSlot1Open },
            { slot: 2 as const, state: customSlot2, setter: setCustomSlot2, isOpen: customSlot2Open, setOpen: setCustomSlot2Open },
          ]).map(({ slot, state, setter, isOpen, setOpen: setSlotOpen }) => (
            <div key={slot} className="rounded-lg border border-border bg-adv-dark/50">
              <button
                onClick={() => setSlotOpen(!isOpen)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-adv-gray" /> : <ChevronRight className="h-3.5 w-3.5 text-adv-gray" />}
                  <span className="text-sm font-medium text-adv-off-white">
                    {state.displayName || `Custom Model ${slot}`}
                  </span>
                  {state.enabled && state.modelId && (
                    <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                      Active
                    </span>
                  )}
                </div>
                {state.modelId && (
                  <span className="text-[10px] text-adv-gray-med font-mono">{state.modelId}</span>
                )}
              </button>

              {isOpen && (
                <div className="border-t border-border px-4 py-4 space-y-3">
                  {/* Enable toggle */}
                  <label className="flex items-center gap-3">
                    <button
                      role="switch"
                      aria-checked={state.enabled}
                      onClick={() => setter({ ...state, enabled: !state.enabled })}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                        state.enabled ? 'bg-adv-teal' : 'bg-adv-gray-med/40'
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        state.enabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </button>
                    <span className="text-xs text-adv-off-white">Enabled</span>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Display Name */}
                    <div>
                      <label className="mb-1 block text-xs text-adv-gray">Display Name</label>
                      <input
                        type="text"
                        value={state.displayName}
                        onChange={(e) => setter({ ...state, displayName: e.target.value })}
                        placeholder="e.g. Claude 4 Opus Preview"
                        className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                      />
                    </div>

                    {/* Model ID */}
                    <div>
                      <label className="mb-1 block text-xs text-adv-gray">Model ID</label>
                      <input
                        type="text"
                        value={state.modelId}
                        onChange={(e) => setter({ ...state, modelId: e.target.value })}
                        placeholder="e.g. claude-opus-4-20260301"
                        className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none font-mono"
                      />
                    </div>

                    {/* Provider */}
                    <div>
                      <label className="mb-1 block text-xs text-adv-gray">Provider</label>
                      <select
                        value={state.provider}
                        onChange={(e) => setter({ ...state, provider: e.target.value as any })}
                        className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
                      >
                        <option value="anthropic">Anthropic</option>
                        <option value="openai">OpenAI</option>
                        <option value="google">Google</option>
                        <option value="mistral">Mistral</option>
                      </select>
                    </div>

                    {/* API Key source */}
                    <div>
                      <label className="mb-1 block text-xs text-adv-gray">API Key</label>
                      <select
                        value={state.apiKeySource}
                        onChange={(e) => setter({ ...state, apiKeySource: e.target.value as 'provider' | 'custom' })}
                        className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
                      >
                        <option value="provider">Use provider's key</option>
                        <option value="custom">Custom API key</option>
                      </select>
                    </div>
                  </div>

                  {/* Custom API key input */}
                  {state.apiKeySource === 'custom' && (
                    <div>
                      <label className="mb-1 block text-xs text-adv-gray">Custom API Key</label>
                      <input
                        type="password"
                        value={state.apiKeyOverride}
                        onChange={(e) => setter({ ...state, apiKeyOverride: e.target.value })}
                        placeholder="sk-..."
                        className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-3">
                    {/* Context Window */}
                    <div>
                      <label className="mb-1 block text-xs text-adv-gray">Context Window</label>
                      <input
                        type="number"
                        min={0}
                        value={state.contextWindow}
                        onChange={(e) => setter({ ...state, contextWindow: Number(e.target.value) })}
                        className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
                      />
                    </div>

                    {/* Max Output */}
                    <div>
                      <label className="mb-1 block text-xs text-adv-gray">Max Output</label>
                      <input
                        type="number"
                        min={0}
                        value={state.maxOutputTokens}
                        onChange={(e) => setter({ ...state, maxOutputTokens: Number(e.target.value) })}
                        className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
                      />
                    </div>

                    {/* Input cost */}
                    <div>
                      <label className="mb-1 block text-xs text-adv-gray">$/M Input</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={state.inputCostPer1M}
                        onChange={(e) => setter({ ...state, inputCostPer1M: Number(e.target.value) })}
                        className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
                      />
                    </div>

                    {/* Output cost */}
                    <div>
                      <label className="mb-1 block text-xs text-adv-gray">$/M Output</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={state.outputCostPer1M}
                        onChange={(e) => setter({ ...state, outputCostPer1M: Number(e.target.value) })}
                        className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {/* Cost tier */}
                    <div>
                      <label className="mb-1 block text-xs text-adv-gray">Cost Tier</label>
                      <select
                        value={state.costTier}
                        onChange={(e) => setter({ ...state, costTier: Number(e.target.value) as 0 | 1 | 2 | 3 })}
                        className="w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
                      >
                        <option value={0}>Free (0)</option>
                        <option value={1}>Budget (1)</option>
                        <option value={2}>Standard (2)</option>
                        <option value={3}>Premium (3)</option>
                      </select>
                    </div>

                    {/* Supports thinking */}
                    <label className="flex items-center gap-2 pt-5">
                      <input
                        type="checkbox"
                        checked={state.supportsThinking}
                        onChange={(e) => setter({ ...state, supportsThinking: e.target.checked })}
                        className="h-3.5 w-3.5 rounded border-border bg-adv-dark text-adv-teal focus:ring-adv-teal"
                      />
                      <span className="text-xs text-adv-off-white">Thinking</span>
                    </label>

                    {/* Supports JSON */}
                    <label className="flex items-center gap-2 pt-5">
                      <input
                        type="checkbox"
                        checked={state.supportsJsonMode}
                        onChange={(e) => setter({ ...state, supportsJsonMode: e.target.checked })}
                        className="h-3.5 w-3.5 rounded border-border bg-adv-dark text-adv-teal focus:ring-adv-teal"
                      />
                      <span className="text-xs text-adv-off-white">JSON Mode</span>
                    </label>
                  </div>

                  {/* Save button */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => saveCustomSlot(slot)}
                      disabled={customSaving === slot}
                      className="rounded-lg bg-adv-teal px-4 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
                    >
                      {customSaving === slot ? 'Saving...' : 'Save'}
                    </button>
                    {state.modelId && (
                      <button
                        onClick={() => {
                          setter({ ...emptySlot });
                          saveCustomSlot(slot);
                        }}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Default Settings */}
      <div className="mb-6 rounded-xl border border-border bg-adv-card p-6">
        <h2 className="text-sm font-semibold text-adv-white">{t('settings.defaultSettings')}</h2>
        <p className="mt-1 text-xs text-adv-gray-med">
          {t('settings.defaultSettingsDesc')}
        </p>

        <div className="mt-5 space-y-5">
          {/* Default Model */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-adv-gray">{t('settings.defaultModel')}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {MODEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSetModel(opt.value)}
                  className={`${CHIP_BASE} ${defaultModel === opt.value ? CHIP_ACTIVE : CHIP_INACTIVE}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Default Thinking */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-adv-gray">{t('settings.defaultThinking')}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {THINKING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSetThinking(opt.value)}
                  className={`${CHIP_BASE} ${defaultThinking === opt.value ? CHIP_ACTIVE : CHIP_INACTIVE}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Default Creativity */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-adv-gray">{t('settings.defaultCreativity')}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {CREATIVITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSetCreativity(opt.value)}
                  className={`${CHIP_BASE} ${defaultCreativity === opt.value ? CHIP_ACTIVE : CHIP_INACTIVE}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Language */}
      <div className="mb-6 rounded-xl border border-border bg-adv-card p-6">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-adv-teal" />
          <h2 className="text-sm font-semibold text-adv-white">{t('settings.language')}</h2>
        </div>
        <p className="mt-1 text-xs text-adv-gray-med">
          {t('settings.languageDesc')}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {([
            // Top 10 languages (already had)
            { value: 'en' as const, label: 'English', flag: '🇬🇧' },
            { value: 'zh' as const, label: '中文', flag: '🇨🇳' },
            { value: 'hi' as const, label: 'हिन्दी', flag: '🇮🇳' },
            { value: 'es' as const, label: 'Español', flag: '🇪🇸' },
            { value: 'fr' as const, label: 'Français', flag: '🇫🇷' },
            { value: 'ar' as const, label: 'العربية', flag: '🇸🇦' },
            { value: 'bn' as const, label: 'বাংলা', flag: '🇧🇩' },
            { value: 'pt' as const, label: 'Português', flag: '🇵🇹' },
            { value: 'ur' as const, label: 'اردو', flag: '🇵🇰' },
            { value: 'id' as const, label: 'Indonesia', flag: '🇮🇩' },

            // 11-20
            { value: 'de' as const, label: 'Deutsch', flag: '🇩🇪' },
            { value: 'ja' as const, label: '日本語', flag: '🇯🇵' },
            { value: 'tr' as const, label: 'Türkçe', flag: '🇹🇷' },
            { value: 'vi' as const, label: 'Tiếng Việt', flag: '🇻🇳' },
            { value: 'ko' as const, label: '한국어', flag: '🇰🇷' },
            { value: 'it' as const, label: 'Italiano', flag: '🇮🇹' },
            { value: 'th' as const, label: 'ไทย', flag: '🇹🇭' },
            { value: 'pl' as const, label: 'Polski', flag: '🇵🇱' },
            { value: 'fa' as const, label: 'فارسی', flag: '🇮🇷' },
            { value: 'uk' as const, label: 'Українська', flag: '🇺🇦' },

            // 21-30
            { value: 'nl' as const, label: 'Nederlands', flag: '🇳🇱' },
            { value: 'ro' as const, label: 'Română', flag: '🇷🇴' },
            { value: 'el' as const, label: 'Ελληνικά', flag: '🇬🇷' },
            { value: 'cs' as const, label: 'Čeština', flag: '🇨🇿' },
            { value: 'sv' as const, label: 'Svenska', flag: '🇸🇪' },
            { value: 'hu' as const, label: 'Magyar', flag: '🇭🇺' },
            { value: 'he' as const, label: 'עברית', flag: '🇮🇱' },
            { value: 'fi' as const, label: 'Suomi', flag: '🇫🇮' },
            { value: 'no' as const, label: 'Norsk', flag: '🇳🇴' },
            { value: 'da' as const, label: 'Dansk', flag: '🇩🇰' },
          ]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSetLanguage(opt.value)}
              className={`${CHIP_BASE} ${language === opt.value ? CHIP_ACTIVE : CHIP_INACTIVE}`}
            >
              {opt.flag} {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Deployment Mode */}
      <div className="mb-6 rounded-xl border border-border bg-adv-card p-6">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-adv-teal" />
          <h2 className="text-sm font-semibold text-adv-white">{t('settings.deployment')}</h2>
        </div>
        <p className="mt-1 text-xs text-adv-gray-med">
          {t('settings.deploymentDesc')}
        </p>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-adv-gray">{t('settings.mode')}</span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              deploymentMode === 'team'
                ? 'bg-adv-blue/20 text-adv-blue'
                : 'bg-adv-teal/20 text-adv-teal'
            }`}>
              {deploymentMode === 'team' ? t('settings.team') : t('settings.solo')}
            </span>
          </div>
          <div className="rounded-lg bg-adv-dark/50 p-3 text-xs text-adv-gray-med">
            {deploymentMode === 'solo' ? (
              <>
                <strong className="text-adv-off-white">Solo mode:</strong> Single-user setup. All features available without login.
                Audit log tracks your personal usage and cost. To enable team features (user attribution, shared review workflows),
                set <code className="rounded bg-adv-dark px-1">DEPLOYMENT_MODE=team</code> in your <code className="rounded bg-adv-dark px-1">.env</code> file and restart the server.
              </>
            ) : (
              <>
                <strong className="text-adv-off-white">Team mode:</strong> Multi-user setup with full audit trail, user attribution
                on reviews, and shared session management. Review statuses show who approved each AI output.
              </>
            )}
          </div>
        </div>
      </div>

      {/* Theme */}
      <div className="mb-6 rounded-xl border border-border bg-adv-card p-6">
        <h2 className="text-sm font-semibold text-adv-white">{t('settings.theme')}</h2>
        <p className="mt-1 text-xs text-adv-gray-med">{t('settings.themeDesc')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSetTheme(opt.value)}
              className={`${CHIP_BASE} ${theme === opt.value ? CHIP_ACTIVE : CHIP_INACTIVE}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Budget */}
      <div className="mb-6 rounded-xl border border-border bg-adv-card p-6">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-adv-teal" />
          <h2 className="text-sm font-semibold text-adv-white">{t('settings.budget')}</h2>
        </div>
        <p className="mt-1 text-xs text-adv-gray-med">
          {t('settings.budgetDesc')}
        </p>

        {/* Current month spending */}
        {spendingData && (
          <div className="mt-4 rounded-lg border border-border bg-adv-dark/50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-adv-gray">
                {t('settings.spendingThisMonth')} ({spendingData.month})
              </span>
              <span className="text-xs font-medium text-adv-off-white">
                €{spendingData.spent.toFixed(2)}
                {spendingData.cap > 0 && ` of €${spendingData.cap.toFixed(2)}`}
              </span>
            </div>
            {spendingData.cap > 0 && (
              <>
                {(() => {
                  const pct = Math.min((spendingData.spent / spendingData.cap) * 100, 100);
                  const barColor = pct >= 100 ? 'bg-adv-red' : pct >= 80 ? 'bg-adv-gold' : 'bg-adv-teal';
                  return (
                    <div className="h-2 rounded-full bg-adv-dark overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  );
                })()}
                {spendingData.spent >= spendingData.cap && (
                  <p className="mt-2 text-xs text-adv-red">
                    {t('settings.budgetCapReached')}
                  </p>
                )}
                {spendingData.spent >= spendingData.cap * 0.8 && spendingData.spent < spendingData.cap && (
                  <p className="mt-2 text-xs text-adv-gold">
                    {t('settings.over80Pct')}
                  </p>
                )}
              </>
            )}
            {spendingData.cap === 0 && (
              <p className="text-xs text-adv-gray-med">{t('settings.noSpendingLimit')}</p>
            )}
          </div>
        )}

        {/* Budget cap input */}
        <div className="mt-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-adv-gray">{t('settings.monthlyBudgetCap')}</label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-adv-gray-med text-xs">€</span>
              <input
                type="number"
                min={0}
                step={1}
                value={budgetCapInput}
                onChange={(e) => setBudgetCapInput(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-border bg-adv-dark pl-7 pr-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
              />
            </div>
            <p className="mt-1 text-xs text-adv-gray-med">{t('settings.zeroNoLimit')}</p>
          </div>
          <button
            onClick={saveBudgetCap}
            disabled={budgetSaving}
            className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
          >
            {budgetSaving ? t('settings.saving') : t('settings.save2')}
          </button>
          {budgetCap > 0 && (
            <button
              onClick={() => { setBudgetCapInput('0'); }}
              className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors"
            >
              {t('settings.noLimit')}
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-xl border border-border bg-adv-card p-6">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-adv-teal" />
          <h2 className="text-sm font-semibold text-adv-white">{t('settings.notifications')}</h2>
        </div>
        <p className="mt-1 text-xs text-adv-gray-med">
          {t('settings.notificationsDesc')}
        </p>
        <div className="mt-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div>
              <p className="text-sm text-adv-off-white">{t('settings.emailNotification')}</p>
              <p className="mt-0.5 text-xs text-adv-gray-med">
                {t('settings.emailNotificationDesc')}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={emailNotificationsEnabled}
              onClick={() => {
                setEmailNotificationsEnabled(!emailNotificationsEnabled);
                flash();
              }}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-adv-teal focus:ring-offset-2 focus:ring-offset-adv-card ${
                emailNotificationsEnabled ? 'bg-adv-teal' : 'bg-adv-gray-med/40'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  emailNotificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
        </div>
      </div>

      {/* Single Sign-On */}
      <div className="mt-6 rounded-xl border border-border bg-adv-card p-6">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="h-4 w-4 text-adv-teal" />
          <h2 className="text-sm font-semibold text-adv-white">Single Sign-On (Enterprise SSO)</h2>
        </div>
        <p className="text-xs text-adv-gray-med mb-4">
          OIDC-based SSO supports Azure AD, Okta, Auth0, and any OpenID Connect-compliant identity provider.
          Configure via environment variables and restart the server to enable the "Enterprise SSO" button on the login page.
        </p>

        {/* Status row */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-adv-gray">SSO status</span>
          <div className="flex items-center gap-2">
            <Circle className={`h-2 w-2 ${oidcEnabled ? 'fill-adv-green text-adv-green' : 'fill-adv-gray-med text-adv-gray-med'}`} />
            <span className="text-xs text-adv-gray-med">
              {oidcEnabled ? 'Configured' : 'Not configured'}
            </span>
          </div>
        </div>

        {/* Required env vars */}
        <div className="rounded-lg bg-adv-dark/50 p-3 text-xs text-adv-gray-med mb-4">
          <p className="mb-2 font-semibold text-adv-off-white">Required environment variables:</p>
          <pre className="text-adv-gray leading-relaxed whitespace-pre-wrap">
{`OIDC_ISSUER_URL=https://login.microsoftonline.com/{tenant}/v2.0
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=http://localhost:3001/api/auth/oidc/callback`}
          </pre>
          <p className="mt-2 text-adv-gray-med">
            Add these to your <code className="rounded bg-adv-dark px-1">.env</code> file and restart the server.
            The callback URL must be registered in your identity provider's application settings.
          </p>
        </div>

        {/* Test button and result */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={testSsoConnection}
            disabled={ssoTestStatus === 'testing'}
            className="flex items-center gap-2 rounded-lg bg-adv-teal-dim px-3 py-1.5 text-xs text-adv-teal hover:bg-adv-teal/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${ssoTestStatus === 'testing' ? 'animate-spin' : ''}`} />
            {ssoTestStatus === 'testing' ? 'Testing...' : 'Test SSO Connection'}
          </button>
          {ssoTestResult && (
            <span className={`text-xs ${ssoTestResult.ok ? 'text-adv-green' : 'text-adv-red'}`}>
              {ssoTestResult.ok
                ? `Connected — Issuer: ${ssoTestResult.issuer}`
                : `Failed: ${ssoTestResult.error}`}
            </span>
          )}
        </div>
      </div>

      {/* Brand Templates */}
      <div className="mt-6 rounded-xl border border-border bg-adv-card p-6">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="h-4 w-4 text-adv-teal" />
          <h2 className="text-sm font-semibold text-adv-white">{t('settings.brandTemplates')}</h2>
        </div>
        <p className="text-xs text-adv-gray-med mb-4">
          {t('settings.brandTemplatesDesc')}
        </p>

        <label className={`cursor-pointer inline-flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark transition-colors ${templateUploading ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload className="w-4 h-4" />
          {templateUploading ? t('settings.uploading') : t('settings.uploadTemplate')}
          <input
            type="file"
            accept=".docx,.pptx"
            className="hidden"
            onChange={handleTemplateUpload}
            disabled={templateUploading}
          />
        </label>

        {templates.length > 0 && (
          <div className="mt-4 divide-y divide-border">
            {templates.map((tpl) => (
              <div key={tpl.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-adv-gray" />
                  <span className="text-sm text-adv-off-white">{tpl.name}</span>
                  <span className="text-xs text-adv-gray-med">.{tpl.type}</span>
                  {tpl.file_size && (
                    <span className="text-xs text-adv-gray-med">
                      {(tpl.file_size / 1024).toFixed(0)} KB
                    </span>
                  )}
                </div>
                <button
                  onClick={() => deleteTemplate(tpl.id)}
                  className="rounded p-1 text-adv-gray hover:text-adv-red transition-colors"
                  title={t('settings.deleteTemplate')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {templates.length === 0 && (
          <p className="mt-4 text-xs text-adv-gray-med">{t('settings.noTemplatesYet')}</p>
        )}
      </div>

      {/* Brand Style — Typography & Color Palette */}
      <div className="mt-6 rounded-xl border border-border bg-adv-card p-6">
        <div className="flex items-center gap-2 mb-1">
          <Palette className="h-4 w-4 text-adv-teal" />
          <h2 className="text-sm font-semibold text-adv-white">Brand Style</h2>
        </div>
        <p className="text-xs text-adv-gray-med mb-5">
          Define your organisation's typography and colour palette. Used in exports (DOCX, PDF) and charts.
        </p>

        {/* Typography */}
        <h3 className="text-xs font-semibold text-adv-off-white uppercase tracking-wider mb-3">Typography</h3>
        <div className="space-y-2 mb-6">
          {([
            { key: 'body' as const, label: 'Body Text' },
            { key: 'h1' as const, label: 'Heading 1' },
            { key: 'h2' as const, label: 'Heading 2' },
            { key: 'h3' as const, label: 'Heading 3' },
            { key: 'h4' as const, label: 'Heading 4' },
          ]).map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3 rounded-lg border border-border bg-adv-dark px-3 py-2">
              <span className="w-20 shrink-0 text-xs font-medium text-adv-gray">{label}</span>
              <input
                type="text"
                value={brandConfig.fonts[key].family}
                onChange={(e) => updateFont(key, 'family', e.target.value)}
                className="w-28 rounded border border-border bg-adv-card px-2 py-1 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
                placeholder="Font family"
                title="Font family"
              />
              <input
                type="text"
                value={brandConfig.fonts[key].size}
                onChange={(e) => updateFont(key, 'size', e.target.value)}
                className="w-16 rounded border border-border bg-adv-card px-2 py-1 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
                placeholder="Size"
                title="Font size (e.g. 11pt)"
              />
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={brandConfig.fonts[key].color}
                  onChange={(e) => updateFont(key, 'color', e.target.value)}
                  className="h-6 w-6 cursor-pointer rounded border border-border bg-transparent"
                  title="Font colour"
                />
                <input
                  type="text"
                  value={brandConfig.fonts[key].color}
                  onChange={(e) => updateFont(key, 'color', e.target.value)}
                  className="w-20 rounded border border-border bg-adv-card px-2 py-1 text-xs text-adv-off-white font-mono focus:border-adv-teal focus:outline-none"
                  placeholder="#333333"
                  title="Hex colour code"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Colour Palette */}
        <h3 className="text-xs font-semibold text-adv-off-white uppercase tracking-wider mb-3">Primary Colour Palette</h3>
        <p className="text-xs text-adv-gray-med mb-3">
          Used in charts, graphs, and accent colours in exports. Default: Office Blue colour scheme.
        </p>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {brandConfig.palette.map((color, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1.5">
              <input
                type="color"
                value={color}
                onChange={(e) => updatePaletteColor(idx, e.target.value)}
                className="h-10 w-10 cursor-pointer rounded-lg border border-border bg-transparent"
                title={`Accent ${idx + 1}`}
              />
              <input
                type="text"
                value={color}
                onChange={(e) => updatePaletteColor(idx, e.target.value)}
                className="w-20 rounded border border-border bg-adv-card px-1.5 py-0.5 text-center text-[10px] text-adv-off-white font-mono focus:border-adv-teal focus:outline-none"
              />
              <span className="text-[9px] text-adv-gray-med">Accent {idx + 1}</span>
            </div>
          ))}
        </div>

        {/* Preview bar */}
        <div className="flex h-6 rounded-md overflow-hidden border border-border mb-5">
          {brandConfig.palette.map((color, idx) => (
            <div key={idx} className="flex-1" style={{ backgroundColor: color }} title={color} />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={saveBrandConfig}
            className="bg-adv-teal text-adv-dark rounded-lg px-4 py-2 text-sm font-medium hover:bg-adv-teal-dark transition-colors"
          >
            Save brand style
          </button>
          <button
            onClick={() => setBrandConfig(DEFAULT_BRAND_CONFIG)}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to defaults
          </button>
          {brandSaved && (
            <div className="flex items-center gap-1.5 text-adv-green text-sm font-medium">
              <Check className="h-3.5 w-3.5" />
              Saved
            </div>
          )}
        </div>
      </div>

      </>}
    </div>
  );
}
