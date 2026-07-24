import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { ArquivoLaudo } from '../types';
import { montarUrlVisualizacao } from '../visualizacaoArquivo';

interface ListaArquivosProps {
  arquivos: ArquivoLaudo[];
  busca: string;
  onChangeBusca: (busca: string) => void;
  onApagar: (arquivos: ArquivoLaudo[]) => void;
  onVisualizar: (arquivo: ArquivoLaudo) => void;
  onEditar: (arquivo: ArquivoLaudo) => void;
}

function formatarTamanho(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function paraNumero(texto: string | null): number | null {
  if (!texto) return null;
  const numero = Number(texto.replace('%', '').replace(',', '.').trim());
  return Number.isFinite(numero) ? numero : null;
}

/** Valor Cultural = (Pureza × Germinação) / 100 — só calcula quando os dois vieram do laudo. */
function calcularVC(pureza: string | null, germinacao: string | null): string {
  const p = paraNumero(pureza);
  const g = paraNumero(germinacao);
  if (p === null || g === null) return '—';
  return `${Math.round((p * g) / 100)}%`;
}

// Word/Excel/PowerPoint abrem via Google Docs Viewer (com a toolbar completa
// dele, que tem botão de imprimir) — abrir a URL crua desses formatos faz o
// navegador simplesmente baixar o arquivo em vez de mostrar algo pra imprimir.
function imprimir(arquivo: ArquivoLaudo) {
  window.open(montarUrlVisualizacao(arquivo, 'aba'), '_blank');
}

function enviarWhatsapp(arquivo: ArquivoLaudo) {
  const mensagem = `Laudo — ${arquivo.nomeProduto}${arquivo.lote ? ` (Lote ${arquivo.lote})` : ''}${arquivo.anoSafra ? ` — Safra ${arquivo.anoSafra}` : ''}: ${arquivo.arquivoUrl}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(mensagem)}`, '_blank');
}

export function ListaArquivos({ arquivos, busca, onChangeBusca, onApagar, onVisualizar, onEditar }: ListaArquivosProps) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const termo = busca.trim().toLowerCase();
  const filtrados = termo ? arquivos.filter((a) => a.nomeProduto.toLowerCase().includes(termo)) : arquivos;

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
          placeholder="Digite o nome do produto para filtrar Lote/Ano disponíveis…"
          className="w-full max-w-md rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
        />
        {arquivosSelecionados.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-text-soft)]">{arquivosSelecionados.length} selecionado{arquivosSelecionados.length === 1 ? '' : 's'}</span>
            <Button variant="danger" onClick={() => onApagar(arquivosSelecionados)}>
              🗑 Excluir
            </Button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-line)] bg-[var(--color-page)] text-left text-[var(--color-text-soft)]">
              <th className="w-10 px-4 py-1.5">
                <input type="checkbox" checked={todosSelecionados} onChange={toggleTodos} className="accent-[var(--color-navy)]" title="Selecionar todos" />
              </th>
              <th className="px-4 py-1.5 font-medium">Produto</th>
              <th className="px-4 py-1.5 font-medium">Lote</th>
              <th className="px-4 py-1.5 font-medium">Ano Safra</th>
              <th className="px-4 py-1.5 font-medium">Pureza</th>
              <th className="px-4 py-1.5 font-medium">Germinação</th>
              <th className="px-4 py-1.5 font-medium" title="Calculado: (Pureza × Germinação) / 100">VC%</th>
              <th className="px-4 py-1.5 font-medium">Validade</th>
              <th className="px-4 py-1.5 font-medium">Arquivo</th>
              <th className="px-4 py-1.5 text-right font-medium">Tamanho</th>
              <th className="px-4 py-1.5 font-medium">Enviado em</th>
              <th className="px-4 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((a) => (
              <tr key={a.id} className={`border-b border-[var(--color-line)] last:border-b-0 ${selecionados.has(a.id) ? 'bg-[var(--color-highlight-row)]' : ''}`}>
                <td className="px-4 py-1">
                  <input type="checkbox" checked={selecionados.has(a.id)} onChange={() => toggleSelecionado(a.id)} className="accent-[var(--color-navy)]" />
                </td>
                <td className="whitespace-nowrap px-4 py-1 font-semibold text-[var(--color-text)]">{a.nomeProduto}</td>
                <td className="px-4 py-1 text-[var(--color-text-soft)]">{a.lote || '—'}</td>
                <td className="px-4 py-1 text-[var(--color-text-soft)]">{a.anoSafra || '—'}</td>
                <td className="px-4 py-1 text-[var(--color-text-soft)]">{a.pureza || '—'}</td>
                <td className="px-4 py-1 text-[var(--color-text-soft)]">{a.germinacao || '—'}</td>
                <td className="px-4 py-1 text-[var(--color-text-soft)]">{calcularVC(a.pureza, a.germinacao)}</td>
                <td className="px-4 py-1 text-[var(--color-text-soft)]">{a.validade || '—'}</td>
                <td className="max-w-[220px] truncate px-4 py-1 text-[var(--color-text-soft)]" title={a.arquivoNome}>
                  {a.arquivoNome}
                </td>
                <td className="num px-4 py-1 text-right text-[var(--color-text-soft)]">{formatarTamanho(a.tamanhoBytes)}</td>
                <td className="px-4 py-1 text-[var(--color-text-soft)]">{formatarData(a.enviadoEm)}</td>
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
                  <button type="button" onClick={() => enviarWhatsapp(a)} title="Enviar via WhatsApp" className="mr-2 text-[var(--color-text-soft)] hover:text-good">
                    💬
                  </button>
                  <button type="button" onClick={() => onApagar([a])} title="Excluir" className="text-[var(--color-text-soft)] hover:text-bad">
                    🗑
                  </button>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-6 text-center text-[var(--color-text-soft)]">
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
