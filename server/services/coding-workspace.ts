/**
 * coding-workspace.ts — Wave 5.2: Coding Large apply-to-workspace + REAL
 * test execution. Converts the prompt-assembly governance skeleton into a
 * verifiable loop:
 *
 *   task execute (LLM) → parseFileBlocks (anton-coding-file-blocks/v1)
 *     → deterministic per-file diff against the bound workspace
 *     → user reviews + explicitly approves → files written (originals
 *       backed up to .anton-coding-backup/<timestamp>/ inside the workspace)
 *     → user explicitly approves a test run → execFile(argv) in the
 *       workspace → REAL results into coding_test_runs.
 *
 * Security posture (the headline):
 *   • Workspace dirs are validated against ALLOWED_FOLDER_PATHS (resolve +
 *     prefix check) at bind time AND on every use — no env default fallback:
 *     if the allowlist is not configured, nothing is writable.
 *   • Every file path from the LLM is workspace-relative; absolute paths,
 *     drive letters, UNC, `..` segments, reserved device names, and writes
 *     into .anton-coding-backup/ or .git/ are rejected at parse time AND
 *     re-checked with resolve+prefix at write time (defense in depth).
 *   • No shell, ever. Test commands are stored as an argv ARRAY and run via
 *     execFile; argv[0] that is itself a shell (cmd/bash/powershell/…) is
 *     refused at configuration time.
 *   • Test runs get a minimal allowlisted environment (script-sandbox
 *     discipline, widened only with what test runners genuinely need:
 *     PATH, HOME/USERPROFILE, TEMP, APPDATA/LOCALAPPDATA). Server secrets
 *     (API keys, DATABASE_URL) and NODE_OPTIONS are never inherited.
 *   • Nothing executes or writes without an explicit user approval carried
 *     in the request — the routes enforce it, this module documents it.
 */

import { execFile as nodeExecFile, type ExecFileException } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, stat, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { computeDiff, computeStats, type DiffChunk, type DiffStats } from './version-diff.js';
import {
  TEAM_STORAGE_REFUSAL,
  isPathSameOrInside,
  overlapsTeamStorage,
  realPathOrSelf,
} from '../lib/folder-guard.js';
import type { DatabaseAdapter } from '../db/database.js';

// ── Format contract ─────────────────────────────────────────────────────────

/**
 * The machine-parseable output contract the task-execute prompt mandates.
 * v1: each file is one fenced code block whose first non-blank line is a
 * header comment carrying the workspace-relative path:
 *   // FILE: relative/path.ts       (C-style)
 *   #  FILE: relative/path.py       (hash-comment languages)
 *   <!-- FILE: relative/path.html --> (markup)
 * plus a block-comment form ("slash-star FILE: path star-slash") and an SQL
 * form ("-- FILE: path").
 *
 * What weaker models write is accepted too (the standalone Code Studio's rules,
 * see "Parser hardening" below): any fence info string, ~~~ fences, up to three
 * spaces of indent, `file:` in any case, and a path line just above the fence
 * (`**src/a.ts**`). A block that elides code ("// ... rest unchanged"), a diff,
 * or a rewrite that loses most of an existing file (checkWholeFileWrite) is
 * refused.
 */
export const FILE_BLOCK_FORMAT_VERSION = 'anton-coding-file-blocks/v1';

export interface ParsedFileBlock {
  /** Normalized workspace-relative path (forward slashes). */
  path: string;
  /** Full file content, normalized to end with exactly one '\n'. */
  content: string;
  /** Info string of the fence (language tag), if any. */
  language?: string;
}

export interface RejectedBlock {
  reason: string;
  /** The raw header path when one was present. */
  path?: string;
}

export interface ParseResult {
  formatVersion: typeof FILE_BLOCK_FORMAT_VERSION;
  files: ParsedFileBlock[];
  /** Blocks that declared a FILE header but were refused. */
  rejected: RejectedBlock[];
  /** Paths that appeared more than once (last block won). */
  duplicates: string[];
  /** Fenced blocks without a FILE header (prose/JSON examples) — ignored. */
  ignoredBlocks: number;
  /** Paths named by the line above the fence instead of a header inside it. */
  pathsFromLineAbove: string[];
}

export interface ParseOptions {
  /** Current contents of existing files, by normalised path. A block that
   *  loses most of one of them is refused as truncated. */
  originals?: ReadonlyMap<string, string>;
  /** Shrink rule: a file of at least `minLines` non-blank lines may not come
   *  back with fewer than `ratio` of them. */
  shrink?: { minLines?: number; ratio?: number };
}

export const SHRINK_DEFAULTS = { minLines: 30, ratio: 0.4 } as const;

const MAX_FILE_CHARS = 1_000_000;       // 1 MB per file (text format)
const MAX_TOTAL_CHARS = 4_000_000;      // 4 MB per response
const MAX_PATH_LENGTH = 512;

// ── Parser hardening for weaker models ──────────────────────────────────────
//
// The same rules as the standalone Code Studio's parser
// (packages/agent-runtime/src/contracts/file-blocks.ts, 2026-09-25), which
// were written to be ported here as they are; its weak-model fixtures run
// against this copy too (tests/services/coding/fixtures/weak-model-replies.ts).
// ANTON's copy differs in one way only: the apply preview parses text the
// CLIENT sends, so the FILE header, wrapping quotes and block comments are read
// by linear scans instead of lazy patterns (which backtrack for seconds to
// minutes on a long line). The results are the same.

// Case-insensitive: weak models write `// File:` and `# file:` as often as the
// documented form, and a block silently ignored for its capitalisation is a
// lost write. The standalone writes each form as one pattern, e.g.
// /^<!--\s*FILE(?:NAME|PATH)?:\s*(.+?)\s*-->\s*$/i — an opener with the
// keyword, the path, and for two forms a closer.
const HEADER_FORMS: Array<{ opener: RegExp; closer?: string }> = [
  { opener: /^\/\/\s*FILE(?:NAME|PATH)?:/i },
  { opener: /^#\s*FILE(?:NAME|PATH)?:/i },
  { opener: /^<!--\s*FILE(?:NAME|PATH)?:/i, closer: '-->' },
  { opener: /^\/\*\s*FILE(?:NAME|PATH)?:/i, closer: '*/' },
  { opener: /^--\s*FILE(?:NAME|PATH)?:/i },
];

/** `s` without a leading or a trailing run of the given quote characters. */
function stripWrappingQuotes(s: string, quotes: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && quotes.includes(s[start])) start++;
  while (end > start && quotes.includes(s[end - 1])) end--;
  return s.slice(start, end);
}

/** The path in a FILE header line (already trimmed), or null. */
function matchFileHeader(line: string): string | null {
  for (const { opener, closer } of HEADER_FORMS) {
    const m = line.match(opener);
    if (!m) continue;
    let rest = line.slice(m[0].length);
    if (closer) {
      const body = rest.trimEnd();
      if (!body.endsWith(closer)) continue;
      rest = body.slice(0, body.length - closer.length);
      // Only blanks before the closer: the pattern's (.+?) takes one of them,
      // and the block is refused for an empty path.
      if (rest !== '' && rest.trim() === '') return ' ';
    }
    const path = rest.trim();
    if (!path) continue;
    return stripWrappingQuotes(path, '`"\'');
  }
  return null;
}

// CommonMark fences: up to 3 spaces of indent, 3+ backticks or tildes. A
// backtick info string cannot contain a backtick (that is inline code).
const FENCE_LINE = /^( {0,3})(`{3,}|~{3,})(.*)$/;

interface FenceLine {
  indent: number;
  char: '`' | '~';
  len: number;
  info: string;
}

function fenceLine(line: string): FenceLine | null {
  const m = line.match(FENCE_LINE);
  if (!m) return null;
  const char = m[2][0] as '`' | '~';
  const info = m[3].trim();
  if (char === '`' && info.includes('`')) return null;
  return { indent: m[1].length, char, len: m[2].length, info };
}

/** A path written on its own line just above a fence: `**src/a.ts**`,
 *  `` `src/a.ts` ``, `### src/a.ts`, `src/a.ts:`, `File: Makefile`, or a
 *  FILE header placed outside the fence. A sentence is never a path. */
