import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cidadesDasTransportadoras, normalizarCidade } from '../calculations';
import type { Transportadora } from '../types';
import { AutocompleteInput, type OpcaoAutocomplete } from './AutocompleteInput';

interface RotaCidadesBuilderProps {
  cidadeInicio: string;
  cidades: string[];
  onChangeCidades: (cidades: string[]) => void;
  transportadoras: Transportadora[];
  cidadesCache: string[];
}

const campoClasse = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';

/** Monta a lista de cidades da Rota de Frota Própria — autocomplete (cidade + UF) + reordenar/remover. Peso, valor e cálculo ficam com quem usa (mesma coluna 2 de Direta/Orçamento). */
export function RotaCidadesBuilder({ cidadeInicio, cidades, onChangeCidades, transportadoras, cidadesCache }: RotaCidadesBuilderProps) {
  const [buscaCidade, setBuscaCidade] = useState('');

  // Sugestões de autocomplete: cidades das transportadoras (com UF) + cidades já usadas em rotas anteriores (cacheadas na primeira vez que foram calculadas).
  const opcoesCidades = useMemo<OpcaoAutocomplete[]>(() => {
    const dasTransportadoras = cidadesDasTransportadoras(transportadoras);
    const jaIncluidas = new Set(dasTransportadoras.map((o) => normalizarCidade(o.valor)));
    const doCache = cidadesCache.filter((c) => !jaIncluidas.has(normalizarCidade(c))).map((c) => ({ valor: c }));
    return [...dasTransportadoras, ...doCache].sort((a, b) => a.valor.localeCompare(b.valor, 'pt-BR'));
  }, [transportadoras, cidadesCache]);

  function adicionarCidade(nomeSelecionado: string) {
    // Se veio de uma sugestão (cidade das transportadoras), a UF só aparecia como dica visual no dropdown —
    // aqui grudamos ela no texto de verdade, senão perde a desambiguação (duas "Sobral" em estados diferentes).
    const opcao = opcoesCidades.find((o) => o.valor === nomeSelecionado);
    const completo = opcao?.meta ? `${opcao.valor}, ${opcao.meta}` : nomeSelecionado;
    const limpo = completo.trim();
    if (!limpo) return;
    onChangeCidades([...cidades, limpo]);
    setBuscaCidade('');
  }

  function moverCidade(indice: number, direcao: -1 | 1) {
    const alvo = indice + direcao;
    if (alvo < 0 || alvo >= cidades.length) return;
    const copia = [...cidades];
    [copia[indice], copia[alvo]] = [copia[alvo], copia[indice]];
    onChangeCidades(copia);
  }

  function removerCidade(indice: number) {
    onChangeCidades(cidades.filter((_, i) => i !== indice));
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Adicionar cidade à rota</label>
        <div className="flex flex-wrap items-start gap-2">
          <div className="max-w-md flex-1">
            <AutocompleteInput
              value={buscaCidade}
              onChangeTexto={setBuscaCidade}
              opcoes={opcoesCidades}
              onSelecionar={adicionarCidade}
              placeholder='Ex.: "Sobral, CE"'
              className={campoClasse}
            />
          </div>
          <Button variant="outline" onClick={() => adicionarCidade(buscaCidade)} disabled={!buscaCidade.trim()}>
            + Adicionar
          </Button>
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-soft)]">Escolha uma sugestão ou digite "Cidade, UF" e clique em Adicionar — uma cidade de cada vez.</p>
      </div>

      {cidades.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-[var(--color-text-soft)]">
            Rota: {cidadeInicio || 'Base'} → {cidades.join(' → ')} → {cidadeInicio || 'Base'}
          </p>
          {cidades.map((cidade, i) => (
            <div key={`${cidade}_${i}`} className="flex items-center gap-2 rounded-md bg-[var(--color-page)] px-2.5 py-1.5 text-sm">
              <span className="w-5 shrink-0 text-xs text-[var(--color-text-soft)]">{i + 1}.</span>
              <span className="flex-1 truncate text-[var(--color-text)]">{cidade}</span>
              <button type="button" onClick={() => moverCidade(i, -1)} disabled={i === 0} title="Mover pra cima" className="text-[var(--color-text-soft)] hover:text-[var(--color-text)] disabled:opacity-30">
                ▲
              </button>
              <button
                type="button"
                onClick={() => moverCidade(i, 1)}
                disabled={i === cidades.length - 1}
                title="Mover pra baixo"
                className="text-[var(--color-text-soft)] hover:text-[var(--color-text)] disabled:opacity-30"
              >
                ▼
              </button>
              <button type="button" onClick={() => removerCidade(i)} title="Remover" className="text-[var(--color-text-soft)] hover:text-bad">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
