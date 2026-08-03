import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { filtrarArquivos } from '../filtrarArquivos';
import { calcularVC } from '../metricas';
import { resultadoTeste } from '../testeGerminacao';
import type { ArquivoLaudo } from '../types';
import { montarUrlVisualizacao } from '../visualizacaoArquivo';

interface ListaArquivosProps {
  arquivos: ArquivoLaudo[];
  busca: string;
  onChangeBusca: (busca: string) => void;
  onApagar: (arquivos: ArquivoLaudo[]) => void;
  onVisualizar: (arquivo: ArquivoLaudo) => void;
  /** Abre o modal completo de edição (nome, lote, safra, pureza, germinação, validade, PMS...) — ícone ✎, mesmo caminho pra todos os campos manuais. */
  onEditar: (arquivo: ArquivoLaudo) => void;
  /** Abre o modal do Teste de Germinação de Campo (clicando no valor da coluna "Último Teste", não num ícone). */
  onAbrirTeste: (arquivo: ArquivoLaudo) => void;
  /** Abre o Guia de Plantio já com esse laudo inserido na grade — só faz sentido com exatamente 1 selecionado. */
  onAbrirGuiaPlantio: (arquivo: ArquivoLaudo) => void;
  /** Abre o diálogo de impressão do Selo (etiqueta de lote) — ícone 🏷️. */
  onImprimirEtiqueta: (arquivo: ArquivoLaudo) => void;
}

/**
 * "Validade" é texto livre lido do laudo (ou digitado à mão) — vem em
 * formatos diferentes conforme o modelo do documento ("MM/AAAA" no boletim
 * de análise, "DD/MM/AAAA" quando tem dia certo). Converte pra uma chave
 * ISO comparável; sem isso, ordenar como string colocaria "07/2026" antes
 * de "12/2025" (compara caractere a caractere, "0" < "1"). Sem validade
 * nenhuma reconhecida, cai pro fim da lista (string vazia).
 */
function chaveOrdenacaoValidade(validade: string | null): string {
  if (!validade) return '';
  const texto = validade.trim();
  const mesAno = texto.match(/^(\d{1,2})\/(\d{4})$/);
  if (mesAno) return `${mesAno[2]}-${mesAno[1].padStart(2, '0')}-01`;
  const diaMesAno = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (diaMesAno) {
    const ano = diaMesAno[3].length === 2 ? `20${diaMesAno[3]}` : diaMesAno[3];
    return `${ano}-${diaMesAno[2].padStart(2, '0')}-${diaMesAno[1].padStart(2, '0')}`;
  }
  return texto;
}

// Word/Excel/PowerPoint abrem via Google Docs Viewer (com a toolbar completa
// dele, que tem botão de imprimir) — abrir a URL crua desses formatos faz o
// navegador simplesmente baixar o arquivo em vez de mostrar algo pra imprimir.
function imprimir(arquivo: ArquivoLaudo) {
  window.open(montarUrlVisualizacao(arquivo, 'aba'), '_blank');
}

