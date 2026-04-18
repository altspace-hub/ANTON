import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Loader2, Languages } from 'lucide-react';

/**
 * Voice-first symptom capture.
 *
 * Uses the browser Web Speech API (SpeechRecognition) when available
 * (Chrome / Edge / most mobile WebViews). On Firefox / Safari Desktop the
 * API is missing, so we render a "voice unavailable" hint and keep the
 * user typing in the textarea. The textarea is always editable — voice
 * is an accelerator, not a gate.
 *
 * Locale comes from the project's working_language. Falls back to 'en-US'.
 */

type SpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognition;

const RecognitionCtor: SpeechRecognitionConstructor | null =
  typeof window !== 'undefined'
    ? ((window as unknown as Record<string, unknown>).SpeechRecognition
       || (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as SpeechRecognitionConstructor | null
    : null;

interface Props {
  value: string;
  onChange: (text: string) => void;
  workingLanguage?: string;     // ISO 639-1, e.g. 'en' / 'sv' / 'fr'
  placeholder?: string;
  onSubmit?: () => void;        // optional Enter-to-submit
}

export default function VoiceSymptomCapture({ value, onChange, workingLanguage, placeholder, onSubmit }: Props) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recogRef = useRef<SpeechRecognition | null>(null);
  const baseRef = useRef<string>('');

  const langTag = workingLanguage ? mapToBcp47(workingLanguage) : 'en-US';
  const supported = !!RecognitionCtor;

  const start = () => {
    if (!RecognitionCtor) return;
    setError(null);
    const r = new RecognitionCtor();
    r.lang = langTag;
    r.continuous = true;
    r.interimResults = true;
    baseRef.current = value;

    r.onresult = (event) => {
      let combined = '';
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results[i][0].transcript;
      }
      const next = baseRef.current
        ? baseRef.current.replace(/\s+$/, '') + ' ' + combined
        : combined;
      onChange(next);
    };
    r.onerror = (e) => {
      setError(`Voice input error: ${e.error}`);
      setListening(false);
    };
    r.onend = () => setListening(false);

    recogRef.current = r;
    try {
      r.start();
      setListening(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start voice');
    }
  };

  const stop = () => {
    recogRef.current?.stop();
    recogRef.current = null;
  };

  useEffect(() => () => recogRef.current?.stop(), []);

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? 'Describe what the device is doing — what changed, what you see, what you have already tried…'}
          rows={4}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) {
              e.preventDefault();
              onSubmit();
            }
          }}
          className="flex-1 bg-adv-card border border-adv-gray/30 rounded p-2 text-sm leading-snug"
        />
        <button
          type="button"
          onClick={listening ? stop : start}
          disabled={!supported}
          title={
            !supported ? 'Voice input is not supported in this browser. Type instead.' :
            listening ? 'Stop voice capture' : `Hold to talk (${langTag})`
          }
          className={`shrink-0 p-2 rounded border transition ${
            !supported ? 'border-adv-gray/30 text-adv-gray cursor-not-allowed' :
            listening ? 'border-red-500/50 bg-red-500/10 text-red-400 animate-pulse' :
            'border-adv-teal/40 hover:bg-adv-teal/10 text-adv-teal'
          }`}
        >
          {listening ? <Loader2 className="w-5 h-5 animate-spin" /> : supported ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>
      </div>
      <div className="flex items-center justify-between text-xs text-adv-gray">
        <span className="flex items-center gap-1">
          <Languages className="w-3 h-3" />
          {workingLanguage ? `Working language: ${workingLanguage} (${langTag})` : 'Default language: en-US'}
        </span>
        {!supported && (
          <span className="text-amber-400">Voice not supported in this browser — type instead.</span>
        )}
        {error && <span className="text-red-400">{error}</span>}
      </div>
    </div>
  );
}

function mapToBcp47(iso639: string): string {
  // Best-effort map from ISO 639-1 to BCP 47 the SpeechRecognition API uses.
  const map: Record<string, string> = {
    en: 'en-US', sv: 'sv-SE', fi: 'fi-FI', no: 'nb-NO', da: 'da-DK',
    de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-PT',
    nl: 'nl-NL', pl: 'pl-PL', ru: 'ru-RU', uk: 'uk-UA', tr: 'tr-TR',
    ar: 'ar-SA', he: 'he-IL', hi: 'hi-IN', bn: 'bn-IN', ur: 'ur-PK',
    zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', th: 'th-TH', vi: 'vi-VN',
    id: 'id-ID', ms: 'ms-MY', tl: 'fil-PH',
    sw: 'sw-KE', am: 'am-ET', yo: 'yo-NG', ig: 'ig-NG', ha: 'ha-NG',
    fr_west_africa: 'fr-SN',
  };
  return map[iso639.toLowerCase()] ?? iso639;
}