export function pathFromLine(raw: string): string | null {
  const header = matchFileHeader(raw.trim());
  if (header !== null) return header;
  let t = raw.trim().replace(/[*`]/g, '');
  t = t.replace(/^(?:#{1,6}\s+|[-+]\s+|\d+[.)]\s+|>\s*)+/, '').trim();
  let labelled = false;
  const label = t.match(/^(?:file(?:name|path)?|path)\s*[:\-–]\s*(.+)$/i);
  if (label) {
    t = label[1].trim();
    labelled = true;
  }
  t = stripWrappingQuotes(t, '"\'').replace(/:$/, '').trim();
  if (!t || /\s/.test(t)) return null;
  if (!/^[\w.\-/@+~[\]()$\\]+$/.test(t)) return null;
  if (!labelled && !t.includes('/') && !/\.[A-Za-z][A-Za-z0-9]{0,9}$/.test(t)) return null;
  return t;
}

// ── Elision placeholders ─────────────────────────────────────────────────────
//
// A whole-file write that says "// ... rest unchanged" deletes the code the
// placeholder stands for. Only a line that is NOTHING but such a comment
// counts, and the phrases are anchored so an ordinary comment that happens to
// contain "the rest of" is not caught.

const NOUN =
  '(?:file|code|codebase|class|module|functions?|methods?|components?|implementation|contents?|logic|imports|exports|tests?|' +
  'properties|fields|config(?:uration)?|styles?|routes|handlers?|body|script|template|document|section|page|file contents)';
const QUAL =
  '(?:(?:is |are |remains? |stays? )?(?:unchanged|the same|as before|as is|as-is|omitted|not shown|elided|untouched|identical|' +
  'as (?:it|they) (?:was|were))|same as before|goes here|here)';
// "rest of YOUR code", "your existing code": weak models address the user.
const DET = '(?:the |this |your |my |our )?';
const POSS = '(?:the |your |my |our )?';

const ELISION_PHRASES: RegExp[] = [
  new RegExp(`^(?:the )?(?:rest|remainder)(?: of ${DET}${NOUN})?(?: ${QUAL})?$`),
  new RegExp(`^${POSS}(?:existing|previous|original|unchanged|old) (?:code|implementation|logic|contents?)$`),
  new RegExp(`^${POSS}(?:existing|previous|original|other|remaining|old) ${NOUN} ${QUAL}$`),
  new RegExp(`^(?:${NOUN} )?(?:unchanged|omitted|not shown|elided|truncated|snipped|same as (?:before|above)|as before)$`),
  /\bfor brevity\b/,
  new RegExp(`^(?:keep|leave|retain|preserve) (?:the |all |your |my |our )?(?:rest|existing|remaining|other|original)(?: ${NOUN})?(?: ${QUAL})?$`),
];

// Only with an ellipsis ("// ... rest of the JSX ...", "// ... unchanged
// methods ..."): without one these are ordinary comments, and a scaffold's
// "// your code here" is deliberate.
const ELLIPSIS_PHRASES: RegExp[] = [
  new RegExp(`^${POSS}(?:other|more|remaining|existing|previous|similar|additional) ${NOUN}$`),
  /^(?:etc|and so on|and so forth|and more)$/,
  new RegExp(`^(?:the |your )?(?:rest|remainder)(?: of ${DET}[a-z]+(?: [a-z]+)?)?$`),
  /^(?:unchanged|existing|other|remaining) [a-z]+$/,
  new RegExp(`^(?:your|my|our) ${NOUN}(?: goes)? here$`),
];

const MARKDOWN_FILE = /\.(md|mdx|markdown|mdown)$/i;
// Documents that can hold ``` fences of their own (AsciiDoc accepts them too).
// A .txt or .rst file cannot, so a bare fence after one never means it was cut:
// requirements.txt followed by a bare ``` install snippet is simply two blocks.
const FENCED_DOCUMENT_FILE = /\.(md|mdx|markdown|mdown|adoc)$/i;

/** A short sentence that introduces the fence below it ("Install with:",
 *  "Then run `npm start`:") — prose, so the bare fence after it opens a
 *  snippet of the reply rather than closing a snippet inside a document. */
function introducesFence(line: string | null): boolean {
  if (line === null) return false;
  const t = stripWrappingQuotes(line.trim(), '*_');
  if (t.length > 160) return false;
  return /^[A-Z][\w'’,.`/-]*(?: [\w'’,.`/-]+)*:$/.test(t);
}
const CLIKE_FILE =
  /\.(m?[jt]sx?|cjs|cts|mts|java|kts?|go|rs|c|cc|cpp|cxx|h|hh|hpp|cs|swift|php|css|scss|less|json|jsonc|vue|svelte|dart|scala)$/i;

function commentBody(line: string, markdown: boolean): string | null {
  const t = line.trim();
  let m = t.match(/^<!--(.*?)-->$/);
  if (m) return m[1];
  if (markdown) return null;
  // {/* … */} and /* … */ — sliced to the same body the standalone's
  // /^\{\s*\/\*(.*?)\*\/\s*\}$/ and /^\/\*+(.*?)\*+\/$/ capture; the second
  // pattern takes minutes on a long line of asterisks.
  if (t.startsWith('{') && t.endsWith('}')) {
    const inner = t.slice(1, -1).trim();
    if (inner.length >= 4 && inner.startsWith('/*') && inner.endsWith('*/')) return inner.slice(2, -2);
  }
  if (t.length >= 4 && t.startsWith('/*') && t.endsWith('*/')) return stripWrappingQuotes(t.slice(2, -2), '*');
  m = t.match(/^\/\/+(.*)$/);
  if (m) return m[1];
  m = t.match(/^#+(?![![])(.*)$/);
  if (m) return m[1];
  m = t.match(/^--+(.*)$/);
  if (m) return m[1];
  m = t.match(/^\*+(?!\/)(.*)$/);
  if (m) return m[1];
  return null;
}

function isElisionBody(body: string): boolean {
  const lowered = body.toLowerCase().replace(/[()[\]{}]/g, ' ');
  const hasEllipsis = /\.{3,}|…/.test(lowered);
  const words = lowered
    .replace(/\.{3,}|…/g, ' ')
    .replace(/[:;,.!]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (hasEllipsis && words === '') return true;
  if (ELISION_PHRASES.some((re) => re.test(words))) return true;
  return hasEllipsis && ELLIPSIS_PHRASES.some((re) => re.test(words));
}

/** The first line of `content` that is an elision placeholder, or null. */
export function findElisionPlaceholder(filePath: string, content: string): { line: number; text: string } | null {
  const markdown = MARKDOWN_FILE.test(filePath);
  const clike = CLIKE_FILE.test(filePath);
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    // A bare `...` is not code in a C-like file (in Python it is: Ellipsis).
    if (clike && /^(?:\.{3,}|…)$/.test(trimmed)) return { line: i + 1, text: trimmed };
    const body = commentBody(trimmed, markdown);
    if (body !== null && isElisionBody(body)) return { line: i + 1, text: trimmed };
  }
  return null;
}

function nonBlankLines(s: string): number {
  let n = 0;
  for (const l of s.split('\n')) if (l.trim()) n++;
  return n;
}

/**
 * Why a whole-file write of `content` to `filePath` must not be applied, or
 * null when it may. `original` is the file as it stands, if it exists. The
 * parser applies this to every block; the apply preview and the Studio build
 * loop apply it again once they have read the file from the workspace.
 */
export function checkWholeFileWrite(
  filePath: string,
  content: string,
  original?: string | null,
  shrink: { minLines?: number; ratio?: number } = {},
): string | null {
  const elided = findElisionPlaceholder(filePath, content);
  if (elided) {
    return (
      `elision placeholder at line ${elided.line} ("${elided.text.slice(0, 80)}") — a file block replaces the WHOLE ` +
      'file, so a placeholder would delete the code it stands for. Re-emit the complete file.'
    );
  }
  if (original !== undefined && original !== null) {
    const minLines = shrink.minLines ?? SHRINK_DEFAULTS.minLines;
    const ratio = shrink.ratio ?? SHRINK_DEFAULTS.ratio;
    const before = nonBlankLines(original);
    const after = nonBlankLines(content);
    if (before >= minLines && after < before * ratio) {
      return (
        `shrinks from ${before} to ${after} non-blank lines against the current file — a whole-file ` +
        `write that loses more than ${Math.round((1 - ratio) * 100)}% of a file reads as truncated. Re-emit the complete file.`
      );
    }
  }
  return null;
}

interface OpenBlock {
  fence: FenceLine;
  pathAbove: string | null;
  lines: string[];
  /** Inner fences opened with an info string, still waiting for their close. */
  nested: FenceLine[];
}

/** Lines outside any fence, up to and including the first one that closes a
 *  `<think>` region with no opener before it: that whole prefix was reasoning
 *  whose opening tag the chat template swallowed. */
function dropUnopenedReasoning(lines: string[]): string[] {
  let fence: FenceLine | null = null;
  for (let i = 0; i < lines.length; i++) {
    const f = fenceLine(lines[i]);
    if (fence === null && f) {
      fence = f;
      continue;
    }
    if (fence !== null) {
      if (f && f.char === fence.char && f.info === '' && f.len >= fence.len) fence = null;
      continue;
    }
    const t = lines[i].trim();
    if (/^<(?:think|thinking)\b[^>]*>/i.test(t)) return lines;
    const close = t.match(/^<\/(?:think|thinking)\s*>/i);
    if (close) return [t.slice(close[0].length), ...lines.slice(i + 1)];
  }
  return lines;
}

/** Remove up to `n` leading spaces — the opening fence's own indent, as
 *  CommonMark does for the lines of an indented fence. */
function stripIndent(line: string, n: number): string {
  let i = 0;
  while (i < n && line[i] === ' ') i++;
  return line.slice(i);
}

/**
 * Parse anton-coding-file-blocks/v1 blocks out of an LLM response.
 * Deterministic; CommonMark fence rules (length, char, indent); an unterminated
 * fence is never applied (truncated responses must not half-write a file).
 */
export function parseFileBlocks(text: string, options: ParseOptions = {}): ParseResult {
  const lines = dropUnopenedReasoning(text.split('\n').map((l) => l.replace(/\r$/, '')));
  const byPath = new Map<string, ParsedFileBlock>();
  const rejected: RejectedBlock[] = [];
  const duplicates: string[] = [];
  const pathsFromLineAbove: string[] = [];
  let ignoredBlocks = 0;
  let totalChars = 0;

  let open: OpenBlock | null = null;
  let inThink = false;
  /** Nearest non-blank line outside a fence, and the blank lines since it. */
  let lastOutside: string | null = null;
  let blanksSince = 0;
  /** A Markdown block closed by a bare fence: its end is ambiguous until the
   *  next fence line outside shows whether that fence was the file's own. */
  let pendingDoc: { path: string; fence: FenceLine } | null = null;

  const headerPathOf = (block: OpenBlock): { path: string | null; body: string[]; fromAbove: boolean } => {
    let idx = 0;
    while (idx < block.lines.length && block.lines[idx].trim() === '') idx++;
    const header = idx < block.lines.length ? matchFileHeader(block.lines[idx].trim()) : null;
    if (header !== null) return { path: header, body: block.lines.slice(idx + 1), fromAbove: false };
    if (block.pathAbove !== null) return { path: block.pathAbove, body: block.lines, fromAbove: true };
    return { path: null, body: block.lines, fromAbove: false };
  };

  const closeBlock = (block: OpenBlock): string | null => {
    const { path: rawPath, body, fromAbove } = headerPathOf(block);
    if (rawPath === null) {
      ignoredBlocks++;
      return null;
    }
    const validated = validateRelativePath(rawPath);
    if (!validated.ok) {
      rejected.push({ reason: validated.reason, path: rawPath });
      return null;
    }
    const lang = block.fence.info.split(/\s+/)[0] ?? '';
    const filePath = validated.normalized;
    if (/^(?:diff|patch)$/i.test(lang) && !/\.(diff|patch)$/i.test(filePath)) {
      rejected.push({
        reason: 'the block is a diff, and this format replaces the WHOLE file — emit the complete final contents instead',
        path: filePath,
      });
      return null;
    }
    // Trailing blank lines trimmed by a scan: /\n+$/ backtracks quadratically
    // on a long run of newlines that does not end the text (client-sent text).
    let end = body.length;
    while (end > 0 && body[end - 1] === '') end--;
    const content = body.slice(0, end).join('\n') + '\n';
    if (content.length > MAX_FILE_CHARS) {
      rejected.push({ reason: `file exceeds ${MAX_FILE_CHARS} characters`, path: filePath });
      return null;
    }
    const refusal = checkWholeFileWrite(filePath, content, options.originals?.get(filePath), options.shrink);
    if (refusal !== null) {
      rejected.push({ reason: refusal, path: filePath });
      return null;
    }
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      rejected.push({ reason: `total parsed content exceeds ${MAX_TOTAL_CHARS} characters — block skipped`, path: filePath });
      return null;
    }
    if (byPath.has(filePath)) duplicates.push(filePath);
    byPath.set(filePath, { path: filePath, content, language: lang || undefined });
    if (fromAbove) pathsFromLineAbove.push(filePath);
    return filePath;
  };

  /** Would this line, with what follows it, open a new FILE block? */
  const startsHeaderBlock = (at: number): boolean => {
    for (let j = at + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (!t) continue;
      return matchFileHeader(t) !== null;
    }
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (open === null) {
      // Reasoning written into the answer. Only OUTSIDE a fence — a file may
      // legitimately contain these tags.
      if (inThink) {
        if (/<\/(?:think|thinking)\s*>/i.test(line)) inThink = false;
        continue;
      }
      if (/^\s*<(?:think|thinking)\b[^>]*>/i.test(line)) {
        if (!/<\/(?:think|thinking)\s*>/i.test(line)) inThink = true;
        continue;
      }

      const fence = fenceLine(line);
      if (fence) {
        const pathAbove = lastOutside !== null && blanksSince <= 1 ? pathFromLine(lastOutside) : null;
        if (pendingDoc) {
          // The first fence after a Markdown block closed by a bare fence. A
          // bare fence that could have closed it, with no path or header of its
          // own, means the file most likely held its own fence and was cut
          // there — refuse it rather than write half a README. A sentence that
          // introduces the fence ("Install with:") says it is the reply's own
          // snippet: inside a cut README the line above would be snippet code.
          const couldHaveClosed =
            fence.info === '' && fence.char === pendingDoc.fence.char && fence.len >= pendingDoc.fence.len;
          if (couldHaveClosed && pathAbove === null && !startsHeaderBlock(i) && !introducesFence(lastOutside)) {
            byPath.delete(pendingDoc.path);
            const at = pathsFromLineAbove.indexOf(pendingDoc.path);
            if (at >= 0) pathsFromLineAbove.splice(at, 1);
            rejected.push({
              reason:
                'the end of this block is ambiguous — the file seems to contain ``` fences of its own. Re-emit it ' +
                'inside a longer fence (```` or ~~~) than any fence in the file.',
              path: pendingDoc.path,
            });
          }
          pendingDoc = null;
        }
        open = { fence, pathAbove, lines: [], nested: [] };
        lastOutside = null;
        blanksSince = 0;
        continue;
      }
      if (line.trim() === '') {
        blanksSince++;
      } else {
        lastOutside = line;
        blanksSince = 0;
      }
      continue;
    }

    const fence = fenceLine(line);
    if (fence && fence.char === open.fence.char && fence.info === '') {
      const inner = open.nested[open.nested.length - 1];
      if (inner && fence.len >= inner.len) {
        open.nested.pop();
        open.lines.push(stripIndent(line, open.fence.indent));
        continue;
      }
      if (!inner && fence.len >= open.fence.len) {
        const closed: OpenBlock = open;
        open = null;
        const written = closeBlock(closed);
        pendingDoc = written !== null && FENCED_DOCUMENT_FILE.test(written) ? { path: written, fence: closed.fence } : null;
        continue;
      }
    }
    if (fence && fence.info !== '') {
      // Only a fence that could NOT be the open block's own content — the same
      // character and at least as long. Inside a ```` or ~~~ block a ``` fence
      // is content, so a document's example that starts with `# File: config.yml`
      // is not a new block (review C17, the standalone's rule).
      if (fence.char === open.fence.char && fence.len >= open.fence.len && startsHeaderBlock(i)) {
        // A new FILE block began before this one closed. Resync on it, so one
        // unclosed block cannot swallow every block after it.
        const unclosed = headerPathOf(open);
        if (unclosed.path !== null) {
          rejected.push({
            reason: 'unterminated code fence (a new file block started before this one closed) — not applied',
            path: unclosed.path,
          });
        } else {
          ignoredBlocks++;
        }
        open = { fence, pathAbove: null, lines: [], nested: [] };
        continue;
      }
      if (fence.char === open.fence.char) open.nested.push(fence);
    }
    open.lines.push(stripIndent(line, open.fence.indent));
  }

  const unfinished = open as OpenBlock | null;
  if (unfinished !== null && unfinished.lines.length > 0) {
    const { path: headerPath } = headerPathOf(unfinished);
    if (headerPath !== null) {
      rejected.push({ reason: 'unterminated code fence (response truncated?) — not applied', path: headerPath });
    }
  }

  return {
    formatVersion: FILE_BLOCK_FORMAT_VERSION,
    files: Array.from(byPath.values()),
    rejected,
    duplicates,
    ignoredBlocks,
    pathsFromLineAbove,
  };
}

