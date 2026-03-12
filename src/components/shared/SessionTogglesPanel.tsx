import { type ReactNode } from 'react';
import { Pen, Smile, BrainCog, Eye, EyeOff, AlertTriangle, Zap, Database } from 'lucide-react';

type WritingTone = 'formal' | 'professional' | 'casual' | 'conversational';

interface SessionTogglesPanelProps {
  writingTone: WritingTone;
  emojiEnabled: boolean;
  metaCognitiveEnabled: boolean;
  transparencyLevel: 0 | 1 | 2;
  nativeReasoningEnabled: boolean;
  atomInjectionEnabled: boolean;
  atomCollectionEnabled: boolean;
  currentModel: string;
  onWritingToneChange: (tone: WritingTone) => void;
  onEmojiChange: (enabled: boolean) => void;
  onMetaCognitiveChange: (enabled: boolean) => void;
  onTransparencyChange: (level: 0 | 1 | 2) => void;
  onNativeReasoningChange: (enabled: boolean) => void;
  onAtomInjectionChange: (enabled: boolean) => void;
  onAtomCollectionChange: (enabled: boolean) => void;
}

const TONE_OPTIONS: { value: WritingTone; label: string }[] = [
  { value: 'formal', label: 'Formal' },
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'conversational', label: 'Conversational' },
];

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <div className="relative shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <div className="h-5 w-9 rounded-full bg-adv-dark transition-colors peer-checked:bg-adv-teal" />
        <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-adv-gray-med transition-transform peer-checked:translate-x-4 peer-checked:bg-white" />
      </div>
      {label}
    </label>
  );
}

function estimateTokenImpact(metaCognitiveEnabled: boolean, writingTone: WritingTone): string {
  let pct = 0;
  if (metaCognitiveEnabled) pct += 30;
  if (writingTone === 'formal') pct += 10;
  if (writingTone === 'conversational') pct += 5;
  if (pct === 0) return '~Standard';
  if (pct <= 15) return '~+20%';
  if (pct <= 35) return '~+30%';
  return '~+50%';
}

