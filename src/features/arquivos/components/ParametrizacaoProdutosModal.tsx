import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { paraNumero } from '../metricas';
import type { FatorPlantio, ProdutoParametrizacao } from '../types';

interface ParametrizacaoProdutosModalProps {
  open: boolean;
  produtos: ProdutoParametrizacao[];
  fatores: FatorPlantio[];
  onFechar: () => void;
  onSalvar: (produto: { id?: string; nomeProduto: string; pmsBase: string; densidadeBase: string; indiceSobrevivencia: string }) => void;
  onApagar: (id: string) => void;
  onSalvarFator: (chave: string, fator: string) => void;
}

const campoClasse = 'rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';

/** Opções fechadas de perda — inversamente, fator 1 = 0% de perda (potencial máximo). */
const OPCOES_PERDA = [0, 25, 50, 75];

/** O banco guarda o fator (multiplicador, ex.: "0,75"), mas aqui exibe/edita a PERDA em % (ex.: "25") — mais intuitivo que digitar um multiplicador. Perda% = (1 - fator) × 100, e volta: fator = 1 - perda%/100. */
function LinhaFator({ fator, onSalvar }: { fator: FatorPlantio; onSalvar: (chave: string, fator: string) => void }) {
  const fatorNumero = paraNumero(fator.fator);
  const perdaAtual = fatorNumero !== null ? Math.round((1 - fatorNumero) * 100) : 0;
  const perdaMaisProxima = OPCOES_PERDA.reduce((maisProxima, opcao) => (Math.abs(opcao - perdaAtual) < Math.abs(maisProxima - perdaAtual) ? opcao : maisProxima), OPCOES_PERDA[0]);

  return (
    <div className="flex items-center gap-2 rounded-md bg-[var(--color-page)] px-3 py-1.5">
      <span className="flex-1 truncate text-sm text-[var(--color-text)]">{fator.rotulo}</span>
      <select
        value={perdaMaisProxima}
        onChange={(e) => {
          const perdaEscolhida = Number(e.target.value);
          onSalvar(fator.chave, (1 - perdaEscolhida / 100).toFixed(2));
        }}
        className={`w-28 ${campoClasse}`}
      >
        {OPCOES_PERDA.map((p) => (
          <option key={p} value={p}>
            {p}%
          </option>
        ))}
      </select>
    </div>
  );
}

