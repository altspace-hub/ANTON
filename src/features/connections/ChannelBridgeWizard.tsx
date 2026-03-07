/**
 * ChannelBridgeWizard.tsx
 * 4-step wizard for creating a new Channel Bridge.
 * Steps: Type → Modules → Limits → Review & Copy Token
 */

import React, { useState } from 'react';
import {
  MessageSquare,
  Send,
  Phone,
  Mic,
  Globe,
  Check,
  Copy,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  X,
} from 'lucide-react';
import type { ChannelBridge, ChannelType } from './types';

// ── Module list ───────────────────────────────────────────

const MODULES = [
  { id: 'gap-analysis',          label: 'AMLR Gap Analysis' },
  { id: 'document-creation',     label: 'Document Creation' },
  { id: 'sanctions-advisory',    label: 'Sanctions Advisory' },
  { id: 'regulatory-monitor',    label: 'Regulatory Monitor' },
  { id: 'training-content',      label: 'Training Content Creator' },
  { id: 'data-management',       label: 'AMLA Data Management' },
  { id: 'risk-assessment',       label: 'Risk Assessment Support' },
  { id: 'investigation-support', label: 'Investigation & Case Support' },
];

// ── Channel type definitions ──────────────────────────────

const CHANNEL_TYPES: {
  id: ChannelType;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: <MessageSquare className="w-6 h-6" />,
    description: 'WhatsApp Business Cloud API webhook integration.',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: <Send className="w-6 h-6" />,
    description: 'Telegram Bot API webhook integration.',
  },
  {
    id: 'sms',
    label: 'SMS Gateway',
    icon: <Phone className="w-6 h-6" />,
    description: 'Twilio, Vonage, or any SMS provider webhook.',
  },
  {
    id: 'voice',
    label: 'Voice / IVR',
    icon: <Mic className="w-6 h-6" />,
    description: 'Telephony / IVR integration via text-to-speech.',
  },
  {
    id: 'generic_http',
    label: 'Generic HTTP',
    icon: <Globe className="w-6 h-6" />,
    description: 'Any custom application that can make HTTP requests.',
  },
];

// ── Props ─────────────────────────────────────────────────

interface ChannelBridgeWizardProps {
  onCreated: (bridge: ChannelBridge) => void;
  onCancel: () => void;
}

// ── Component ─────────────────────────────────────────────