// ── JSON replies (planner, panel) ───────────────────────────────────────────
//
// The same extractor as the standalone's structured/json-reply.ts. The rule,
// in order:
//   1. drop reasoning written into the answer;
//   2. the LAST fenced block (``` or ~~~, any info string) whose JSON parses
//      and has the shape the caller asked for;
//   3. else the last balanced {…} in the text that does;
//   4. else the whole text, if it parses;
// and when nothing has the shape, the last candidate that parses at all — so
// the caller's own shape check fails with its usual, honest reason. Nothing is
// repaired.

const REASONING_OPENER_AT_START = /^(\s*)<(?:think|thinking)\b[^>]*>/i;
const REASONING_CLOSER = /<\/(?:think|thinking)\s*>/i;

/** `text` (from a line start) without the reasoning regions it begins with;
 *  `open` when the last one does not close on this line. */
function leadingReasoningStripped(text: string): { kept: string; open: boolean } {
  let kept = '';
  let rest = text;
  for (;;) {
    const opener = REASONING_OPENER_AT_START.exec(rest);
    if (!opener) return { kept: kept + rest, open: false };
    kept += opener[1];
    rest = rest.slice(opener[0].length);
    const close = REASONING_CLOSER.exec(rest);
    if (!close) return { kept, open: true };
    rest = rest.slice(close.index + close[0].length);
  }
}

/**
 * Remove reasoning a model wrote into its answer text — where a chat template
 * puts it, by the file-block parser's rules: a `<think>` / `<thinking>` opener
 * that begins a line outside a fence, through its close (to the end when it
 * never closes: the reply was cut inside it), and a prefix that ends in a line
 * starting with a close whose opener the template swallowed. A tag inside a
 * sentence, a JSON string or a fenced block is content ("collapse the <think>
 * block"), and is kept.
 */
export function stripReasoning(raw: string): string {
  const lines = dropUnopenedReasoning(raw.replace(/\r\n/g, '\n').split('\n'));
  const out: string[] = [];
  let fence: FenceLine | null = null;
  let thinking = false;
  for (const line of lines) {
    if (thinking) {
      const close = REASONING_CLOSER.exec(line);
      if (!close) continue;
      const after = leadingReasoningStripped(line.slice(close.index + close[0].length));
      out[out.length - 1] += after.kept;
      thinking = after.open;
      continue;
    }
    if (fence !== null) {
      const f = fenceLine(line);
      if (f && f.char === fence.char && f.info === '' && f.len >= fence.len) fence = null;
      out.push(line);
      continue;
    }
    const f = fenceLine(line);
    if (f) {
      fence = f;
      out.push(line);
      continue;
    }
    const stripped = leadingReasoningStripped(line);
    out.push(stripped.kept);
    thinking = stripped.open;
  }
  return out.join('\n');
}

/** The bodies of the fenced blocks in `text`, in order. */
function fencedBodies(text: string): string[] {
  const out: string[] = [];
  let open: { char: string; len: number } | null = null;
  let body: string[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const m = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (open === null) {
      if (!m) continue;
      const rest = m[2];
      // A one-line fence (```json {"a":1}```) is its own block.
      const inline = rest.match(new RegExp(`^[^\\s{\\[]*\\s*([\\s\\S]*?)\\s*${m[1][0] === '`' ? '`' : '~'}{3,}\\s*$`));
      if (inline && inline[1].trim()) {
        out.push(inline[1]);
        continue;
      }
      open = { char: m[1][0], len: m[1].length };
      body = [];
      continue;
    }
    if (m && m[1][0] === open.char && m[1].length >= open.len && m[2].trim() === '') {
      out.push(body.join('\n'));
      open = null;
      continue;
    }
    body.push(line);
  }
  return out;
}

const MAX_SCAN_STARTS = 400;

/** Balanced top-level `{…}` spans, string-aware. A span that does not parse is
 *  skipped whole, so an object nested inside broken JSON is never offered as
 *  if it were the answer. */
