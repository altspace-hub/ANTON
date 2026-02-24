import { useState } from 'react';
import { FileText, Brain } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageWithThinkingProps {
  outputContent: string;
  thinkingContent: string;
}

export default function MessageWithThinking({
  outputContent,
  thinkingContent,
}: MessageWithThinkingProps) {
  const [activeTab, setActiveTab] = useState<'output' | 'thinking'>('output');

  return (
    <div className="rounded-lg border border-border bg-adv-card overflow-hidden">
      {/* Tab Headers */}
      <div className="flex border-b border-border bg-adv-dark-2">
        <button
          onClick={() => setActiveTab('output')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'output'
              ? 'text-adv-teal border-b-2 border-adv-teal bg-adv-card'
              : 'text-adv-gray hover:text-adv-off-white'
          }`}
        >
          <FileText className="h-4 w-4" />
          Output
        </button>
        <button
          onClick={() => setActiveTab('thinking')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'thinking'
              ? 'text-adv-teal border-b-2 border-adv-teal bg-adv-card'
              : 'text-adv-gray hover:text-adv-off-white'
          }`}
        >
          <Brain className="h-4 w-4" />
          Thinking
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'output' ? (
          <div className="prose-output max-w-none text-adv-off-white">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{outputContent}</ReactMarkdown>
          </div>
        ) : (
          <div className="prose-output max-w-none text-adv-gray-med [&_strong]:text-adv-gray [&_h1]:text-adv-gray [&_h2]:text-adv-gray [&_h3]:text-adv-gray [&_h4]:text-adv-gray">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{thinkingContent}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
