import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { apenasNomeCidade, cidadesDasTransportadoras, normalizarCidade } from '../calculations';
import type { Transportadora } from '../types';
import { AutocompleteInput, type OpcaoAutocomplete } from './AutocompleteInput';

interface RotaCidadesBuilderProps {
  cidadeInicio: string;
  cidades: string[];
  onChangeCidades: (cidades: string[]) => void;
  transportadoras: Transportadora[];
  cidadesCache: string[];
  /** Clicar numa cidade (em qualquer situação) abre o modal de NFs/etiquetas dela, via onAbrirCidade. */
  resumoPorCidade?: (cidade: string) => { notas: number; volumes: number } | null;
  onAbrirCidade?: (cidade: string) => void;
  /** Botão "Imprimir Etiquetas" (todas as cidades de uma vez), ao lado da busca — só aparece se houver ao menos uma etiqueta informada. */
  onImprimirTodas?: () => void;
  temNotasParaImprimir?: boolean;
}

const campoClasse = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';

/**
 * Cidade(s) de destino da Cotação de Frete — autocomplete (cidade + UF) +
 * reordenar/remover, sempre a mesma UI. Com 1 cidade só, quem usa trata como
 * cotação por transportadora (Cidade única); a partir da 2ª cidade adicionada
 * vira Rota de Frota Própria — some transportadora, some por km (calculado
 * por quem usa este componente). Peso, valor e cálculo ficam com quem usa
 * (mesma coluna 2 de Direta/Orçamento).
 */
export function RotaCidadesBuilder({
  cidadeInicio,
  cidades,
  onChangeCidades,
  transportadoras,
  cidadesCache,
  resumoPorCidade,
  onAbrirCidade,
  onImprimirTodas,
  temNotasParaImprimir,
}: RotaCidadesBuilderProps) {
  const [buscaCidade, setBuscaCidade] = useState('');
  const ehRota = cidades.length > 1;

  // Sugestões de autocomplete: cidades das transportadoras (com UF) + cidades já usadas em rotas anteriores (cacheadas na primeira vez que foram calculadas).
  // O cache guarda "Cidade, UF" (texto completo salvo em `cidades`) — compara só a PARTE do nome
  // contra as transportadoras (que não têm vírgula), senão "Iguatu" (transportadora) e "Iguatu, CE"
  // (cache) passam como cidades diferentes e a sugestão aparece duplicada.
  const opcoesCidades = useMemo<OpcaoAutocomplete[]>(() => {
    const dasTransportadoras = cidadesDasTransportadoras(transportadoras);
    const jaIncluidas = new Set(dasTransportadoras.map((o) => normalizarCidade(o.valor)));
    const doCache = cidadesCache.filter((c) => !jaIncluidas.has(normalizarCidade(apenasNomeCidade(c)))).map((c) => ({ valor: c }));
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
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-[var(--color-text-soft)]">{ehRota ? 'Adicionar cidade à rota' : 'Cidade de destino'}</label>
          {temNotasParaImprimir && onImprimirTodas && (
            <Button variant="outline" onClick={onImprimirTodas}>
              🏷️ Imprimir Etiquetas
            </Button>
          )}
        </div>
        <div className="max-w-md">
          <AutocompleteInput
            value={buscaCidade}
            onChangeTexto={setBuscaCidade}
            opcoes={opcoesCidades}
            onSelecionar={adicionarCidade}
            className={campoClasse}
          />
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-soft)]">
          {cidades.length === 0
            ? 'Escolha uma sugestão (clique ou Enter) ou digite "Cidade, UF" e dê Enter.'
            : 'Adicione mais uma cidade e a cotação vira Rota de Frota Própria automaticamente.'}
        </p>
      </div>

      {cidades.length > 0 && (
        <div className="space-y-1.5">
          {ehRota && (
            <p className="text-xs font-semibold text-[var(--color-text-soft)]">
              Rota: {cidadeInicio || 'Base'} → {cidades.join(' → ')} → {cidadeInicio || 'Base'}
            </p>
          )}
          {cidades.map((cidade, i) => {
            const resumo = resumoPorCidade?.(cidade) ?? null;
            return (
              <div
                key={`${cidade}_${i}`}
                onClick={() => onAbrirCidade?.(cidade)}
                title="Clique pra informar NF(s) e imprimir etiquetas dessa cidade"
                className="flex cursor-pointer items-center gap-2 rounded-md bg-[var(--color-page)] px-2.5 py-1.5 text-sm hover:bg-[var(--color-line)]/40"
              >
                <span className="w-5 shrink-0 text-xs text-[var(--color-text-soft)]">{i + 1}.</span>
                <span className="flex-1 truncate text-[var(--color-text)]">{cidade}</span>
                {resumo && (
                  <span className="shrink-0 rounded-full bg-[var(--color-accent)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--color-accent)]">
                    {resumo.notas} NF · {resumo.volumes} vol.
                  </span>
                )}
                {ehRota && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        moverCidade(i, -1);
                      }}
                      disabled={i === 0}
                      title="Mover pra cima"
                      className="text-[var(--color-text-soft)] hover:text-[var(--color-text)] disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        moverCidade(i, 1);
                      }}
                      disabled={i === cidades.length - 1}
                      title="Mover pra baixo"
                      className="text-[var(--color-text-soft)] hover:text-[var(--color-text)] disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removerCidade(i);
                  }}
                  title="Remover"
                  className="text-[var(--color-text-soft)] hover:text-bad"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
