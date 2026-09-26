/**
 * html-to-text.ts — markup to plain text for the model (Online References,
 * uploaded .html files). The text is never rendered as HTML; these rules are
 * about reading it right:
 *
 *   - entities are decoded in one pass, so "&amp;lt;" becomes "&lt;", not "<";
 *   - a removal repeats until nothing changes, so a tag split around another
 *     ("<scr<script></script>ipt>") cannot survive it;
 *   - a closing tag may carry spaces or attributes ("</script >").
 */

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

/** Named (the common ones) and numeric entities, decoded in a single pass. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole: string, name: string) => {
    if (name.startsWith('#')) {
      const hex = name[1] === 'x' || name[1] === 'X';
      const code = hex ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Apply a replacement until the text stops changing. */
export function replaceUntilStable(text: string, pattern: RegExp, replacement: string): string {
  let previous: string;
  let out = text;
  do {
    previous = out;
    out = out.replace(pattern, replacement);
  } while (out !== previous);
  return out;
}

/** Script and style elements, content included. */
export function removeScriptsAndStyles(html: string): string {
  const noStyles = replaceUntilStable(html, /<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, '');
  return replaceUntilStable(noStyles, /<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, '');
}

/** Every remaining tag becomes a space. */
export function stripTags(html: string): string {
  return replaceUntilStable(html, /<[^<>]*>/g, ' ');
}
