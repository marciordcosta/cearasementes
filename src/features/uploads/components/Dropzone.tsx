import { useRef, useState, type DragEvent } from 'react';

interface DropzoneProps {
  onFiles: (files: File[]) => void;
}

export function Dropzone({ onFiles }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastando(false);
    if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        setArrastando(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setArrastando(false);
      }}
      onDrop={handleDrop}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
        arrastando ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/6' : 'border-[var(--color-line)]'
      }`}
    >
      <p className="font-medium text-[var(--color-text)]">Arraste e solte os arquivos XLS/XLSX/CSV aqui</p>
      <p className="mt-1 text-sm text-[var(--color-text-soft)]">
        ou clique para selecionar (aceita múltiplos arquivos — relatórios 124 e 396)
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xls,.xlsx"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
    </div>
  );
}
