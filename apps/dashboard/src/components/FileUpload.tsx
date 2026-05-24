import { useState, useRef, type ChangeEvent } from "react";
import { clsx } from "clsx";
import { Upload, FileText, X } from "lucide-react";

interface FileUploadProps {
  accept?: string;
  maxSizeMB?: number;
  multiple?: boolean;
  onFilesChange: (files: File[]) => void;
}

export default function FileUpload({ accept, maxSizeMB = 5, multiple = false, onFilesChange }: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (newFiles: FileList) => {
    const valid = Array.from(newFiles)
      .filter((f) => f.size <= maxSizeMB * 1024 * 1024)
      .slice(0, multiple ? undefined : 1);

    setFiles((prev) => {
      const updated = multiple ? [...prev, ...valid] : valid;
      onFilesChange(updated);
      return updated;
    });
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      const updated = prev.filter((_, i) => i !== idx);
      onFilesChange(updated);
      return updated;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
          dragOver
            ? "border-blue-500 bg-blue-600/10"
            : "border-gray-700 bg-gray-800/50 hover:border-gray-600",
        )}
      >
        <Upload className="mx-auto w-8 h-8 text-gray-500 mb-2" />
        <p className="text-sm text-gray-400">
          <span className="text-blue-400">Click to upload</span> or drag and drop
        </p>
        <p className="text-xs text-gray-600 mt-1">
          Max {maxSizeMB}MB {accept ? `(${accept})` : ""}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          className="hidden"
        />
      </div>

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((file, idx) => (
            <li key={`${file.name}-${idx}`} className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2 text-sm">
              <FileText className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="flex-1 text-gray-300 truncate">{file.name}</span>
              <span className="text-xs text-gray-500">{formatSize(file.size)}</span>
              <button onClick={() => removeFile(idx)} className="text-gray-500 hover:text-red-400">
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
