import { useState } from 'react';
import { File, FilePlus, FileEdit, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import type { FileManifestEntry } from '@/lib/coding-types';

interface FileManifestProps {
  files: FileManifestEntry[];
  onFileSelect?: (file: FileManifestEntry) => void;
  selectedFile?: string;
  className?: string;
}

const ACTION_CONFIG = {
  create: { icon: FilePlus, label: 'New', color: 'text-adv-green', bg: 'bg-adv-green/10' },
  modify: { icon: FileEdit, label: 'Modified', color: 'text-adv-gold', bg: 'bg-adv-gold/10' },
  enhance: { icon: Sparkles, label: 'Enhanced', color: 'text-adv-blue', bg: 'bg-adv-blue/10' },
};

const LANG_COLORS: Record<string, string> = {
  typescript: 'text-blue-400',
  javascript: 'text-yellow-400',
  python: 'text-green-400',
  html: 'text-orange-400',
  css: 'text-purple-400',
  json: 'text-adv-gray',
  markdown: 'text-adv-off-white',
};

export default function FileManifest({ files, onFileSelect, selectedFile, className = '' }: FileManifestProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // Build directory tree
  const tree = buildTree(files);

  const toggleDir = (dir: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  };

  return (
    <div className={`rounded-lg border border-border bg-adv-card ${className}`}>
      <div className="border-b border-border px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-gray">
          Files ({files.length})
        </h3>
      </div>
      <div className="max-h-[400px] overflow-auto p-2">
        {renderTree(tree, 0, expandedDirs, toggleDir, onFileSelect, selectedFile)}
      </div>
    </div>
  );
}

interface TreeNode {
  name: string;
  fullPath: string;
  children: TreeNode[];
  file?: FileManifestEntry;
}

function buildTree(files: FileManifestEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const fullPath = parts.slice(0, i + 1).join('/');
      let node = current.find((n) => n.name === part);
      if (!node) {
        node = { name: part, fullPath, children: [], file: i === parts.length - 1 ? file : undefined };
        current.push(node);
      }
      current = node.children;
    }
  }
  return root;
}

function renderTree(
  nodes: TreeNode[],
  depth: number,
  expanded: Set<string>,
  toggleDir: (dir: string) => void,
  onFileSelect?: (f: FileManifestEntry) => void,
  selectedFile?: string,
): React.ReactNode {
  return nodes.map((node) => {
    if (node.file) {
      const config = ACTION_CONFIG[node.file.action];
      const Icon = config.icon;
      const isSelected = selectedFile === node.file.path;
      return (
        <button
          key={node.fullPath}
          onClick={() => onFileSelect?.(node.file!)}
          className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
            isSelected ? 'bg-adv-teal-dim text-adv-teal' : 'text-adv-off-white hover:bg-adv-dark-2'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <File className={`h-3.5 w-3.5 shrink-0 ${LANG_COLORS[node.file.language || ''] || 'text-adv-gray'}`} />
          <span className="truncate font-mono">{node.name}</span>
          <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] ${config.color} ${config.bg}`}>
            {config.label}
          </span>
        </button>
      );
    }

    const isExpanded = expanded.has(node.fullPath);
    return (
      <div key={node.fullPath}>
        <button
          onClick={() => toggleDir(node.fullPath)}
          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-adv-gray hover:text-adv-off-white hover:bg-adv-dark-2 transition-colors"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="font-mono font-medium">{node.name}/</span>
        </button>
        {isExpanded && renderTree(node.children, depth + 1, expanded, toggleDir, onFileSelect, selectedFile)}
      </div>
    );
  });
}