function braceSpans(text: string): string[] {
  const spans: string[] = [];
  let starts = 0;
  let i = text.indexOf('{');
  while (i >= 0 && starts < MAX_SCAN_STARTS) {
    starts++;
    let depth = 0;
    let inString = false;
    let end = -1;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (ch === '\\') j++;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) {
      i = text.indexOf('{', i + 1);
      continue;
    }
    spans.push(text.slice(i, end + 1));
    i = text.indexOf('{', end + 1);
  }
  return spans;
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text.trim()) as unknown };
  } catch {
    return { ok: false };
  }
}

export interface JsonReply {
  /** The candidate text that was chosen. */
  text: string;
  /** Its parsed value. */
  value: unknown;
}

/**
 * The JSON a model reply carries, or null when no candidate parses.
 * `accept` says what shape the caller wants; a candidate that parses but has
 * another shape (an example object, a schema) is passed over for one that has it.
 */
export function extractJsonReply(raw: string, accept?: (value: unknown) => boolean): JsonReply | null {
  const text = stripReasoning(raw ?? '');
  const candidates = [...fencedBodies(text)].reverse();
  candidates.push(...braceSpans(text).reverse());
  candidates.push(text);
  let firstParsed: JsonReply | null = null;
  for (const candidate of candidates) {
    if (!candidate.trim()) continue;
    const parsed = tryParseJson(candidate);
    if (!parsed.ok) continue;
    const reply = { text: candidate.trim(), value: parsed.value };
    if (!accept || accept(parsed.value)) return reply;
    firstParsed ??= reply;
  }
  return firstParsed;
}

/** Shape helpers for `accept`. */
export function isJsonObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function hasArrayField(field: string): (v: unknown) => boolean {
  return (v) => isJsonObject(v) && Array.isArray(v[field]);
}

// ── Path validation (the attack surface) ────────────────────────────────────

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const FORBIDDEN_TOP_DIRS = new Set(['.anton-coding-backup', '.git']);

export type PathValidation =
  | { ok: true; normalized: string }
  | { ok: false; reason: string };

/**
 * Validate an LLM-supplied workspace-relative path. Rejects absolute paths
 * (POSIX, drive-letter, drive-relative, UNC), traversal (`..`), null bytes,
 * reserved Windows device names, illegal characters, and writes into the
 * backup dir or .git. Returns a normalized forward-slash relative path.
 */
export function validateRelativePath(raw: string): PathValidation {
  let p = String(raw ?? '').trim();
  // Strip one layer of wrapping quotes/backticks the LLM may add.
  // A scan, not /^["'`]+|["'`]+$/g, which backtracks on a long run of quotes.
  p = stripWrappingQuotes(p, '"\'`').trim();
  if (!p) return { ok: false, reason: 'empty path' };
  if (p.length > MAX_PATH_LENGTH) return { ok: false, reason: `path longer than ${MAX_PATH_LENGTH} characters` };
  // eslint-disable-next-line no-control-regex
  if (/[\0-\x1f]/.test(p)) return { ok: false, reason: 'control characters in path' };
  if (/^[a-zA-Z]:/.test(p)) return { ok: false, reason: 'absolute/drive-letter paths are not allowed' };
  if (p.startsWith('/') || p.startsWith('\\')) return { ok: false, reason: 'absolute paths are not allowed' };
  if (p.endsWith('/') || p.endsWith('\\')) return { ok: false, reason: 'path must name a file, not a directory' };

  const segments = p.split(/[\\/]+/);
  const kept: string[] = [];
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') return { ok: false, reason: 'path traversal (..) is not allowed' };
    if (WINDOWS_RESERVED.test(seg)) return { ok: false, reason: `reserved device name in path: ${seg}` };
    if (/[<>:"|?*]/.test(seg)) return { ok: false, reason: 'illegal characters in path' };
    kept.push(seg);
  }
  if (kept.length === 0) return { ok: false, reason: 'empty path' };
  if (FORBIDDEN_TOP_DIRS.has(kept[0].toLowerCase())) {
    return { ok: false, reason: `writes into ${kept[0]}/ are not allowed` };
  }
  return { ok: true, normalized: kept.join('/') };
}

/**
 * Final defense at write time: resolve the (already-validated) relative
 * path against the workspace and verify the result stays inside it.
 * Returns the absolute target path, or null if it escapes.
 */
export function resolveTargetPath(workspaceAbs: string, normalizedRel: string): string | null {
  const base = path.resolve(workspaceAbs);
  const abs = path.resolve(base, normalizedRel);
  if (abs === base) return null; // the workspace dir itself is not a file target
  return abs.startsWith(base + path.sep) ? abs : null;
}

/**
 * Symlink-aware escape check (defense in depth on top of the lexical
 * resolveTargetPath). A pre-existing symlink anywhere in the workspace could
 * make a lexically-inside path resolve, physically, OUTSIDE the allowlist.
 *
 * We realpath the deepest EXISTING ancestor of the target (the target itself
 * and intermediate dirs may not exist yet — ENOENT walks up) and the workspace
 * root, then require the realpathed ancestor to stay within the realpathed
 * workspace. Returns true when the write is safe.
 *
 * Team mode adds two rules (teamTargetAllowed + the forbidden-dir check in the
 * walk); solo mode is exactly the walk it always was. See teamTargetAllowed for
 * why they are team-only.
 *
 * Exported for tests.
 */
export async function isWriteWithinWorkspaceReal(
  workspaceAbs: string,
  targetAbs: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const team = env.DEPLOYMENT_MODE === 'team';
  let realBase: string;
  try {
    realBase = await realpath(workspaceAbs);
  } catch {
    // Workspace root must resolve — validateWorkspacePath already proved it
    // exists, so a failure here is an unexpected race; fail closed.
    return false;
  }
  if (team && !(await teamTargetAllowed(realBase, targetAbs))) return false;

  // Walk up from the target's parent to the nearest existing ancestor.
  let probe = path.dirname(targetAbs);
  // Guard against an unbounded loop; the loop terminates at the filesystem root.
  for (let i = 0; i < 4096; i++) {
    try {
      const realProbe = await realpath(probe);
      // The realpathed nearest-existing ancestor must be the workspace root or
      // strictly inside it.
      if (realProbe === realBase || realProbe.startsWith(realBase + path.sep)) {
        // Also verify the not-yet-created tail (probe→target) carries no `..`
        // that would climb back out lexically — resolveTargetPath already did,
        // but recompute defensively against realProbe.
        const rel = path.relative(probe, targetAbs);
        const realTarget = path.resolve(realProbe, rel);
        const inside = realTarget === realBase || realTarget.startsWith(realBase + path.sep);
        return inside && !(team && landsInForbiddenTopDir(realBase, realTarget));
      }
      return false;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        const parent = path.dirname(probe);
        if (parent === probe) return false; // reached root without resolving
        probe = parent;
        continue;
      }
      return false; // any other error (EACCES, ELOOP…) → fail closed
    }
  }
  return false;
}

/**
 * Team mode: the one hop the ancestor walk cannot see — the target ITSELF.
 *
 * The walk starts at the target's parent, so a link `ws/notes.md -> <another
 * user's upload>` passed it, and readFile/writeFile then followed the link: the
 * apply preview returned that file as the diff's old side, and approve wrote
 * over it. A link is followed only when it resolves INSIDE the workspace and not
 * into its .git or backup folder (a link to .git/config would plant
 * core.fsmonitor for the next git an admin runs there). A dangling or looping
 * link is refused: writeFile would create the file wherever it points.
 *
 * Why team only. Solo mode followed every link, and still does: a repo's own
 * in-workspace link (README.md -> docs/README.md) must keep working, and the
 * machine's one user owns everything a link can reach. On a shared server the
 * workspace is one user's while the disk is everyone's, and links do arrive in
 * it — a cloned repo, an `npm install`, or a postinstall script run by an
 * admin-approved command can create one — so without this rule a planted link
 * turns the apply preview into a read of any file the server can open.
 */
async function teamTargetAllowed(realBase: string, targetAbs: string): Promise<boolean> {
  let isLink: boolean;
  try {
    isLink = (await lstat(targetAbs)).isSymbolicLink();
  } catch (err) {
    // Absent is the normal case for a new file; anything else fails closed.
    return (err as NodeJS.ErrnoException).code === 'ENOENT';
  }
  if (!isLink) return true;
  let realTarget: string;
  try {
    realTarget = await realpath(targetAbs);
  } catch {
    return false;
  }
  return realTarget.startsWith(realBase + path.sep) && !landsInForbiddenTopDir(realBase, realTarget);
}

/**
 * The write REALLY lands in the workspace's .git/ or backup folder.
 * validateRelativePath refuses those names lexically; this catches the aliases
 * it cannot see — a link, or an NTFS 8.3 short name (`GIT~1/config`), both of
 * which realpath resolves to the long name. Team mode only (see teamTargetAllowed).
 */
function landsInForbiddenTopDir(realBase: string, realTarget: string): boolean {
  const top = path.relative(realBase, realTarget).split(path.sep)[0] ?? '';
  return FORBIDDEN_TOP_DIRS.has(top.toLowerCase());
}

// ── Workspace (ALLOWED_FOLDER_PATHS) validation ─────────────────────────────

export interface WorkspaceValidation {
  ok: boolean;
  /** Resolved absolute path when ok. */
  resolved?: string;
  error?: string;
  allowedBases: string[];
  exists?: boolean;
}

/**
 * The ANTON Studio root (env CODING_STUDIO_ROOT, default ./coding-studio),
 * resolved. This is the ONE safe widening of the allowlist: a single
 * ANTON-OWNED directory (not the user's disk), auto-appended to the allowed
 * bases so Studio can `mkdir coding-studio/<project-slug>/` and bind it
 * through the existing validators without the operator having to add it to
 * ALLOWED_FOLDER_PATHS by hand. Provisioning derives the slug from the project
 * id (never LLM text); the per-project subdir stays inside this root.
 */
export const DEFAULT_CODING_STUDIO_ROOT = './coding-studio';

