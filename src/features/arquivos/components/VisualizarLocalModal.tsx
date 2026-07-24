import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';

interface VisualizarLocalModalProps {
  arquivo: File | null;
  onFechar: () => void;
}

const EXTENSOES_NATIVAS = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

function ehNativo(arquivo: File): boolean {
  if (arquivo.type === 'application/pdf' || arquivo.type.startsWith('image/')) return true;
  const nome = arquivo.name.toLowerCase();
  return EXTENSOES_NATIVAS.some((ext) => nome.endsWith(ext));
}

function ehDocx(arquivo: File): boolean {
  return arquivo.name.toLowerCase().endsWith('.docx');
}

/**
 * Preview do arquivo ANTES de enviar — não existe URL pública ainda (não foi
 * pro Storage), então não dá pra usar o Google Docs Viewer aqui (ele precisa
 * buscar o arquivo por URL). PDF/imagem o navegador já mostra sozinho a
 * partir de um blob local; .docx é convertido pra HTML no próprio navegador
 * via mammoth (só funciona pra .docx — o .doc antigo não tem suporte).
 */
export function VisualizarLocalModal({ arquivo, onFechar }: VisualizarLocalModalProps) {
  const [htmlDocx, setHtmlDocx] = useState<string | null>(null);
  const [erroDocx, setErroDocx] = useState<string | null>(null);
  const [urlLocal, setUrlLocal] = useState<string | null>(null);

  useEffect(() => {
    setHtmlDocx(null);
    setErroDocx(null);
    setUrlLocal(null);
    if (!arquivo) return;

    if (ehNativo(arquivo)) {
      const url = URL.createObjectURL(arquivo);
      setUrlLocal(url);
      return () => URL.revokeObjectURL(url);
    }

    if (ehDocx(arquivo)) {
      let cancelado = false;
      arquivo
        .arrayBuffer()
        .then((buffer) => import('mammoth').then((mammoth) => mammoth.convertToHtml({ arrayBuffer: buffer })))
        .then((resultado) => {
          if (!cancelado) setHtmlDocx(resultado.value);
        })
        .catch(() => {
          if (!cancelado) setErroDocx('Não deu pra ler o conteúdo desse arquivo.');
        });
      return () => {
        cancelado = true;
      };
    }
  }, [arquivo]);

  return (
    <Modal open={arquivo !== null} title={arquivo?.name ?? 'Visualizar arquivo'} onClose={onFechar} widthClassName="max-w-[860px]">
      {arquivo && (
        <div className="h-[70vh] overflow-y-auto rounded-md border border-[var(--color-line)] bg-white">
          {urlLocal && <iframe title={arquivo.name} src={urlLocal} className="h-[70vh] w-full" />}
          {htmlDocx && <div className="preview-docx p-4 text-sm text-[#1a2233]" dangerouslySetInnerHTML={{ __html: htmlDocx }} />}
          {erroDocx && <p className="p-4 text-sm text-bad">{erroDocx}</p>}
          {!urlLocal && !htmlDocx && !erroDocx && (
            <p className="p-4 text-sm text-[var(--color-text-soft)]">
              Pré-visualização não disponível pra esse formato antes de enviar — envie o laudo e use o ícone 👁 pra visualizá-lo depois.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
