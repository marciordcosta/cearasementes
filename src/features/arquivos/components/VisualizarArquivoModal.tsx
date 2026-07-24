import { Modal } from '@/components/ui/Modal';
import type { ArquivoLaudo } from '../types';
import { montarUrlVisualizacao, precisaVisualizadorExterno } from '../visualizacaoArquivo';

interface VisualizarArquivoModalProps {
  laudo: ArquivoLaudo | null;
  onFechar: () => void;
}

/** Pré-visualização inline — PDF/imagem carrega direto; Word/Excel/PowerPoint passam pelo Google Docs Viewer (o arquivo precisa estar público, que já é o caso do bucket "laudos"). */
export function VisualizarArquivoModal({ laudo, onFechar }: VisualizarArquivoModalProps) {
  const viaGoogleViewer = laudo ? precisaVisualizadorExterno(laudo) : false;
  const src = laudo ? montarUrlVisualizacao(laudo, 'embutido') : '';

  return (
    <Modal open={laudo !== null} title={laudo?.arquivoNome ?? 'Visualizar arquivo'} onClose={onFechar} widthClassName="max-w-[860px]">
      {laudo && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <a href={laudo.arquivoUrl} download={laudo.arquivoNome} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[var(--color-accent)] hover:underline">
              ⬇ Baixar arquivo
            </a>
            {viaGoogleViewer && <span className="text-xs text-[var(--color-text-soft)]">Visualização via Google Docs</span>}
          </div>
          <iframe title={laudo.arquivoNome} src={src} className="h-[70vh] w-full rounded-md border border-[var(--color-line)] bg-white" />
        </div>
      )}
    </Modal>
  );
}
