import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Code, Search, Wrench, ChevronRight } from 'lucide-react';
import SchoolLayout from '@/components/school/SchoolLayout';

type ProgrammingLanguage = 'python' | 'javascript' | 'scratch';

interface CodingModule {
  id: string;
  titleKey: string;
  descKey: string;
  icon: React.ReactNode;
  exampleKey: string;
  assistanceDefault: string;
}

const CODING_MODULES: CodingModule[] = [
  {
    id: 'code-explainer',
    titleKey: 'coding.explainerTitle',
    descKey: 'coding.explainerDesc',
    icon: <Search className="h-6 w-6 text-adv-teal" />,
    exampleKey: 'coding.explainerExample',
    assistanceDefault: 'L2',
  },
  {
    id: 'code-mentor',
    titleKey: 'coding.mentorTitle',
    descKey: 'coding.mentorDesc',
    icon: <Code className="h-6 w-6 text-adv-teal" />,
    exampleKey: 'coding.mentorExample',
    assistanceDefault: 'L2',
  },
  {
    id: 'debug-guide',
    titleKey: 'coding.debugTitle',
    descKey: 'coding.debugDesc',
    icon: <Wrench className="h-6 w-6 text-adv-teal" />,
    exampleKey: 'coding.debugExample',
    assistanceDefault: 'L2',
  },
];

const LANGUAGES: { id: ProgrammingLanguage; label: string }[] = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'scratch', label: 'Scratch' },
];

export default function SchoolCodingPage() {
  const { t } = useTranslation('school');
  const navigate = useNavigate();
  const [language, setLanguage] = useState<ProgrammingLanguage>('python');

  function handleStart(moduleId: string) {
    sessionStorage.setItem('coding_language', language);
    navigate(`/school/coding/${moduleId}`);
  }

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-adv-white">
            {t('coding.title', 'Computational Thinking')}
          </h1>
          <p className="mt-0.5 text-sm text-adv-gray-med">
            {t('coding.subtitle', 'Learn to code with Alma\'s guidance')}
          </p>
        </div>

        {/* Language selector */}
        <div className="rounded-xl border border-border bg-adv-card p-4">
          <label className="mb-2 block text-xs font-medium uppercase tracking-widest text-adv-gray-med">
            {t('coding.language', 'Programming language')}
          </label>
          <div className="flex gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.id}
                type="button"
                onClick={() => setLanguage(lang.id)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-adv-teal ${
                  language === lang.id
                    ? 'border-adv-teal bg-adv-teal/10 text-adv-teal'
                    : 'border-border text-adv-gray hover:border-adv-teal/50 hover:text-adv-off-white'
                }`}
              >
                {t(`coding.${lang.id}`, lang.label)}
              </button>
            ))}
          </div>
        </div>

        {/* Module cards */}
        <div className="space-y-3">
          {CODING_MODULES.map((mod) => (
            <div
              key={mod.id}
              className="rounded-xl border border-border bg-adv-card p-5"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-adv-teal/10">
                  {mod.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-adv-white">
                      {t(mod.titleKey, mod.id)}
                    </h2>
                    <span className="rounded-full border border-adv-teal/30 bg-adv-teal/5 px-2 py-0.5 text-xs font-medium text-adv-teal">
                      {mod.assistanceDefault}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-adv-gray">
                    {t(mod.descKey, mod.descKey)}
                  </p>
                  <p className="mt-2 text-xs italic text-adv-gray-med">
                    {t(mod.exampleKey, '')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleStart(mod.id)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
                >
                  Start
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Info box */}
        <div className="rounded-xl border border-adv-teal/20 bg-adv-teal/5 p-4 text-sm text-adv-gray">
          <p className="font-medium text-adv-off-white mb-1">How coding sessions work</p>
          <p>Alma guides you with questions and hints — she won't just write the code for you. The goal is for you to understand and build real skills. As you progress, Alma gives you more freedom to experiment.</p>
        </div>
      </div>
    </SchoolLayout>
  );
}
