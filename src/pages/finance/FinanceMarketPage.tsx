/**
 * FinanceMarketPage.tsx
 *
 * Market overview with placeholder index data and ANTON chat.
 */

import { useState, useRef } from 'react';
import { BarChart2, AlertTriangle, TrendingUp, TrendingDown, Send, Loader2, Plus, Newspaper } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import { getAuthHeader } from '@/lib/api';

interface IndexRow {
  name: string;
  symbol: string;
  price: string;
  change: string;
  changeDir: 'up' | 'down' | 'flat';
}

const PLACEHOLDER_INDICES: IndexRow[] = [
  { name: 'S&P 500', symbol: 'SPX', price: '5,234.18', change: '+0.87%', changeDir: 'up' },
  { name: 'OMXS30', symbol: 'OMXS30', price: '2,541.30', change: '-0.42%', changeDir: 'down' },
  { name: 'NASDAQ Composite', symbol: 'COMP', price: '16,384.47', change: '+1.12%', changeDir: 'up' },
  { name: 'DAX', symbol: 'DAX', price: '17,892.91', change: '+0.23%', changeDir: 'up' },
  { name: 'FTSE 100', symbol: 'UKX', price: '7,930.05', change: '-0.15%', changeDir: 'down' },
];

export default function FinanceMarketPage() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  async function askAnton() {
    if (!question.trim() || isStreaming) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAnswer('');
    setError('');
    setIsStreaming(true);

    try {
      const res = await fetch('/api/finance/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ concept: question }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === 'text_delta' && parsed.content) {
              fullText += parsed.content;
              setAnswer(fullText);
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError('Failed to get answer. Please try again.');
      }
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      askAnton();
    }
  }

  function addToWatchlist(symbol: string, name: string) {
    navigate(`/finance/watchlist?add=${symbol}&name=${encodeURIComponent(name)}&type=index`);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-gold/10">
            <BarChart2 className="h-5 w-5 text-adv-gold" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-adv-off-white">Market Overview</h1>
            <p className="text-sm text-adv-gray">Market Intelligence — for education, not trading</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-6">
        {/* Disclaimer */}
        <div className="flex items-start gap-3 rounded-xl border border-adv-gold/30 bg-adv-gold/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-adv-gold" />
          <p className="text-sm text-adv-gold">
            <span className="font-semibold">Market data is delayed and for education only.</span>{' '}
            Not for trading decisions. Live data requires a separate API key.
          </p>
        </div>

        {/* Indices table */}
        <div className="rounded-xl border border-border bg-adv-card overflow-hidden">
          <div className="border-b border-border px-5 py-3 flex items-center justify-between">
            <h2 className="font-semibold text-adv-off-white">Popular Indices</h2>
            <span className="text-xs text-adv-gray-med bg-adv-dark rounded px-2 py-1">
              Example data — live data requires API key
            </span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-adv-gray">
                <th className="px-5 py-3 text-left font-medium">Index</th>
                <th className="px-5 py-3 text-left font-medium">Symbol</th>
                <th className="px-5 py-3 text-right font-medium">Price</th>
                <th className="px-5 py-3 text-right font-medium">Change</th>
                <th className="px-5 py-3 text-right font-medium">Watchlist</th>
              </tr>
            </thead>
            <tbody>
              {PLACEHOLDER_INDICES.map((idx) => (
                <tr key={idx.symbol} className="border-b border-border/50 hover:bg-adv-dark-2 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium text-adv-off-white">{idx.name}</td>
                  <td className="px-5 py-3 text-sm text-adv-gray font-mono">{idx.symbol}</td>
                  <td className="px-5 py-3 text-sm text-right text-adv-off-white">{idx.price}</td>
                  <td className={`px-5 py-3 text-sm text-right flex items-center justify-end gap-1 ${
                    idx.changeDir === 'up' ? 'text-adv-green' : idx.changeDir === 'down' ? 'text-adv-red' : 'text-adv-gray'
                  }`}>
                    {idx.changeDir === 'up' ? <TrendingUp className="h-3 w-3" /> : idx.changeDir === 'down' ? <TrendingDown className="h-3 w-3" /> : null}
                    {idx.change}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => addToWatchlist(idx.symbol, idx.name)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-adv-gray hover:bg-adv-teal-dim hover:text-adv-teal transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Ask ANTON section */}
        <div className="rounded-xl border border-border bg-adv-card p-5">
          <h2 className="mb-3 font-semibold text-adv-off-white">Ask ANTON about markets</h2>
          <p className="mb-4 text-sm text-adv-gray">
            Ask any market or investing concept — ANTON will explain it clearly.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. What is the P/E ratio? How does inflation affect bonds?"
              disabled={isStreaming}
              className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none"
            />
            <button
              onClick={askAnton}
              disabled={!question.trim() || isStreaming}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
            >
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Ask
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-adv-red">{error}</p>}
          {(answer || isStreaming) && (
            <div className="mt-4 rounded-lg border border-adv-teal/20 bg-adv-dark p-4">
              <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
                {isStreaming && <span className="animate-pulse text-adv-teal">▊</span>}
              </div>
            </div>
          )}
        </div>

        {/* Cross-tab: link to financial news */}
        <div className="rounded-xl border border-border bg-adv-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Newspaper className="h-5 w-5 text-adv-blue" />
            <h2 className="font-semibold text-adv-off-white">Financial News</h2>
          </div>
          <p className="text-sm text-adv-gray mb-4">
            Read the latest financial and economic news — see how markets connect to real-world events.
          </p>
          <div className="flex gap-2 flex-wrap">
            {['economy', 'markets', 'inflation', 'technology', 'energy'].map((topic) => (
              <button
                key={topic}
                onClick={() => navigate(`/news?topic=${topic}`)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-adv-gray hover:border-adv-blue/40 hover:text-adv-blue transition-colors capitalize"
              >
                {topic}
              </button>
            ))}
            <button
              onClick={() => navigate('/news')}
              className="rounded-full border border-adv-blue/30 bg-adv-blue/5 px-3 py-1.5 text-xs text-adv-blue hover:bg-adv-blue/10 transition-colors"
            >
              All news →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
