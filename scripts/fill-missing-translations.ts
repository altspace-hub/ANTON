/**
 * Fill missing translation keys across all locale files.
 * Uses Claude to translate any keys present in en.json but absent from a locale file.
 *
 * Run:  pnpm tsx scripts/fill-missing-translations.ts
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic',
  bn: 'Bengali',
  cs: 'Czech',
  da: 'Danish',
  de: 'German',
  el: 'Greek',
  es: 'Spanish',
  fa: 'Persian (Farsi)',
  fi: 'Finnish',
  fr: 'French',
  he: 'Hebrew',
  hi: 'Hindi',
  hu: 'Hungarian',
  id: 'Indonesian',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  nl: 'Dutch',
  no: 'Norwegian',
  pl: 'Polish',
  pt: 'Portuguese',
  ro: 'Romanian',
  sv: 'Swedish',
  th: 'Thai',
  tr: 'Turkish',
  uk: 'Ukrainian',
  ur: 'Urdu',
  vi: 'Vietnamese',
  zh: 'Chinese (Simplified)',
};

function flattenKeys(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null) {
      Object.assign(result, flattenKeys(v as Record<string, unknown>, full));
    } else {
      result[full] = String(v);
    }
  }
  return result;
}

function setNestedKey(obj: Record<string, unknown>, dotKey: string, value: string): void {
  const parts = dotKey.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

async function translateBatch(
  langCode: string,
  langName: string,
  keysToTranslate: Record<string, string>
): Promise<Record<string, string>> {
  const keyCount = Object.keys(keysToTranslate).length;
  if (keyCount === 0) return {};

  const inputJson = JSON.stringify(keysToTranslate, null, 2);

  const prompt = `You are a professional translator. Translate the following UI strings from English to ${langName}.

Rules:
- Return ONLY a valid JSON object with the same keys, values replaced with ${langName} translations
- Keep {{count}}, {{name}}, {{role}} and similar template placeholders EXACTLY as-is
- Keep brand names unchanged: "Anton", "openEXPERT", "Claude", "Anthropic", "OpenAI", "Mistral", "Ollama", "AMLR", "GDPR", "MiFID"
- Keep technical terms that don't translate well in English (e.g. "API", "JWT", "SMTP", "RAG", "MCP")
- For short navigation labels, use concise natural translations
- Do NOT include any explanation, markdown, or code fences — only the raw JSON object

English strings to translate:
${inputJson}`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = (message.content[0] as { type: string; text: string }).text.trim();

  // Strip any accidental markdown code fences
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    return JSON.parse(cleaned) as Record<string, string>;
  } catch (e) {
    console.error(`  ⚠  JSON parse failed for ${langCode}, attempting repair...`);
    // Try to extract JSON object
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, string>;
      } catch {
        console.error(`  ✗  Could not parse response for ${langCode}. Skipping batch.`);
        return {};
      }
    }
    return {};
  }
}

async function processLocale(localeCode: string, enFlat: Record<string, string>): Promise<void> {
  const langName = LANGUAGE_NAMES[localeCode];
  if (!langName) {
    console.log(`  Skipping unknown locale: ${localeCode}`);
    return;
  }

  const filePath = path.join(localesDir, `${localeCode}.json`);
  const localeData: Record<string, unknown> = await fs.readJson(filePath);
  const localeFlat = flattenKeys(localeData);

  // Find missing keys
  const missing: Record<string, string> = {};
  for (const [key, enValue] of Object.entries(enFlat)) {
    if (!localeFlat[key]) {
      missing[key] = enValue;
    }
  }

  const missingCount = Object.keys(missing).length;
  if (missingCount === 0) {
    console.log(`  ✓ ${localeCode} (${langName}) — already complete`);
    return;
  }

  console.log(`  → ${localeCode} (${langName}) — translating ${missingCount} missing keys...`);

  // Split into batches of 80 keys to stay within token limits
  const BATCH_SIZE = 80;
  const allKeys = Object.keys(missing);
  const translated: Record<string, string> = {};

  for (let i = 0; i < allKeys.length; i += BATCH_SIZE) {
    const batchKeys = allKeys.slice(i, i + BATCH_SIZE);
    const batch: Record<string, string> = {};
    batchKeys.forEach(k => { batch[k] = missing[k]; });

    const result = await translateBatch(localeCode, langName, batch);
    Object.assign(translated, result);

    if (allKeys.length > BATCH_SIZE) {
      console.log(`    batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allKeys.length / BATCH_SIZE)} done`);
    }
  }

  // Write translated keys back into the locale object
  for (const [key, value] of Object.entries(translated)) {
    if (value && typeof value === 'string') {
      setNestedKey(localeData as Record<string, unknown>, key, value);
    }
  }

  await fs.writeJson(filePath, localeData, { spaces: 2 });
  console.log(`  ✓ ${localeCode} — wrote ${Object.keys(translated).length} translations`);
}

async function main() {
  console.log('Loading en.json...');
  const en: Record<string, unknown> = await fs.readJson(path.join(localesDir, 'en.json'));
  const enFlat = flattenKeys(en);
  console.log(`en.json has ${Object.keys(enFlat).length} keys\n`);

  const localeCodes = Object.keys(LANGUAGE_NAMES);
  console.log(`Processing ${localeCodes.length} locale files...\n`);

  for (const code of localeCodes) {
    await processLocale(code, enFlat);
  }

  console.log('\n✅ All locale files updated.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
