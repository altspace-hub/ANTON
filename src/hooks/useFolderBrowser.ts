import { useState, useEffect, useCallback } from 'react';
import { fetchRegisteredFolders, registerFolder } from '@/lib/api';
import type { RegisteredFolder } from '@/lib/types';

export function useFolderBrowser() {
  const [folders, setFolders] = useState<RegisteredFolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadFolders = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchRegisteredFolders();
      setFolders(data);
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const register = useCallback(
    async (path: string, label: string) => {
      await registerFolder(path, label);
      await loadFolders();
    },
    [loadFolders]
  );

  return { folders, isLoading, register, refresh: loadFolders };
}
