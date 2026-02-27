import { Lock, Cloud } from 'lucide-react';
import { useSettingsStore } from '@/stores/useSettingsStore';

/**
 * PrivacyIndicator — small badge in the Header showing where data goes.
 * Reads the current model from the settings store to determine the active provider.
 */
export default function PrivacyIndicator() {
  const { defaultModel } = useSettingsStore();

  const isOllama = defaultModel?.startsWith('ollama') || defaultModel?.startsWith('local');
  const isOpenAI = defaultModel?.startsWith('gpt') || defaultModel?.startsWith('o1') || defaultModel?.startsWith('o3');
  const isMistral = defaultModel?.startsWith('mistral') || defaultModel?.startsWith('open-mistral');
  const isGemini = defaultModel?.startsWith('gemini');

  let providerLabel: string;
  if (isOllama) {
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
      className="hidden items-center gap-1.5 rounded-lg border border-adv-teal/20 bg-adv-teal/5 px-2 py-1 xl:flex"
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
      <span className="text-[10px] text-adv-teal/80">
        {fullyOffline ? 'Offline' : `Local + ${providerLabel}`}
      </span>
    </div>
  );
}