export function getCodingStudioRoot(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.CODING_STUDIO_ROOT ?? '').trim() || DEFAULT_CODING_STUDIO_ROOT;
  return path.resolve(raw);
}

/**
 * ALLOWED_FOLDER_PATHS, resolved, PLUS the ANTON Studio root.
 * NO default for the user's own paths — an unset ALLOWED_FOLDER_PATHS still
 * means none of the user's directories are writable. The Studio root is the
 * only base we add unconditionally because ANTON owns it.
 *
 * Team mode: minus every entry that overlaps ANTON's per-user storage, by the
 * SAME rule folder-guard.getAllowedFolderBases applies (overlapsTeamStorage).
 * This list used to read the variable on its own, so the shipped
 * `./uploads,./outputs` whitelist still let any user bind every user's uploads
 * as a Studio workspace after the folder guard had stopped allowing them. Not
 * getAllowedFolderBases() itself: its unset-variable fallback (./uploads +
 * ./outputs) is a folder-browsing default Code Studio has never had.
 */
export function getAllowedBases(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.ALLOWED_FOLDER_PATHS ?? '';
  const userBases = raw.split(',').map((p) => p.trim()).filter(Boolean).map((p) => path.resolve(p))
    .filter((b) => !overlapsTeamStorage(b, env));
  const studioRoot = getCodingStudioRoot(env);
  // De-dupe in case the operator also listed the studio root explicitly.
  return userBases.includes(studioRoot) ? userBases : [...userBases, studioRoot];
}

/**
 * Which coding project a workspace is (or is about to be) bound to — lets team
 * mode tell the project's own Studio folder from a colleague's.
 */
export interface WorkspaceScope {
  /**
   * The project's Studio slug (coding-studio-provisioner.deriveProjectSlug), or
   * null when its id yields none. In team mode a workspace inside the Studio
   * root must then be coding-studio/<slug>/ or below it.
   */
  studioSlug: string | null;
  /**
   * The caller is scoped to their own rows (team mode, not an admin —
   * ownership.scopesToOwner). Such a caller may bind and write ONLY inside the
   * project's own coding-studio/<slug>/: the ALLOWED_FOLDER_PATHS bases are
   * shared folders, and a non-admin who could bind one could read and overwrite
   * whatever a colleague keeps there — including a colleague's bound workspace —
   * through the apply preview and approve. Admins keep the whitelisted bases.
   */
  studioOnly?: boolean;
}

/** A team non-admin's workspace outside the project's own Studio folder. */
export const STUDIO_ONLY_REFUSAL =
  "In team mode only an admin may use a folder outside this project's own Code Studio folder (coding-studio/<slug>/) — ALLOWED_FOLDER_PATHS folders are shared";

/** The Studio root itself, or a folder around it, spans every project's workspace. */
export const STUDIO_ROOT_REFUSAL =
  "Workspace is the Code Studio root (or a folder around it), which holds every project's workspace — not usable as one project's workspace in team mode";

/** Another project's coding-studio/<slug>/ folder. */
export const STUDIO_SIBLING_REFUSAL =
  "Workspace is another project's Code Studio folder — in team mode a project may use only its own coding-studio/<slug>/ folder";

/**
 * Team mode: why this (already allowlisted) workspace must still be refused,
 * or null. Checked lexically AND through links, like folder-guard.
 *
 *   1. ANTON's per-user storage (uploads, outputs, …) — never a workspace.
 *      The Studio root is excluded here and handled by rule 2.
 *   2. The Studio root holds every project's folder side by side, so the root
 *      itself (or anything containing it) is refused, and — when the caller
 *      names the project — so is any folder but that project's own.
 *   3. scope.studioOnly (a non-admin caller): nothing but the project's own
 *      Studio folder, lexically AND for real — a link planted in
 *      coding-studio/<slug>/ does not carry the workspace out of it.
 *
 * Rules 1-2 apply to admins too, as folder-guard's storage rule does: this
 * function has no caller identity at several call sites (git, preview, the
 * bundler), and a project has no legitimate reason to use a sibling project's
 * folder. Rule 3 needs the caller, so only request handlers can set it.
 */
function teamWorkspaceRefusal(
  resolved: string,
  env: NodeJS.ProcessEnv,
  scope: WorkspaceScope | undefined,
): string | null {
  if (env.DEPLOYMENT_MODE !== 'team') return null;
  const studioRoot = getCodingStudioRoot(env);
  if (overlapsTeamStorage(resolved, env, [studioRoot])) return TEAM_STORAGE_REFUSAL;

  const roots = [...new Set([studioRoot, realPathOrSelf(studioRoot)])];
  const candidates = [...new Set([resolved, realPathOrSelf(resolved)])];
  for (const candidate of candidates) {
    for (const root of roots) {
      if (isPathSameOrInside(root, candidate)) return STUDIO_ROOT_REFUSAL;
      if (!scope || !isPathSameOrInside(candidate, root)) continue;
      const own = scope.studioSlug ? path.join(root, scope.studioSlug) : null;
      if (!own || !isPathSameOrInside(candidate, own)) return STUDIO_SIBLING_REFUSAL;
    }
  }
  if (scope?.studioOnly) {
    const slug = scope.studioSlug;
    const owns = slug ? roots.map((root) => path.join(root, slug)) : [];
    // EVERY candidate — the given path and its real location — must be in the
    // project's own folder; a slug-less project has no folder, so none passes.
    // isPathSameOrInside folds case on Windows/macOS, which is safe as an ALLOW
    // here: slugs are lowercase hex, so a differently-cased folder is never a
    // sibling project's, and the real location is compared as well.
    if (!candidates.every((c) => owns.some((own) => isPathSameOrInside(c, own)))) return STUDIO_ONLY_REFUSAL;
  }
  return null;
}

/**
 * Two workspace folders overlap: the same folder, or one inside the other,
 * lexically or through a link. Binding one reaches the other's files, which is
 * why team mode lets two projects share a folder only when one person owns
 * both (coding-large.ts). Refusal checks only (case-folded like folder-guard).
 */
export function workspacesOverlap(a: string, b: string): boolean {
  const as = [...new Set([path.resolve(a), realPathOrSelf(a)])];
  const bs = [...new Set([path.resolve(b), realPathOrSelf(b)])];
  return as.some((x) => bs.some((y) => isPathSameOrInside(x, y) || isPathSameOrInside(y, x)));
}

/**
 * Validate a candidate workspace directory: absolute, inside an allowed
 * base (resolve + prefix check — the CLAUDE.md pattern), and an existing
 * directory. Called at bind time AND on every use.
 *
 * In team mode also refuses ANTON's per-user storage and the Studio root
 * (teamWorkspaceRefusal); pass `scope` wherever the project is known so a
 * sibling project's Studio folder is refused as well.
 */
export async function validateWorkspacePath(
  dirPath: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
  scope?: WorkspaceScope,
): Promise<WorkspaceValidation> {
  const allowedBases = getAllowedBases(env);
  if (!dirPath || !String(dirPath).trim()) {
    return { ok: false, error: 'No workspace directory bound to this project.', allowedBases };
  }
  if (allowedBases.length === 0) {
    return {
      ok: false,
      error: 'ALLOWED_FOLDER_PATHS is not configured — add your workspace root to it in .env to enable workspace writes.',
      allowedBases,
    };
  }
  if (!path.isAbsolute(dirPath)) {
    return { ok: false, error: 'Workspace path must be absolute.', allowedBases };
  }
  const resolved = path.resolve(dirPath);
  const inside = allowedBases.some((base) => resolved === base || resolved.startsWith(base + path.sep));
  if (!inside) {
    return { ok: false, error: 'Workspace is outside ALLOWED_FOLDER_PATHS.', allowedBases, resolved };
  }
  const refusal = teamWorkspaceRefusal(resolved, env, scope);
  if (refusal) {
    return { ok: false, error: refusal, allowedBases, resolved };
  }
  try {
    const st = await stat(resolved);
    if (!st.isDirectory()) {
      return { ok: false, error: 'Workspace path exists but is not a directory.', allowedBases, resolved, exists: true };
    }
  } catch {
    return { ok: false, error: 'Workspace directory does not exist.', allowedBases, resolved, exists: false };
  }
  return { ok: true, resolved, allowedBases, exists: true };
}

// ── Deterministic diff ──────────────────────────────────────────────────────

export type FileAction = 'create' | 'modify' | 'unchanged';

export interface FileDiff {
  path: string;
  action: FileAction;
  stats: DiffStats;
  chunks: DiffChunk[];
}

/** Reuses the line-based diff from version-diff.ts — pure and deterministic. */
export function buildFileDiff(relPath: string, oldContent: string | null, newContent: string): FileDiff {
  if (oldContent === null) {
    const newLines = newContent.replace(/\n$/, '').split('\n');
    return {
      path: relPath,
      action: 'create',
      stats: {
        linesAdded: newLines.length, linesRemoved: 0, linesModified: 0,
        linesUnchanged: 0, similarity: 0, sectionsChanged: [],
      },
      chunks: [{ type: 'added', newLines }],
    };
  }
  if (oldContent === newContent) {
    return {
      path: relPath,
      action: 'unchanged',
      stats: { linesAdded: 0, linesRemoved: 0, linesModified: 0, linesUnchanged: oldContent.split('\n').length, similarity: 1, sectionsChanged: [] },
      chunks: [],
    };
  }
  const chunks = computeDiff(oldContent, newContent);
  return { path: relPath, action: 'modify', stats: computeStats(chunks, oldContent, newContent), chunks };
}

/**
 * Compact unchanged runs to head/tail context lines so previews stay small.
 * Deterministic.
 */
export function compactChunks(chunks: DiffChunk[], context = 3): DiffChunk[] {
  return chunks.map((c) => {
    if (c.type !== 'unchanged' || !c.lines || c.lines.length <= context * 2 + 1) return c;
    const omitted = c.lines.length - context * 2;
    return {
      ...c,
      lines: [
        ...c.lines.slice(0, context),
        `… ${omitted} unchanged lines …`,
        ...c.lines.slice(c.lines.length - context),
      ],
    };
  });
}

