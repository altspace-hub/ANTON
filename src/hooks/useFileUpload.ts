import { useState, useCallback } from 'react';
import { uploadFile } from '@/lib/api';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  extension: string;
  status: 'uploading' | 'done' | 'error';
  isImage?: boolean;
  previewUrl?: string;
}

export function useFileUpload() {
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const upload = useCallback(async (file: File) => {
    const tempId = crypto.randomUUID();
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const isImage = IMAGE_EXTS.has(ext);
    // Create an object URL for local thumbnail preview while uploading
    const previewUrl = isImage ? URL.createObjectURL(file) : undefined;

    const newFile: UploadedFile = {
      id: tempId,
      name: file.name,
      size: file.size,
      extension: ext,
      status: 'uploading',
      isImage,
      previewUrl,
    };
    setFiles((prev) => [...prev, newFile]);

    try {
      const result = await uploadFile(file);
      setFiles((prev) =>
        prev.map((f) => (f.id === tempId ? { ...f, id: result.id, status: 'done' as const } : f))
      );
    } catch {
      setFiles((prev) => prev.map((f) => (f.id === tempId ? { ...f, status: 'error' as const } : f)));
    }
  }, []);

  const remove = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  return { files, upload, remove };
}
