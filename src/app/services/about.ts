/**
 * about.ts — what the About screen says and reads.
 *
 * The sentences are the desktop About page's (src/pages/AboutPage.tsx), kept
 * word for word; the companion does not import from src/, so they are copied
 * here and src/app/pages/__tests__/about-screen.test.ts fails when the two
 * drift apart. The sentence about the companion itself is WelcomePage's
 * ("Connect to your organisation's ANTON instance. Identity stays on this
 * device."), turned into a statement.
 *
 * Nothing here invents a fact about the paired instance: the models are the
 * ones its /api/app/org/:orgId/models answer lists (the same list the chat's
 * model picker shows), and the app version is the one the installed app
 * reports (Capacitor App.getInfo(): Android versionName / iOS
 * CFBundleShortVersionString). The PWA has no version of its own to report,
 * so there the version is left out, as the desktop page leaves out a version
 * the server does not report.
 */
import { providerName, type ModelList } from './models';

export const ABOUT_CREDIT = 'Created by Daniel Bardun.';

export const ABOUT_WHAT_ANTON_IS =
  'ANTON is a workspace for professional work with AI. You pick a module set up for one kind of task, such as '
  + 'a compliance gap assessment, a contract review or a policy draft, add your own documents and sources, and '
  + 'get a structured answer you can check, edit and export to Word, Excel, PDF or PowerPoint. ANTON runs on a '
  + 'computer or server its owner controls: the documents stay there, and only what a run needs is sent to the '
  + 'AI model.';

/** What the companion itself is, from WelcomePage's subtitle. */
export const ABOUT_COMPANION =
  "ANTON Companion connects this device to your organisation's ANTON instance. Identity stays on this device.";

/** The desktop page's sentence for a server that reports no model, up to "Whoever runs …". */
export const ABOUT_MODELS_GENERAL =
  'ANTON is built around Anthropic’s Claude models and can also use models from OpenAI, Azure OpenAI, '
  + 'Google (Gemini) and Mistral, local models through Ollama, and other OpenAI-compatible services.';

export const ABOUT_CHECK_NOTICE =
  'Answers are AI-generated and must be checked by a qualified person. They are not legal advice.';

export interface AboutModelEntry {
  id: string;
  name: string;
  /** Who made it, from the provider the instance reports; '' when it reports none. */
  maker: string;
  isDefault: boolean;
}

/**
 * The models the paired instance offers, for the About screen: the org's
 * default first (when it is one of them), then the others in the order the
 * instance listed them — the desktop page's order. Empty when it lists none.
 */
export function modelLineup(list: ModelList | null | undefined): AboutModelEntry[] {
  const models = Array.isArray(list?.models) ? list!.models : [];
  const valid = models.filter((m) => m && typeof m.id === 'string' && m.id);
  const def = valid.find((m) => m.id === list?.defaultModel) ?? null;
  const ordered = def ? [def, ...valid.filter((m) => m !== def)] : valid;
  return ordered.map((m) => ({
    id: m.id,
    name: typeof m.label === 'string' && m.label ? m.label : m.id,
    maker: typeof m.provider === 'string' && m.provider ? providerName(m.provider) : '',
    isDefault: m === def,
  }));
}

/**
 * The sentence above the model list. The desktop's "answers come from these
 * models" holds only when the org's default is one of them: a chat with no
 * model picked runs on the org's default (app-gateway processQuery), and the
 * instance lists only its API-key models, so that default (an `sdk:` or
 * `compat:` id, say) can be missing from the list. Then the list is what one
 * can choose, and the default is named for what it is.
 */
export function modelsSentence(where: string, lineup: readonly AboutModelEntry[]): string {
  const one = lineup.length === 1;
  if (lineup.some((m) => m.isDefault)) {
    return `On ${where}, answers come from ${one ? 'this model' : 'these models'}.`
      + (one ? '' : ' You can choose one in the model list before a run.');
  }
  return `On ${where}, you can choose ${one ? 'this model' : 'one of these models'} in the model list before a run. `
    + "Without a choice, answers come from your organisation's default model.";
}

export interface AppVersion {
  version: string;
  build: string;
}

const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/;

/** Reads App.getInfo() defensively (the desktop's parseServerVersion rule): anything odd is no version. */
export function parseAppVersion(info: unknown): AppVersion | null {
  if (!info || typeof info !== 'object') return null;
  const { version, build } = info as Record<string, unknown>;
  if (typeof version !== 'string' || !VERSION_RE.test(version)) return null;
  return { version, build: typeof build === 'string' && VERSION_RE.test(build) ? build : '' };
}

/** The installed app's version; null in a browser (the PWA), where App.getInfo() is not implemented. */
export async function getAppVersion(): Promise<AppVersion | null> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return null;
    const { App } = await import('@capacitor/app');
    return parseAppVersion(await App.getInfo());
  } catch {
    return null;
  }
}