// ── Apply (write with backup) ───────────────────────────────────────────────

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export interface AppliedFileResult {
  path: string;
  action: FileAction;
  hash_before: string | null;
  hash_after: string;
  backed_up: boolean;
}

export interface ApplyResult {
  /** Workspace-relative backup dir, e.g. '.anton-coding-backup/2026-06-11T...' */
  backupDir: string;
  files: AppliedFileResult[];
  written: number;
  unchanged: number;
}

/**
 * Write parsed files into the workspace. Every target is re-resolved and
 * prefix-checked; originals are copied to .anton-coding-backup/<timestamp>/
 * (preserving relative structure) before being overwritten; a manifest.json
 * in the backup dir records the application for manual revert.
 *
 * Caller MUST have validated the workspace via validateWorkspacePath and
 * obtained explicit user approval.
 */
export async function applyFilesToWorkspace(params: {
  workspaceAbs: string;
  files: Array<{ path: string; content: string }>;
  applicationId: string;
}): Promise<ApplyResult> {
  const { workspaceAbs, files, applicationId } = params;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRel = `.anton-coding-backup/${stamp}`;
  const backupAbs = path.join(workspaceAbs, '.anton-coding-backup', stamp);

  const results: AppliedFileResult[] = [];
  let written = 0;
  let unchanged = 0;
  let backupDirCreated = false;

  for (const file of files) {
    // Defense in depth: re-validate even though preview validated already.
    const validated = validateRelativePath(file.path);
    if (!validated.ok) throw new Error(`refusing to write ${file.path}: ${validated.reason}`);
    const target = resolveTargetPath(workspaceAbs, validated.normalized);
    if (!target) throw new Error(`refusing to write ${file.path}: escapes the workspace`);

    // Defense in depth: a pre-existing symlink in the workspace could make a
    // lexically-inside path resolve physically outside the allowlist. Verify
    // the realpathed nearest-existing ancestor stays inside the workspace.
    if (!(await isWriteWithinWorkspaceReal(workspaceAbs, target))) {
      throw new Error(`refusing to write ${file.path}: resolves outside the workspace via a symlink`);
    }

    let before: string | null = null;
    try {
      before = await readFile(target, 'utf8');
    } catch { /* new file */ }

    if (before !== null && before === file.content) {
      unchanged++;
      results.push({
        path: validated.normalized, action: 'unchanged',
        hash_before: sha256(before), hash_after: sha256(before), backed_up: false,
      });
      continue;
    }

    let backedUp = false;
    if (before !== null) {
      const backupTarget = path.join(backupAbs, ...validated.normalized.split('/'));
      await mkdir(path.dirname(backupTarget), { recursive: true });
      await copyFile(target, backupTarget);
      backedUp = true;
      backupDirCreated = true;
    }

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf8');
    written++;
    results.push({
      path: validated.normalized,
      action: before === null ? 'create' : 'modify',
      hash_before: before === null ? null : sha256(before),
      hash_after: sha256(file.content),
      backed_up: backedUp,
    });
  }

  // Manifest (even when only new files were created — it records what to
  // delete for a manual revert).
  if (results.some((r) => r.action !== 'unchanged')) {
    await mkdir(backupAbs, { recursive: true });
    backupDirCreated = true;
    await writeFile(
      path.join(backupAbs, 'manifest.json'),
      JSON.stringify({
        application_id: applicationId,
        applied_at: new Date().toISOString(),
        note: 'Files with action=modify have their pre-application originals stored alongside this manifest. Files with action=create did not exist before — delete them to revert.',
        files: results,
      }, null, 2),
      'utf8',
    );
  }

  return { backupDir: backupDirCreated ? backupRel : '', files: results, written, unchanged };
}

// ── Test command (argv array) validation ────────────────────────────────────

const SHELL_BINARIES = new Set([
  'cmd', 'cmd.exe', 'command', 'command.com',
  'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe',
  'sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'csh', 'tcsh',
  'wsl', 'wsl.exe',
]);

export type ArgvValidation = { ok: true; argv: string[] } | { ok: false; reason: string };

/**
 * Validate a user-configured test command. Must be a non-empty array of
 * strings (argv — command + args, never a shell string). argv[0] may not be
 * a shell: the whole point is that the command runs via execFile with no
 * shell interpretation. Configure the runner directly, e.g.
 * ["node","--run","test"] or ["node","node_modules/vitest/vitest.mjs","run"].
 */
export function validateTestArgv(input: unknown): ArgvValidation {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, reason: 'test command must be a non-empty array of strings (argv: command + args)' };
  }
  if (input.length > 32) return { ok: false, reason: 'too many arguments (max 32)' };
  for (const item of input) {
    if (typeof item !== 'string' || item.length === 0) {
      return { ok: false, reason: 'every argv element must be a non-empty string' };
    }
    if (item.length > 500) return { ok: false, reason: 'argv element longer than 500 characters' };
    // eslint-disable-next-line no-control-regex
    if (/[\0\r\n]/.test(item)) return { ok: false, reason: 'control characters in argv' };
  }
  const argv = input as string[];
  // Cross-platform basename: split on BOTH `/` and `\` (and strip any drive
  // prefix) so a Windows shell path like `C:\Windows\System32\cmd.exe` is
  // detected even on a POSIX host (path.basename is platform-specific and
  // would treat the backslashes as filename chars on Linux). Defense in depth:
  // argv runs via execFile with no shell, but argv[0] must never itself be a
  // shell, regardless of the host OS the studio happens to run on.
  const lastSeg = argv[0].split(/[\\/]/).pop() ?? argv[0];
  const cmdBase = lastSeg.replace(/^[a-zA-Z]:/, '').toLowerCase();
  if (SHELL_BINARIES.has(cmdBase)) {
    return {
      ok: false,
      reason: `"${argv[0]}" is a shell — configure the test runner directly (no shell strings). ` +
        'Examples: ["node","--run","test"], ["node","node_modules/vitest/vitest.mjs","run"], ["pytest","-q"].',
    };
  }
  return { ok: true, argv };
}

// ── Test-run environment (allowlist, documented) ────────────────────────────

/**
 * Environment allowlist for test runs. Script-sandbox discipline, widened
 * with ONLY what test runners genuinely need:
 *   • PATH/PATHEXT + OS essentials — find node/python and their shims
 *   • HOME/USERPROFILE + TEMP/TMP — tools write caches and temp files
 *   • APPDATA/LOCALAPPDATA/XDG_* — npm/pnpm/yarn/pip cache locations
 * Everything else — API keys, DATABASE_URL, NODE_OPTIONS (could inject
 * --inspect/--require), tokens — is deliberately NOT inherited.
 */
export const TEST_ENV_KEEP = [
  'PATH', 'Path', 'PATHEXT',
  'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'windir', 'COMSPEC', 'ComSpec',
  'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'APPDATA', 'LOCALAPPDATA', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)',
  'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME',
  'LANG', 'LC_ALL', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS',
  'USER', 'LOGNAME', 'SHELL',
  // ── Phase 3 multi-language toolchain caches/homes ──────────────────────────
  // Rust (rustup/cargo) and Python (venv) need their home/cache dirs to find
  // installed toolchains and write build artifacts. These are LOCATIONS, never
  // secrets. CARGO_TARGET_DIR is honoured if the operator set it (lets builds
  // share a target/ dir that can be cleaned up — see the disk-usage follow-up).
  'CARGO_HOME', 'RUSTUP_HOME', 'CARGO_TARGET_DIR', 'RUSTUP_TOOLCHAIN',
  'VIRTUAL_ENV', 'PYTHONPATH', 'PIP_CACHE_DIR',
] as const;

/**
 * The single secret deliberately injected into a Studio run env: the scoped
 * PROJECT_DATABASE_URL (points at proj_<slug> AS studio_<slug>). It is NOT in
 * TEST_ENV_KEEP — TEST_ENV_KEEP strips the server's DATABASE_URL — and is only
 * ever added by buildCommandEnv() from the per-project vault. NEVER un-strip
 * the server DATABASE_URL.
 */
export const PROJECT_DATABASE_URL_KEY = 'PROJECT_DATABASE_URL';

export function buildTestEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of TEST_ENV_KEEP) {
    if (source[key] !== undefined) env[key] = source[key];
  }
  env.CI = 'true';
  env.NO_COLOR = '1';
  env.FORCE_COLOR = '0';
  return env;
}

/**
 * Studio command env = the allowlisted test env (server secrets + the server's
 * own DATABASE_URL are stripped) PLUS, when provided, the project's scoped
 * PROJECT_DATABASE_URL. The server DATABASE_URL is NEVER re-introduced here —
 * we only ever set the least-privilege per-project DSN.
 */
export function buildCommandEnv(
  projectDatabaseUrl: string | null | undefined,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = buildTestEnv(source);
  // Defence in depth: even if buildTestEnv ever leaked DATABASE_URL, strip it.
  delete env.DATABASE_URL;
  if (projectDatabaseUrl) env[PROJECT_DATABASE_URL_KEY] = projectDatabaseUrl;
  return env;
}

// ── Real test execution ─────────────────────────────────────────────────────

export const TEST_RUN_LIMITS = {
  timeout_ms: 5 * 60 * 1000,           // 5-minute hard timeout
  max_output_bytes: 1024 * 1024,        // 1 MB capture cap (execFile maxBuffer)
  output_tail_chars: 16_000,            // stored/echoed tail per stream
  environment: 'allowlist only (PATH/HOME/TEMP/APPDATA + OS essentials; CI=true) — no server env vars, API keys, or NODE_OPTIONS',
  execution: 'execFile with an argv array in the workspace dir — never a shell',
} as const;

export type ExecFileImpl = typeof nodeExecFile;

