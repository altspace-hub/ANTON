import React, { useState, useRef } from 'react';
import { Upload, FileText, Loader } from 'lucide-react';

interface DocumentUploaderProps {
  collectionId: string;
  onUploadComplete: () => void;
}

export function DocumentUploader({ collectionId, onUploadComplete }: DocumentUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setProgress(0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
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
          setProgress(((i + 1) / files.length) * 100);
        }
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
      }
    }

    setUploading(false);
    setProgress(0);
    onUploadComplete();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="border-2 border-dashed border-adv-gray-med rounded-lg p-8 text-center">
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
            Supported: PDF, Word, Excel, Text, Markdown
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
  );
}
