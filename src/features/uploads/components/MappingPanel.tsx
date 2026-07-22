import { useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CAMPOS_POR_RELATORIO, NOME_RELATORIO } from '../fields';
import { contarColunas, encontrarLinhaCabecalho, rotularColuna } from '../parsing';
import type { GrupoLinhas, MapeamentoColunas, TipoRelatorio } from '../types';

/** Datas lidas do Excel vêm como objeto Date de verdade — sem isso, a prévia mostrava o .toString() inteiro (com fuso, hora etc.). */
function formatarValorPrevia(valor: unknown): string {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return valor.toLocaleDateString('pt-BR');
  }
  return String(valor);
}

interface MappingPanelProps {
  tipo: TipoRelatorio;
  grupos: GrupoLinhas[];
  mapeamento: MapeamentoColunas;
  onChangeMapeamento: (mapeamento: MapeamentoColunas) => void;
  onRemoverArquivo: (label: string) => void;
  onConfirmar: () => void;
  processando: boolean;
}

export function MappingPanel({
  tipo,
  grupos,
  mapeamento,
  onChangeMapeamento,
  onRemoverArquivo,
  onConfirmar,
  processando,
}: MappingPanelProps) {
  const campos = CAMPOS_POR_RELATORIO[tipo];
  const grupoReferencia = grupos[0];
  const totalColunas = useMemo(() => contarColunas(grupoReferencia?.rows ?? []), [grupoReferencia]);

  // Acha a linha real de cabeçalho (onde ficam "Vlr.S.Desc.", "Data" etc.)
  // pra não confundir com o letreiro do relatório (nome da empresa,
  // endereço, telefone) que costuma vir antes dela no arquivo. O rótulo da
  // coluna usa o texto DESSA linha; a prévia usa a primeira linha DEPOIS
  // dela (um valor de dado de verdade, não o próprio texto do cabeçalho).
  const { linhaCabecalho, linhaDados } = useMemo(() => {
    const regexes = campos.map((c) => c.palpiteCabecalho).filter((r): r is RegExp => Boolean(r));
    const encontrada = encontrarLinhaCabecalho(grupoReferencia?.rows ?? [], regexes);
    return { linhaCabecalho: Math.max(encontrada, 0), linhaDados: encontrada >= 0 ? encontrada + 1 : 0 };
  }, [grupoReferencia, campos]);

  const opcoesColuna = useMemo(
    () => Array.from({ length: totalColunas }, (_, i) => ({ indice: i, rotulo: rotularColuna(grupoReferencia?.rows ?? [], i, linhaCabecalho) })),
    [grupoReferencia, totalColunas, linhaCabecalho],
  );

  // Uma ÚNICA linha de referência pra prévia de todos os campos — antes,
  // cada campo procurava a primeira linha não vazia na SUA própria coluna,
  // e podia acabar pegando linhas diferentes umas das outras (números que
  // pareciam não bater). Aqui, a linha escolhida é a primeira, depois do
  // cabeçalho, em que todos os campos obrigatórios já mapeados vêm
  // preenchidos — a mesma ideia de "isso aqui já parece uma linha de dado
  // de verdade" que o próprio import usa.
  const linhaPrevia = useMemo(() => {
    if (!grupoReferencia) return -1;
    const indicesObrigatorios = campos.filter((c) => c.obrigatorio).map((c) => mapeamento[c.chave]).filter((i): i is number => i != null);
    if (indicesObrigatorios.length === 0) return linhaDados;
    const linha = grupoReferencia.rows
      .slice(linhaDados)
      .findIndex((row) => indicesObrigatorios.every((i) => String(row[i] ?? '').trim() !== ''));
    return linha === -1 ? linhaDados : linhaDados + linha;
  }, [grupoReferencia, campos, mapeamento, linhaDados]);

  const faltandoObrigatorio = campos.some((campo) => campo.obrigatorio && mapeamento[campo.chave] == null);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">{NOME_RELATORIO[tipo]}</h3>
          <p className="text-xs text-[var(--color-text-soft)]">
            Associe cada campo do ERP à coluna correspondente da planilha. Só os dados mapeados aqui são enviados ao Supabase.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {grupos.map((g) => (
            <span
              key={g.label}
              className="flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-page)] px-2.5 py-1 text-xs text-[var(--color-text-soft)]"
            >
              {g.label}
              <button
                type="button"
                onClick={() => onRemoverArquivo(g.label)}
                title="Remover deste envio"
                className="text-[var(--color-text-soft)] hover:text-bad"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] bg-[var(--color-page)] text-left text-[var(--color-text-soft)]">
              <th className="px-3 py-2 font-medium">Campo do ERP</th>
              <th className="px-3 py-2 font-medium">Coluna da planilha</th>
              <th className="px-3 py-2 font-medium">Prévia</th>
            </tr>
          </thead>
          <tbody>
            {campos.map((campo) => {
              const idx = mapeamento[campo.chave];
              const valorBruto = idx != null && grupoReferencia ? grupoReferencia.rows[linhaPrevia]?.[idx] : undefined;
              const previa = valorBruto === undefined || valorBruto === '' ? '—' : formatarValorPrevia(valorBruto);
              return (
                <tr key={campo.chave} className="border-b border-[var(--color-line)] last:border-b-0">
                  <td className="px-3 py-2 text-[var(--color-text)]">
                    {campo.rotulo}
                    {campo.obrigatorio && <span className="ml-1 text-bad">*</span>}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={idx ?? ''}
                      onChange={(e) =>
                        onChangeMapeamento({
                          ...mapeamento,
                          [campo.chave]: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className="min-w-[220px] rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
                    >
                      <option value="">— Não mapear —</option>
                      {opcoesColuna.map((op) => (
                        <option key={op.indice} value={op.indice}>
                          {op.rotulo}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num px-3 py-2 text-[var(--color-text-soft)]">{previa}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        {faltandoObrigatorio && (
          <p className="text-xs text-bad">Mapeie todos os campos obrigatórios (*) antes de enviar.</p>
        )}
        <div className="ml-auto">
          <Button variant="primary" disabled={faltandoObrigatorio || processando} onClick={onConfirmar}>
            {processando ? 'Enviando...' : `Confirmar e enviar (${grupos.length} arquivo${grupos.length > 1 ? 's' : ''})`}
          </Button>
        </div>
      </div>
    </Card>
  );
}
