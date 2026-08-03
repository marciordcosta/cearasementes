import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Produto } from '@/features/pricing/types';
import { montarDadosEtiqueta } from '../etiqueta';
import { gerarEtiquetaPdf } from '../etiquetaPdf';
import type { ArquivoLaudo, ProdutoParametrizacao } from '../types';

interface ImprimirEtiquetaModalProps {
  laudo: ArquivoLaudo | null;
  produtos: ProdutoParametrizacao[];
  produtosPreco: Produto[];
  onFechar: () => void;
}

/**
 * Confirmação "Selo em Branco" vs "Original" — mesmo padrão do diálogo
 * "Imprimir Guia de Plantio" em GuiaPlantioModal.tsx. Os dois trazem os
 * mesmos valores do laudo; a diferença é só a grade/rótulos: "Selo em
 * Branco" imprime tudo (papel virgem, sem nada pré-impresso), "Original"
 * imprime só os valores nas mesmas posições (papel já vem com a grade e os
 * rótulos pré-impressos de fábrica, não precisa/não pode duplicar).
 */
export function ImprimirEtiquetaModal({ laudo, produtos, produtosPreco, onFechar }: ImprimirEtiquetaModalProps) {
  function imprimir(comEstrutura: boolean) {
    if (!laudo) return;
    gerarEtiquetaPdf(montarDadosEtiqueta(laudo, produtos, produtosPreco), comEstrutura);
    onFechar();
  }

  return (
    <Modal
      open={laudo !== null}
      title="Imprimir Selo"
      onClose={onFechar}
      widthClassName="max-w-[420px]"
      footer={
        <>
          <Button variant="outline" onClick={() => imprimir(true)}>
            Selo em Branco
          </Button>
          <Button variant="primary" onClick={() => imprimir(false)}>
            Original
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-text)]">
        Selo em Branco imprime a grade completa (rótulos + valores) — pra papel virgem, sem nada pré-impresso. Original imprime só os valores, nas mesmas posições — pra papel que já vem com a grade e os
        rótulos de fábrica.
      </p>
    </Modal>
  );
}
