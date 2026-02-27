import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AppWindow, ArrowRight, Download, Copy, Check, Send, RotateCcw, Loader2,
  AlertCircle, Square, ChevronDown, ChevronRight, Play, MessageSquare,
  Pencil, BookOpen, FileCode, Package, Eye,
} from 'lucide-react';
import CodingBreadcrumb from '@/components/coding/CodingBreadcrumb';
import CodeViewer from '@/components/coding/CodeViewer';
import FileManifest from '@/components/coding/FileManifest';
import ExportAntonButton from '@/components/coding/ExportAntonButton';
import QualityScore from '@/components/coding/QualityScore';
import ConversationThread from '@/components/shared/ConversationThread';
import ThinkingControls from '@/components/shared/ThinkingControls';
import ModelSelector from '@/components/shared/ModelSelector';
import StatusIndicator from '@/components/shared/StatusIndicator';
import ExportBar from '@/components/shared/ExportBar';
import { useSessionStore } from '@/stores/useSessionStore';
import { useClaude } from '@/hooks/useClaude';
import { useExport } from '@/hooks/useExport';
import { fetchSession } from '@/lib/api';
import type { FileManifestEntry } from '@/lib/coding-types';
import type { ThinkingLevel, ModelId, Message } from '@/lib/types';

type Stage = 'describe' | 'clarify' | 'output';
type AppType = 'react' | 'html' | 'python-cli' | 'node-api';

const APP_TYPES: Array<{ id: AppType; label: string; description: string; icon: typeof AppWindow }> = [
  { id: 'react', label: 'React SPA', description: 'Modern React with Tailwind CSS', icon: AppWindow },
  { id: 'html', label: 'HTML/CSS/JS', description: 'Vanilla web application', icon: FileCode },
  { id: 'python-cli', label: 'Python CLI', description: 'Command-line application', icon: Package },
  { id: 'node-api', label: 'Node.js API', description: 'Express.js REST API', icon: Package },
];

