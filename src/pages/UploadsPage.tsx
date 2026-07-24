import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { ehArquivoConciliacao, importarArquivoConciliacao } from '@/features/conciliacao/importar';
import { garantirCanaisPreco, sincronizarProdutosCusto } from '@/features/pricing/api';
import {
  apagarUploadsAnteriores,
  carregarMapeamentoSalvo,
  inserirEntregas124,
  inserirVendas396,
  listarPeriodosGrupo,
  obterExtensaoVendas,
  registrarLogUpload,
  salvarMapeamento,
} from '@/features/uploads/api';
import { Dropzone } from '@/features/uploads/components/Dropzone';
import { MappingPanel } from '@/features/uploads/components/MappingPanel';
import { UploadLog } from '@/features/uploads/components/UploadLog';
import { CAMPOS_POR_RELATORIO } from '@/features/uploads/fields';
import { classificarArquivos, detectarNomeTabelaPreco, detectarPeriodoFiltroCabecalho, encontrarColunaPorCabecalho, toISODate } from '@/features/uploads/parsing';
import { janelaFechada, seSobrepoe, type Intervalo } from '@/features/uploads/periodos';
import { construirRegistros124, construirRegistros333, construirRegistros396 } from '@/features/uploads/recordBuilder';
import type { GrupoClassificado, GrupoLinhas, MapeamentoColunas, TipoRelatorio } from '@/features/uploads/types';
import { mensagemDeErro } from '@/lib/errors';
import { fmtDataBR } from '@/lib/format';
import type { Database } from '@/types/database';

type VendaInsert = Database['public']['Tables']['vendas_tabela_preco']['Insert'];

/** Menor/maior data entre os registros que têm a data preenchida. */
function extrairIntervaloBruto<T>(registros: T[], pegarData: (r: T) => string | null): Intervalo | null {
  const datas = registros.map(pegarData).filter((d): d is string => d !== null);
  if (datas.length === 0) return null;
  const ordenadas = [...datas].sort();
  return { inicio: new Date(`${ordenadas[0]}T00:00:00`), fim: new Date(`${ordenadas[ordenadas.length - 1]}T00:00:00`) };
}

interface ResultadoFiltro396 {
  periodoCabecalho: Intervalo | null;
  janela: Intervalo | null;
  registrosFiltrados: VendaInsert[];
  rejeitadas: number;
  sobrepoe: boolean;
}

/**
 * O 396 é o único relatório com nº de documento (upsert já evita duplicar
 * linha) — por isso é o único que ainda fecha mês. A data mostrada/gravada
 * (`periodoCabecalho`) vem sempre do cabeçalho do relatório: puxar da data
 * dos registros dava falso atraso quando a tabela simplesmente não tem
 * venda no fim do período (dado zerado, não desatualizado). Só quando o
 * cabeçalho do upload novo repete (se sobrepõe a) o de um upload anterior
 * da MESMA tabela é que faz sentido olhar as datas dos registros — aí sim
 * consulta o que já está gravado no banco (não o cabeçalho, que não avança
 * sozinho) pra saber até onde os dados reais vão, fecha o mês e filtra.
 */
