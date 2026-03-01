import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText, Loader, CheckCircle, XCircle } from 'lucide-react';

interface DocumentUploaderProps {
  collectionId: string;
  onUploadComplete: () => void;
}

interface FileResult {
  name: string;
  success: boolean;
  error?: string;
  chunkCount?: number;
}

export function DocumentUploader({ collectionId, onUploadComplete }: DocumentUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<FileResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploading(true);
    setProgress(0);
    setResults([]);

    const uploadResults: FileResult[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('collectionId', collectionId);

      try {
        const response = await fetch('/api/documents/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('openexpert-token')}`,
          },
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          uploadResults.push({ name: file.name, success: true, chunkCount: data.chunkCount });
        } else {
          let errorMsg = `Upload failed (${response.status})`;
          try {
            const errData = await response.json();
            errorMsg = errData.error || errorMsg;
          } catch {}
          uploadResults.push({ name: file.name, success: false, error: errorMsg });
        }
      } catch (error) {
        uploadResults.push({ name: file.name, success: false, error: 'Network error — check server connection' });
        console.error(`Failed to upload ${file.name}:`, error);
      }

      setProgress(((i + 1) / fileArray.length) * 100);
    }

    setResults(uploadResults);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onUploadComplete();
  }, [collectionId, onUploadComplete]);

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    uploadFiles(files);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(Array.from(e.dataTransfer.files));
  }, [uploadFiles]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  return (
    <div className="space-y-3">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver
            ? 'border-adv-teal bg-adv-teal/5'
            : 'border-adv-gray-med hover:border-adv-teal/50'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md"
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
          id="file-upload"
        />

        {uploading ? (
          <div className="space-y-3">
            <Loader className="h-12 w-12 text-adv-teal animate-spin mx-auto" />
            <p className="text-adv-off-white">Uploading and indexing...</p>
            <div className="w-full bg-adv-dark rounded-full h-2">
              <div
                className="bg-adv-teal h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <FileText className="h-12 w-12 text-adv-gray mx-auto mb-4" />
            <p className="text-adv-off-white mb-2">
              Drag and drop files here, or click to browse
            </p>
            <p className="text-sm text-adv-gray mb-4">
              Supported: PDF, Word, Excel, CSV, Text, Markdown
            </p>
            <label
              htmlFor="file-upload"
              className="inline-flex items-center gap-2 px-4 py-2 bg-adv-teal text-white rounded hover:bg-adv-teal-dark cursor-pointer transition-colors"
            >
              <Upload className="h-4 w-4" />
              Select Files
            </label>
          </>
        )}
      </div>

      {/* Upload results */}
      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 p-3 rounded border text-sm ${
                r.success
                  ? 'border-adv-green/30 bg-adv-green/5'
                  : 'border-adv-red/30 bg-adv-red/5'
              }`}
            >
              {r.success ? (
                <CheckCircle className="h-4 w-4 text-adv-green flex-shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-adv-red flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="text-adv-off-white truncate block">{r.name}</span>
                {r.success && r.chunkCount !== undefined && (
                  <span className="text-adv-gray text-xs">{r.chunkCount} chunks indexed</span>
                )}
                {!r.success && r.error && (
                  <span className="text-adv-red text-xs">{r.error}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
