import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, AlertCircle, ExternalLink } from 'lucide-react';

interface SharedSession {
  title: string;
  moduleName: string;
  output: string;
  createdAt: string;
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<SharedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No share token provided.');
      setLoading(false);
      return;
    }

    const fetchShared = async () => {
      try {
        const res = await fetch(`/api/share/${token}`);
        if (res.status === 404) {
          setError('This shared link has expired or does not exist.');
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setError('Failed to load shared analysis. Please try again later.');
          setLoading(false);
          return;
        }
        const data = await res.json();
        setSession(data);
      } catch {
        setError('This shared link has expired or does not exist.');
      } finally {
        setLoading(false);
      }
    };

    fetchShared();
  }, [token]);

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-adv-dark">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-adv-teal" />
          <p className="text-sm text-adv-gray">Loading shared analysis...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-adv-dark">
        <div className="mx-4 max-w-md rounded-xl border border-border bg-adv-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-adv-red/10">
            <AlertCircle className="h-7 w-7 text-adv-red" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-adv-white">Link Not Found</h2>
          <p className="mb-6 text-sm text-adv-gray">{error}</p>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            Go to openEXPERT
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    );
  }

  // Success state
  const formattedDate = session?.createdAt
    ? new Date(session.createdAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  return (
    <div className="min-h-screen bg-adv-dark">
      {/* Header */}
      <header className="border-b border-border bg-adv-dark-2">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-teal/10">
              <span className="text-sm font-bold text-adv-teal">oE</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-adv-white">openEXPERT</span>
                <span className="rounded border border-adv-teal/30 bg-adv-teal-dim px-1.5 py-0.5 text-[10px] font-medium text-adv-teal">
                  Shared Analysis
                </span>
              </div>
              {session?.moduleName && (
                <span className="text-xs text-adv-gray">{session.moduleName}</span>
              )}
            </div>
          </div>
          {formattedDate && (
            <span className="text-xs text-adv-gray-med">{formattedDate}</span>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-6 py-8">
        {session?.title && (
          <h1 className="mb-6 text-2xl font-bold text-adv-white">{session.title}</h1>
        )}

        <div className="prose prose-invert max-w-none rounded-xl border border-border bg-adv-card p-6 md:p-8">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="mb-4 mt-6 text-xl font-bold text-adv-white first:mt-0">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="mb-3 mt-5 text-lg font-semibold text-adv-white">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="mb-2 mt-4 text-base font-semibold text-adv-off-white">{children}</h3>
              ),
              p: ({ children }) => (
                <p className="mb-3 text-sm leading-relaxed text-adv-off-white">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="mb-3 list-disc pl-5 text-sm text-adv-off-white">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-3 list-decimal pl-5 text-sm text-adv-off-white">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="mb-1 text-sm text-adv-off-white">{children}</li>
              ),
              table: ({ children }) => (
                <div className="my-4 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">{children}</table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="border-b border-border bg-adv-dark">{children}</thead>
              ),
              th: ({ children }) => (
                <th className="px-3 py-2 text-left font-medium text-adv-gray">{children}</th>
              ),
              td: ({ children }) => (
                <td className="border-t border-border px-3 py-2 text-adv-off-white">{children}</td>
              ),
              blockquote: ({ children }) => (
                <blockquote className="my-3 border-l-2 border-adv-teal pl-4 text-sm italic text-adv-gray">
                  {children}
                </blockquote>
              ),
              code: ({ className, children }) => {
                const isBlock = className?.includes('language-');
                if (isBlock) {
                  return (
                    <pre className="my-3 overflow-x-auto rounded-lg bg-adv-dark p-4 text-xs text-adv-off-white">
                      <code>{children}</code>
                    </pre>
                  );
                }
                return (
                  <code className="rounded bg-adv-dark px-1.5 py-0.5 text-xs text-adv-teal">
                    {children}
                  </code>
                );
              },
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-adv-teal underline hover:text-adv-teal-dark"
                >
                  {children}
                </a>
              ),
            }}
          >
            {session?.output || ''}
          </ReactMarkdown>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-adv-dark-2 py-6 text-center">
        <p className="text-xs text-adv-gray-med">
          Created with{' '}
          <a
            href="/"
            className="font-medium text-adv-teal hover:text-adv-teal-dark transition-colors"
          >
            openEXPERT
          </a>
          {' '}by openEXPERT
        </p>
      </footer>
    </div>
  );
}