export function ListaArquivos({ arquivos, busca, onChangeBusca, onApagar, onVisualizar, onEditar, onAbrirTeste, onAbrirGuiaPlantio, onImprimirEtiqueta }: ListaArquivosProps) {
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // As caixas de seleção ficam escondidas por padrão (só a maioria das vezes
  // ninguém precisa selecionar nada) — o botão "Selecionar" liga o modo; ao
  // desligar, some a coluna inteira e limpa qualquer seleção pendente.
  function alternarModoSelecao() {
    setModoSelecao((atual) => {
      if (atual) setSelecionados(new Set());
      return !atual;
    });
  }

  // Nome do produto (alfabética) primeiro; validade mais recente como
  // critério de desempate entre laudos do mesmo produto.
  const filtrados = [...filtrarArquivos(arquivos, busca)].sort((a, b) => {
    const porNome = a.nomeProduto.localeCompare(b.nomeProduto);
    return porNome !== 0 ? porNome : chaveOrdenacaoValidade(b.validade).localeCompare(chaveOrdenacaoValidade(a.validade));
  });

  const todosSelecionados = filtrados.length > 0 && filtrados.every((a) => selecionados.has(a.id));

  function toggleSelecionado(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function toggleTodos() {
    if (todosSelecionados) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(filtrados.map((a) => a.id)));
    }
  }

  const arquivosSelecionados = filtrados.filter((a) => selecionados.has(a.id));

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] p-4">
        <input
          value={busca}
          onChange={(e) => onChangeBusca(e.target.value)}
          placeholder="Buscar por nome do produto ou lote…"
          className="w-full max-w-md rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-[var(--color-text)]">
          <input type="checkbox" checked={modoSelecao} onChange={alternarModoSelecao} className="accent-[var(--color-navy)]" />
          Selecionar
        </label>
        {arquivosSelecionados.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-text-soft)]">{arquivosSelecionados.length} selecionado{arquivosSelecionados.length === 1 ? '' : 's'}</span>
            <Button variant="danger" onClick={() => onApagar(arquivosSelecionados)}>
              🗑 Excluir
            </Button>
            {arquivosSelecionados.length === 1 && (
              <Button variant="action" onClick={() => onAbrirGuiaPlantio(arquivosSelecionados[0])}>
                🌱 Guia de Plantio
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-line)] bg-[var(--color-page)] text-left text-[var(--color-text-soft)]">
              {modoSelecao && (
                <th className="w-10 px-4 py-1.5">
                  <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos} className="accent-[var(--color-navy)]" title="Selecionar todos" />
                </th>
              )}
              <th className="px-4 py-1.5 font-medium">Produto</th>
              <th className="px-4 py-1.5 font-medium">Lote</th>
              <th className="px-4 py-1.5 font-medium">Ano Safra</th>
              <th className="px-4 py-1.5 font-medium">Validade</th>
              <th className="px-4 py-1.5 font-medium" title="Pureza">Pur%</th>
              <th className="px-4 py-1.5 font-medium" title="Germinação">Germ%</th>
              <th className="px-4 py-1.5 font-medium" title="Calculado: (Pureza × Germinação) / 100">VC%</th>
              <th className="px-4 py-1.5 font-medium" title="Peso de Mil Sementes — só aparece quando editado manualmente (✎) pra esse lote; sem edição, o cálculo usa o PMS base da Parametrização por baixo, mas a coluna fica em branco">PMS</th>
              <th className="px-4 py-1.5 font-medium" title="Teste de Germinação de Campo — clique no valor pra ver/editar">Último Teste</th>
              <th className="px-4 py-1.5 font-medium">Data de Importação</th>
              <th className="px-4 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((a) => (
              <tr key={a.id} className={`border-b border-[var(--color-line)] last:border-b-0 ${selecionados.has(a.id) ? 'bg-[var(--color-highlight-row)]' : ''}`}>
                {modoSelecao && (
                  <td className="px-4 py-1">
                    <input type="checkbox" checked={selecionados.has(a.id)} onChange={() => toggleSelecionado(a.id)} className="accent-[var(--color-navy)]" />
                  </td>
                )}
                <td className="whitespace-nowrap px-4 py-1 font-semibold text-[var(--color-text)]">{a.nomeProduto}</td>
                <td className="px-4 py-1 text-[var(--color-text-soft)]">{a.lote || '—'}</td>
                <td className="px-4 py-1 text-[var(--color-text-soft)]">{a.anoSafra || '—'}</td>
                <td className="px-4 py-1 text-[var(--color-text-soft)]">{a.validade || '—'}</td>
                <td className="px-4 py-1 text-[var(--color-text-soft)]">{a.pureza || '—'}</td>
                <td className="px-4 py-1 text-[var(--color-text-soft)]">{a.germinacao || '—'}</td>
                <td className="px-4 py-1 text-[var(--color-text-soft)]">{calcularVC(a)}</td>
                <td className="whitespace-nowrap px-4 py-1 text-[var(--color-text-soft)]">{a.pms || '—'}</td>
                <td className="whitespace-nowrap px-4 py-1 text-[var(--color-text-soft)]">
                  <button type="button" onClick={() => onAbrirTeste(a)} className="font-semibold text-good underline decoration-dotted underline-offset-2 hover:brightness-90">
                    {resultadoTeste(a)}
                  </button>
                </td>
                <td className="whitespace-nowrap px-4 py-1 text-[var(--color-text-soft)]">{new Date(a.enviadoEm).toLocaleDateString('pt-BR')}</td>
                <td className="whitespace-nowrap px-4 py-1 text-right">
                  <button type="button" onClick={() => onVisualizar(a)} title="Visualizar" className="mr-2 text-[var(--color-text-soft)] hover:text-[var(--color-text)]">
                    👁
                  </button>
                  <button type="button" onClick={() => onEditar(a)} title="Editar" className="mr-2 text-[var(--color-text-soft)] hover:text-[var(--color-text)]">
                    ✎
                  </button>
                  <button type="button" onClick={() => imprimir(a)} title="Abrir / Imprimir" className="mr-2 text-[var(--color-text-soft)] hover:text-[var(--color-text)]">
                    🖨️
                  </button>
                  <button type="button" onClick={() => onImprimirEtiqueta(a)} title="Imprimir Selo" className="mr-2 text-[var(--color-text-soft)] hover:text-[var(--color-text)]">
                    🏷️
                  </button>
                  <button type="button" onClick={() => onApagar([a])} title="Excluir" className="text-[var(--color-text-soft)] hover:text-bad">
                    🗑
                  </button>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={modoSelecao ? 12 : 11} className="px-4 py-6 text-center text-[var(--color-text-soft)]">
                  Nenhum laudo encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
