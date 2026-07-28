import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { apagarGrupoConciliacao, contarConciliadosDoGrupo } from '@/features/conciliacao/api';
import { fmtDataBR } from '@/lib/format';
import { apagarGrupoUploads, listarUploadsRecentes } from '../api';
import { NOME_RELATORIO } from '../fields';
import { toISODate } from '../parsing';
import { agruparUploads, calcularAvisosAtraso, chaveGrupo, type AvisoAtraso, type ResumoGrupo } from '../periodos';
import type { TipoRelatorioLog } from '../types';

const STATUS_COR: Record<'sucesso' | 'aviso' | 'erro', string> = {
  sucesso: '#0ca30c',
  aviso: '#c98a1e',
  erro: '#d03b3b',
};

// Vendas (396) primeiro, depois entregas (124), e por último a Conciliação
// Bancária (Sistema/OFX). Cada tipo sempre aparece, mesmo sem nenhum upload
// — vira uma linha "vazia" só com o nome, pra ficar claro o que ainda falta
// importar. O 333 (CMV) foi descontinuado — não entra mais nessa lista,
// nem como linha vazia (não tem mais como importar esse relatório).
const ORDEM_TIPOS: TipoRelatorioLog[] = ['396', '124', 'sistema', 'ofx'];

// Sistema e OFX têm sub-grupos conhecidos de antemão (ao contrário do 396,
// cujas Tabelas de Preço só existem depois do primeiro upload) — por isso
// sempre reservam 1 linha por sub-grupo, mesmo vazia, em vez de 1 linha
// genérica pro tipo inteiro.
const SUBGRUPOS_PADRAO: Partial<Record<TipoRelatorioLog, string[]>> = {
  sistema: ['Entrada', 'Saída'],
  ofx: ['Banco do Brasil', 'Stone'],
};

interface LinhaVazia {
  vazia: true;
  tipoRelatorio: TipoRelatorioLog;
  /** Nome do sub-grupo reservado (ex.: "Stone") — undefined usa o nome genérico do tipo. */
  rotulo?: string;
}

function montarLinhas(grupos: ResumoGrupo[]): (ResumoGrupo | LinhaVazia)[] {
  const linhas: (ResumoGrupo | LinhaVazia)[] = [];
  for (const tipo of ORDEM_TIPOS) {
    const doTipo = grupos.filter((g) => g.tipoRelatorio === tipo);
    const subgruposPadrao = SUBGRUPOS_PADRAO[tipo];

    if (subgruposPadrao) {
      for (const nome of subgruposPadrao) {
        const real = doTipo.find((g) => g.tabelaPreco === nome);
        linhas.push(real ?? { vazia: true, tipoRelatorio: tipo, rotulo: nome });
      }
      const extras = doTipo.filter((g) => !subgruposPadrao.includes(g.tabelaPreco ?? '')).sort((a, b) => (a.tabelaPreco ?? '').localeCompare(b.tabelaPreco ?? ''));
      linhas.push(...extras);
      continue;
    }

    const ordenados = [...doTipo].sort((a, b) => (a.tabelaPreco ?? '').localeCompare(b.tabelaPreco ?? ''));
    if (ordenados.length === 0) linhas.push({ vazia: true, tipoRelatorio: tipo });
    else linhas.push(...ordenados);
  }
  return linhas;
}

function ehVazia(linha: ResumoGrupo | LinhaVazia): linha is LinhaVazia {
  return 'vazia' in linha;
}

const TIPOS_CONCILIACAO: TipoRelatorioLog[] = ['sistema', 'ofx'];

function ehConciliacao(linha: ResumoGrupo | LinhaVazia): boolean {
  return TIPOS_CONCILIACAO.includes(linha.tipoRelatorio);
}

function rotuloGrupo(grupo: ResumoGrupo): string {
  return grupo.tabelaPreco ?? NOME_RELATORIO[grupo.tipoRelatorio];
}

