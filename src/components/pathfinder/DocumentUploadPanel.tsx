import { useState, useCallback } from 'react';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { uploadPathfinderDocument, deleteDocument, type PathfinderDocument } from '@/lib/pathfinder-api';

interface DocumentUploadPanelProps {
  documents: PathfinderDocument[];
  threadId?: string;
  onDocumentsChange: () => void;
}

export default function DocumentUploadPanel({ documents, threadId, onDocumentsChange }: DocumentUploadPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadPathfinderDocument(file, threadId);
      }
      onDocumentsChange();
    } catch (err) {
      console.error('Upload failed:', err);
    }
    setUploading(false);
  }, [threadId, onDocumentsChange]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }

  async function handleRemove(id: string) {
    await deleteDocument(id);
    onDocumentsChange();
  }

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 text-xs transition-colors cursor-pointer ${
          dragOver ? 'border-adv-teal bg-adv-teal/5 text-adv-teal' : 'border-border text-adv-gray hover:border-adv-teal/30'
        }`}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = true;
          input.accept = '.pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md,.html';
          input.onchange = () => input.files && handleFiles(input.files);
          input.click();
        }}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        <span>{uploading ? 'Uploading...' : 'Drop files or click to upload'}</span>
      </div>

      {/* File list */}
      {documents.length > 0 && (
        <div className="space-y-1">
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center gap-2 rounded-lg bg-adv-card/50 px-2.5 py-1.5 text-xs">
              <FileText className="h-3.5 w-3.5 text-adv-teal shrink-0" />
              <span className="truncate text-adv-off-white">{doc.filename}</span>
              <span className="ml-auto text-[10px] text-adv-gray shrink-0">
                {doc.word_count.toLocaleString()} words · ~{doc.token_estimate.toLocaleString()} tokens
              </span>
              <button
                onClick={() => handleRemove(doc.id)}
                className="text-adv-gray hover:text-adv-red transition-colors shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