export function ChannelBridgeWizard({ onCreated, onCancel }: ChannelBridgeWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenConfirmed, setTokenConfirmed] = useState(false);
  const [createdBridge, setCreatedBridge] = useState<ChannelBridge | null>(null);

  // Step 1 — Type
  const [displayName, setDisplayName] = useState('');
  const [channelType, setChannelType] = useState<ChannelType>('generic_http');

  // Step 2 — Modules
  const [allModules, setAllModules] = useState(true);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [defaultModule, setDefaultModule] = useState('gap-analysis');

  // Step 3 — Limits
  const [rateLimitRpm, setRateLimitRpm] = useState(60);
  const [maxResponseLength, setMaxResponseLength] = useState(1500);
  const [languageHint, setLanguageHint] = useState('en');

  // ── Helpers ──

  function toggleModule(id: string) {
    setSelectedModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  async function copyToken() {
    if (!createdBridge?.token_plain) return;
    await navigator.clipboard.writeText(createdBridge.token_plain);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 3000);
  }

  async function copyEndpoint() {
    if (!createdBridge?.endpoint_url) return;
    await navigator.clipboard.writeText(createdBridge.endpoint_url);
  }

  async function handleCreate() {
    setSaving(true);
    setError('');
    try {
      const body = {
        display_name: displayName.trim(),
        channel_type: channelType,
        allowed_modules: allModules ? ['*'] : selectedModules.length > 0 ? selectedModules : ['*'],
        default_module: defaultModule,
        rate_limit_rpm: rateLimitRpm,
        max_response_length: maxResponseLength,
        language_hint: languageHint,
      };

      const res = await fetch('/api/bridges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || 'Failed to create bridge');
      }

      const bridge = await res.json() as ChannelBridge;
      setCreatedBridge(bridge);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSaving(false);
    }
  }

  function handleFinish() {
    if (createdBridge) onCreated(createdBridge);
  }

  // ── Step validation ──

  const step1Valid = displayName.trim().length > 0;
  const step2Valid = allModules || selectedModules.length > 0;

  // ── Render ──

  const stepLabels = ['Type', 'Modules', 'Limits', 'Copy Token'];

  return (
    <div className="rounded-xl border border-border bg-adv-card p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-adv-white">New Channel Bridge</h3>
          <p className="text-xs text-adv-gray mt-0.5">
            Generate a secure HTTP endpoint for your messaging bot or SMS gateway.
          </p>
        </div>
        <button onClick={onCancel} className="text-adv-gray hover:text-adv-off-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {stepLabels.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <React.Fragment key={label}>
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    done
                      ? 'bg-adv-teal text-adv-dark'
                      : active
                      ? 'bg-adv-teal text-adv-dark'
                      : 'bg-adv-dark border border-border text-adv-gray'
                  }`}
                >
                  {done ? <Check className="w-3 h-3" /> : n}
                </div>
                <span
                  className={`text-xs ${
                    active ? 'text-adv-off-white font-medium' : 'text-adv-gray'
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < stepLabels.length - 1 && (
                <div className="flex-1 h-px bg-border" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── STEP 1: Type ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-adv-off-white mb-1.5">
              Bridge name <span className="text-adv-red">*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. NGO Partner WhatsApp Bot"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-adv-off-white mb-2">
              Channel type
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CHANNEL_TYPES.map((ct) => (
                <button
                  key={ct.id}
                  onClick={() => setChannelType(ct.id)}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    channelType === ct.id
                      ? 'border-adv-teal bg-adv-teal-dim text-adv-white'
                      : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray hover:text-adv-off-white'
                  }`}
                >
                  <span
                    className={`mt-0.5 ${channelType === ct.id ? 'text-adv-teal' : 'text-adv-gray'}`}
                  >
                    {ct.icon}
                  </span>
                  <div>
                    <div className="text-sm font-medium">{ct.label}</div>
                    <div className="text-xs text-adv-gray mt-0.5">{ct.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Modules ── */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-adv-off-white mb-2">
              Which modules can be called through this bridge?
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={allModules}
                  onChange={() => setAllModules(true)}
                  className="accent-adv-teal"
                />
                <span className="text-sm text-adv-off-white">All modules (recommended)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!allModules}
                  onChange={() => setAllModules(false)}
                  className="accent-adv-teal"
                />
                <span className="text-sm text-adv-off-white">Specific modules only</span>
              </label>
            </div>
          </div>

          {!allModules && (
            <div>
              <label className="block text-xs text-adv-gray mb-2">Select allowed modules:</label>
              <div className="flex flex-wrap gap-2">
                {MODULES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => toggleModule(m.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      selectedModules.includes(m.id)
                        ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                        : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {selectedModules.length === 0 && (
                <p className="text-xs text-adv-gold mt-2">Select at least one module.</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-adv-off-white mb-1.5">
              Default module (used when caller doesn't specify)
            </label>
            <select
              value={defaultModule}
              onChange={(e) => setDefaultModule(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              {MODULES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── STEP 3: Limits ── */}
      {step === 3 && (
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-adv-off-white">
                Rate limit (requests per minute)
              </label>
              <span className="text-xs font-mono text-adv-teal">{rateLimitRpm} rpm</span>
            </div>
            <input
              type="range"
              min={10}
              max={300}
              step={10}
              value={rateLimitRpm}
              onChange={(e) => setRateLimitRpm(Number(e.target.value))}
              className="w-full accent-adv-teal"
            />
            <div className="flex justify-between text-xs text-adv-gray mt-1">
              <span>10 rpm</span>
              <span>300 rpm</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-adv-off-white">
                Max response length (characters)
              </label>
              <span className="text-xs font-mono text-adv-teal">{maxResponseLength} chars</span>
            </div>
            <input
              type="range"
              min={300}
              max={3000}
              step={100}
              value={maxResponseLength}
              onChange={(e) => setMaxResponseLength(Number(e.target.value))}
              className="w-full accent-adv-teal"
            />
            <div className="flex justify-between text-xs text-adv-gray mt-1">
              <span>300 (SMS)</span>
              <span>3000 (chat)</span>
            </div>
            <p className="text-xs text-adv-gray mt-1">
              WhatsApp: ~1500. SMS: ~300. Chat: up to 3000.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-adv-off-white mb-1.5">
              Language hint
            </label>
            <select
              value={languageHint}
              onChange={(e) => setLanguageHint(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              <option value="en">English</option>
              <option value="sv">Swedish</option>
              <option value="fi">Finnish</option>
              <option value="no">Norwegian</option>
              <option value="da">Danish</option>
              <option value="de">German</option>
              <option value="fr">French</option>
              <option value="nl">Dutch</option>
              <option value="es">Spanish</option>
              <option value="pt">Portuguese</option>
            </select>
            <p className="text-xs text-adv-gray mt-1">
              Claude will respond in this language unless overridden per-request.
            </p>
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-border bg-adv-dark p-3 text-xs text-adv-gray space-y-1">
            <div className="font-medium text-adv-off-white mb-1">Configuration summary</div>
            <div>
              Name: <span className="text-adv-off-white">{displayName}</span>
            </div>
            <div>
              Channel:{' '}
              <span className="text-adv-off-white capitalize">{channelType.replace('_', ' ')}</span>
            </div>
            <div>
              Modules:{' '}
              <span className="text-adv-off-white">
                {allModules
                  ? 'All modules'
                  : `${selectedModules.length} selected`}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 4: Token & Endpoint ── */}
      {step === 4 && createdBridge && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-adv-gold bg-adv-gold/10 p-3">
            <AlertTriangle className="w-4 h-4 text-adv-gold flex-shrink-0 mt-0.5" />
            <div className="text-xs text-adv-gold">
              <strong>Copy your token now.</strong> It will not be shown again after you close this
              dialog.
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-adv-off-white mb-1.5">
              Bridge endpoint URL
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded border border-border bg-adv-dark px-3 py-2 text-xs text-adv-teal font-mono break-all">
                {createdBridge.endpoint_url}
              </code>
              <button
                onClick={copyEndpoint}
                className="flex-shrink-0 rounded border border-border bg-adv-card px-2 py-2 text-adv-gray hover:text-adv-off-white transition-colors"
                title="Copy endpoint URL"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-adv-off-white mb-1.5">
              Bearer token <span className="text-adv-red">(shown once only)</span>
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded border border-adv-gold bg-adv-dark px-3 py-2 text-xs text-adv-gold font-mono break-all">
                {createdBridge.token_plain}
              </code>
              <button
                onClick={copyToken}
                className={`flex-shrink-0 rounded border px-2 py-2 transition-colors ${
                  tokenCopied
                    ? 'border-adv-green bg-adv-green/10 text-adv-green'
                    : 'border-border bg-adv-card text-adv-gray hover:text-adv-off-white'
                }`}
                title="Copy token"
              >
                {tokenCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-adv-dark p-3 text-xs text-adv-gray space-y-1">
            <div className="font-medium text-adv-off-white mb-1">Usage example (curl)</div>
            <code className="block text-adv-gray font-mono whitespace-pre-wrap break-all">
              {`curl -X POST ${createdBridge.endpoint_url} \\\n  -H "Authorization: Bearer ${createdBridge.token_plain?.substring(0, 8)}..." \\\n  -H "Content-Type: application/json" \\\n  -d '{"message":"What is AMLR?"}'`}
            </code>
          </div>

          <div className="rounded-lg border border-border bg-adv-teal-soft p-3 text-xs text-adv-gray">
            <strong className="text-adv-off-white">Bridge status:</strong> Pending approval.
            An admin must approve this bridge in the Channel Bridges panel before it goes live.
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={tokenConfirmed}
              onChange={(e) => setTokenConfirmed(e.target.checked)}
              className="accent-adv-teal"
            />
            <span className="text-xs text-adv-off-white">I have copied the token</span>
          </label>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-adv-red/30 bg-adv-red/10 px-3 py-2 text-xs text-adv-red">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <button
          onClick={step === 1 ? onCancel : () => setStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
          disabled={step === 4}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-adv-gray hover:text-adv-off-white transition-colors disabled:opacity-40"
        >
          {step === 1 ? (
            'Cancel'
          ) : (
            <>
              <ChevronLeft className="w-3.5 h-3.5" />
              Back
            </>
          )}
        </button>

        {step < 3 && (
          <button
            onClick={() => setStep((s) => (s + 1) as 2 | 3 | 4)}
            disabled={step === 1 ? !step1Valid : !step2Valid}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-40"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}

        {step === 3 && (
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-40"
          >
            {saving ? 'Creating…' : 'Create Bridge'}
            {!saving && <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}

        {step === 4 && (
          <button
            onClick={handleFinish}
            disabled={!tokenConfirmed}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-40"
          >
            <Check className="w-3.5 h-3.5" />
            Done
          </button>
        )}
      </div>
    </div>
  );
}