// ── Auth helper ─────────────────────────────────────────────────────────────
function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Parse files from Claude's streaming response ────────────────────────────
function parseFilesFromText(text: string): Array<{ path: string; content: string; language: string }> {
  const files: Array<{ path: string; content: string; language: string }> = [];
  const seen = new Set<string>();

  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', html: 'html', css: 'css', json: 'json', md: 'markdown',
    yml: 'yaml', yaml: 'yaml', toml: 'toml', sql: 'sql', sh: 'bash',
    env: 'bash', gitignore: 'bash', dockerfile: 'docker', txt: 'text',
    cfg: 'ini', ini: 'ini', xml: 'xml', svg: 'xml',
  };

  // Reverse map: language tag → extension (for when we find filenames separately)
  const langToExt: Record<string, string> = {
    python: 'py', py: 'py',
    javascript: 'js', js: 'js', node: 'js',
    typescript: 'ts', ts: 'ts',
    typescriptreact: 'tsx', tsx: 'tsx',
    javascriptreact: 'jsx', jsx: 'jsx',
    react: 'jsx',
    html: 'html', htm: 'html',
    css: 'css', scss: 'scss', less: 'less', sass: 'scss',
    json: 'json', jsonc: 'json',
    bash: 'sh', shell: 'sh', sh: 'sh', zsh: 'sh', powershell: 'ps1',
    yaml: 'yaml', yml: 'yaml',
    toml: 'toml',
    sql: 'sql',
    markdown: 'md', md: 'md',
    text: 'txt', plaintext: 'txt', txt: 'txt',
    xml: 'xml', svg: 'svg',
    docker: 'dockerfile', dockerfile: 'dockerfile',
    ruby: 'rb', rust: 'rs', go: 'go', java: 'java',
    csharp: 'cs', cs: 'cs', cpp: 'cpp', c: 'c',
    php: 'php', swift: 'swift', kotlin: 'kt',
    env: 'env', ini: 'ini', cfg: 'cfg',
  };

  // Filename pattern: word chars, dots, slashes, hyphens — must have a dot with extension
  const fileNamePattern = /[\w./-]+\.\w+/;

  // Match all code blocks: ```tag\n...```
  const codeBlockRegex = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const tag = match[1].trim();
    const content = match[2];
    const blockStart = match.index;

    // Strategy 1: Tag itself is a file path (e.g., ```src/main.py)
    if (tag.includes('/') || (tag.includes('.') && fileNamePattern.test(tag))) {
      const ext = tag.split('.').pop() || '';
      const filePath = tag;
      if (!seen.has(filePath)) {
        seen.add(filePath);
        files.push({ path: filePath, content, language: langMap[ext] || ext });
      }
      continue;
    }

    // Strategy 2: Look at the text BEFORE this code block for a filename
    // Check the 300 chars preceding the code block for patterns like:
    //   **filename.py**  /  ### filename.py  /  `filename.py`  /  filename.py:  /  FILE: filename.py
    const preceding = text.slice(Math.max(0, blockStart - 300), blockStart);
    const precedingLines = preceding.split('\n').filter((l) => l.trim());
    let detectedPath = '';

    // Search backwards through preceding lines (closest first)
    for (let i = precedingLines.length - 1; i >= Math.max(0, precedingLines.length - 5); i--) {
      const line = precedingLines[i];

      // Match: **path/file.ext**  or  **`path/file.ext`**
      const boldMatch = line.match(/\*\*`?([\w./-]+\.\w+)`?\*\*/);
      if (boldMatch) { detectedPath = boldMatch[1]; break; }

      // Match: ### path/file.ext  or  #### path/file.ext
      const headingMatch = line.match(/^#{1,6}\s+`?([\w./-]+\.\w+)`?\s*$/);
      if (headingMatch) { detectedPath = headingMatch[1]; break; }

      // Match: `path/file.ext`  (inline code, must be prominent — line is short)
      const inlineCodeMatch = line.match(/^[^`]*`([\w./-]+\.\w+)`[^`]*$/);
      if (inlineCodeMatch && line.length < 120) { detectedPath = inlineCodeMatch[1]; break; }

      // Match: FILE: path/file.ext  or  File: path/file.ext
      const fileLabel = line.match(/(?:file|filename|path)\s*:\s*`?([\w./-]+\.\w+)`?/i);
      if (fileLabel) { detectedPath = fileLabel[1]; break; }

      // Match: "path/file.ext:"  or  "path/file.ext :"  (filename followed by colon, common heading style)
      const colonMatch = line.match(/^[*#\s]*`?([\w./-]+\.\w+)`?\s*:?\s*$/);
      if (colonMatch) { detectedPath = colonMatch[1]; break; }
    }

    if (detectedPath && !seen.has(detectedPath)) {
      const ext = detectedPath.split('.').pop() || '';
      seen.add(detectedPath);
      files.push({ path: detectedPath, content, language: langMap[ext] || tag || ext });
      continue;
    }

    // Strategy 3: Check first line of code for a filename comment
    // e.g., # main.py  or  // src/app.ts  or  <!-- index.html -->
    const firstLine = content.split('\n')[0]?.trim() || '';
    const commentFileMatch = firstLine.match(
      /^(?:#|\/\/|<!--|;|--|%)\s*(?:file(?:name)?:\s*)?`?([\w./-]+\.\w+)`?\s*(?:-->)?$/i,
    );
    if (commentFileMatch) {
      const filePath = commentFileMatch[1];
      if (!seen.has(filePath)) {
        const ext = filePath.split('.').pop() || '';
        seen.add(filePath);
        files.push({ path: filePath, content, language: langMap[ext] || tag || ext });
        continue;
      }
    }

    // Strategy 4: If tag is a known language, generate a fallback filename
    // Only if we found no path via other strategies
    const langTag = tag.toLowerCase();
    if (langTag && (langToExt[langTag] || langMap[langTag])) {
      const ext = langToExt[langTag] || langTag;
      const lang = langMap[ext] || langTag;

      // Try to infer a name from content: look for class/function/component declarations
      let inferredName = '';
      const classMatch = content.match(/(?:class|def|function|const|export\s+default\s+(?:function|class))\s+(\w+)/);
      if (classMatch) {
        const name = classMatch[1];
        // Convert PascalCase to kebab-case for filenames
        inferredName = name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
      }

      const existingCount = files.filter((f) => f.path.endsWith(`.${ext}`)).length;
      let fallbackName: string;
      if (inferredName && !seen.has(`${inferredName}.${ext}`)) {
        fallbackName = `${inferredName}.${ext}`;
      } else if (existingCount === 0) {
        // Use conventional names by language
        const defaultNames: Record<string, string> = {
          py: 'main.py', js: 'index.js', ts: 'index.ts', tsx: 'App.tsx',
          jsx: 'App.jsx', html: 'index.html', css: 'styles.css',
          scss: 'styles.scss', json: 'package.json', sh: 'run.sh',
          md: 'README.md', yaml: 'config.yaml', toml: 'config.toml',
          env: '.env', dockerfile: 'Dockerfile', txt: 'requirements.txt',
        };
        fallbackName = defaultNames[ext] || `app.${ext}`;
      } else {
        fallbackName = `file_${existingCount + 1}.${ext}`;
      }

      if (!seen.has(fallbackName)) {
        seen.add(fallbackName);
        files.push({ path: fallbackName, content, language: lang });
      }
    }
  }

  return files;
}

// ── Extract architecture notes (text outside of code blocks) ────────────────
function extractArchitectureNotes(text: string): string {
  return text
    .replace(/```[^\n`]+\n[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Parse numbered clarifying questions from Claude's response ──────────────
function parseQuestions(text: string): string[] {
  const lines = text.split('\n');
  const questions: string[] = [];
  let currentQ = '';
  let blankAfterQ = false; // Track single blank line (heading may be followed by body after blank)

  for (const rawLine of lines) {
    // Pre-strip leading bold markers: "**1. ..." → "1. ..."
    // Also handles "* **1. ..." or "- **1. ..."
    const line = rawLine.replace(/^(\s*(?:[-*]\s+)?)\*{1,2}(\d)/, '$1$2');

    // Match numbered patterns:
    //   1. Question text
    //   1. **Bold Title** Question text
    //   1) Question text
    //   1 - Question text
    //   - 1. Title: text  (bullet with number)
    const numberedMatch = line.match(/^\s*(?:[-*]\s+)?(\d+)[.)]\s+(.+)/) ||
                          line.match(/^\s*(\d+)\s*[-–—]\s+(.+)/);
    if (numberedMatch) {
      if (currentQ) questions.push(currentQ.trim());
      // Strip leading/trailing bold markers from the captured text
      currentQ = numberedMatch[2].replace(/^\*\*/, '').replace(/\*\*\s*$/, '');
      blankAfterQ = false;
    } else if (currentQ && line.trim()) {
      const trimmed = line.trim();
      // Stop accumulating if this looks like a section header
      if (trimmed.startsWith('#') || trimmed.startsWith('---')) {
        questions.push(currentQ.trim());
        currentQ = '';
        blankAfterQ = false;
      } else {
        // Continuation line — append (handles body text after heading, sub-bullets, etc.)
        currentQ += ' ' + trimmed;
        blankAfterQ = false;
      }
    } else if (!line.trim() && currentQ) {
      if (blankAfterQ) {
        // Second blank line in a row — finalize the question
        questions.push(currentQ.trim());
        currentQ = '';
        blankAfterQ = false;
      } else {
        // First blank line — don't finalize yet, body text may follow
        // (e.g., "4. **Heading**\n\nWhat is the actual question?")
        blankAfterQ = true;
      }
    }
  }
  if (currentQ) questions.push(currentQ.trim());

  // Strip any remaining markdown bold/italic wrappers and clean up sub-bullets
  return questions.map((q) =>
    q.replace(/\*\*/g, '')
     .replace(/\*([^*]+)\*/g, '$1')
     .replace(/\s{2,}/g, ' ')
     .trim(),
  ).filter((q) => q.length > 10); // Filter out very short fragments that aren't real questions
}

// ── Convert parsed files to FileManifestEntry[] ─────────────────────────────
function toManifestEntries(
  files: Array<{ path: string; content: string; language: string }>,
  action: 'create' | 'modify' = 'create',
): FileManifestEntry[] {
  return files.map((f) => ({
    path: f.path,
    action,
    language: f.language,
    description: undefined,
    content: f.content,
  }));
}

export default function ScriptMediumPage() {
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');

  // ── Local UI state ──────────────────────────────────────────────────────
  const [stage, setStage] = useState<Stage>('describe');
  const [appType, setAppType] = useState<AppType>('react');
  const [description, setDescription] = useState('');
  const [constraints, setConstraints] = useState('');
  const [selectedFile, setSelectedFile] = useState('');
  const [sessionBackendId, setSessionBackendId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyAllState, setCopyAllState] = useState(false);
  const [showIterate, setShowIterate] = useState(false);
  const [iterateInput, setIterateInput] = useState('');
  const [generateDone, setGenerateDone] = useState(false);
  const [clarifyDone, setClarifyDone] = useState(false);
  const [parsedQuestions, setParsedQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [qualityScore, setQualityScore] = useState<{ score: number; dimensions?: Record<string, number> } | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  // When preview mode is ON we force HTML for generation, but remember the real target
  const [targetAppType, setTargetAppType] = useState<AppType>('react');

  // Keep merged files across iterations
  const [mergedFiles, setMergedFiles] = useState<FileManifestEntry[]>([]);

  const prevStreamingRef = useRef(false);
  const iterateInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Zustand store ────────────────────────────────────────────────────────
  const {
    sessionId, model, thinking,
    lastCachedTokens, lastCacheCreationTokens,
    setModule, setAreaId, setThinking, setCreativity,
    setPlainTextMode, setSelectedOutputFormats, setModel,
    setSystemPrompt, clearSession, restoreSession,
  } = useSessionStore();

  const {
    runMessage, stopStreaming, isStreaming,
    streamingText, streamingThinking,
    messages, lastInputTokens, lastOutputTokens,
  } = useClaude();

  const { doExport, isExporting } = useExport();

  // ── Initialize session on mount ──────────────────────────────────────────
  useEffect(() => {
    clearSession();
    setModule('script-medium');
    setAreaId('coding');
    setThinking('think_hard');
    setCreativity('balanced');
    setPlainTextMode(false);
    setSelectedOutputFormats([]);

    // ── Resume from saved session if ?session= is present ──────────────
    if (sessionParam) {
      fetchSession(sessionParam).then((data) => {
        if (!data) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const restored: Message[] = ((data.messages as any[]) || []).map((m: any) => ({
          id: m.id as string,
          sessionId: (m.session_id as string) ?? data.id,
          role: m.role as 'user' | 'assistant',
          content: m.content as string,
          thinkingContent: (m.thinking_content as string | null) ?? undefined,
          tokenCount: (m.token_count as number | null) ?? undefined,
          createdAt: m.created_at as string,
        }));
        restoreSession(data.id as string, restored);

        // Restore config
        const cfg = typeof data.config === 'string'
          ? JSON.parse(data.config) : (data.config ?? {});
        if (cfg.model) setModel(cfg.model);
        if (cfg.thinking) setThinking(cfg.thinking);

        // Jump to output stage if there are assistant messages
        const hasAssistant = restored.some((m) => m.role === 'assistant');
        if (hasAssistant) {
          setStage('output');
          setGenerateDone(true);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Parse files from streaming/completed text in real-time ───────────────
  const currentText = useMemo(() => {
    if (isStreaming) return streamingText;
    const assistantMsgs = messages.filter((m) => m.role === 'assistant');
    const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
    return lastAssistant?.content || '';
  }, [isStreaming, streamingText, messages]);

  const previewHtmlContent = useMemo(() => {
    if (!previewMode || stage !== 'output') return '';

    // Strategy 1: Find a ```html code block that's a full self-contained document
    const htmlMatch = currentText.match(/```html\n([\s\S]*?)```/);
    if (htmlMatch) {
      const html = htmlMatch[1];
      // Accept if it's a full HTML doc with inline script/style (not a shell referencing externals)
      const hasInlineScript = html.includes('<script>') || html.includes('<script ') && !html.match(/<script\s+src=/);
      const isFullDoc = html.includes('<!DOCTYPE') || html.includes('<html');
      if (isFullDoc && hasInlineScript && html.length > 500) {
        return html;
      }
    }

    // Strategy 2: Find an index.html code block that IS self-contained
    const indexMatch = currentText.match(/```(?:index\.html)\n([\s\S]*?)```/);
    if (indexMatch) {
      const html = indexMatch[1];
      const hasInlineScript = html.includes('<script>') || (html.includes('<script ') && !html.match(/<script\s+src=/));
      if (hasInlineScript && html.length > 500) {
        return html;
      }
    }

    // Strategy 3: Fallback — assemble from multi-file output into a working preview
    const files = parseFilesFromText(currentText);
    if (files.length === 0) return '';

    // Strategy 3a: Vanilla HTML/CSS/JS — inline external CSS/JS into the HTML file
    const htmlFile = files.find((f) =>
      f.path.endsWith('.html') || f.path.endsWith('.htm'),
    );
    const cssFiles = files.filter((f) => f.path.endsWith('.css'));
    const jsFiles = files.filter((f) =>
      f.path.endsWith('.js') && !f.path.endsWith('.config.js') && !f.path.endsWith('.min.js'),
    );

    if (htmlFile && htmlFile.content.includes('<html')) {
      let assembled = htmlFile.content;

      // Inline all CSS: replace <link rel="stylesheet" href="xxx"> with <style> blocks
      for (const cssFile of cssFiles) {
        const baseName = cssFile.path.split('/').pop() || cssFile.path;
        // Match <link> tags referencing this CSS file (with or without ./ prefix)
        const linkPattern = new RegExp(
          `<link[^>]*href=["'](?:\\./)?${baseName.replace('.', '\\.')}["'][^>]*/?>`,
          'gi',
        );
        if (linkPattern.test(assembled)) {
          assembled = assembled.replace(linkPattern, `<style>\n${cssFile.content}\n</style>`);
        } else {
          // No matching <link> tag — inject before </head>
          assembled = assembled.replace('</head>', `<style>\n${cssFile.content}\n</style>\n</head>`);
        }
      }

      // Inline all JS: replace <script src="xxx"></script> with inline <script> blocks
      for (const jsFile of jsFiles) {
        const baseName = jsFile.path.split('/').pop() || jsFile.path;
        const scriptPattern = new RegExp(
          `<script[^>]*src=["'](?:\\./)?${baseName.replace('.', '\\.')}["'][^>]*>\\s*</script>`,
          'gi',
        );
        if (scriptPattern.test(assembled)) {
          assembled = assembled.replace(scriptPattern, `<script>\n${jsFile.content}\n<\/script>`);
        } else {
          // No matching <script src> tag — inject before </body>
          assembled = assembled.replace('</body>', `<script>\n${jsFile.content}\n<\/script>\n</body>`);
        }
      }

      return assembled;
    }

    // Strategy 3b: React/JSX project — wrap in a single HTML with CDN React + Babel
    const jsxFiles = files.filter((f) =>
      f.path.endsWith('.jsx') || f.path.endsWith('.tsx') || f.path.endsWith('.js') || f.path.endsWith('.ts'),
    );

    // Only attempt React assembly if we have JSX/component code
    if (jsxFiles.length === 0) return '';

    const combinedCss = cssFiles.map((f) => f.content).join('\n\n');
    const combinedJs = jsxFiles
      .map((f) => `// === ${f.path} ===\n${f.content}`)
      .join('\n\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
    ${combinedCss.replace(/@import[^;]+;/g, '').replace(/@tailwind[^;]+;/g, '')}
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    // Auto-assembled preview from multi-file output
    const { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } = React;

    ${combinedJs
      .replace(/^import\s+.*$/gm, '// [import removed for preview]')
      .replace(/^export\s+default\s+/gm, 'const __default__ = ')
      .replace(/^export\s+(function|const|class|let)\s+/gm, '$1 ')
    }

    // Try to find and render the main App component
    const AppComponent = typeof App !== 'undefined' ? App : typeof __default__ !== 'undefined' ? __default__ : () => React.createElement('div', null, 'Preview assembled — check console for errors');
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(AppComponent));
  <\/script>
</body>
</html>`;
  }, [currentText, previewMode, stage]);

  const parsedFiles = useMemo(() => {
    if (stage !== 'output') return [];
    return parseFilesFromText(currentText);
  }, [currentText, stage]);

  const architectureNotes = useMemo(() => {
    if (stage !== 'output' || !generateDone) return '';
    return extractArchitectureNotes(currentText);
  }, [currentText, stage, generateDone]);

  // ── Auto-select first file when files first appear ───────────────────────
  const prevFileCountRef = useRef(0);
  useEffect(() => {
    if (parsedFiles.length > 0 && prevFileCountRef.current === 0) {
      setSelectedFile(parsedFiles[0].path);
    }
    prevFileCountRef.current = parsedFiles.length;
  }, [parsedFiles]);

  // ── Merge newly parsed files into mergedFiles on each update ─────────────
  useEffect(() => {
    if (stage !== 'output' || parsedFiles.length === 0) return;
    setMergedFiles((prev) => {
      const map = new Map<string, FileManifestEntry>();
      for (const f of prev) map.set(f.path, f);
      for (const f of parsedFiles) {
        const existing = map.has(f.path);
        map.set(f.path, {
          path: f.path,
          action: existing ? 'modify' : 'create',
          language: f.language,
          content: f.content,
        });
      }
      return Array.from(map.values());
    });
  }, [parsedFiles, stage]);

  // ── Detect when streaming finishes ───────────────────────────────────────
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;

    if (wasStreaming && !isStreaming) {
      if (stage === 'clarify' && !clarifyDone) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === 'assistant') {
          const qs = parseQuestions(lastMsg.content);
          if (qs.length > 0) {
            setParsedQuestions(qs);
            const initialAnswers: Record<string, string> = {};
            qs.forEach((q) => { initialAnswers[q] = ''; });
            setAnswers(initialAnswers);
          }
          setClarifyDone(true);
        }
      } else if (stage === 'output' && !generateDone) {
        setGenerateDone(true);

        // Fire-and-forget quality score fetch
        const lastAssistantMsg = messages.filter((m) => m.role === 'assistant').pop();
        if (lastAssistantMsg?.content) {
          fetch('/api/coding/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({ content: lastAssistantMsg.content, type: 'script-medium' }),
          })
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
              if (data && typeof data.score === 'number') {
                setQualityScore({ score: data.score, dimensions: data.dimensions });
              }
            })
            .catch(() => {});
        }

        // Save generated files to backend
        if (sessionBackendId && parsedFiles.length > 0) {
          const filesToSave = parsedFiles.map((f) => ({
            path: f.path,
            content: f.content,
            language: f.language,
          }));
          fetch(`/api/coding/script-medium/${sessionBackendId}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({ files: filesToSave }),
          }).catch(() => {});
        }
      }
    }
  }, [isStreaming, stage, clarifyDone, generateDone, messages, sessionBackendId, parsedFiles]);

  // ── Stage 1: Generate Application (direct) ──────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!description.trim() || isStreaming) return;
    setError(null);
    setGenerateDone(false);
    setQualityScore(null);
    setMergedFiles([]);
    setSelectedFile('');
    prevFileCountRef.current = 0;

    try {
      const res = await fetch('/api/coding/script-medium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          description: description.trim(),
          app_type: appType,
          constraints: constraints.trim() || undefined,
          preview_mode: previewMode,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to start generation' }));
        setError((err as { error?: string }).error || 'Failed to start generation');
        return;
      }

      const data = await res.json() as {
        id: string;
        appPrompt: string;
        systemPromptOverride?: string;
        moduleId?: string;
        areaId?: string;
        app_type?: string;
      };

      setSessionBackendId(data.id);

      if (data.systemPromptOverride) {
        setSystemPrompt(data.systemPromptOverride);
      }

      setStage('output');
      await new Promise((r) => setTimeout(r, 50));
      runMessage(data.appPrompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }, [description, appType, constraints, isStreaming, previewMode, setSystemPrompt, runMessage]);

  // ── Stage 1 -> Clarify: Get Questions First ──────────────────────────────
  const handleGetQuestions = useCallback(async () => {
    if (!description.trim() || isStreaming) return;
    setError(null);
    setClarifyDone(false);
    setParsedQuestions([]);
    setAnswers({});

    try {
      const res = await fetch('/api/coding/script-medium/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          description: description.trim(),
          app_type: appType,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to get clarifying questions' }));
        setError((err as { error?: string }).error || 'Failed to get clarifying questions');
        return;
      }

      const data = await res.json() as {
        systemPrompt: string;
        userMessage: string;
        moduleId?: string;
        areaId?: string;
      };

      if (data.systemPrompt) {
        setSystemPrompt(data.systemPrompt);
      }

      setStage('clarify');
      await new Promise((r) => setTimeout(r, 50));
      runMessage(data.userMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }, [description, appType, isStreaming, setSystemPrompt, runMessage]);

  // ── Clarify -> Output: Generate from answers ─────────────────────────────
  const handleGenerateFromAnswers = useCallback(async () => {
    if (isStreaming) return;
    setError(null);
    setGenerateDone(false);
    setQualityScore(null);
    setMergedFiles([]);
    setSelectedFile('');
    prevFileCountRef.current = 0;

    try {
      const answeredQuestions = Object.entries(answers).filter(([, a]) => a.trim());
      const answersPayload: Record<string, string> = {};
      answeredQuestions.forEach(([q, a]) => {
        answersPayload[q] = a.trim();
      });

      const res = await fetch('/api/coding/script-medium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          description: description.trim(),
          app_type: appType,
          constraints: constraints.trim() || undefined,
          answers: answersPayload,
          preview_mode: previewMode,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to start generation' }));
        setError((err as { error?: string }).error || 'Failed to start generation');
        return;
      }

      const data = await res.json() as {
        id: string;
        appPrompt: string;
        systemPromptOverride?: string;
      };

      setSessionBackendId(data.id);

      if (data.systemPromptOverride) {
        setSystemPrompt(data.systemPromptOverride);
      }

      setStage('output');
      await new Promise((r) => setTimeout(r, 50));
      runMessage(data.appPrompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }, [isStreaming, answers, description, appType, constraints, previewMode, setSystemPrompt, runMessage]);

  // ── Iterate: send feedback and get updated files ─────────────────────────
  const handleIterate = useCallback(async () => {
    if (!iterateInput.trim() || isStreaming) return;
    setError(null);
    setGenerateDone(false);

    try {
      const res = await fetch('/api/coding/script-medium/iterate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          feedback: iterateInput.trim(),
          session_id: sessionBackendId,
          existing_files: mergedFiles.map((f) => f.path),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to start iteration' }));
        setError((err as { error?: string }).error || 'Failed to start iteration');
        return;
      }

      const data = await res.json() as {
        iterationPrompt: string;
        systemPromptOverride?: string;
      };

      if (data.systemPromptOverride) {
        setSystemPrompt(data.systemPromptOverride);
      }

      setIterateInput('');
      setShowIterate(false);

      await new Promise((r) => setTimeout(r, 50));
      runMessage(data.iterationPrompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }, [iterateInput, isStreaming, sessionBackendId, mergedFiles, setSystemPrompt, runMessage]);

  // ── Convert preview to production multi-file project ────────────────────
  const handleConvertToProduction = useCallback(async () => {
    if (isStreaming || isConverting || !previewHtmlContent) return;
    setIsConverting(true);
    setError(null);

    try {
      const res = await fetch('/api/coding/script-medium/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          session_id: sessionBackendId,
          preview_html: previewHtmlContent,
          app_type: targetAppType,
          constraints: constraints.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to start conversion' }));
        setError((err as { error?: string }).error || 'Failed to start conversion');
        setIsConverting(false);
        return;
      }

      const data = await res.json() as {
        convertPrompt: string;
        systemPromptOverride?: string;
      };

      if (data.systemPromptOverride) {
        setSystemPrompt(data.systemPromptOverride);
      }

      // Switch OFF preview mode so output renders as normal multi-file view
      setPreviewMode(false);
      setAppType(targetAppType); // Restore the real target type
      setGenerateDone(false);
      setMergedFiles([]);
      setSelectedFile('');
      prevFileCountRef.current = 0;
      setIsConverting(false);

      await new Promise((r) => setTimeout(r, 50));
      runMessage(data.convertPrompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setIsConverting(false);
    }
  }, [isStreaming, isConverting, previewHtmlContent, sessionBackendId, targetAppType, constraints, setSystemPrompt, runMessage]);

  // ── Download as ZIP (creates a concatenated text file or uses JSZip) ─────
  const handleDownloadZip = useCallback(async () => {
    if (mergedFiles.length === 0) return;

    // Try to dynamically import JSZip if available
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsZipModule = await import('jszip') as any;
      const JSZipCtor = jsZipModule.default || jsZipModule;
      const zip = new JSZipCtor();
      for (const file of mergedFiles) {
        if (file.content) {
          zip.file(file.path, file.content);
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const slug = description.trim().slice(0, 40).replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase() || 'app';
      a.download = `${slug}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: create a text file with clear delimiters
      const lines: string[] = [];
      lines.push('# Generated Application Files');
      lines.push(`# ${mergedFiles.length} files\n`);
      for (const file of mergedFiles) {
        lines.push(`${'='.repeat(72)}`);
        lines.push(`# FILE: ${file.path}`);
        lines.push(`${'='.repeat(72)}\n`);
        lines.push(file.content || '');
        lines.push('');
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const slug = description.trim().slice(0, 40).replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase() || 'app';
      a.download = `${slug}-files.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [mergedFiles, description]);

  // ── Copy All files to clipboard ──────────────────────────────────────────
  const handleCopyAll = useCallback(async () => {
    if (mergedFiles.length === 0) return;
    const lines: string[] = [];
    for (const file of mergedFiles) {
      lines.push(`// ── ${file.path} ──`);
      lines.push(file.content || '');
      lines.push('');
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopyAllState(true);
      setTimeout(() => setCopyAllState(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, [mergedFiles]);

  // ── Export handler ───────────────────────────────────────────────────────
  const handleExport = useCallback(
    (format: string) => {
      const allContent = messages
        .map((m) => `**${m.role === 'user' ? 'User' : 'Assistant'}:**\n\n${m.content}`)
        .join('\n\n---\n\n');
      const filename = description.trim().slice(0, 40).replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase() || 'script-medium';
      doExport(format, allContent, filename);
    },
    [messages, description, doExport],
  );

  // ── New Application: full reset ──────────────────────────────────────────
  const handleNewApplication = useCallback(() => {
    clearSession();
    setModule('script-medium');
    setAreaId('coding');
    setThinking('think_hard');
    setCreativity('balanced');
    setPlainTextMode(false);
    setSelectedOutputFormats([]);
    setStage('describe');
    setDescription('');
    setConstraints('');
    setSelectedFile('');
    setSessionBackendId(null);
    setShowAdvanced(false);
    setError(null);
    setCopyAllState(false);
    setShowIterate(false);
    setIterateInput('');
    setGenerateDone(false);
    setClarifyDone(false);
    setParsedQuestions([]);
    setAnswers({});
    setMergedFiles([]);
    setQualityScore(null);
    setPreviewMode(false);
    setIsConverting(false);
    setTargetAppType('react');
    prevFileCountRef.current = 0;
  }, [clearSession, setModule, setAreaId, setThinking, setCreativity, setPlainTextMode, setSelectedOutputFormats]);

  // ── Derived values ───────────────────────────────────────────────────────
  const displayFiles = mergedFiles.length > 0
    ? mergedFiles
    : toManifestEntries(parsedFiles);

  const selectedFileEntry = displayFiles.find((f) => f.path === selectedFile);
  const selectedFileContent = selectedFileEntry?.content || '';
  const selectedFileLang = selectedFileEntry?.language || 'typescript';

  const stageOrder: Stage[] = ['describe', 'clarify', 'output'];
  const currentIdx = stageOrder.indexOf(stage);

  const canGenerate = description.trim().length > 0 && !isStreaming;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      <CodingBreadcrumb items={[{ label: 'Script Medium' }]} />

      {/* Header */}
      <div>
        <h1 className="flex items-center gap-3 text-xl font-bold text-adv-white">
          <AppWindow className="h-6 w-6 text-adv-blue" />
          Script Medium — Application Builder
        </h1>
        <p className="mt-1 text-sm text-adv-gray">
          Generate complete multi-file applications with real-time streaming
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {[
          { id: 'describe' as Stage, label: 'Describe', num: 1 },
          { id: 'clarify' as Stage, label: 'Clarify', num: 2 },
          { id: 'output' as Stage, label: 'Output', num: 3 },
        ].map(({ id, label, num }, i) => {
          const idx = stageOrder.indexOf(id);
          const isActive = stage === id;
          const isCompleted = currentIdx > idx;
          return (
            <div key={id} className="flex items-center gap-2">
              {i > 0 && <ArrowRight className="h-3 w-3 text-adv-gray-med" />}
              <div
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-adv-blue text-white'
                    : isCompleted
                      ? 'bg-adv-green/10 text-adv-green'
                      : 'bg-adv-dark text-adv-gray'
                }`}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : null}
                {num}. {label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-adv-red/30 bg-adv-red/10 px-4 py-3 text-sm text-adv-red">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-adv-red hover:text-adv-red/80">
            Dismiss
          </button>
        </div>
      )}

      {/* ================================================================ */}
      {/* STAGE 1: DESCRIBE                                                */}
      {/* ================================================================ */}
      {stage === 'describe' && (
        <div className="space-y-4">
          {/* App Type Selector */}
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <h3 className="mb-3 text-sm font-medium text-adv-white">
              {previewMode ? 'Target Platform' : 'Application Type'}
            </h3>
            {previewMode && (
              <p className="mb-3 text-xs text-adv-gray">
                Preview will be generated as HTML first. When ready, convert to your chosen platform.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {APP_TYPES.map((t) => {
                const Icon = t.icon;
                const selected = previewMode ? targetAppType === t.id : appType === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      if (previewMode) {
                        setTargetAppType(t.id);
                      } else {
                        setAppType(t.id);
                      }
                    }}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      selected
                        ? 'border-adv-blue bg-adv-blue/10'
                        : 'border-border bg-adv-dark hover:border-adv-gray-med'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${selected ? 'text-adv-blue' : 'text-adv-gray'}`} />
                      <span className={`text-sm font-medium ${selected ? 'text-adv-blue' : 'text-adv-off-white'}`}>
                        {t.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-adv-gray">{t.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Preview Toggle */}
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-adv-white flex items-center gap-2">
                  <Eye className="h-4 w-4 text-adv-teal" />
                  Live Preview Mode
                </h3>
                <p className="mt-1 text-xs text-adv-gray">
                  Generate a previewable web version first. You can convert to your target platform later.
                </p>
              </div>
              <button
                onClick={() => {
                  const next = !previewMode;
                  setPreviewMode(next);
                  if (next) {
                    // Remember current choice as target, force HTML for preview
                    setTargetAppType(appType === 'html' ? 'react' : appType);
                    setAppType('html');
                  } else {
                    // Restore target type as active type
                    setAppType(targetAppType);
                  }
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  previewMode ? 'bg-adv-teal' : 'bg-adv-dark'
                }`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  previewMode ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            {previewMode && (
              <div className="mt-3 rounded-lg border border-adv-teal/20 bg-adv-teal/5 p-3 text-xs text-adv-teal">
                Your app will be generated as a single interactive HTML file you can preview right here.
                When you're happy with it, convert it to a proper {APP_TYPES.find(t => t.id === targetAppType)?.label || targetAppType} project.
              </div>
            )}
          </div>

          {/* Description */}
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <label className="block text-sm font-medium text-adv-white">
              What should the application do?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the application you want to build. Be specific about features, UI elements, data handling..."
              className="mt-2 h-32 w-full rounded-lg border border-border bg-adv-dark p-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-blue focus:outline-none resize-none"
            />
          </div>

          {/* Constraints */}
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <label className="block text-sm font-medium text-adv-white">
              Constraints (optional)
            </label>
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder="e.g., must use specific libraries, no external dependencies, dark theme, responsive design..."
              className="mt-2 h-20 w-full rounded-lg border border-border bg-adv-dark p-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-blue focus:outline-none resize-none"
            />
          </div>

          {/* Advanced Settings (collapsible) */}
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center gap-1.5 text-sm font-medium text-adv-white hover:text-adv-blue transition-colors"
            >
              {showAdvanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Advanced Settings
            </button>
            {showAdvanced && (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs text-adv-gray">Thinking Depth</label>
                  <ThinkingControls
                    value={thinking}
                    onChange={(v: ThinkingLevel) => setThinking(v)}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs text-adv-gray">Model</label>
                  <ModelSelector
                    value={model}
                    onChange={(v: ModelId) => setModel(v)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="flex items-center gap-2 rounded-lg bg-adv-blue px-6 py-2.5 text-sm font-semibold text-white hover:bg-adv-blue/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStreaming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Generate Application
                </>
              )}
            </button>

            <button
              onClick={handleGetQuestions}
              disabled={!canGenerate}
              className="flex items-center gap-2 rounded-lg border border-adv-blue/30 bg-adv-blue/10 px-5 py-2.5 text-sm font-medium text-adv-blue hover:bg-adv-blue/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MessageSquare className="h-4 w-4" />
              Get Questions First
            </button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* STAGE 2: CLARIFY                                                 */}
      {/* ================================================================ */}
      {stage === 'clarify' && (
        <div className="space-y-4">
          {/* Streaming conversation for AI questions */}
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-adv-white mb-3">
              <MessageSquare className="h-4 w-4 text-adv-blue" />
              Clarifying Questions
            </h3>
            <ConversationThread
              messages={messages}
              streamingText={streamingText}
              streamingThinking={streamingThinking}
              isStreaming={isStreaming}
              moduleId="script-medium"
            />
          </div>

          {/* Parsed questions with answer fields */}
          {clarifyDone && parsedQuestions.length > 0 && (
            <div className="rounded-xl border border-border bg-adv-card p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-adv-white">
                <Pencil className="h-4 w-4 text-adv-blue" />
                Your Answers
              </h3>
              <p className="mt-1 text-xs text-adv-gray">
                Answer these to help generate a better application. Skipping is OK.
              </p>
              <div className="mt-4 space-y-3">
                {parsedQuestions.map((q, i) => (
                  <div key={i}>
                    <label className="text-xs font-medium text-adv-off-white">
                      {i + 1}. {q}
                    </label>
                    <input
                      type="text"
                      value={answers[q] || ''}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [q]: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-blue focus:outline-none"
                      placeholder="Your answer..."
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No questions fallback */}
          {clarifyDone && parsedQuestions.length === 0 && (
            <div className="rounded-xl border border-adv-gold/30 bg-adv-gold/5 p-4 text-sm text-adv-gold">
              No specific questions were generated. You can proceed directly to application generation.
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setStage('describe')}
              disabled={isStreaming}
              className="rounded-lg bg-adv-dark px-4 py-2 text-xs text-adv-gray hover:text-adv-off-white transition-colors border border-border disabled:opacity-50"
            >
              Back
            </button>

            {isStreaming ? (
              <button
                onClick={stopStreaming}
                className="flex items-center gap-1.5 rounded-lg bg-adv-red/10 border border-adv-red/30 px-4 py-2 text-xs text-adv-red hover:bg-adv-red/20 transition-colors"
              >
                <Square className="h-3.5 w-3.5" />
                Stop
              </button>
            ) : (
              <button
                onClick={handleGenerateFromAnswers}
                disabled={!clarifyDone}
                className="flex items-center gap-2 rounded-lg bg-adv-blue px-6 py-2.5 text-sm font-semibold text-white hover:bg-adv-blue/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="h-4 w-4" />
                Generate Application
              </button>
            )}
          </div>

          {/* Status */}
          <StatusIndicator
            inputTokens={lastInputTokens}
            outputTokens={lastOutputTokens}
            cachedTokens={lastCachedTokens}
            cacheCreationTokens={lastCacheCreationTokens}
            model={model}
            isStreaming={isStreaming}
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* STAGE 3: OUTPUT — THREE-COLUMN LAYOUT (or Preview Layout)        */}
      {/* ================================================================ */}
      {stage === 'output' && (
        <div className="space-y-4">

          {/* ── Preview Mode Layout (2-column: iframe + code/conversation) */}
          {previewMode ? (
            <div className="grid grid-cols-12 gap-4" style={{ minHeight: '500px' }}>

              {/* ── Left (wider): Live Preview iframe (7/12) ──────────── */}
              <div className="col-span-7 flex flex-col gap-4">
                {previewHtmlContent ? (
                  <div className="rounded-xl border border-border bg-adv-card overflow-hidden">
                    <div className="flex items-center justify-between border-b border-border px-4 py-2">
                      <h3 className="text-sm font-medium text-adv-white flex items-center gap-2">
                        <Eye className="h-4 w-4 text-adv-teal" />
                        Live Preview
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const blob = new Blob([previewHtmlContent], { type: 'text/html' });
                            const url = URL.createObjectURL(blob);
                            window.open(url, '_blank');
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                          }}
                          className="text-xs text-adv-gray hover:text-adv-teal transition-colors"
                        >
                          Open in New Tab
                        </button>
                      </div>
                    </div>
                    <iframe
                      srcDoc={previewHtmlContent}
                      sandbox="allow-scripts allow-modals"
                      className="w-full bg-white"
                      style={{ height: '600px' }}
                      title="Application Preview"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-adv-card flex items-center justify-center" style={{ height: '600px' }}>
                    <div className="text-center">
                      {isStreaming ? (
                        <>
                          <Loader2 className="mx-auto h-8 w-8 animate-spin text-adv-teal" />
                          <p className="mt-3 text-sm text-adv-gray">Generating preview...</p>
                        </>
                      ) : (
                        <>
                          <Eye className="mx-auto h-8 w-8 text-adv-gray-med" />
                          <p className="mt-3 text-sm text-adv-gray-med">Preview will appear here once HTML is generated</p>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Convert to Production */}
                {previewMode && generateDone && previewHtmlContent && (
                  <div className="rounded-xl border border-adv-teal/30 bg-adv-teal/5 p-5">
                    <h3 className="text-sm font-semibold text-adv-white flex items-center gap-2">
                      <Package className="h-4 w-4 text-adv-teal" />
                      Ready to convert?
                    </h3>
                    <p className="mt-1 text-xs text-adv-gray">
                      Happy with the preview? Convert it to a full {APP_TYPES.find(t => t.id === targetAppType)?.label || targetAppType} project
                      with proper file structure, or keep iterating.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={handleConvertToProduction}
                        disabled={isStreaming || isConverting}
                        className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
                      >
                        {isConverting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                        Convert to {APP_TYPES.find(t => t.id === targetAppType)?.label || 'Production'}
                      </button>
                      <button
                        onClick={() => {
                          // Download preview HTML directly
                          const blob = new Blob([previewHtmlContent], { type: 'text/html' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'preview.html';
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="flex items-center gap-2 rounded-lg border border-border bg-adv-dark px-4 py-2 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
                      >
                        <Download className="h-4 w-4" />
                        Download Preview HTML
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Right: Code viewer + Conversation (5/12) ──────────── */}
              <div className="col-span-5 flex flex-col gap-4">
                {/* Code source view (shows the HTML source) */}
                {selectedFile && selectedFileContent ? (
                  <CodeViewer
                    code={selectedFileContent}
                    language={selectedFileLang}
                    filename={selectedFile}
                    maxHeight="350px"
                  />
                ) : displayFiles.length > 0 ? (
                  <CodeViewer
                    code={displayFiles[0].content || ''}
                    language={displayFiles[0].language || 'html'}
                    filename={displayFiles[0].path}
                    maxHeight="350px"
                  />
                ) : (
                  <div className="rounded-lg border border-border bg-adv-dark">
                    <div className="flex items-center justify-between border-b border-border bg-adv-dark-2 px-3 py-2">
                      <span className="font-mono text-xs text-adv-gray">Source Code</span>
                    </div>
                    <div className="flex h-40 items-center justify-center">
                      <p className="text-xs text-adv-gray-med">
                        {isStreaming ? 'Generating source...' : 'No source available yet'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Conversation thread */}
                <div className="rounded-lg border border-border bg-adv-card flex-1">
                  <div className="border-b border-border px-3 py-2">
                    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-adv-gray">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {isStreaming ? 'Generating...' : 'Conversation'}
                    </h3>
                  </div>
                  <div className="max-h-[300px] overflow-auto p-4">
                    {messages.length === 0 && !isStreaming ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="text-center">
                          <AppWindow className="mx-auto h-8 w-8 text-adv-gray-med" />
                          <p className="mt-2 text-sm text-adv-gray-med">Preparing generation...</p>
                        </div>
                      </div>
                    ) : (
                      <ConversationThread
                        messages={messages}
                        streamingText={streamingText}
                        streamingThinking={streamingThinking}
                        isStreaming={isStreaming}
                        moduleId="script-medium"
                      />
                    )}
                  </div>
                </div>

                {/* Status indicator */}
                {(lastInputTokens > 0 || lastOutputTokens > 0) && (
                  <div className="rounded-lg border border-border bg-adv-card p-3">
                    <StatusIndicator
                      inputTokens={lastInputTokens}
                      outputTokens={lastOutputTokens}
                      cachedTokens={lastCachedTokens}
                      cacheCreationTokens={lastCacheCreationTokens}
                      model={model}
                      isStreaming={isStreaming}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── Normal Three-Column Layout ─────────────────────────────── */
            <div className="grid grid-cols-12 gap-4" style={{ minHeight: '600px' }}>

              {/* ── Left column: File Manifest (3/12) ─────────────────────── */}
              <div className="col-span-3">
                <div className="sticky top-6">
                  {displayFiles.length > 0 ? (
                    <FileManifest
                      files={displayFiles}
                      onFileSelect={(f) => setSelectedFile(f.path)}
                      selectedFile={selectedFile}
                    />
                  ) : (
                    <div className="rounded-lg border border-border bg-adv-card p-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-gray mb-3">
                        Files
                      </h3>
                      {isStreaming ? (
                        <div className="flex items-center gap-2 text-xs text-adv-gray">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-adv-blue" />
                          Detecting files...
                        </div>
                      ) : (
                        <p className="text-xs text-adv-gray-med">No files detected yet</p>
                      )}
                    </div>
                  )}

                  {/* File count indicator during streaming */}
                  {isStreaming && displayFiles.length > 0 && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-adv-blue/20 bg-adv-blue/5 px-3 py-2 text-xs text-adv-blue">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {displayFiles.length} file{displayFiles.length !== 1 ? 's' : ''} detected
                    </div>
                  )}
                </div>
              </div>

              {/* ── Center column: Code Viewer (4/12) ─────────────────────── */}
              <div className="col-span-4">
                {selectedFile && selectedFileContent ? (
                  <CodeViewer
                    code={selectedFileContent}
                    language={selectedFileLang}
                    filename={selectedFile}
                    maxHeight="600px"
                  />
                ) : (
                  <div className="rounded-lg border border-border bg-adv-dark">
                    <div className="flex items-center justify-between border-b border-border bg-adv-dark-2 px-3 py-2">
                      <span className="font-mono text-xs text-adv-gray">Select a file</span>
                    </div>
                    <div className="flex h-80 items-center justify-center">
                      <div className="text-center">
                        <FileCode className="mx-auto h-8 w-8 text-adv-gray-med" />
                        <p className="mt-2 text-sm text-adv-gray-med">
                          {displayFiles.length > 0
                            ? 'Click a file in the manifest to view its contents'
                            : isStreaming
                              ? 'Files will appear as they are generated...'
                              : 'No files generated yet'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Right column: Architecture Notes / Streaming (5/12) ──── */}
              <div className="col-span-5 flex flex-col gap-4">
                {/* Architecture Notes (shown after streaming completes) */}
                {generateDone && architectureNotes && (
                  <div className="rounded-lg border border-border bg-adv-card">
                    <div className="border-b border-border px-3 py-2">
                      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-adv-gray">
                        <BookOpen className="h-3.5 w-3.5" />
                        Architecture Notes
                      </h3>
                    </div>
                    <div className="max-h-[200px] overflow-auto p-4">
                      <div className="prose-output max-w-none text-sm text-adv-off-white whitespace-pre-wrap leading-relaxed">
                        {architectureNotes}
                      </div>
                    </div>
                  </div>
                )}

                {/* Streaming output / Conversation thread */}
                <div className="rounded-lg border border-border bg-adv-card flex-1">
                  <div className="border-b border-border px-3 py-2">
                    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-adv-gray">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {isStreaming ? 'Generating...' : 'Conversation'}
                    </h3>
                  </div>
                  <div className="max-h-[600px] overflow-auto p-4">
                    {messages.length === 0 && !isStreaming ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="text-center">
                          <AppWindow className="mx-auto h-8 w-8 text-adv-gray-med" />
                          <p className="mt-2 text-sm text-adv-gray-med">Preparing generation...</p>
                        </div>
                      </div>
                    ) : (
                      <ConversationThread
                        messages={messages}
                        streamingText={streamingText}
                        streamingThinking={streamingThinking}
                        isStreaming={isStreaming}
                        moduleId="script-medium"
                      />
                    )}
                  </div>
                </div>

                {/* Status indicator */}
                {(lastInputTokens > 0 || lastOutputTokens > 0) && (
                  <div className="rounded-lg border border-border bg-adv-card p-3">
                    <StatusIndicator
                      inputTokens={lastInputTokens}
                      outputTokens={lastOutputTokens}
                      cachedTokens={lastCachedTokens}
                      cacheCreationTokens={lastCacheCreationTokens}
                      model={model}
                      isStreaming={isStreaming}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quality Score */}
          {generateDone && qualityScore && (
            <QualityScore
              score={qualityScore.score}
              dimensions={qualityScore.dimensions}
            />
          )}

          {/* ── Bottom Action Bar (full width) ────────────────────────────── */}
          <div className="rounded-xl border border-border bg-adv-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              {/* Download ZIP */}
              <button
                onClick={handleDownloadZip}
                disabled={displayFiles.length === 0}
                className="flex items-center gap-1.5 rounded-lg bg-adv-blue px-4 py-2 text-xs font-medium text-white hover:bg-adv-blue/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="h-3.5 w-3.5" />
                Download ZIP
              </button>

              {/* Copy All */}
              <button
                onClick={handleCopyAll}
                disabled={displayFiles.length === 0}
                className="flex items-center gap-1.5 rounded-lg bg-adv-card border border-border px-4 py-2 text-xs text-adv-off-white hover:bg-adv-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {copyAllState ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-adv-green" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy All
                  </>
                )}
              </button>

              {/* Iterate */}
              {isStreaming ? (
                <button
                  onClick={stopStreaming}
                  className="flex items-center gap-1.5 rounded-lg bg-adv-red/10 border border-adv-red/30 px-4 py-2 text-xs text-adv-red hover:bg-adv-red/20 transition-colors"
                >
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => {
                    setShowIterate(true);
                    setTimeout(() => iterateInputRef.current?.focus(), 100);
                  }}
                  disabled={!generateDone}
                  className="flex items-center gap-1.5 rounded-lg bg-adv-card border border-border px-4 py-2 text-xs text-adv-off-white hover:bg-adv-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Iterate
                </button>
              )}

              {/* Export .anton */}
              {generateDone && sessionBackendId && (
                <ExportAntonButton
                  type="script-medium"
                  id={sessionBackendId}
                />
              )}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Export */}
              {generateDone && messages.length > 0 && (
                <ExportBar
                  content={messages.map((m) => `**${m.role === 'user' ? 'User' : 'Assistant'}:**\n\n${m.content}`).join('\n\n---\n\n')}
                  availableFormats={['md', 'docx']}
                  onExport={handleExport}
                  isExporting={isExporting}
                  sessionId={sessionId ?? undefined}
                  moduleContext="Script Medium"
                />
              )}

              {/* New Application */}
              <button
                onClick={handleNewApplication}
                className="flex items-center gap-1.5 rounded-lg bg-adv-dark border border-border px-4 py-2 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                New Application
              </button>
            </div>
          </div>

          {/* ── Iterate input area ────────────────────────────────────────── */}
          {showIterate && !isStreaming && (
            <div className="rounded-xl border border-adv-blue/30 bg-adv-blue/5 p-4 space-y-3">
              <h4 className="text-sm font-medium text-adv-blue">Request Changes</h4>
              <textarea
                ref={iterateInputRef}
                value={iterateInput}
                onChange={(e) => setIterateInput(e.target.value)}
                placeholder="Describe what you want to change, e.g., 'Add a dark mode toggle', 'Use a sidebar navigation instead', 'Add form validation'..."
                className="h-24 w-full rounded-lg border border-border bg-adv-dark p-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-blue focus:outline-none resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleIterate();
                  }
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleIterate}
                  disabled={!iterateInput.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-adv-blue px-4 py-2 text-xs font-medium text-white hover:bg-adv-blue/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send Changes
                </button>
                <button
                  onClick={() => {
                    setShowIterate(false);
                    setIterateInput('');
                  }}
                  className="rounded-lg bg-adv-dark px-4 py-2 text-xs text-adv-gray hover:text-adv-off-white transition-colors border border-border"
                >
                  Cancel
                </button>
                <span className="ml-auto self-center text-[10px] text-adv-gray-med">
                  Ctrl+Enter to send
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
