import { Lock, Cloud } from 'lucide-react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useDemoStore } from '@/stores/useDemoStore';

/** The provider a compat:<slug>:<model> id is sent to, named for people (openrouter → OpenRouter). */
function endpointName(slug: string): string {
  if (slug === 'openrouter') return 'OpenRouter';
  return slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : 'a model endpoint';
}

/**
 * PrivacyIndicator — small badge in the Header showing where data goes.
 * Reads the current model from the settings store to determine the active provider.
 * Not shown on a public demo: there everything is on a server, not "local",
 * and the demo banner says where input goes.
 */
export default function PrivacyIndicator() {
  const { defaultModel } = useSettingsStore();
  const demoMode = useDemoStore((s) => s.config.demoMode);

  const isOllama = defaultModel?.startsWith('ollama') || defaultModel?.startsWith('local');
  const isOpenAI = defaultModel?.startsWith('gpt') || defaultModel?.startsWith('o1') || defaultModel?.startsWith('o3');
  const isMistral = ['mistral', 'open-mistral', 'magistral', 'codestral', 'devstral'].some(
    (p) => defaultModel?.startsWith(p)
  );
  const isGemini = defaultModel?.startsWith('gemini');

  let providerLabel: string;
  if (demoMode) {
    return null;
  } else if (defaultModel?.startsWith('compat:')) {
    providerLabel = `API: ${endpointName(defaultModel.split(':')[1] ?? '')}`;
  } else if (defaultModel?.startsWith('sdk:')) {
    providerLabel = 'Claude subscription';
  } else if (isOllama) {
    providerLabel = 'Fully offline';
  } else if (isOpenAI) {
    providerLabel = 'API: OpenAI';
  } else if (isMistral) {
    providerLabel = 'API: Mistral';
  } else if (isGemini) {
    providerLabel = 'API: Google';
  } else {
    providerLabel = 'API: Anthropic';
  }

  const fullyOffline = isOllama;

  return (
    <div
      className="hidden items-center gap-1.5 whitespace-nowrap rounded-lg border border-adv-teal/20 bg-adv-teal/5 px-2 py-1 xl:flex"
      title={
        fullyOffline
          ? 'Running fully offline — no data leaves your machine'
          : `Your documents stay on your machine. Only prompts/responses are sent to ${providerLabel}.`
      }
    >
      {fullyOffline ? (
        <Lock className="h-3 w-3 text-adv-teal" />
      ) : (
        <Cloud className="h-3 w-3 text-adv-teal/70" />
      )}
      <span className="text-xs text-adv-teal/80">
        {fullyOffline ? 'Offline' : `Local + ${providerLabel}`}
      </span>
    </div>
  );
}
