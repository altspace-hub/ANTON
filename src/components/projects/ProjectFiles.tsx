import { useEffect, useState, useCallback } from 'react';
import { Upload, FileText, Download, Trash2, FolderOpen, X } from 'lucide-react';

interface ProjectFile {
  id: string;
  project_id: string;
  filename: string;
  original_name: string;
  file_size: number;
  mime_type: string;
  extension: string;
  uploaded_by: string;
  created_at: string;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const EXT_ICONS: Record<string, string> = {
  '.pdf': 'text-red-400',
  '.docx': 'text-blue-400',
  '.doc': 'text-blue-400',
  '.xlsx': 'text-green-400',
  '.xls': 'text-green-400',
  '.csv': 'text-green-400',
  '.txt': 'text-adv-gray',
  '.md': 'text-adv-gray',
};

export default function ProjectFiles({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, { headers: getAuthHeader() });
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[project-files] fetch error:', err);
    }
  }, [projectId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  async function handleUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < fileList.length; i++) {
        formData.append('files', fileList[i]);
      }
      await fetch(`/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData,
      });
      fetchFiles();
    } catch (err) {
      console.error('[project-files] upload error:', err);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(fileId: string) {
    try {
      await fetch(`/api/projects/${projectId}/files/${fileId}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      });
      setFiles(prev => prev.filter(f => f.id !== fileId));
    } catch (err) {
      console.error('[project-files] delete error:', err);
    }
  }

  function handleDownload(fileId: string, originalName: string) {
    const a = document.createElement('a');
    a.href = `/api/projects/${projectId}/files/${fileId}/download`;
    a.download = originalName;
    // Add auth header via fetch + blob
    fetch(a.href, { headers: getAuthHeader() })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(err => console.error('[project-files] download error:', err));
  }

  return (
    <div>
      {/* Upload area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleUpload(e.dataTransfer.files);
        }}
        className={`mb-4 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver
            ? 'border-adv-teal bg-adv-teal-dim/30'
            : 'border-border bg-adv-dark hover:border-adv-teal/30'
        }`}
      >
        <Upload className={`mx-auto mb-2 h-8 w-8 ${dragOver ? 'text-adv-teal' : 'text-adv-gray'}`} />
        <p className="text-sm text-adv-gray">
          {uploading ? 'Uploading...' : 'Drop files here or click to upload'}
        </p>
        <input
          type="file"
          multiple
          onChange={(e) => handleUpload(e.target.files)}
          className="absolute inset-0 cursor-pointer opacity-0"
          style={{ position: 'relative' }}
        />
        <label className="mt-2 inline-block cursor-pointer">
          <input
            type="file"
            multiple
            onChange={(e) => handleUpload(e.target.files)}
            className="hidden"
          />
          <span className="rounded-lg bg-adv-teal/10 px-3 py-1.5 text-xs font-medium text-adv-teal transition-colors hover:bg-adv-teal/20">
            Browse files
          </span>
        </label>
      </div>

      {/* File list */}
      {files.length === 0 ? (
        <div className="rounded-xl border border-border bg-adv-card p-6 text-center">
          <FolderOpen className="mx-auto mb-2 h-8 w-8 text-adv-gray" />
          <p className="text-sm text-adv-gray">No files uploaded yet</p>
          <p className="mt-1 text-xs text-adv-gray">
            Upload documents to share with your team and use in modules
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map(file => (
            <div
              key={file.id}
              className="group flex items-center gap-3 rounded-lg border border-border bg-adv-card px-4 py-3 transition-all hover:border-adv-teal/20"
            >
              <FileText className={`h-5 w-5 shrink-0 ${EXT_ICONS[file.extension] || 'text-adv-gray'}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-adv-off-white">{file.original_name}</p>
                <p className="text-xs text-adv-gray">
                  {formatFileSize(file.file_size)} · {formatDate(file.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => handleDownload(file.id, file.original_name)}
                  className="rounded p-1.5 text-adv-gray hover:text-adv-teal transition-colors"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(file.id)}
                  className="rounded p-1.5 text-adv-gray hover:text-adv-red transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Knowledge source note */}
      {files.length > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-adv-teal/20 bg-adv-teal-dim/20 px-3 py-2">
          <FolderOpen className="h-4 w-4 shrink-0 text-adv-teal" />
          <p className="text-xs text-adv-teal">
            These files are available as a Knowledge Source in any module. Look for "Project: {projectName}" in Local Folders.
          </p>
        </div>
      )}
    </div>
  );
}