async function prepararFiltro396(tabelaPreco: string, headerRows: unknown[][], registros: VendaInsert[], forcarTudo: boolean): Promise<ResultadoFiltro396> {
  const periodoCabecalho = detectarPeriodoFiltroCabecalho(headerRows);
  const anteriores = await listarPeriodosGrupo('396', tabelaPreco);
  const sobrepoe = periodoCabecalho !== null && anteriores.some((a) => seSobrepoe(a, periodoCabecalho));

  if (!sobrepoe || forcarTudo) {
    return { periodoCabecalho, janela: null, registrosFiltrados: registros, rejeitadas: 0, sobrepoe };
  }

  const intervaloLinhas = extrairIntervaloBruto(registros, (r) => r.data_venda);
  if (!intervaloLinhas) {
    return { periodoCabecalho, janela: null, registrosFiltrados: registros, rejeitadas: 0, sobrepoe };
  }

  const extensaoAtual = await obterExtensaoVendas(tabelaPreco);
  const combinado = extensaoAtual
    ? {
        inicio: extensaoAtual.inicio.getTime() < intervaloLinhas.inicio.getTime() ? extensaoAtual.inicio : intervaloLinhas.inicio,
        fim: extensaoAtual.fim.getTime() > intervaloLinhas.fim.getTime() ? extensaoAtual.fim : intervaloLinhas.fim,
      }
    : intervaloLinhas;

  const janela = janelaFechada(combinado.inicio, combinado.fim);
  const inicioISO = janela ? toISODate(janela.inicio) : null;
  const fimISO = janela ? toISODate(janela.fim) : null;
  const registrosFiltrados = registros.filter((r) => !r.data_venda || (inicioISO !== null && fimISO !== null && r.data_venda >= inicioISO && r.data_venda <= fimISO));
  return { periodoCabecalho, janela, registrosFiltrados, rejeitadas: registros.length - registrosFiltrados.length, sobrepoe };
}

async function inicializarMapeamento(tipo: TipoRelatorio, grupoReferencia: GrupoLinhas): Promise<MapeamentoColunas> {
  const salvo = await carregarMapeamentoSalvo(tipo);
  if (salvo) return salvo;

  const mapeamento: MapeamentoColunas = {};
  for (const campo of CAMPOS_POR_RELATORIO[tipo]) {
    const idx = campo.palpiteCabecalho ? encontrarColunaPorCabecalho(grupoReferencia.rows, campo.palpiteCabecalho) : -1;
    mapeamento[campo.chave] = idx >= 0 ? idx : null;
  }

  // Relatório 333: a célula do cabeçalho "Produto:" fica mesclada uma
  // coluna à direita de onde o nome do produto realmente começa em cada
  // linha de dado (mesclagem inconsistente no relatório original — o
  // "Código" mescla A:B mas a linha de dado só usa a coluna A, "empurrando"
  // o produto pra coluna logo depois do código). Corrige o palpite usando
  // essa relação fixa em vez do texto do cabeçalho, que aponta errado.
  if (tipo === '333' && mapeamento.codigo != null) {
    mapeamento.nome = mapeamento.codigo + 1;
  }

  return mapeamento;
}

interface ItemPendencia {
  rotulo: string;
  rejeitadas: number;
  janela: Intervalo | null;
}

interface PendenciaConfirmacao {
  tipo: TipoRelatorio;
  totalRejeitadas: number;
  itens: ItemPendencia[];
}

