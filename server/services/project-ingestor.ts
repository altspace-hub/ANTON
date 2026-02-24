import fs from 'fs/promises';
import path from 'path';

export interface ProjectState {
  projectName: string;
  structure: DirectoryNode[];
  technologies: string[];
  entryPoints: string[];
  keyFiles: { path: string; summary: string }[];
  testCoverage: { hasTests: boolean; testFiles: string[] };
  dependencies: { name: string; version: string }[];
  documentation: { hasReadme: boolean; otherDocs: string[] };
  healthIndicators: {
    dependencyFreshness: 'good' | 'stale' | 'outdated';
    codeOrganization: 'clean' | 'moderate' | 'messy';
    documentationCompleteness: 'complete' | 'partial' | 'minimal';
  };
  totalFiles: number;
  totalSize: number;
}

interface DirectoryNode {
  name: string;
  type: 'file' | 'directory';
  children?: DirectoryNode[];
  size?: number;
  extension?: string;
}

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache',
  '__pycache__', '.venv', 'venv', '.tox', 'coverage',
  '.idea', '.vscode', '.DS_Store', 'target', 'bin', 'obj',
]);

const IGNORE_EXTENSIONS = new Set([
  '.lock', '.log', '.map', '.min.js', '.min.css',
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot',
  '.mp4', '.mp3', '.wav', '.avi',
  '.zip', '.tar', '.gz', '.rar',
  '.exe', '.dll', '.so', '.dylib',
  '.sqlite', '.db',
]);

const KEY_FILES = [
  'package.json', 'tsconfig.json', 'pyproject.toml', 'requirements.txt',
  'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle',
  'Dockerfile', 'docker-compose.yml', '.env.example',
  'README.md', 'CLAUDE.md', 'INSTRUCTIONS.md',
];

const MAX_FILE_READ_SIZE = 50000; // chars
const MAX_TREE_DEPTH = 6;

export async function ingestLocalProject(dirPath: string): Promise<ProjectState> {
  const resolvedPath = path.resolve(dirPath);

  // Build directory tree
  const structure = await buildTree(resolvedPath, 0);

  // Detect technologies
  const technologies = await detectTechnologies(resolvedPath);

  // Find entry points
  const entryPoints = await findEntryPoints(resolvedPath);

  // Read key files
  const keyFiles = await readKeyFiles(resolvedPath);

  // Detect tests
  const testCoverage = await detectTests(resolvedPath);

  // Read dependencies
  const dependencies = await readDependencies(resolvedPath);

  // Documentation check
  const documentation = await checkDocumentation(resolvedPath);

  // Count files and size
  const { totalFiles, totalSize } = await countFilesAndSize(resolvedPath);

  // Assess health
  const healthIndicators = assessHealth(dependencies, structure, documentation);

  return {
    projectName: path.basename(resolvedPath),
    structure,
    technologies,
    entryPoints,
    keyFiles,
    testCoverage,
    dependencies,
    documentation,
    healthIndicators,
    totalFiles,
    totalSize,
  };
}

async function buildTree(dirPath: string, depth: number): Promise<DirectoryNode[]> {
  if (depth >= MAX_TREE_DEPTH) return [];

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const nodes: DirectoryNode[] = [];

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;

    if (entry.isDirectory()) {
      const children = await buildTree(path.join(dirPath, entry.name), depth + 1);
      nodes.push({ name: entry.name, type: 'directory', children });
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (IGNORE_EXTENSIONS.has(ext)) continue;
      try {
        const stat = await fs.stat(path.join(dirPath, entry.name));
        nodes.push({ name: entry.name, type: 'file', size: stat.size, extension: ext });
      } catch {
        nodes.push({ name: entry.name, type: 'file', extension: ext });
      }
    }
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

async function detectTechnologies(dirPath: string): Promise<string[]> {
  const techs: string[] = [];
  const files = (await fs.readdir(dirPath).catch(() => [])) as string[];

  if (files.includes('package.json')) techs.push('Node.js');
  if (files.includes('tsconfig.json')) techs.push('TypeScript');
  if (files.includes('pyproject.toml') || files.includes('requirements.txt') || files.includes('setup.py')) techs.push('Python');
  if (files.includes('Cargo.toml')) techs.push('Rust');
  if (files.includes('go.mod')) techs.push('Go');
  if (files.includes('pom.xml') || files.includes('build.gradle')) techs.push('Java');
  if (files.includes('Gemfile')) techs.push('Ruby');
  if (files.includes('composer.json')) techs.push('PHP');
  if (files.includes('Dockerfile') || files.includes('docker-compose.yml')) techs.push('Docker');
  if (files.includes('.github')) techs.push('GitHub Actions');
  if (files.includes('vite.config.ts') || files.includes('vite.config.js')) techs.push('Vite');
  if (files.includes('next.config.js') || files.includes('next.config.ts')) techs.push('Next.js');

  // Check package.json for frameworks
  try {
    const pkgJson = JSON.parse(await fs.readFile(path.join(dirPath, 'package.json'), 'utf-8'));
    const allDeps = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };
    if (allDeps.react) techs.push('React');
    if (allDeps.vue) techs.push('Vue');
    if (allDeps.angular) techs.push('Angular');
    if (allDeps.express) techs.push('Express');
    if (allDeps.fastify) techs.push('Fastify');
    if (allDeps.tailwindcss) techs.push('Tailwind CSS');
  } catch { /* no package.json or parse error */ }

  return [...new Set(techs)];
}

