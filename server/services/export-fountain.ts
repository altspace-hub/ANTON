/**
 * export-fountain.ts
 * LONE-08: Converts screenplay/script content to Fountain (.fountain) and
 * Final Draft XML (.fdx) formats for use with Fade In, Final Draft, etc.
 *
 * Fountain spec: https://fountain.io/syntax
 * FDX spec: Final Draft 12 XML (subset — paragraphs, character cues, dialogue, action)
 *
 * Input: Markdown content produced by the script-development module.
 * The service detects screenplay elements from common formatting conventions.
 *
 * Detected patterns (in priority order):
 *   # TITLE / ## TITLE        → Scene Heading (INT./EXT. or all-caps line)
 *   **CHARACTER NAME**        → Character cue
 *   > text                    → Parenthetical
 *   Plain paragraphs          → Action or Dialogue (follows context)
 *   --- or ===                → Page break / transition
 */

interface ScriptExportOptions {
  title?: string;
  author?: string;
  /** If true, attempt to parse Markdown screenplay conventions */
  parseMarkdown?: boolean;
}

/** Represents a parsed screenplay element */
interface ScreenplayElement {
  type:
    | 'title-page'
    | 'scene-heading'
    | 'action'
    | 'character'
    | 'dialogue'
    | 'parenthetical'
    | 'transition'
    | 'page-break'
    | 'blank';
  text: string;
}

