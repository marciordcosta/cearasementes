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
  onConfirmar: (canal: Canal) => void;
}

export function ExportPdfModal({ open, canaisVisiveis, modo = 'padrao', onFechar, onConfirmar }: ExportPdfModalProps) {
  const [selecionadoId, setSelecionadoId] = useState<string | null>(canaisVisiveis[0]?.id ?? null);

  function confirmar() {
    const canal = canaisVisiveis.find((c) => c.id === selecionadoId);
    if (!canal) {
      alert('Selecione uma Tabela de Preço para gerar o catálogo.');
      return;
    }
    onConfirmar(canal);
  }

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
            {modo === 'online' ? 'Publicar' : 'Confirmar Impressão'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-[var(--color-text-soft)]">
        {modo === 'gerenciamento'
          ? 'Escolha qual Tabela de Preço será usada no relatório — ele traz Custo/Frete/Encargos/Margem R$ além de Valor e Peso, uso interno (não é pra ir pro cliente). Respeita o filtro de Classe/Categoria atualmente selecionado na tela.'
          : modo === 'online'
            ? 'Escolha qual Tabela de Preço vira o link público — mostra só nome, peso e preço dos produtos marcados "Imprimir" (com Código cadastrado). Publicar de novo substitui o que estava no link antes.'
            : 'Escolha qual Tabela de Preço será usada como coluna "Valor (R$)" no catálogo. O relatório respeitará o filtro de Classe/Categoria atualmente selecionado na tela.'}
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
              <input
                type="radio"
                name="canal-pdf"
                checked={selecionadoId === canal.id}
                onChange={() => setSelecionadoId(canal.id)}
              />
              <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: gerarCorCanal(canal.corIndice).dark }} />
              <span>{canal.nome}</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