function corGrupo(grupo: ResumoGrupo): string {
  if (grupo.temErro) return STATUS_COR.erro;
  if (grupo.totalLinhas === 0) return STATUS_COR.aviso;
  return STATUS_COR.sucesso;
}

interface LinhaItemProps {
  linha: ResumoGrupo | LinhaVazia;
  aviso: AvisoAtraso | undefined;
  onApagar: (grupo: ResumoGrupo) => void;
}

function LinhaItem({ linha, aviso, onApagar }: LinhaItemProps) {
  if (ehVazia(linha)) {
    return (
      <li className="flex items-center gap-2 opacity-40">
        <span className="text-[var(--color-text-soft)]">○</span>
        <span className="text-[var(--color-text-soft)]">{linha.rotulo ?? NOME_RELATORIO[linha.tipoRelatorio]} — nada importado ainda</span>
      </li>
    );
  }

  const grupo = linha;
  return (
    <li className="flex items-start justify-between gap-2">
      <span className="flex items-start gap-2">
        <span style={{ color: corGrupo(grupo) }}>●</span>
        <span className="text-[var(--color-text-soft)]">
          <strong className="text-[var(--color-text)]">{rotuloGrupo(grupo)}</strong> — Relatório {grupo.tipoRelatorio}, {grupo.totalLinhas} linha(s) importada(s)
          {grupo.temDados &&
            (grupo.janela
              ? ` — Período fechado: ${fmtDataBR(toISODate(grupo.janela.inicio))} a ${fmtDataBR(toISODate(grupo.janela.fim))}`
              : ' — aguardando fechamento de mês')}
          {aviso && (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-[#8A5B10]">
              <span>⚠️</span>
              {isNaN(aviso.diasAtraso) ? (
                <span>
                  Ainda não fechou nenhum mês — <strong>{rotuloGrupo(aviso.referencia)}</strong> já fechou até {fmtDataBR(toISODate(aviso.faltaFim))}.
                </span>
              ) : (
                <span>
                  {aviso.diasAtraso} dia(s) atrás de <strong>{rotuloGrupo(aviso.referencia)}</strong> — faltam dados de{' '}
                  {fmtDataBR(toISODate(aviso.faltaInicio!))} a {fmtDataBR(toISODate(aviso.faltaFim))}.
                </span>
              )}
            </span>
          )}
        </span>
      </span>
      <button
        type="button"
        onClick={() => onApagar(grupo)}
        title="Apagar todos os arquivos deste relatório/tabela e os dados que geraram"
        className="shrink-0 text-[var(--color-text-soft)] hover:text-bad"
      >
        ✕
      </button>
    </li>
  );
}

interface ListaLinhasProps {
  titulo: string;
  linhas: (ResumoGrupo | LinhaVazia)[];
  avisos: Map<string, AvisoAtraso>;
  onApagar: (grupo: ResumoGrupo) => void;
}

function ListaLinhas({ titulo, linhas, avisos, onApagar }: ListaLinhasProps) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">{titulo}</h3>
      <ul className="space-y-1.5 text-sm">
        {linhas.map((linha) => (
          <LinhaItem
            key={ehVazia(linha) ? `${linha.tipoRelatorio}-${linha.rotulo ?? ''}` : chaveGrupo(linha)}
            linha={linha}
            aviso={ehVazia(linha) ? undefined : avisos.get(chaveGrupo(linha))}
            onApagar={onApagar}
          />
        ))}
      </ul>
    </Card>
  );
}