/** PMS base, Densidade base (plantas/m²) e Índice de Sobrevivência (%) por produto (nome) — cadastrado uma vez aqui, usado automaticamente no cálculo de kg/ha de todo laudo desse produto. */
export function ParametrizacaoProdutosModal({ open, produtos, fatores, onFechar, onSalvar, onApagar, onSalvarFator }: ParametrizacaoProdutosModalProps) {
  const [novoNome, setNovoNome] = useState('');
  const [novoPms, setNovoPms] = useState('');
  const [novaDensidade, setNovaDensidade] = useState('');
  const [novaSobrevivencia, setNovaSobrevivencia] = useState('');

  function adicionar() {
    if (!novoNome.trim()) return;
    onSalvar({
      nomeProduto: novoNome.trim(),
      pmsBase: novoPms.trim(),
      densidadeBase: novaDensidade.trim(),
      indiceSobrevivencia: novaSobrevivencia.trim(),
    });
    setNovoNome('');
    setNovoPms('');
    setNovaDensidade('');
    setNovaSobrevivencia('');
  }

  return (
    <Modal open={open} title="Parametrização de Produtos" onClose={onFechar} widthClassName="max-w-[680px]" footer={<Button onClick={onFechar}>Fechar</Button>}>
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-text-soft)]">
            Fatores globais (não são por produto) — usados no Guia de Plantio pra corrigir o kg/ha conforme a forma de plantio escolhida. Escolha a perda em % (0% = potencial máximo, sem redução).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-[var(--color-text-soft)]">Modo de Plantio</p>
              {fatores
                .filter((f) => f.categoria === 'modo')
                .map((f) => (
                  <LinhaFator key={f.chave} fator={f} onSalvar={onSalvarFator} />
                ))}
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-[var(--color-text-soft)]">Condição de Implantação</p>
              {fatores
                .filter((f) => f.categoria === 'condicao')
                .map((f) => (
                  <LinhaFator key={f.chave} fator={f} onSalvar={onSalvarFator} />
                ))}
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-[var(--color-line)] pt-4">
          <p className="text-xs text-[var(--color-text-soft)]">
            PMS base, Densidade base (população alvo, plantas/m²) e Índice de Sobrevivência (%) por produto — usados no cálculo do Guia de Plantio sempre que o nome do produto do laudo bater com um
            cadastrado aqui. O PMS pode ser sobrescrito por lote (se digitar lá, o valor do lote manda); os demais campos só existem aqui. O peso do saco vem direto da Tabela de Preço (módulo
            Precificação) — não precisa cadastrar de novo.
          </p>

          <div className="max-h-[320px] space-y-1.5 overflow-y-auto">
            <div className="flex items-center gap-2 px-3 text-[11px] font-semibold text-[var(--color-text-soft)]">
              <span className="flex-1">Produto</span>
              <span className="w-20 text-center">PMS</span>
              <span className="w-20 text-center">Densidade</span>
              <span className="w-20 text-center">Sobrev. %</span>
              <span className="w-4" />
            </div>
            {produtos.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-md bg-[var(--color-page)] px-3 py-1.5">
                <span className="flex-1 truncate text-sm text-[var(--color-text)]" title={p.nomeProduto}>
                  {p.nomeProduto}
                </span>
                <input
                  defaultValue={p.pmsBase ?? ''}
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor !== (p.pmsBase ?? ''))
                      onSalvar({ id: p.id, nomeProduto: p.nomeProduto, pmsBase: valor, densidadeBase: p.densidadeBase ?? '', indiceSobrevivencia: p.indiceSobrevivencia ?? '' });
                  }}
                  className={`w-20 ${campoClasse}`}
                />
                <input
                  defaultValue={p.densidadeBase ?? ''}
                  placeholder="por m²"
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor !== (p.densidadeBase ?? ''))
                      onSalvar({ id: p.id, nomeProduto: p.nomeProduto, pmsBase: p.pmsBase ?? '', densidadeBase: valor, indiceSobrevivencia: p.indiceSobrevivencia ?? '' });
                  }}
                  className={`w-20 ${campoClasse}`}
                />
                <input
                  defaultValue={p.indiceSobrevivencia ?? ''}
                  placeholder="ideal"
                  onBlur={(e) => {
                    const valor = e.target.value.trim();
                    if (valor !== (p.indiceSobrevivencia ?? ''))
                      onSalvar({ id: p.id, nomeProduto: p.nomeProduto, pmsBase: p.pmsBase ?? '', densidadeBase: p.densidadeBase ?? '', indiceSobrevivencia: valor });
                  }}
                  className={`w-20 ${campoClasse}`}
                />
                <button type="button" onClick={() => onApagar(p.id)} title="Excluir" className="text-[var(--color-text-soft)] hover:text-bad">
                  🗑
                </button>
              </div>
            ))}
            {produtos.length === 0 && <p className="text-sm text-[var(--color-text-soft)]">Nenhum produto cadastrado ainda.</p>}
          </div>

          <div className="flex items-center gap-2 border-t border-[var(--color-line)] px-3 pt-3">
            <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do produto" className={`flex-1 ${campoClasse}`} />
            <input value={novoPms} onChange={(e) => setNovoPms(e.target.value)} placeholder="PMS" className={`w-20 ${campoClasse}`} />
            <input value={novaDensidade} onChange={(e) => setNovaDensidade(e.target.value)} placeholder="Densidade" className={`w-20 ${campoClasse}`} />
            <input value={novaSobrevivencia} onChange={(e) => setNovaSobrevivencia(e.target.value)} placeholder="Sobrev. %" className={`w-20 ${campoClasse}`} />
            <Button variant="primary" onClick={adicionar}>
              + Adicionar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
