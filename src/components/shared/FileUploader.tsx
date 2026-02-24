import { useState, useCallback } from 'react';
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  extension: string;
  status: 'uploading' | 'done' | 'error';
}

interface FileUploaderProps {
  files: UploadedFile[];
  onUpload: (file: File) => void;
  onRemove: (id: string) => void;
}

export default function FileUploader({ files, onUpload, onRemove }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      droppedFiles.forEach(onUpload);
    },
    [onUpload]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files || []);
      selected.forEach(onUpload);
      e.target.value = '';
    },
    [onUpload]
  );

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-adv-off-white">Upload Documents</label>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          isDragging
            ? 'border-adv-teal bg-adv-teal/5'
            : 'border-border hover:border-adv-gray-med'
        }`}
      >
        <Upload className="mx-auto h-6 w-6 text-adv-gray-med" />
        <p className="mt-2 text-xs text-adv-gray">
          Drag & drop files here, or{' '}
          <label className="cursor-pointer text-adv-teal hover:underline">
            browse
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.txt,.md,.xlsx,.csv,.html"
              onChange={handleFileInput}
              className="hidden"
            />
          </label>
        </p>
        <p className="mt-1 text-[10px] text-adv-gray-med">
          PDF, DOCX, TXT, MD, XLSX, CSV, HTML (max 50MB)
        </p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-2 space-y-1">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 rounded bg-adv-dark px-2.5 py-1.5 text-xs"
            >
              <File className="h-3 w-3 text-adv-gray shrink-0" />
              <span className="flex-1 truncate text-adv-gray">{f.name}</span>
              <span className="text-adv-gray-med">{(f.size / 1024).toFixed(0)}KB</span>
              {f.status === 'done' && <CheckCircle className="h-3 w-3 text-adv-green" />}
              {f.status === 'error' && <AlertCircle className="h-3 w-3 text-adv-red" />}
              {f.status === 'uploading' && (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
              )}
              <button onClick={() => onRemove(f.id)} className="text-adv-gray-med hover:text-adv-red">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