export interface TestRunResult {
  ran: boolean;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  stdoutTail: string;
  stderrTail: string;
  outputTruncated: boolean;
  spawnError?: string;
  /** Honest operator hint for known platform gotchas (npm .cmd shims on Windows). */
  hint?: string;
  /**
   * The REAL execution mode used. 'docker' = the command ran inside a `docker
   * run` container with host isolation; 'local' = the existing unsandboxed
   * execFile path (NOT isolated). Present only when containerMode was supplied.
   */
  executionMode?: 'docker' | 'local';
}

function tail(s: string): string {
  return s.length > TEST_RUN_LIMITS.output_tail_chars
    ? `… [earlier output truncated]\n${s.slice(-TEST_RUN_LIMITS.output_tail_chars)}`
    : s;
}

const WINDOWS_CMD_SHIMS = /^(npm|pnpm|yarn|npx)(\.cmd)?$/i;

/**
 * Run the user-configured test command in the workspace via execFile.
 * No shell — argv[0] is spawned directly with argv.slice(1) as arguments.
 */
export async function runProjectTests(params: {
  argv: string[];
  cwd: string;
  timeoutMs?: number;
  execFileImpl?: ExecFileImpl;
  /**
   * The project's scoped DSN. When set it is injected as PROJECT_DATABASE_URL
   * (the only deliberately-injected secret); the server's own DATABASE_URL is
   * always stripped regardless. Omit/null for commands that need no DB.
   */
  projectDatabaseUrl?: string | null;
  /**
   * ANTON Studio Phase 6 — container isolation. When 'docker', the configured
   * argv is wrapped into a `docker run … <image> <argv>` invocation (workspace
   * bind-mounted at /work, network off by default) so hostile build/test code
   * runs in a throwaway container, NOT on the host. Omit / null / 'local' →
   * EXACT current behaviour (unsandboxed execFile — zero regression).
   *
   * The CALLER is responsible for the docker-or-local DECISION (via
   * coding-container.resolveExecution, which honestly reports the real mode).
   * This param just selects the spawn shape; the result echoes executionMode.
   */
  containerMode?: 'docker' | 'local' | null;
  /** Image override for docker mode (else derived from `language`). */
  containerImage?: string;
  /** Language hint used to pick a default docker image when no override given. */
  language?: string;
  /** Container network for docker mode. Default 'none' (max isolation). */
  containerNetwork?: 'none' | 'bridge';
}): Promise<TestRunResult> {
  const execFileImpl = params.execFileImpl ?? nodeExecFile;
  const timeoutMs = Math.min(params.timeoutMs ?? TEST_RUN_LIMITS.timeout_ms, TEST_RUN_LIMITS.timeout_ms);
  const started = Date.now();

  // ── Phase 6: container wrap (opt-in; default path is untouched) ────────────
  // When containerMode==='docker' we spawn `docker` (argv[0]) from the host
  // cwd=workspaceAbs; the INNER command runs in /work inside the container. The
  // host process env carries NO secrets to the docker CLIENT (buildCommandEnv
  // strips them); the scoped DSN reaches the CONTAINER via -e only (added by
  // buildDockerRunArgv), never logged. Dynamic import avoids a circular import.
  const useDocker = params.containerMode === 'docker';
  let spawnArgv = params.argv;
  if (useDocker) {
    const { buildDockerRunArgv } = await import('./coding-container.js');
    // buildDockerRunArgv returns the args AFTER the `docker` binary
    // (['run','--rm',…]); the binary itself is the spawn target (argv[0]).
    spawnArgv = ['docker', ...buildDockerRunArgv({
      workspaceAbs: params.cwd,
      innerArgv: params.argv,
      image: params.containerImage,
      language: params.language,
      projectDatabaseUrl: params.projectDatabaseUrl ?? null,
      networkMode: params.containerNetwork ?? 'none',
    })];
  }
  const executionMode: 'docker' | 'local' | undefined =
    params.containerMode == null ? undefined : useDocker ? 'docker' : 'local';

  return new Promise<TestRunResult>((resolve) => {
    execFileImpl(
      spawnArgv[0],
      spawnArgv.slice(1),
      {
        cwd: params.cwd,
        timeout: timeoutMs,
        maxBuffer: TEST_RUN_LIMITS.max_output_bytes,
        // The docker CLIENT inherits the same allowlisted, secret-stripped env;
        // the scoped DSN is handed to the CONTAINER via -e, not to the client.
        env: buildCommandEnv(useDocker ? null : (params.projectDatabaseUrl ?? null)),
        windowsHide: true,
      },
      (err: ExecFileException | null, stdout: string | Buffer, stderr: string | Buffer) => {
        const durationMs = Date.now() - started;
        const stdoutTail = tail(String(stdout ?? ''));
        const stderrTail = tail(String(stderr ?? ''));
        if (!err) {
          resolve({ ran: true, exitCode: 0, durationMs, timedOut: false, stdoutTail, stderrTail, outputTruncated: false, executionMode });
          return;
        }
        const timedOut = !!err.killed && durationMs >= timeoutMs - 250;
        if (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
          resolve({
            ran: true, exitCode: null, durationMs, timedOut: false,
            stdoutTail, stderrTail, outputTruncated: true,
            spawnError: `output exceeded the ${TEST_RUN_LIMITS.max_output_bytes}-byte capture cap — run was terminated`,
            executionMode,
          });
          return;
        }
        const spawnFailed = typeof err.code === 'string';
        let hint: string | undefined;
        // The npm/.cmd-shim hint only applies to the LOCAL path (the inner
        // command is spawned directly). In docker mode the spawned binary is
        // `docker`, so the shim gotcha does not apply.
        if (spawnFailed && !useDocker && process.platform === 'win32' && WINDOWS_CMD_SHIMS.test(path.basename(params.argv[0]))) {
          hint = 'On Windows, npm/pnpm/yarn/npx are .cmd shims that cannot be spawned without a shell (and ANTON never uses a shell). ' +
            'Use ["node","--run","<script>"] (Node 22+ runs package.json scripts directly) or invoke the runner binary, e.g. ["node","node_modules/vitest/vitest.mjs","run"].';
        } else if (spawnFailed && useDocker && (err.code === 'ENOENT')) {
          hint = 'Docker mode was requested but the `docker` command could not be spawned (ENOENT). Falling back is the caller\'s job — detectDocker() should have caught this.';
        }
        resolve({
          ran: !spawnFailed,
          exitCode: typeof err.code === 'number' ? err.code : null,
          durationMs,
          timedOut,
          stdoutTail,
          stderrTail,
          outputTruncated: false,
          spawnError: spawnFailed ? `${err.code}: ${err.message}` : undefined,
          hint,
          executionMode,
        });
      },
    );
  });
}

// ── Test-summary parsing (heuristic, honest about recognition) ──────────────

export interface TestSummary {
  pass_count: number;
  fail_count: number;
  skip_count: number;
  /** false = counts could not be parsed from the output; only the exit code is authoritative. */
  recognized: boolean;
}

/**
 * Best-effort extraction of pass/fail/skip counts from common runner output
 * (vitest, jest, mocha, pytest, go test, cargo). The exit code remains the
 * authority on pass/fail; when nothing matches, recognized=false and all
 * counts are 0 — never fabricated.
 */
export function parseTestSummary(output: string): TestSummary {
  const text = output.slice(-TEST_RUN_LIMITS.output_tail_chars);
  let pass = 0; let fail = 0; let skip = 0; let recognized = false;

  // vitest/jest summary lines: "Tests  3 failed | 39 passed (42)" /
  // "Tests:       1 failed, 41 passed, 42 total"
  const summaryLine = text.match(/Tests:?\s+([^\n]*)/g)?.pop();
  const scope = summaryLine ?? text;

  const passM = [...scope.matchAll(/(\d+)\s+pass(?:ed|ing)?\b/gi)].pop();
  const failM = [...scope.matchAll(/(\d+)\s+fail(?:ed|ing|ures?)?\b/gi)].pop();
  const skipM = [...scope.matchAll(/(\d+)\s+(?:skipped|pending|todo|ignored)\b/gi)].pop();

  if (passM) { pass = parseInt(passM[1], 10); recognized = true; }
  if (failM) { fail = parseInt(failM[1], 10); recognized = true; }
  if (skipM) { skip = parseInt(skipM[1], 10); recognized = true; }

  return { pass_count: pass, fail_count: fail, skip_count: skip, recognized };
}

// ── Application record construction (pure — easy to test) ───────────────────

export interface ApplicationFileEntry {
  path: string;
  action: FileAction;
  bytes: number;
  hash_new: string;
  hash_before: string | null;
  hash_after?: string;
  content?: string;
}

export interface ApplicationRecord {
  files: ApplicationFileEntry[];
  diff_summary: {
    per_file: Record<string, DiffStats & { action: FileAction }>;
    totals: { files: number; create: number; modify: number; unchanged: number; lines_added: number; lines_removed: number; lines_modified: number };
  };
}

/**
 * Build the persistable application record from parsed files + their
 * current-workspace diffs. content is retained while 'proposed' so approve
 * writes exactly what was reviewed.
 */
export function buildApplicationRecord(
  files: ParsedFileBlock[],
  diffs: FileDiff[],
  oldContents: Map<string, string | null>,
): ApplicationRecord {
  const perFile: ApplicationRecord['diff_summary']['per_file'] = {};
  const totals = { files: files.length, create: 0, modify: 0, unchanged: 0, lines_added: 0, lines_removed: 0, lines_modified: 0 };
  const diffByPath = new Map(diffs.map((d) => [d.path, d]));

  const entries: ApplicationFileEntry[] = files.map((f) => {
    const diff = diffByPath.get(f.path);
    const action: FileAction = diff?.action ?? 'create';
    if (diff) {
      perFile[f.path] = { ...diff.stats, action };
      totals.lines_added += diff.stats.linesAdded;
      totals.lines_removed += diff.stats.linesRemoved;
      totals.lines_modified += diff.stats.linesModified;
    }
    totals[action]++;
    const before = oldContents.get(f.path) ?? null;
    return {
      path: f.path,
      action,
      bytes: Buffer.byteLength(f.content, 'utf8'),
      hash_new: sha256(f.content),
      hash_before: before === null ? null : sha256(before),
      content: f.content,
    };
  });

  return { files: entries, diff_summary: { per_file: perFile, totals } };
}