async function findEntryPoints(dirPath: string): Promise<string[]> {
  const entries: string[] = [];
  try {
    const pkgJson = JSON.parse(await fs.readFile(path.join(dirPath, 'package.json'), 'utf-8'));
    if (pkgJson.main) entries.push(pkgJson.main);
    if (pkgJson.scripts?.start) entries.push(`scripts.start: ${pkgJson.scripts.start}`);
    if (pkgJson.scripts?.dev) entries.push(`scripts.dev: ${pkgJson.scripts.dev}`);
  } catch { /* ignore */ }

  // Common entry points
  const commonEntries = ['src/index.ts', 'src/main.ts', 'src/app.ts', 'src/index.js', 'src/main.tsx', 'index.ts', 'index.js', 'main.py', 'app.py', 'main.go', 'src/main.rs'];
  for (const entry of commonEntries) {
    try {
      await fs.access(path.join(dirPath, entry));
      entries.push(entry);
    } catch { /* doesn't exist */ }
  }

  return [...new Set(entries)];
}

async function readKeyFiles(dirPath: string): Promise<{ path: string; summary: string }[]> {
  const results: { path: string; summary: string }[] = [];

  for (const filename of KEY_FILES) {
    try {
      const content = await fs.readFile(path.join(dirPath, filename), 'utf-8');
      const summary = content.length > MAX_FILE_READ_SIZE
        ? content.substring(0, MAX_FILE_READ_SIZE) + '\n... [truncated]'
        : content;
      results.push({ path: filename, summary });
    } catch { /* file doesn't exist */ }
  }

  return results;
}

async function detectTests(dirPath: string): Promise<{ hasTests: boolean; testFiles: string[] }> {
  const testFiles: string[] = [];

  async function findTests(dir: string, depth: number) {
    if (depth > 4) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (['test', 'tests', '__tests__', 'spec', 'specs'].includes(entry.name.toLowerCase())) {
            testFiles.push(path.relative(dirPath, fullPath) + '/');
          }
          await findTests(fullPath, depth + 1);
        } else if (/\.(test|spec)\.(ts|tsx|js|jsx|py)$/.test(entry.name) || entry.name.startsWith('test_')) {
          testFiles.push(path.relative(dirPath, fullPath));
        }
      }
    } catch { /* ignore */ }
  }

  await findTests(dirPath, 0);
  return { hasTests: testFiles.length > 0, testFiles: testFiles.slice(0, 50) };
}

async function readDependencies(dirPath: string): Promise<{ name: string; version: string }[]> {
  try {
    const pkgJson = JSON.parse(await fs.readFile(path.join(dirPath, 'package.json'), 'utf-8'));
    const deps = pkgJson.dependencies || {};
    return Object.entries(deps).map(([name, version]) => ({ name, version: version as string }));
  } catch { return []; }
}

async function checkDocumentation(dirPath: string): Promise<{ hasReadme: boolean; otherDocs: string[] }> {
  const docs: string[] = [];
  let hasReadme = false;
  try {
    const files = await fs.readdir(dirPath);
    for (const f of files) {
      if (f.toLowerCase() === 'readme.md') hasReadme = true;
      else if (/\.(md|rst|txt)$/i.test(f) && !f.startsWith('.')) docs.push(f);
    }
    // Check docs/ directory
    try {
      const docsDir = await fs.readdir(path.join(dirPath, 'docs'));
      for (const f of docsDir) {
        if (/\.(md|rst|txt)$/i.test(f)) docs.push(`docs/${f}`);
      }
    } catch { /* no docs dir */ }
  } catch { /* ignore */ }
  return { hasReadme, otherDocs: docs };
}

async function countFilesAndSize(dirPath: string): Promise<{ totalFiles: number; totalSize: number }> {
  let totalFiles = 0;
  let totalSize = 0;

  async function walk(dir: string, depth: number) {
    if (depth > MAX_TREE_DEPTH) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1);
        } else {
          totalFiles++;
          try {
            const stat = await fs.stat(fullPath);
            totalSize += stat.size;
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  await walk(dirPath, 0);
  return { totalFiles, totalSize };
}

function assessHealth(
  deps: { name: string; version: string }[],
  structure: DirectoryNode[],
  docs: { hasReadme: boolean; otherDocs: string[] }
): ProjectState['healthIndicators'] {
  // Simple heuristics
  const depFreshness: 'good' | 'stale' | 'outdated' = deps.length === 0 ? 'good' :
    deps.some(d => d.version.includes('^0.') || d.version.includes('~0.')) ? 'stale' : 'good';

  const hasOrganizedStructure = structure.some(n => n.type === 'directory' && ['src', 'lib', 'app'].includes(n.name));
  const codeOrg: 'clean' | 'moderate' | 'messy' = hasOrganizedStructure ? 'clean' : 'moderate';

  const docCompleteness: 'complete' | 'partial' | 'minimal' = docs.hasReadme && docs.otherDocs.length >= 2 ? 'complete' :
    docs.hasReadme ? 'partial' : 'minimal';

  return { dependencyFreshness: depFreshness, codeOrganization: codeOrg, documentationCompleteness: docCompleteness };
}