export default function SessionTogglesPanel({
  writingTone,
  emojiEnabled,
  metaCognitiveEnabled,
  transparencyLevel,
  nativeReasoningEnabled,
  atomInjectionEnabled,
  atomCollectionEnabled,
  currentModel,
  onWritingToneChange,
  onEmojiChange,
  onMetaCognitiveChange,
  onTransparencyChange,
  onNativeReasoningChange,
  onAtomInjectionChange,
  onAtomCollectionChange,
}: SessionTogglesPanelProps) {
  const isOpusOrSonnet =
    currentModel === 'claude-opus-4-6' || currentModel === 'claude-sonnet-4-6' || currentModel === 'claude-sonnet-4-5-20250929';
  return (
    <div className="rounded-xl border border-border bg-adv-card p-4 space-y-4">
      {/* ── Output Controls ── */}
      <div>
        <div className="mb-3 flex items-center gap-1.5">
          <Pen className="h-3.5 w-3.5 text-adv-teal" />
          <span className="text-xs font-medium text-adv-off-white">Output Controls</span>
        </div>

        {/* Writing Tone chips */}
        <div className="mb-3">
          <div className="mb-1.5 text-[11px] text-adv-gray">Writing Tone</div>
          <div className="flex flex-wrap gap-1.5">
            {TONE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => onWritingToneChange(value)}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  writingTone === value
                    ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                    : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Emoji toggle */}
        <div className="flex items-center justify-between">
          <ToggleSwitch
            checked={emojiEnabled}
            onChange={onEmojiChange}
            label={
              <div className="flex items-center gap-1.5 text-xs text-adv-off-white">
                <Smile className="h-3.5 w-3.5 text-adv-gray" />
                <span>Emoji in output</span>
                <span className="text-xs text-adv-gray">{emojiEnabled ? 'On' : 'Off'}</span>
              </div>
            }
          />
        </div>
      </div>

      <div className="border-t border-border" />

      {/* ── Reasoning ── */}
      <div>
        <div className="mb-3 flex items-center gap-1.5">
          <BrainCog className="h-3.5 w-3.5 text-adv-gold" />
          <span className="text-xs font-medium text-adv-off-white">Reasoning</span>
        </div>

        {/* Structured Reasoning toggle */}
        <div className="mb-3">
          <ToggleSwitch
            checked={metaCognitiveEnabled}
            onChange={onMetaCognitiveChange}
            label={
              <div>
                <div className="text-xs text-adv-off-white">Structured Reasoning</div>
                <p className="mt-0.5 text-xs text-adv-gray">
                  {metaCognitiveEnabled
                    ? 'Deep analysis with confidence scoring'
                    : 'Standard'}
                </p>
              </div>
            }
          />
        </div>

        {/* Native Reasoning Boost toggle — only shown for Opus and Sonnet */}
        {isOpusOrSonnet && (
          <div className="mb-3">
            <div className="flex items-center justify-between">
              <ToggleSwitch
                checked={nativeReasoningEnabled}
                onChange={onNativeReasoningChange}
                label={
                  <div className="flex items-start gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-adv-off-white">
                        <Zap className="h-3 w-3 text-adv-gold" />
                        Native Reasoning Boost
                      </div>
                      <p className="mt-0.5 text-xs text-adv-gray">
                        Forces maximum extended thinking. Best for highly complex analysis. Significant cost increase.
                      </p>
                    </div>
                  </div>
                }
              />
              {nativeReasoningEnabled && (
                <span className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-full border border-adv-gold/40 bg-adv-gold/10 px-2 py-0.5 text-xs font-medium text-adv-gold">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  High cost
                </span>
              )}
            </div>
          </div>
        )}

        {/* Transparency level */}
        <div>
          <div className="mb-1.5 text-[11px] text-adv-gray">Approach Transparency</div>
          <div className="flex gap-1.5">
            {([
              { level: 0 as const, label: 'Off', icon: <EyeOff className="h-3 w-3" /> },
              { level: 1 as const, label: 'Summary', icon: <Eye className="h-3 w-3" /> },
              { level: 2 as const, label: 'Detailed', icon: <Eye className="h-3 w-3" /> },
            ]).map(({ level, label, icon }) => (
              <button
                key={level}
                type="button"
                onClick={() => onTransparencyChange(level)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                  transparencyLevel === level
                    ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                    : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border" />

      {/* ── Knowledge Memory ── */}
      <div>
        <div className="mb-3 flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5 text-adv-blue" />
          <span className="text-xs font-medium text-adv-off-white">Knowledge Memory</span>
        </div>

        <div className="mb-3">
          <ToggleSwitch
            checked={atomInjectionEnabled}
            onChange={onAtomInjectionChange}
            label={
              <div>
                <div className="text-xs text-adv-off-white">Use prior insights</div>
                <p className="mt-0.5 text-xs text-adv-gray">
                  {atomInjectionEnabled
                    ? 'Recent findings injected as context'
                    : 'Clean slate — no prior knowledge used'}
                </p>
              </div>
            }
          />
        </div>

        <div>
          <ToggleSwitch
            checked={atomCollectionEnabled}
            onChange={onAtomCollectionChange}
            label={
              <div>
                <div className="text-xs text-adv-off-white">Collect insights</div>
                <p className="mt-0.5 text-xs text-adv-gray">
                  {atomCollectionEnabled
                    ? 'Responses contribute to knowledge base'
                    : 'Playground mode — nothing saved'}
                </p>
              </div>
            }
          />
        </div>
      </div>

      {/* Token impact indicator */}
      <div className="border-t border-border pt-2">
        <div className="text-xs text-adv-gray">
          Token impact: {estimateTokenImpact(metaCognitiveEnabled, writingTone)}
        </div>
      </div>
    </div>
  );
}
