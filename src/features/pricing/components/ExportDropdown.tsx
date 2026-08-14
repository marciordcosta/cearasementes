import { useEffect, useRef, useState } from 'react';

interface ExportDropdownProps {
  onExportarPdf: () => void;
  onExportarGerenciamento: () => void;
  onPublicarCatalogoOnline: () => void;
}

export function ExportDropdown({ onExportarPdf, onExportarGerenciamento, onPublicarCatalogoOnline }: ExportDropdownProps) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('click', fechar);
    return () => document.removeEventListener('click', fechar);
  }, [aberto]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="rounded-md border border-white/40 px-3.5 py-2 text-sm font-semibold whitespace-nowrap text-white hover:bg-white/12"
      >
        ⇩ Exportar ▾
      </button>
      {aberto && (
        <div className="absolute top-[calc(100%+6px)] right-0 z-[70] min-w-[190px] overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-xl">
          <button
            type="button"
            onClick={() => {
              setAberto(false);
              onExportarPdf();
            }}
            className="block w-full px-3.5 py-2.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-page)]"
          >
            📄 PDF (Catálogo)
          </button>
          <button
            type="button"
            onClick={() => {
              setAberto(false);
              onExportarGerenciamento();
            }}
            className="block w-full border-t border-[var(--color-line)] px-3.5 py-2.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-page)]"
          >
            📊 PDF (Gerenciamento)
          </button>
          <button
            type="button"
            onClick={() => {
              setAberto(false);
              onPublicarCatalogoOnline();
            }}
            className="block w-full border-t border-[var(--color-line)] px-3.5 py-2.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-page)]"
          >
            🌐 Catálogo Online
          </button>
        </div>
      )}
    </div>
  );
}
