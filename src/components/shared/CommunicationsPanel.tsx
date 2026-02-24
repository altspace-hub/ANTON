import { useState } from 'react';
import { MessageSquare, ChevronDown, ChevronRight } from 'lucide-react';

interface CommunicationsPanelProps {
  audience: string;
  channel: string;
  outputLanguage: string;
  onAudienceChange: (v: string) => void;
  onChannelChange: (v: string) => void;
  onOutputLanguageChange: (v: string) => void;
}

const AUDIENCES = [
  { id: 'board', label: 'Board' },
  { id: 'regulator', label: 'Regulator' },
  { id: 'customer', label: 'Customer' },
  { id: 'employee', label: 'Employee' },
  { id: 'media', label: 'Media' },
  { id: 'investor', label: 'Investor' },
  { id: 'public', label: 'Public' },
  { id: 'technical', label: 'Technical' },
];

const CHANNELS = [
  { id: 'email', label: 'Email' },
  { id: 'presentation', label: 'Presentation' },
  { id: 'report', label: 'Report' },
  { id: 'social', label: 'Social Post' },
  { id: 'press-release', label: 'Press Release' },
  { id: 'meeting-brief', label: 'Meeting Brief' },
  { id: 'policy-doc', label: 'Policy Doc' },
];

const LANGUAGES = [
  // European Languages (14)
  { code: 'en', label: 'English', region: 'Europe' },
  { code: 'sv', label: 'Svenska (Swedish)', region: 'Europe' },
  { code: 'de', label: 'Deutsch (German)', region: 'Europe' },
  { code: 'fr', label: 'Fran\u00e7ais (French)', region: 'Europe' },
  { code: 'es', label: 'Espa\u00f1ol (Spanish)', region: 'Europe' },
  { code: 'it', label: 'Italiano (Italian)', region: 'Europe' },
  { code: 'pt', label: 'Portugu\u00eas (Portuguese)', region: 'Europe' },
  { code: 'nl', label: 'Nederlands (Dutch)', region: 'Europe' },
  { code: 'pl', label: 'Polski (Polish)', region: 'Europe' },
  { code: 'da', label: 'Dansk (Danish)', region: 'Europe' },
  { code: 'no', label: 'Norsk (Norwegian)', region: 'Europe' },
  { code: 'fi', label: 'Suomi (Finnish)', region: 'Europe' },
  { code: 'cs', label: '\u010ce\u0161tina (Czech)', region: 'Europe' },
  { code: 'ro', label: 'Rom\u00e2n\u0103 (Romanian)', region: 'Europe' },

  // Asian Languages (8)
  { code: 'zh', label: '\u4e2d\u6587 (Chinese)', region: 'Asia' },
  { code: 'ja', label: '\u65e5\u672c\u8a9e (Japanese)', region: 'Asia' },
  { code: 'ko', label: '\ud55c\uad6d\uc5b4 (Korean)', region: 'Asia' },
  { code: 'th', label: '\u0e44\u0e17\u0e22 (Thai)', region: 'Asia' },
  { code: 'vi', label: 'Ti\u1ebfng Vi\u1ec7t (Vietnamese)', region: 'Asia' },
  { code: 'id', label: 'Bahasa Indonesia (Indonesian)', region: 'Asia' },
  { code: 'ms', label: 'Bahasa Melayu (Malay)', region: 'Asia' },
  { code: 'tl', label: 'Tagalog (Filipino)', region: 'Asia' },

  // Middle East & Africa (4)
  { code: 'ar', label: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629 (Arabic)', region: 'Middle East' },
  { code: 'he', label: '\u05e2\u05d1\u05e8\u05d9\u05ea (Hebrew)', region: 'Middle East' },
  { code: 'tr', label: 'T\u00fcrk\u00e7e (Turkish)', region: 'Middle East' },
  { code: 'fa', label: '\u0641\u0627\u0631\u0633\u06cc (Persian)', region: 'Middle East' },

  // Americas (4)
  { code: 'pt-BR', label: 'Portugu\u00eas (Brasil)', region: 'Americas' },
  { code: 'es-MX', label: 'Espa\u00f1ol (M\u00e9xico)', region: 'Americas' },
  { code: 'fr-CA', label: 'Fran\u00e7ais (Canada)', region: 'Americas' },
  { code: 'en-US', label: 'English (US)', region: 'Americas' },
];

function buildSummary(audience: string, channel: string, outputLanguage: string): string {
  const parts: string[] = [];
  if (audience) {
    const a = AUDIENCES.find((x) => x.id === audience);
    parts.push(`For: ${a?.label ?? audience}`);
  }
  if (channel) {
    const c = CHANNELS.find((x) => x.id === channel);
    parts.push(`Via: ${c?.label ?? channel}`);
  }
  if (outputLanguage && outputLanguage !== 'en') {
    const l = LANGUAGES.find((x) => x.code === outputLanguage);
    const shortLabel = l?.label.split(' ')[0] ?? outputLanguage;
    parts.push(shortLabel);
  }
  return parts.length > 0 ? parts.join(' \u00b7 ') : 'Communications';
}

export default function CommunicationsPanel({
  audience,
  channel,
  outputLanguage,
  onAudienceChange,
  onChannelChange,
  onOutputLanguageChange,
}: CommunicationsPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const summary = buildSummary(audience, channel, outputLanguage);
  const hasSelections = audience || channel || (outputLanguage && outputLanguage !== 'en');

  return (
    <div className="rounded-xl border border-border bg-adv-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className={`h-4 w-4 ${hasSelections ? 'text-adv-teal' : 'text-adv-gray'}`} />
          <span className={`text-sm font-medium ${hasSelections ? 'text-adv-off-white' : 'text-adv-gray'}`}>
            {summary}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-adv-gray-med" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-adv-gray-med" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          {/* Section 1: Audience */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-adv-gray">
              Audience
            </label>
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCES.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onAudienceChange(audience === a.id ? '' : a.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    audience === a.id
                      ? 'bg-adv-teal/20 text-adv-teal border border-adv-teal/40'
                      : 'bg-adv-dark border border-border text-adv-gray hover:border-adv-teal/30 hover:text-adv-off-white'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Channel */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-adv-gray">
              Channel
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onChannelChange(channel === c.id ? '' : c.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    channel === c.id
                      ? 'bg-adv-teal/20 text-adv-teal border border-adv-teal/40'
                      : 'bg-adv-dark border border-border text-adv-gray hover:border-adv-teal/30 hover:text-adv-off-white'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Section 3: Output Language */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-adv-gray">
              Output Language
            </label>
            <select
              value={outputLanguage}
              onChange={(e) => onOutputLanguageChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus:ring-1 focus:ring-adv-teal"
            >
              <option value="en">Auto-detect from user input</option>
              {['Europe', 'Asia', 'Middle East', 'Americas'].map((region) => (
                <optgroup key={region} label={region}>
                  {LANGUAGES.filter((l) => l.region === region).map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
