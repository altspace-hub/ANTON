import { useState, useEffect } from 'react';

interface Props {
  onInputChange: (inputs: Record<string, unknown>) => void;
}

const AUDIENCES = [
  'Board of Directors',
  'Executive Committee',
  'Risk Committee',
  'Compliance Team',
  'Project Steering Group',
  'Full management team',
];

const SECTIONS = [
  'Executive Summary',
  'Scope & Methodology',
  'Key Findings',
  'RAG Assessment',
  'Detailed Analysis',
  'Recommendations',
  'Implementation Roadmap',
  'Resource Requirements',
  'Next Steps',
  'Appendices',
];

type Duration = '15' | '30' | '45' | '60';
type Tone = 'formal' | 'working' | 'workshop';

const DURATION_OPTIONS: { id: Duration; label: string; slides: string }[] = [
  { id: '15', label: '15 min', slides: '8-12 slides' },
  { id: '30', label: '30 min', slides: '15-20 slides' },
  { id: '45', label: '45 min', slides: '20-28 slides' },
  { id: '60', label: '60 min', slides: '25-35 slides' },
];

const TONE_OPTIONS: { id: Tone; label: string; description: string }[] = [
  { id: 'formal', label: 'Formal Board', description: 'Concise, decisive' },
  { id: 'working', label: 'Working Session', description: 'Detailed, interactive' },
  { id: 'workshop', label: 'Workshop', description: 'Facilitative, engaging' },
];

export default function ManagementPresentation({ onInputChange }: Props) {
  const [clientName, setClientName] = useState('');
  const [presentationTitle, setPresentationTitle] = useState('');
  const [presenterNames, setPresenterNames] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [duration, setDuration] = useState<Duration>('30');
  const [selectedSections, setSelectedSections] = useState<string[]>([
    'Executive Summary', 'Key Findings', 'Recommendations', 'Next Steps',
  ]);
  const [tone, setTone] = useState<Tone>('formal');
  const [keyMessages, setKeyMessages] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');

  useEffect(() => {
    onInputChange({
      clientName,
      presentationTitle,
      presenterNames,
      targetAudience,
      duration,
      sections: selectedSections,
      tone,
      keyMessages,
      specialInstructions,
    });
  }, [clientName, presentationTitle, presenterNames, targetAudience, duration, selectedSections, tone, keyMessages, specialInstructions]);

  const toggleSection = (s: string) => {
    setSelectedSections((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-adv-gray">Client name</label>
        <input
          type="text"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="e.g., Nordea, SEB, Handelsbanken"
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Presentation title</label>
        <input
          type="text"
          value={presentationTitle}
          onChange={(e) => setPresentationTitle(e.target.value)}
          placeholder="e.g., AML Gap Analysis — Key Findings & Recommendations"
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Presenter name(s)</label>
        <input
          type="text"
          value={presenterNames}
          onChange={(e) => setPresenterNames(e.target.value)}
          placeholder="e.g., Daniel Bardun, Jonas Karlsson"
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Target audience</label>
        <select
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        >
          <option value="">Select...</option>
          {AUDIENCES.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Duration</label>
        <div className="flex gap-1.5">
          {DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setDuration(opt.id)}
              className={`flex-1 rounded-lg border p-2 text-center transition-colors ${
                duration === opt.id
                  ? 'border-adv-teal bg-adv-teal-dim'
                  : 'border-border bg-adv-dark hover:border-adv-gray-med'
              }`}
            >
              <div className={`text-xs font-medium ${duration === opt.id ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                {opt.label}
              </div>
              <div className="text-xs text-adv-gray">{opt.slides}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Include sections</label>
        <div className="flex flex-wrap gap-1.5">
          {SECTIONS.map((s) => (
            <button
              key={s}
              onClick={() => toggleSection(s)}
              className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                selectedSections.includes(s)
                  ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                  : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Tone</label>
        <div className="flex gap-1.5">
          {TONE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setTone(opt.id)}
              className={`flex-1 rounded-lg border p-2 text-center transition-colors ${
                tone === opt.id
                  ? 'border-adv-teal bg-adv-teal-dim'
                  : 'border-border bg-adv-dark hover:border-adv-gray-med'
              }`}
            >
              <div className={`text-xs font-medium ${tone === opt.id ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                {opt.label}
              </div>
              <div className="text-xs text-adv-gray">{opt.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Key messages</label>
        <textarea
          value={keyMessages}
          onChange={(e) => setKeyMessages(e.target.value)}
          placeholder="3-5 takeaways that must land with the audience..."
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          rows={3}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-adv-gray">Special instructions (optional)</label>
        <textarea
          value={specialInstructions}
          onChange={(e) => setSpecialInstructions(e.target.value)}
          placeholder="Any specific requirements for style, branding, or content emphasis..."
          className="w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          rows={2}
        />
      </div>
    </div>
  );
}