// ── Multi-language toolchain probe (Phase 3 — honest detect-and-report) ──────
//
// Clones script-sandbox.ts's resolveRuntime discipline: execFile <cmd>
// --version with a short timeout, NO shell. Reports green/red per language —
// NEVER fakes a pass when the runtime is absent (the design's honesty rule for
// the §C-req5 "detect and report only" MVP). detect-and-report only: ANTON
// does NOT install toolchains.

export type ToolchainLanguage = 'typescript' | 'python' | 'rust' | 'node';

export interface ToolProbe {
  /** The command that was probed (e.g. 'cargo'). */
  command: string;
  /** True iff `<command> --version` exited 0. */
  available: boolean;
  /** Trimmed first line of --version output, when available. */
  version: string | null;
}

export interface ToolchainStatus {
  language: ToolchainLanguage;
  /** True iff ALL required commands for the language probed green. */
  ready: boolean;
  probes: ToolProbe[];
  /** Honest one-liner for the UI. */
  note: string;
}

/** The commands each language needs to build/test, in argv form (first elem is the binary). */
const TOOLCHAIN_COMMANDS: Record<ToolchainLanguage, string[]> = {
  node: ['node'],
  // TS builds/tests via the project's own tsc + node 22's --run; we probe both
  // node and tsc. tsc may be a project-local binary; the probe is best-effort.
  typescript: ['node', 'tsc'],
  python: ['python', 'pip'],
  rust: ['cargo', 'rustc'],
};

const PROBE_CANDIDATES: Record<string, string[]> = {
  // Honour the same Windows/Unix python ordering as script-sandbox.
  python: process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'],
  pip: process.platform === 'win32' ? ['pip', 'pip3'] : ['pip3', 'pip'],
};

async function probeOne(command: string, execFileImpl: ExecFileImpl): Promise<ToolProbe> {
  const candidates = PROBE_CANDIDATES[command] ?? [command];
  for (const candidate of candidates) {
    const result = await new Promise<{ ok: boolean; out: string }>((resolve) => {
      try {
        execFileImpl(
          candidate, ['--version'],
          { timeout: 5_000, windowsHide: true, env: buildTestEnv() },
          (err, stdout, stderr) => {
            const out = String(stdout || '') || String(stderr || '');
            resolve({ ok: !err, out });
          },
        );
      } catch {
        resolve({ ok: false, out: '' });
      }
    });
    if (result.ok) {
      const version = result.out.split('\n')[0]?.trim() || null;
      return { command: candidate, available: true, version };
    }
  }
  return { command, available: false, version: null };
}

/**
 * Probe the toolchain for one language. NEVER fabricates — a missing runtime is
 * reported red. Injectable execFile for tests (no real spawn).
 */
export async function probeToolchain(
  language: ToolchainLanguage,
  execFileImpl: ExecFileImpl = nodeExecFile,
): Promise<ToolchainStatus> {
  const commands = TOOLCHAIN_COMMANDS[language];
  const probes: ToolProbe[] = [];
  for (const cmd of commands) {
    // node is the running process — it is always available.
    if (cmd === 'node') {
      probes.push({ command: 'node', available: true, version: process.version });
      continue;
    }
    probes.push(await probeOne(cmd, execFileImpl));
  }
  const ready = probes.every((p) => p.available);
  const missing = probes.filter((p) => !p.available).map((p) => p.command);
  const note = ready
    ? `${language} toolchain detected (${probes.map((p) => p.version ?? p.command).join(', ')}).`
    : `${language} toolchain incomplete — missing: ${missing.join(', ')}. Install it yourself; ANTON does not install toolchains.`;
  return { language, ready, probes, note };
}

/** Probe all supported languages at once. */
export async function probeAllToolchains(
  execFileImpl: ExecFileImpl = nodeExecFile,
): Promise<ToolchainStatus[]> {
  const langs: ToolchainLanguage[] = ['typescript', 'python', 'rust'];
  return Promise.all(langs.map((l) => probeToolchain(l, execFileImpl)));
}

// ── Per-language command presets (Phase 3 — §C-req5) ────────────────────────
//
// The single test_command generalises into setup/build/test per project, each
// an argv ARRAY run through the SAME approve→execFile gate as tests. These
// presets are honest defaults the UI can offer; every value is a validated
// argv (validateTestArgv rejects shells). Python passes the venv python path
// IN ARGV (we never mutate PATH); on POSIX the venv binary lives in bin/, on
// Windows in Scripts/.

export type CommandKind = 'setup' | 'build' | 'test';

export interface LanguagePreset {
  language: ToolchainLanguage;
  label: string;
  setup_command: string[] | null;
  build_command: string[] | null;
  test_command: string[] | null;
  /** Honest caveats (Windows shims, venv path, network needed, …). */
  notes: string[];
}

/** The relative path to the venv's python, OS-aware (argv, never PATH mutation). */
export function venvPython(venvDir = '.venv'): string {
  return process.platform === 'win32'
    ? `${venvDir}\\Scripts\\python.exe`
    : `${venvDir}/bin/python`;
}

/**
 * Built-in per-language presets. TS uses node 22's `tsc --noEmit` (typecheck)
 * for build + `node --run test` for test (no npm shim — see runProjectTests'
 * Windows hint). Python creates a venv, installs, and runs pytest THROUGH the
 * venv python (in argv). Rust uses cargo build / cargo test.
 */
export function languagePreset(language: ToolchainLanguage): LanguagePreset {
  switch (language) {
    case 'typescript':
      return {
        language, label: 'TypeScript',
        // tsc lives in the project's node_modules; invoke it via node so no shim is needed.
        setup_command: null,
        build_command: ['node', 'node_modules/typescript/bin/tsc', '--noEmit'],
        test_command: ['node', '--run', 'test'],
        notes: [
          'Build = tsc --noEmit (typecheck). Invoked via node so no npm/.cmd shim is needed on Windows.',
          'Test = node --run test (Node 22+ runs the package.json "test" script directly).',
          'Adjust to your runner, e.g. ["node","node_modules/vitest/vitest.mjs","run"].',
        ],
      };
    case 'python':
      return {
        language, label: 'Python',
        setup_command: ['python', '-m', 'venv', '.venv'],
        build_command: [venvPython(), '-m', 'pip', 'install', '-e', '.'],
        test_command: [venvPython(), '-m', 'pytest', '-q'],
        notes: [
          'Setup creates a .venv; build installs the project into it; tests run THROUGH the venv python (passed in argv — PATH is never mutated).',
          'pip install needs network — see the sandbox security note (a malicious setup.py runs arbitrary code).',
          'On Windows the venv python is .venv\\Scripts\\python.exe; on POSIX .venv/bin/python.',
        ],
      };
    case 'rust':
      return {
        language, label: 'Rust',
        setup_command: null,
        build_command: ['cargo', 'build'],
        test_command: ['cargo', 'test'],
        notes: [
          'cargo build / cargo test. Needs rustup/cargo installed (ANTON detects but does not install it).',
          'cargo build downloads crates — needs network. A malicious build.rs runs arbitrary code; this is not a container.',
          'Set CARGO_TARGET_DIR to control where target/ grows (kept in the env allowlist) — no disk caps yet.',
        ],
      };
    case 'node':
      return {
        language, label: 'Node',
        setup_command: null,
        build_command: null,
        test_command: ['node', '--run', 'test'],
        notes: ['Test = node --run test (no npm shim).'],
      };
  }
}

export function allLanguagePresets(): LanguagePreset[] {
  return (['typescript', 'python', 'rust', 'node'] as ToolchainLanguage[]).map(languagePreset);
}

// ── Per-user project cap (team mode) ────────────────────────────────────────

/** CODING_MAX_PROJECTS_PER_USER when unset. */
export const DEFAULT_CODING_PROJECTS_PER_USER = 20;

/** The cap from CODING_MAX_PROJECTS_PER_USER; 0 (or less) means no cap. */
export function codingProjectsPerUserCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.CODING_MAX_PROJECTS_PER_USER ?? '').trim();
  if (raw === '') return DEFAULT_CODING_PROJECTS_PER_USER;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_CODING_PROJECTS_PER_USER;
  return n <= 0 ? 0 : Math.floor(n);
}

/** A refused project create; `message` is safe to show the person. */
export class CodingProjectCapError extends Error {
  /** The message, which is written for the person (publicErrorMessage). */
  readonly publicMessage: string;
  constructor(message: string) {
    super(message);
    this.name = 'CodingProjectCapError';
    this.publicMessage = message;
  }
}

/**
 * Team mode: why `userId` may not have another Code Studio project, or null.
 * Counts the projects they own (the parent projects.user_id) or created
 * (coding_projects.created_by). Solo mode and admins are never capped. On a
 * shared server every project is a set of rows and a charter — and, once
 * provisioned, a folder and a database — so one account must not make thousands.
 */
export async function codingProjectCapRefusal(
  db: DatabaseAdapter,
  userId: string | null,
  isAdmin: boolean,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  if (env.DEPLOYMENT_MODE !== 'team' || isAdmin) return null;
  const cap = codingProjectsPerUserCap(env);
  if (cap === 0) return null;
  const limitMessage = `You have reached the limit of ${cap} Code Studio projects on this server. Delete one to start another.`;
  if (!userId) return limitMessage;
  const row = await db.get<{ n: number | string }>(
    `SELECT COUNT(*) AS n
       FROM coding_projects cp LEFT JOIN projects p ON p.id = cp.project_id
      WHERE p.user_id = ? OR cp.created_by = ?`,
    userId, userId,
  );
  return Number(row?.n ?? 0) >= cap ? limitMessage : null;
}