export function UploadLog() {
  const queryClient = useQueryClient();
  const [paraApagar, setParaApagar] = useState<ResumoGrupo | null>(null);

  const { data: uploads = [] } = useQuery({
    queryKey: ['uploads_log'],
    queryFn: () => listarUploadsRecentes(),
  });

  // Apagar um grupo (Banco ou Sistema) não desfaz a conciliação do OUTRO
  // lado — o lançamento que ficou lá continua marcado "conciliado", agora
  // órfão (sem contraparte). Avisa isso ANTES de confirmar a exclusão.
  const ehGrupoConciliacao = paraApagar ? TIPOS_CONCILIACAO.includes(paraApagar.tipoRelatorio) : false;
  const { data: conciliadosNoGrupo } = useQuery({
    queryKey: ['conciliacao', 'conciliados-do-grupo', paraApagar?.tipoRelatorio, paraApagar?.tabelaPreco],
    queryFn: () => contarConciliadosDoGrupo(paraApagar!.tipoRelatorio as 'ofx' | 'sistema', paraApagar!.tabelaPreco!),
    enabled: ehGrupoConciliacao && !!paraApagar?.tabelaPreco,
  });

  const grupos = agruparUploads(uploads);
  // Cada categoria compara atraso só entre si — não faz sentido comparar a
  // data de fechamento de uma Tabela de Preço (396) com a de um sub-grupo
  // da Conciliação Bancária (Entrada/Saída/banco), são coisas diferentes.
  const gruposRelatorios = grupos.filter((g) => !TIPOS_CONCILIACAO.includes(g.tipoRelatorio));
  const gruposConciliacao = grupos.filter((g) => TIPOS_CONCILIACAO.includes(g.tipoRelatorio));
  const avisos = new Map([...calcularAvisosAtraso(gruposRelatorios), ...calcularAvisosAtraso(gruposConciliacao)]);
  const linhas = montarLinhas(grupos);
  const linhasRelatorios = linhas.filter((l) => !ehConciliacao(l));
  const linhasConciliacao = linhas.filter(ehConciliacao);

  const { mutate: confirmarExclusao, isPending: apagando } = useMutation({
    mutationFn: async (grupo: ResumoGrupo) => {
      // Sistema/OFX não guardam os lançamentos em uploads_log — precisa
      // apagar também o lado da Conciliação (arquivo + lançamentos em
      // cascata), pelo mesmo sub-grupo mostrado na linha.
      if ((grupo.tipoRelatorio === 'ofx' || grupo.tipoRelatorio === 'sistema') && grupo.tabelaPreco) {
        await apagarGrupoConciliacao(grupo.tipoRelatorio, grupo.tabelaPreco);
      }
      await apagarGrupoUploads(grupo.ids);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uploads_log'] });
      queryClient.invalidateQueries({ queryKey: ['bi'] });
      queryClient.invalidateQueries({ queryKey: ['conciliacao'] });
      setParaApagar(null);
    },
  });

  return (
    <div className="space-y-4">
      <ListaLinhas titulo="Arquivos processados recentemente" linhas={linhasRelatorios} avisos={avisos} onApagar={setParaApagar} />
      <ListaLinhas titulo="Conciliação Bancária" linhas={linhasConciliacao} avisos={avisos} onApagar={setParaApagar} />

      <Modal
        open={paraApagar !== null}
        title="Apagar arquivos importados"
        onClose={() => setParaApagar(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setParaApagar(null)} disabled={apagando}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => paraApagar && confirmarExclusao(paraApagar)} disabled={apagando}>
              {apagando ? 'Apagando...' : 'Apagar definitivamente'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-text)]">
          Isso vai apagar <strong>todos os {paraApagar?.ids.length} arquivo(s)</strong> já importados de{' '}
          <strong>{paraApagar && rotuloGrupo(paraApagar)}</strong> e todas as linhas que eles gravaram nas tabelas do Supabase. Não tem como desfazer.
        </p>
        {!!conciliadosNoGrupo && conciliadosNoGrupo > 0 && (
          <p className="mt-3 rounded-md border border-[#e0a300]/40 bg-[#fff6de] p-2.5 text-sm font-semibold text-[#8a6d1f]">
            ⚠ Existem <strong>{conciliadosNoGrupo} lançamento(s)</strong> desse grupo já conciliado(s). Apagar aqui não desfaz a conciliação do outro
            lado (Banco/Sistema) — ele vai ficar marcado como conciliado sem contraparte nenhuma.
          </p>
        )}
      </Modal>
    </div>
  );
}
