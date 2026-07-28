import { useRef, useState, type DragEvent } from 'react';

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  /** Enquanto true, ignora clique/arrastar e mostra que já tem um envio em andamento — evita reenviar o mesmo arquivo duas vezes antes do primeiro terminar. */
  desabilitado?: boolean;
}

export function Dropzone({ onFiles, desabilitado = false }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastando(false);
    if (desabilitado) return;
    if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div
      onClick={() => !desabilitado && inputRef.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!desabilitado) setArrastando(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!desabilitado) setArrastando(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setArrastando(false);
      }}
      onDrop={handleDrop}
      className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
        desabilitado
          ? 'cursor-not-allowed border-[var(--color-line)] opacity-50'
          : `cursor-pointer ${arrastando ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/6' : 'border-[var(--color-line)]'}`
      }`}
    >
      <p className="font-medium text-[var(--color-text)]">{desabilitado ? 'Processando o envio anterior, aguarde…' : 'Arraste e solte os arquivos aqui'}</p>
      <p className="mt-1 text-sm text-[var(--color-text-soft)]">
        ou clique para selecionar — relatórios 124/396, extrato BB e recebíveis Stone (XLS/XLSX/CSV) e Sistema (HTML), à vontade misturados
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xls,.xlsx,.html,.htm"
        multiple
        disabled={desabilitado}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
    </div>
  );
}
