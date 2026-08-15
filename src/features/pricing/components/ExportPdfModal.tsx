import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { gerarCorCanal } from '../calculations';
import type { Canal } from '../types';

interface ExportPdfModalProps {
  open: boolean;
  canaisVisiveis: Canal[];
  /** 'gerenciamento' expõe Custo/Frete/Encargos/Margem no PDF; 'online' publica o Catálogo Online (link público) em vez de gerar PDF — só ajusta o texto do modal, quem executa a ação é o chamador. */
  modo?: 'padrao' | 'gerenciamento' | 'online';
  onFechar: () => void;
  /** 1 ou mais Tabelas marcadas — no modo PDF, o chamador gera um arquivo por Tabela (separados); no modo 'online', publica/atualiza todas de uma vez. */
  onConfirmar: (canais: Canal[]) => void;
}

export function ExportPdfModal({ open, canaisVisiveis, modo = 'padrao', onFechar, onConfirmar }: ExportPdfModalProps) {
  const [selecionadosIds, setSelecionadosIds] = useState<Set<string>>(() => new Set(canaisVisiveis[0] ? [canaisVisiveis[0].id] : []));

  function alternar(id: string) {
    setSelecionadosIds((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function confirmar() {
    const canais = canaisVisiveis.filter((c) => selecionadosIds.has(c.id));
    if (canais.length === 0) {
      alert('Selecione ao menos uma Tabela de Preço.');
      return;
    }
    onConfirmar(canais);
  }

  const rotuloBotao =
    modo === 'online' ? `Publicar${selecionadosIds.size > 1 ? ` (${selecionadosIds.size})` : ''}` : `Confirmar Impressão${selecionadosIds.size > 1 ? ` (${selecionadosIds.size})` : ''}`;

  return (
    <Modal
      open={open}
      title={modo === 'gerenciamento' ? 'Exportar Relatório de Gerenciamento' : modo === 'online' ? 'Publicar Catálogo Online' : 'Exportar Catálogo em PDF'}
      onClose={onFechar}
      footer={
        <>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button variant="action" onClick={confirmar}>
            {rotuloBotao}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-[var(--color-text-soft)]">
        {modo === 'gerenciamento'
          ? 'Escolha 1 ou mais Tabelas de Preço — marcando mais de uma, gera um relatório separado pra cada. Cada um traz Custo/Frete/Encargos/Margem R$ além de Valor e Peso, uso interno (não é pra ir pro cliente). Respeita o filtro de Classe/Categoria atualmente selecionado na tela.'
          : modo === 'online'
            ? 'Escolha 1 ou mais Tabelas de Preço — marcando mais de uma, publica/atualiza o link público de todas de uma vez. Mostra só nome, peso e preço dos produtos marcados "Imprimir" (com Código cadastrado). Publicar de novo substitui o que estava no link antes.'
            : 'Escolha 1 ou mais Tabelas de Preço — marcando mais de uma, gera um catálogo separado pra cada. O relatório respeitará o filtro de Classe/Categoria atualmente selecionado na tela.'}
      </p>
      {canaisVisiveis.length === 0 ? (
        <p className="text-sm text-[var(--color-text-soft)]">
          Nenhuma Tabela de Preço visível no momento. Ative alguma em Parametrização de Custos.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {canaisVisiveis.map((canal) => (
            <label
              key={canal.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--color-line)] px-3 py-2.5 text-sm hover:bg-[var(--color-page)]"
            >
              <input type="checkbox" checked={selecionadosIds.has(canal.id)} onChange={() => alternar(canal.id)} />
              <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: gerarCorCanal(canal.corIndice).dark }} />
              <span>{canal.nome}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
