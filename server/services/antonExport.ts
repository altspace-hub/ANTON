import JSZip from 'jszip';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AREAS_DIR = join(__dirname, '..', 'areas');

export interface AntonExportMetadata {
  authorName: string;
  authorOrg: string;
  description: string;
  tags: string[];
  license: string;
  version?: string;
}

export async function exportModuleToAnton(moduleId: string, metadata: AntonExportMetadata): Promise<Buffer> {
  // Find which area contains this module by scanning area directories
  let moduleDir: string | null = null;
  let areaId: string | null = null;
  let moduleConfig: Record<string, unknown> = {};
  let systemPrompt = '';

  const areas = readdirSync(AREAS_DIR, { withFileTypes: true });
  for (const entry of areas) {
    if (!entry.isDirectory()) continue;
    const modulePath = join(AREAS_DIR, entry.name, 'modules', moduleId);
    if (existsSync(modulePath)) {
      moduleDir = modulePath;
      areaId = entry.name;
      break;
    }
  }

  if (!moduleDir) throw new Error(`Module not found: ${moduleId}`);

  // Read module config
  const configPath = join(moduleDir, 'module.json');
  if (existsSync(configPath)) {
    moduleConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
  }

  // Read system prompt
  const promptPath = join(moduleDir, 'system-prompt.md');
  if (existsSync(promptPath)) {
    systemPrompt = readFileSync(promptPath, 'utf-8');
  }

  // Build manifest
  const manifest = {
    formatVersion: '1.0',
    type: 'module',
    id: moduleId,
    name: (moduleConfig.label as string) || moduleId,
    version: metadata.version || '1.0.0',
    author: {
      name: metadata.authorName,
      org: metadata.authorOrg,
    },
    description: metadata.description || (moduleConfig.description as string) || '',
    area: areaId,
    tags: metadata.tags,
    dependencies: {
      skills: [] as string[],
      minPlatformVersion: '1.0.0',
    },
    toggleDefaults: {
      defaultReasoningMode: false,
      defaultWritingTone: 'professional',
      defaultEmojiEnabled: false,
    },
    license: metadata.license || 'CC-BY-4.0',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  // Build zip
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('system-prompt.md', systemPrompt);
  zip.file('config.json', JSON.stringify(moduleConfig, null, 2));
  zip.file(
    'README.md',
    `# ${manifest.name}\n\n${manifest.description}\n\n## Area\n${areaId}\n\n## Author\n${metadata.authorName} (${metadata.authorOrg})\n\n## License\n${metadata.license}\n`,
  );
  zip.file('LICENSE', `${metadata.license}\n\nCopyright (c) ${new Date().getFullYear()} ${metadata.authorName}`);

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return buffer;
}