export function UploadsPage() {
  const queryClient = useQueryClient();
  const [classificados, setClassificados] = useState<GrupoClassificado[]>([]);
  const [mapeamentos, setMapeamentos] = useState<Partial<Record<TipoRelatorio, MapeamentoColunas>>>({});
  const [processandoTipo, setProcessandoTipo] = useState<TipoRelatorio | null>(null);
  const [pendencia, setPendencia] = useState<PendenciaConfirmacao | null>(null);
  const [processandoConciliacao, setProcessandoConciliacao] = useState(false);
  const [erroConciliacao, setErroConciliacao] = useState<string | null>(null);
  const emInicializacao = useRef(new Set<TipoRelatorio>());

  const gruposPorTipo = useMemo(() => {
    const mapa = new Map<TipoRelatorio, GrupoLinhas[]>();
    classificados.forEach((c) => {
      if (!c.tipo) return;
      const atual = mapa.get(c.tipo) ?? [];
      atual.push(c.grupo);
      mapa.set(c.tipo, atual);
    });
    return mapa;
  }, [classificados]);

  const naoReconhecidos = classificados.filter((c) => !c.tipo);

  /** Arquivos de Conciliação (OFX/HTML) não passam pelo mapeamento de coluna — vão direto pro import, o resto segue o fluxo normal (124/396/333). */
  async function handleFiles(files: File[]) {
    const arquivosConciliacao = files.filter((f) => ehArquivoConciliacao(f.name) !== null);
    const arquivosRelatorio = files.filter((f) => ehArquivoConciliacao(f.name) === null);

    if (arquivosConciliacao.length > 0) {
      setProcessandoConciliacao(true);
      setErroConciliacao(null);
      try {
        for (const file of arquivosConciliacao) {
          const tipo = ehArquivoConciliacao(file.name);
          if (tipo) await importarArquivoConciliacao(file, tipo);
        }
        queryClient.invalidateQueries({ queryKey: ['conciliacao'] });
        queryClient.invalidateQueries({ queryKey: ['uploads_log'] });
      } catch (e) {
        setErroConciliacao(mensagemDeErro(e, 'Falha ao importar OFX/Sistema.'));
      } finally {
        setProcessandoConciliacao(false);
      }
    }

    if (arquivosRelatorio.length === 0) return;

    const novos = await classificarArquivos(arquivosRelatorio);
    setClassificados((prev) => [...prev, ...novos]);

    for (const item of novos) {
      if (!item.tipo) continue;
      const tipo = item.tipo;
      if (mapeamentos[tipo] || emInicializacao.current.has(tipo)) continue;
      emInicializacao.current.add(tipo);
      const mapeamento = await inicializarMapeamento(tipo, item.grupo);
      setMapeamentos((prev) => (prev[tipo] ? prev : { ...prev, [tipo]: mapeamento }));
      emInicializacao.current.delete(tipo);
    }
  }

  function removerArquivo(tipo: TipoRelatorio, label: string) {
    setClassificados((prev) => prev.filter((c) => !(c.tipo === tipo && c.grupo.label === label)));
  }

  /** Só o 396 pode ter algo a rejeitar — 124/333 substituem o upload anterior sem filtro nenhum. */
  async function iniciarConfirmacao(tipo: TipoRelatorio) {
    const grupos = gruposPorTipo.get(tipo) ?? [];
    const mapeamento = mapeamentos[tipo];
    if (!mapeamento || grupos.length === 0) return;

    if (tipo !== '396') {
      await executarImportacao(tipo, 'fechado');
      return;
    }

    let totalRejeitadas = 0;
    const itens: ItemPendencia[] = [];
    for (const grupo of grupos) {
      const tabelaPreco = detectarNomeTabelaPreco(grupo.rows);
      const { registros } = construirRegistros396(grupo, mapeamento);
      const r = await prepararFiltro396(tabelaPreco, grupo.rows, registros, false);
      totalRejeitadas += r.rejeitadas;
      if (r.rejeitadas > 0) itens.push({ rotulo: `${grupo.label} (${tabelaPreco})`, rejeitadas: r.rejeitadas, janela: r.janela });
    }

    if (totalRejeitadas === 0) {
      await executarImportacao(tipo, 'fechado');
      return;
    }
    setPendencia({ tipo, totalRejeitadas, itens });
  }

  async function executarImportacao(tipo: TipoRelatorio, modoPeriodo: 'fechado' | 'quebrado') {
    const grupos = gruposPorTipo.get(tipo) ?? [];
    const mapeamento = mapeamentos[tipo];
    if (!mapeamento || grupos.length === 0) return;

    setPendencia(null);
    setProcessandoTipo(tipo);
    try {
      for (const grupo of grupos) {
        if (tipo === '124') {
          const { registros, ignoradas } = construirRegistros124(grupo, mapeamento);
          const periodo = detectarPeriodoFiltroCabecalho(grupo.rows);

          // Sem nº de documento pra deduplicar — cada novo upload substitui
          // o anterior por completo em vez de acumular.
          await apagarUploadsAnteriores('124');

          const logId = await registrarLogUpload({
            arquivoNome: grupo.label,
            tipoRelatorio: '124',
            linhasImportadas: registros.length,
            dataMin: periodo ? toISODate(periodo.inicio) : null,
            dataMax: periodo ? toISODate(periodo.fim) : null,
            status: registros.length > 0 ? 'sucesso' : 'aviso',
            mensagem:
              registros.length === 0
                ? 'Nenhuma linha válida encontrada com o mapeamento atual.'
                : ignoradas > 0
                  ? `${ignoradas} linha(s) ignorada(s) (cabeçalho, rodapé ou valor inválido).`
                  : undefined,
          });
          await inserirEntregas124(registros.map((r) => ({ ...r, upload_log_id: logId })));
        } else if (tipo === '333') {
          const { registros, ignoradas } = construirRegistros333(grupo, mapeamento);
          const periodo = detectarPeriodoFiltroCabecalho(grupo.rows);

          // Não guarda linha a linha: sincroniza direto no cadastro de
          // produtos da Precificação (código + nome + custo), sem duplicar
          // quem já existe.
          const { criados, atualizados } = await sincronizarProdutosCusto(registros);

          // Sem nº de documento pra deduplicar — cada novo upload substitui
          // o anterior por completo em vez de acumular.
          await apagarUploadsAnteriores('333');

          await registrarLogUpload({
            arquivoNome: grupo.label,
            tipoRelatorio: '333',
            linhasImportadas: registros.length,
            dataMin: periodo ? toISODate(periodo.inicio) : null,
            dataMax: periodo ? toISODate(periodo.fim) : null,
            status: registros.length > 0 ? 'sucesso' : 'aviso',
            mensagem:
              registros.length === 0
                ? 'Nenhuma linha de produto reconhecida com o mapeamento atual.'
                : [
                    ignoradas > 0 ? `${ignoradas} linha(s) ignorada(s) (cabeçalho, rodapé ou totais).` : null,
                    `${criados} produto(s) novo(s) cadastrado(s)`,
                    `${atualizados} custo(s) atualizado(s)`,
                  ]
                    .filter(Boolean)
                    .join(', '),
          });
        } else {
          const { registros, ignoradas } = construirRegistros396(grupo, mapeamento);
          const tabelaPreco = detectarNomeTabelaPreco(grupo.rows);

          // Cria automaticamente, na Precificação, qualquer Tabela de Preço
          // que apareça neste arquivo e ainda não exista (parâmetros zerados
          // — o usuário ajusta depois em Parametrização de Custos).
          const criadas = registros.length > 0 ? await garantirCanaisPreco([tabelaPreco]) : 0;

          const { periodoCabecalho, janela, registrosFiltrados, rejeitadas, sobrepoe } = await prepararFiltro396(
            tabelaPreco,
            grupo.rows,
            registros,
            modoPeriodo === 'quebrado',
          );

          const logId = await registrarLogUpload({
            arquivoNome: grupo.label,
            tipoRelatorio: '396',
            linhasImportadas: registrosFiltrados.length,
            tabelaPreco,
            dataMin: periodoCabecalho ? toISODate(periodoCabecalho.inicio) : null,
            dataMax: periodoCabecalho ? toISODate(periodoCabecalho.fim) : null,
            status: registrosFiltrados.length > 0 ? 'sucesso' : 'aviso',
            mensagem:
              registrosFiltrados.length === 0
                ? registros.length > 0 && sobrepoe && !janela
                  ? 'Nenhum mês fechado nesse período ainda — aguardando mais dados de outro upload.'
                  : 'Nenhuma linha de detalhe reconhecida com o mapeamento atual.'
                : [
                    ignoradas > 0 ? `${ignoradas} linha(s) ignorada(s) (rodapé ou valor inválido).` : null,
                    rejeitadas > 0 && janela
                      ? `${rejeitadas} linha(s) fora do período fechado (${fmtDataBR(toISODate(janela.inicio))} a ${fmtDataBR(toISODate(janela.fim))}) não importada(s).`
                      : null,
                    modoPeriodo === 'quebrado' && sobrepoe ? 'Importado com período em aberto, a pedido do usuário (sem fechar o mês).' : null,
                    criadas > 0 ? `${criadas} Tabela(s) de Preço criada(s) automaticamente na Precificação.` : null,
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined,
          });
          await inserirVendas396(registrosFiltrados.map((r) => ({ ...r, upload_log_id: logId })));
        }
      }

      await salvarMapeamento(tipo, mapeamento);
      setClassificados((prev) => prev.filter((c) => c.tipo !== tipo));
      setMapeamentos((prev) => {
        const copia = { ...prev };
        delete copia[tipo];
        return copia;
      });
    } catch (err) {
      const mensagem = mensagemDeErro(err, 'Falha ao enviar para o Supabase.');
      for (const g of grupos) {
        await registrarLogUpload({ arquivoNome: g.label, tipoRelatorio: tipo, linhasImportadas: 0, status: 'erro', mensagem });
      }
    } finally {
      queryClient.invalidateQueries({ queryKey: ['uploads_log'] });
      if (tipo === '396' || tipo === '333') queryClient.invalidateQueries({ queryKey: ['pricing'] });
      setProcessandoTipo(null);
    }
  }

  return (
    <AppShell topbarNavy title="Uploads de Relatórios">
      <div className="space-y-6">
        <Dropzone onFiles={handleFiles} />

        {processandoConciliacao && <p className="text-sm text-[var(--color-text-soft)]">Importando OFX/Sistema (Conciliação)…</p>}

        {erroConciliacao && (
          <Card className="flex items-center justify-between gap-3 border-bad/40 bg-bad-soft p-3 text-sm text-[#8F2E2E]">
            <span>{erroConciliacao}</span>
            <button type="button" onClick={() => setErroConciliacao(null)} className="font-semibold hover:underline">
              Fechar
            </button>
          </Card>
        )}

        {naoReconhecidos.length > 0 && (
          <Card className="border-warn/40 bg-warn-soft p-4">
            <p className="text-sm font-semibold text-[#8A5B10]">Arquivos/abas não reconhecidos</p>
            <ul className="mt-1.5 space-y-1 text-sm text-[#8A5B10]">
              {naoReconhecidos.map((c) => (
                <li key={c.grupo.label}>{c.grupo.label} — cabeçalho não corresponde ao Relatório 124, 396 nem 333.</li>
              ))}
            </ul>
          </Card>
        )}

        {Array.from(gruposPorTipo.entries()).map(([tipo, grupos]) => {
          const mapeamento = mapeamentos[tipo];
          if (!mapeamento) return null;
          return (
            <MappingPanel
              key={tipo}
              tipo={tipo}
              grupos={grupos}
              mapeamento={mapeamento}
              onChangeMapeamento={(novoMapeamento) => setMapeamentos((prev) => ({ ...prev, [tipo]: novoMapeamento }))}
              onRemoverArquivo={(label) => removerArquivo(tipo, label)}
              onConfirmar={() => iniciarConfirmacao(tipo)}
              processando={processandoTipo === tipo}
            />
          );
        })}

        <UploadLog />
      </div>

      <Modal
        open={pendencia !== null}
        title="Período em aberto detectado"
        onClose={() => setPendencia(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => pendencia && executarImportacao(pendencia.tipo, 'quebrado')} disabled={processandoTipo !== null}>
              Subir como está (período quebrado)
            </Button>
            <Button variant="primary" onClick={() => pendencia && executarImportacao(pendencia.tipo, 'fechado')} disabled={processandoTipo !== null}>
              Fechar o mês (recomendado)
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-[var(--color-text)]">
          <p>
            O cabeçalho desse upload repete o período de um upload anterior da mesma Tabela de Preço, e {pendencia?.totalRejeitadas} linha(s)
            caem fora de um mês fechado nos dados já importados. Você pode <strong>fechar o mês</strong> agora (essas linhas ficam de fora
            até um upload futuro completar o período) ou <strong>subir do jeito que está</strong>, incluindo os dias do mês em aberto.
          </p>
          <ul className="space-y-1 text-[var(--color-text-soft)]">
            {pendencia?.itens.map((item) => (
              <li key={item.rotulo}>
                <strong className="text-[var(--color-text)]">{item.rotulo}</strong>: {item.rejeitadas} linha(s) fora do fechado
                {item.janela ? ` (fecharia em ${fmtDataBR(toISODate(item.janela.inicio))} a ${fmtDataBR(toISODate(item.janela.fim))})` : ''}.
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </AppShell>
  );
}