const SCENE_HEADING_RE = /^(INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.)\s+/i;
const TRANSITION_RE = /^(FADE (IN|OUT|TO)|SMASH CUT|MATCH CUT|CUT TO|DISSOLVE TO):?\s*$/i;
const ALL_CAPS_RE = /^[A-Z][A-Z\s\d\-'.()\[\]]+$/;

/**
 * Parse a Markdown/plain-text screenplay into structured elements.
 */
function parseScript(content: string): ScreenplayElement[] {
  const lines = content.split('\n');
  const elements: ScreenplayElement[] = [];
  let i = 0;
  let lastSignificantType: ScreenplayElement['type'] | null = null;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Blank line
    if (!trimmed) {
      elements.push({ type: 'blank', text: '' });
      i++;
      continue;
    }

    // Markdown heading → scene heading or title
    if (trimmed.startsWith('#')) {
      const headingText = trimmed.replace(/^#+\s*/, '').toUpperCase();
      // Is it a scene heading?
      if (SCENE_HEADING_RE.test(headingText) || headingText.startsWith('INT ') || headingText.startsWith('EXT ')) {
        elements.push({ type: 'scene-heading', text: headingText });
        lastSignificantType = 'scene-heading';
      } else {
        // Treat non-scene headings as action / scene titles
        elements.push({ type: 'action', text: headingText });
        lastSignificantType = 'action';
      }
      i++;
      continue;
    }

    // Fountain-style forced scene heading: .INT. / .EXT.
    if (trimmed.startsWith('.') && !trimmed.startsWith('..')) {
      elements.push({ type: 'scene-heading', text: trimmed.slice(1).trim() });
      lastSignificantType = 'scene-heading';
      i++;
      continue;
    }

    // Transition
    if (TRANSITION_RE.test(trimmed)) {
      elements.push({ type: 'transition', text: trimmed.toUpperCase() });
      lastSignificantType = 'transition';
      i++;
      continue;
    }

    // Page break — --- or ===
    if (/^(-{3,}|={3,})$/.test(trimmed)) {
      elements.push({ type: 'page-break', text: '' });
      i++;
      continue;
    }

    // Parenthetical — wrapped in parentheses or > quote
    if ((trimmed.startsWith('(') && trimmed.endsWith(')')) || trimmed.startsWith('> ')) {
      const pText = trimmed.startsWith('> ') ? trimmed.slice(2) : trimmed;
      elements.push({ type: 'parenthetical', text: pText });
      lastSignificantType = 'parenthetical';
      i++;
      continue;
    }

    // Bold **CHARACTER** or @CHARACTER (Fountain force-character) → character cue
    const boldCharMatch = trimmed.match(/^\*\*([A-Z][A-Z\s\d\-'.]+)\*\*$/);
    const atCharMatch = trimmed.match(/^@(.+)/);
    if (boldCharMatch || atCharMatch) {
      const charName = boldCharMatch ? boldCharMatch[1] : (atCharMatch as RegExpMatchArray)[1];
      elements.push({ type: 'character', text: charName.trim() });
      lastSignificantType = 'character';
      i++;
      continue;
    }

    // All-caps line — character cue if previous context supports it
    if (ALL_CAPS_RE.test(trimmed) && trimmed.length <= 60 && !SCENE_HEADING_RE.test(trimmed)) {
      // Heuristic: if the previous significant element was blank/action/scene-heading, treat as character
      if (lastSignificantType === 'scene-heading' || lastSignificantType === 'action' || lastSignificantType === null) {
        // Could be character or scene heading — prefer character for short lines
        if (!trimmed.includes('.') || trimmed.split(' ').length <= 3) {
          elements.push({ type: 'character', text: trimmed });
          lastSignificantType = 'character';
          i++;
          continue;
        }
      }
    }

    // Dialogue — if previous significant element was character or parenthetical
    if (lastSignificantType === 'character' || lastSignificantType === 'parenthetical') {
      // Strip any Markdown bold/italic from dialogue
      const dialogueText = trimmed.replace(/\*+([^*]+)\*+/g, '$1');
      elements.push({ type: 'dialogue', text: dialogueText });
      lastSignificantType = 'dialogue';
      i++;
      continue;
    }

    // Default: action
    const actionText = trimmed.replace(/\*+([^*]+)\*+/g, '$1'); // strip Markdown
    elements.push({ type: 'action', text: actionText });
    lastSignificantType = 'action';
    i++;
  }

  return elements;
}

/**
 * Generate Fountain plain-text output.
 * Fountain is whitespace-sensitive — each element separated by blank lines.
 */
export function generateFountain(content: string, options: ScriptExportOptions = {}): Buffer {
  const elements = parseScript(content);
  const lines: string[] = [];

  // Title page (optional)
  if (options.title) {
    lines.push(`Title: ${options.title}`);
    if (options.author) lines.push(`Author: ${options.author}`);
    lines.push(''); // blank after title page metadata
    lines.push('==='); // title page separator
    lines.push('');
  }

  for (const el of elements) {
    switch (el.type) {
      case 'scene-heading':
        lines.push('');
        lines.push(el.text);
        lines.push('');
        break;
      case 'action':
        lines.push(el.text);
        lines.push('');
        break;
      case 'character':
        lines.push('');
        lines.push(el.text);
        break;
      case 'dialogue':
        lines.push(el.text);
        lines.push('');
        break;
      case 'parenthetical':
        lines.push(`(${el.text.replace(/^\(|\)$/g, '')})`);
        break;
      case 'transition':
        lines.push('');
        lines.push(`> ${el.text}`);
        lines.push('');
        break;
      case 'page-break':
        lines.push('===');
        break;
      case 'blank':
        lines.push('');
        break;
    }
  }

  return Buffer.from(lines.join('\n'), 'utf-8');
}

/**
 * Generate Final Draft XML (.fdx) output.
 * Implements a minimal FDX subset compatible with Final Draft 12.
 */
export function generateFdx(content: string, options: ScriptExportOptions = {}): Buffer {
  const elements = parseScript(content);

  function xmlEscape(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function makeParagraph(type: string, text: string): string {
    if (!text.trim()) return '';
    return `    <Paragraph Type="${type}"><Text>${xmlEscape(text)}</Text></Paragraph>`;
  }

  const paragraphs: string[] = [];

  for (const el of elements) {
    switch (el.type) {
      case 'scene-heading':
        paragraphs.push(makeParagraph('Scene Heading', el.text));
        break;
      case 'action':
        paragraphs.push(makeParagraph('Action', el.text));
        break;
      case 'character':
        paragraphs.push(makeParagraph('Character', el.text));
        break;
      case 'dialogue':
        paragraphs.push(makeParagraph('Dialogue', el.text));
        break;
      case 'parenthetical':
        paragraphs.push(makeParagraph('Parenthetical', `(${el.text.replace(/^\(|\)$/g, '')})`));
        break;
      case 'transition':
        paragraphs.push(makeParagraph('Transition', el.text));
        break;
      case 'page-break':
        break;
      case 'blank':
        break;
    }
  }

  const scriptTitle = xmlEscape(options.title || 'Untitled Script');
  const scriptAuthor = xmlEscape(options.author || '');
  const today = new Date().toISOString().slice(0, 10);

  const fdx = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>',
    '<FinalDraft DocumentType="Script" Template="No" Version="3">',
    '  <Content>',
    ...paragraphs.filter(Boolean),
    '  </Content>',
    '  <TitlePage>',
    `    <Content><Paragraph Type="Title"><Text>${scriptTitle}</Text></Paragraph>`,
    scriptAuthor
      ? `    <Paragraph Type="Written By"><Text>${scriptAuthor}</Text></Paragraph>`
      : '',
    `    <Paragraph Type="Credit"><Text>Written on ${today}</Text></Paragraph></Content>`,
    '  </TitlePage>',
    '</FinalDraft>',
  ].join('\n');

  return Buffer.from(fdx, 'utf-8');
}
