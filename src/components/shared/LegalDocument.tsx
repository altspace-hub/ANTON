/**
 * LegalDocument — the public demo's privacy notice and demo terms, rendered
 * from their Markdown text (DEMO_MODE=true; privacy review G7, G10).
 *
 * Fills in the owner's facts and the server's retention period
 * (src/lib/demo-legal.ts). A fact still missing stays visible as a
 * highlighted [[NAME]], and the red DRAFT box above the text names what is
 * left until counsel has signed the text off. Section headings get ids
 * ("5. Your right to object" is #section-5), so the sign-up form can link to
 * one section.
 */
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft } from 'lucide-react';
import { useDemoStore } from '@/stores/useDemoStore';
import { demoLegalValues, fillLegalText, legalTextIsDraft, unfilledFields } from '@/lib/demo-legal';

const PLACEHOLDER_PART = /(\[\[[A-Z0-9_]+\]\])/;
const PLACEHOLDER_WHOLE = /^\[\[[A-Z0-9_]+\]\]$/;

/** The part of an mdast node this file reads and writes. */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

function markPlaceholders(node: MdNode): void {
  if (!node.children) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && child.value && PLACEHOLDER_PART.test(child.value)) {
      for (const part of child.value.split(PLACEHOLDER_PART)) {
        if (!part) continue;
        next.push(PLACEHOLDER_WHOLE.test(part)
          ? {
            type: 'legalPlaceholder',
            data: { hName: 'mark', hProperties: { className: ['rounded', 'bg-amber-100', 'px-1', 'text-amber-900'] } },
            children: [{ type: 'text', value: part }],
          }
          : { type: 'text', value: part });
      }
    } else {
      markPlaceholders(child);
      next.push(child);
    }
  }
  node.children = next;
}

/** Highlights every [[NAME]] left in the text. */
function remarkMarkPlaceholders() {
  return (tree: unknown) => { markPlaceholders(tree as MdNode); };
}

const remarkPlugins = [remarkGfm, remarkMarkPlaceholders];

function textOf(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textOf).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return textOf((children as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

/** "6.2 What OpenRouter …" → "section-6-2"; undefined for a heading without a number. */
function sectionId(children: ReactNode): string | undefined {
  const m = textOf(children).match(/^(\d+(?:\.\d+)*)\.?\s/);
  return m ? `section-${m[1].replace(/\./g, '-')}` : undefined;
}

const components: Components = {
  h1: ({ children }) => <h1 className="mt-8 text-3xl font-bold tracking-tight text-gray-900">{children}</h1>,
  h2: ({ children }) => <h2 id={sectionId(children)} className="mt-10 scroll-mt-6 text-xl font-semibold text-gray-900">{children}</h2>,
  h3: ({ children }) => <h3 id={sectionId(children)} className="mt-6 scroll-mt-6 text-base font-semibold text-gray-900">{children}</h3>,
  p: ({ children }) => <p className="mt-3 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1.5 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1.5 pl-6">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed [&>ul]:mt-1.5">{children}</li>,
  blockquote: ({ children }) => (
    <div className="mt-6 rounded-xl border-2 border-[#0D7D6C]/40 bg-[#0D7D6C]/5 px-5 pb-4 pt-1 [&>h2]:mt-4 [&>h3]:mt-4">
      {children}
    </div>
  ),
  table: ({ children }) => (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  // A table whose header row is empty (the controller's details) shows no header.
  thead: ({ children }) => (textOf(children).trim() ? <thead>{children}</thead> : null),
  th: ({ children }) => <th className="border border-gray-300 bg-gray-50 px-3 py-2 align-top font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-gray-300 px-3 py-2 align-top">{children}</td>,
  hr: () => <hr className="my-8 border-gray-200" />,
  code: ({ children }) => <code className="rounded bg-gray-100 px-1 font-mono text-[14px] text-gray-800">{children}</code>,
  a: ({ href, children }) => {
    const external = typeof href === 'string' && /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        className="text-[#0D7D6C] underline hover:text-[#06655A]"
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    );
  },
};

/** The red box shown until the text is complete and signed off. */
function DraftBox({ what, plural, unfilled }: { what: string; plural: boolean; unfilled: readonly string[] }) {
  const these = plural ? `these ${what}` : `this ${what}`;
  return (
    <div role="alert" className="mt-6 rounded-xl border-2 border-red-300 bg-red-50 p-4 text-[15px] text-red-800">
      <p className="font-bold">DRAFT: {these} {plural ? 'are' : 'is'} not yet in force.</p>
      <p className="mt-1">Before the demo opens to the public, two things are left:</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>
          {unfilled.length === 0
            ? 'Every field the operator supplies is filled in.'
            : <>Fill in the {unfilled.length} {unfilled.length === 1 ? 'field' : 'fields'} still shown as <mark className="rounded bg-amber-100 px-1 text-amber-900">[[NAME]]</mark>: {unfilled.join(', ')}.</>}
        </li>
        <li>Have counsel review and sign off {these}.</li>
      </ul>
      <p className="mt-1">This box is removed once both are done.</p>
    </div>
  );
}

interface LegalDocumentProps {
  /** The text, with [[NAME]] where the owner's facts go. */
  markdown: string;
  /** "privacy notice" or "demo terms", for the DRAFT box. */
  what: string;
  /** True for a plural name ("these demo terms are"). */
  plural?: boolean;
}

export default function LegalDocument({ markdown, what, plural = false }: LegalDocumentProps) {
  const { config, load } = useDemoStore();
  useEffect(() => { void load(); }, [load]);
  const text = fillLegalText(markdown, demoLegalValues(config));
  const unfilled = unfilledFields(text);

  // A link such as /privacy#section-5 lands on its section once the text is there.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView?.();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-3xl px-6 py-10 text-[15px] text-gray-700">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#0D7D6C]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to ANTON
        </Link>
        {legalTextIsDraft(unfilled) && <DraftBox what={what} plural={plural} unfilled={unfilled} />}
        <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>{text}</ReactMarkdown>
      </main>
    </div>
  );
}
