import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { paraNumero } from '../metricas';
import type { ChecklistPergunta, FatorPlantio } from '../types';

interface ChecklistCondicaoModalProps {
  open: boolean;
  checklist: ChecklistPergunta[];
  fatores: FatorPlantio[];
  onFechar: () => void;
  /** Chamado com a `chave` da condição resultante (ex.: 'baixa') ao clicar "Usar essa condição". */
  onConfirmar: (condicaoChave: string) => void;
}

/**
 * Checklist de Diagnóstico de Campo — perguntas/opções vêm da Parametrização
 * de Produtos (cada opção marcada aponta pra uma condição). A condição
 * resultante é sempre a PIOR (menor fator = mais perda) entre as respostas
 * marcadas — assim uma única resposta "ruim" já trava o resultado em Baixa,
 * do mesmo jeito que "qualquer C" travava no checklist original em papel.
 */
export function ChecklistCondicaoModal({ open, checklist, fatores, onFechar, onConfirmar }: ChecklistCondicaoModalProps) {
  const [respostas, setRespostas] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) setRespostas({});
  }, [open]);

  const condicoes = fatores.filter((f) => f.categoria === 'condicao');

  const chavesEscolhidas = checklist.map((p) => {
    const opcaoId = respostas[p.id];
    return p.opcoes.find((o) => o.id === opcaoId)?.condicaoChave ?? null;
  });

  const respondeuTudo = checklist.length > 0 && chavesEscolhidas.every((c) => c !== null);

  const condicaoResultante = respondeuTudo
    ? condicoes.reduce<FatorPlantio | null>((pior, atual) => {
        if (!chavesEscolhidas.includes(atual.chave)) return pior;
        const fatorAtual = paraNumero(atual.fator) ?? 1;
        const fatorPior = pior ? (paraNumero(pior.fator) ?? 1) : Infinity;
        return fatorAtual < fatorPior ? atual : pior;
      }, null)
    : null;

  return (
    <Modal
      open={open}
      title="Checklist de Diagnóstico de Campo"
      onClose={onFechar}
      widthClassName="max-w-[560px]"
      footer={
        <>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!condicaoResultante} onClick={() => condicaoResultante && onConfirmar(condicaoResultante.chave)}>
            {condicaoResultante ? `Usar condição: ${condicaoResultante.rotulo}` : 'Responda todas as perguntas'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-[var(--color-text-soft)]">
          Responda as perguntas abaixo sobre a área de plantio — o sistema identifica a condição real de campo e já deixa
          selecionada no Guia de Plantio.
        </p>
        {checklist.length === 0 && (
          <p className="text-sm text-[var(--color-text-soft)]">Nenhuma pergunta cadastrada ainda — cadastre o checklist na Parametrização de Produtos.</p>
        )}
        {checklist.map((pergunta, indice) => (
          <div key={pergunta.id} className="space-y-1.5">
            <p className="text-sm font-semibold text-[var(--color-text)]">
              {indice + 1}. {pergunta.pergunta}
            </p>
            <div className="space-y-1">
              {pergunta.opcoes.map((opcao) => {
                const selecionada = respostas[pergunta.id] === opcao.id;
                const descartada = respostas[pergunta.id] !== undefined && !selecionada;
                return (
                  <label key={opcao.id} className="flex items-start gap-2 rounded-md px-2 py-1 text-sm hover:bg-[var(--color-page)]">
                    <input
                      type="radio"
                      name={`pergunta-${pergunta.id}`}
                      checked={selecionada}
                      onChange={() => setRespostas((prev) => ({ ...prev, [pergunta.id]: opcao.id }))}
                      className="mt-1 accent-[var(--color-navy)]"
                    />
                    <span className={descartada ? 'text-[var(--color-text-soft)] opacity-60' : 'text-[var(--color-text)]'}>{opcao.texto}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
