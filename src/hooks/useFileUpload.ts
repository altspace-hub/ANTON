import { useState, useCallback } from 'react';
import { uploadFile } from '@/lib/api';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  extension: string;
  status: 'uploading' | 'done' | 'error';
}

export function useFileUpload() {
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const upload = useCallback(async (file: File) => {
    const tempId = crypto.randomUUID();
    const newFile: UploadedFile = {
      id: tempId,
      name: file.name,
      size: file.size,
      extension: file.name.split('.').pop() || '',
      status: 'uploading',
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
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return { files, upload, remove };
}
