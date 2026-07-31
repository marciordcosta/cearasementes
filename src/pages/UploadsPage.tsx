import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { atualizarLancamentoSistemaConciliado, detectarConflitosConciliados, detectarConflitosConciliadosSistema } from '@/features/conciliacao/api';
import type { ConflitoRegistroBanco, ConflitoRegistroSistema } from '@/features/conciliacao/api';
import { ehArquivoConciliacaoSistema, importarArquivoSistema, importarGrupoBanco, parseArquivoSistema, parseGrupoBanco } from '@/features/conciliacao/importar';
import type { TipoBanco } from '@/features/conciliacao/importar';
import { ehExtratoBB, ehRecebiveisStone } from '@/features/conciliacao/parsing';
import { fmtDataBR } from '@/lib/format';
import { garantirCanaisPreco } from '@/features/pricing/api';
import { apagarUploadsAnteriores, carregarMapeamentoSalvo, inserirEntregas124, registrarLogUpload, salvarMapeamento } from '@/features/uploads/api';
import { Dropzone } from '@/features/uploads/components/Dropzone';
import { MappingPanel } from '@/features/uploads/components/MappingPanel';
import { UploadLog } from '@/features/uploads/components/UploadLog';
import { CAMPOS_POR_RELATORIO } from '@/features/uploads/fields';
import { detectarPeriodoFiltroCabecalho, detectarTipoRelatorio, encontrarColunaPorCabecalho, extractRowGroups, toISODate } from '@/features/uploads/parsing';
import { construirRegistros124 } from '@/features/uploads/recordBuilder';
import type { GrupoClassificado, GrupoLinhas, MapeamentoColunas, TipoRelatorioMapeado } from '@/features/uploads/types';
import { importarVendas396 } from '@/features/vendas396/api';
import { parseVendas396 } from '@/features/vendas396/parsing';
import { mensagemDeErro } from '@/lib/errors';

/** Um conflito unificado (Banco ou Sistema) pra exibir na lista de confirmação — ver detectarConflitosConciliados/detectarConflitosConciliadosSistema em api.ts. */
interface ConflitoExibicao {
  chaveDecisao: string;
  origem: 'banco' | 'sistema';
  label: string;
  antigo: { data: string | null; valor: number };
  novo: { data: string | null; valor: number };
  /** Só sistema: precisa do id da linha antiga e do registro novo completo pra aplicar o UPDATE explícito se a decisão for "atualizar" (ver comentário em detectarConflitosConciliadosSistema — o upsert normal não serve aqui). */
  sistemaAntigoId?: string;
  sistemaNovo?: ConflitoRegistroSistema['novo'];
  /** Só banco: fitid, usado só se a decisão for "manter" (excluído do upsert; "atualizar" não precisa de nada especial, o upsert por fitid já sobrescreve sozinho). */
  bancoFitid?: string;
}

type DecisaoConflito = 'atualizar' | 'manter';

async function inicializarMapeamento(tipo: TipoRelatorioMapeado, grupoReferencia: GrupoLinhas): Promise<MapeamentoColunas> {
  const salvo = await carregarMapeamentoSalvo(tipo);
  if (salvo) return salvo;

  const mapeamento: MapeamentoColunas = {};
  for (const campo of CAMPOS_POR_RELATORIO[tipo]) {
    const idx = campo.palpiteCabecalho ? encontrarColunaPorCabecalho(grupoReferencia.rows, campo.palpiteCabecalho) : -1;
    mapeamento[campo.chave] = idx >= 0 ? idx : null;
  }
  return mapeamento;
}

export function UploadsPage() {
  const queryClient = useQueryClient();
  const [classificados, setClassificados] = useState<GrupoClassificado[]>([]);
  const [mapeamentos, setMapeamentos] = useState<Partial<Record<TipoRelatorioMapeado, MapeamentoColunas>>>({});
  const [processandoTipo, setProcessandoTipo] = useState<TipoRelatorioMapeado | null>(null);
  const [processandoConciliacao, setProcessandoConciliacao] = useState(false);
  const [erroConciliacao, setErroConciliacao] = useState<string | null>(null);
  const [sucessoConciliacao, setSucessoConciliacao] = useState<string | null>(null);
  const [processandoVendas396, setProcessandoVendas396] = useState(false);
  const [erroVendas396, setErroVendas396] = useState<string | null>(null);
  const [sucessoVendas396, setSucessoVendas396] = useState<string | null>(null);
  // Conflito = mesmo registro (fitid/chave_dedup) já CONCILIADO, mas com
  // valor/data diferentes no arquivo novo — fica pendente até o usuário
  // escolher, registro por registro, "Atualizar" ou "Manter" antes de gravar
  // qualquer coisa (ver detectarConflitosConciliados/...Sistema em api.ts).
  const [pendenteConciliacao, setPendenteConciliacao] = useState<{
    arquivosSistema: File[];
    gruposBanco: { grupo: GrupoLinhas; tipoBanco: TipoBanco }[];
    conflitos: ConflitoExibicao[];
  } | null>(null);
  const [decisoesConflito, setDecisoesConflito] = useState<Map<string, DecisaoConflito>>(new Map());
  const emInicializacao = useRef(new Set<TipoRelatorioMapeado>());

  const gruposPorTipo = useMemo(() => {
    const mapa = new Map<TipoRelatorioMapeado, GrupoLinhas[]>();
    classificados.forEach((c) => {
      if (c.tipo !== '124') return;
      const atual = mapa.get(c.tipo) ?? [];
      atual.push(c.grupo);
      mapa.set(c.tipo, atual);
    });
    return mapa;
  }, [classificados]);

  const naoReconhecidos = classificados.filter((c) => !c.tipo);

  /**
   * Vendas (Relatório 396, formato matricial novo) tem parser dedicado —
   * não passa pela tela de mapeamento de coluna, vai direto pro Supabase
   * igual à Conciliação Bancária (Banco/Sistema).
   */
  async function importarVendas396DosGrupos(grupos: GrupoLinhas[]) {
    setProcessandoVendas396(true);
    setErroVendas396(null);
    setSucessoVendas396(null);
    try {
      for (const grupo of grupos) {
        const { tabelaPreco, periodoCabecalho, vendas, ignoradas } = parseVendas396(grupo);
        const criadas = vendas.length > 0 ? await garantirCanaisPreco([tabelaPreco]) : 0;

        const logId = await registrarLogUpload({
          arquivoNome: grupo.label,
          tipoRelatorio: '396',
          linhasImportadas: vendas.length,
          tabelaPreco,
          dataMin: periodoCabecalho ? toISODate(periodoCabecalho.inicio) : null,
          dataMax: periodoCabecalho ? toISODate(periodoCabecalho.fim) : null,
          status: vendas.length > 0 ? 'sucesso' : 'aviso',
          mensagem:
            vendas.length === 0
              ? 'Nenhuma venda reconhecida nesse arquivo.'
              : [
                  ignoradas > 0 ? `${ignoradas} linha(s) de formatação ignorada(s) (cabeçalho repetido a cada página impressa).` : null,
                  criadas > 0 ? `${criadas} Tabela(s) de Preço criada(s) automaticamente na Precificação.` : null,
                ]
                  .filter(Boolean)
                  .join(' ') || undefined,
        });

        await importarVendas396(logId, tabelaPreco, grupo.label, vendas);
      }
      queryClient.invalidateQueries({ queryKey: ['uploads_log'] });
      queryClient.invalidateQueries({ queryKey: ['pricing'] });
      setSucessoVendas396(`${grupos.length} arquivo(s) de Vendas (396) importado(s) com sucesso.`);
    } catch (e) {
      const mensagem = mensagemDeErro(e, 'Falha ao importar Vendas (Relatório 396).');
      setErroVendas396(mensagem);
      for (const g of grupos) {
        await registrarLogUpload({ arquivoNome: g.label, tipoRelatorio: '396', linhasImportadas: 0, status: 'erro', mensagem });
      }
      queryClient.invalidateQueries({ queryKey: ['uploads_log'] });
    } finally {
      setProcessandoVendas396(false);
    }
  }

/** Junta os dois lados (Banco e Sistema) — cada um com seu próprio mecanismo de detecção — numa lista só, pra mostrar antes de gravar qualquer coisa. */
  async function detectarTodosConflitos(arquivosSistema: File[], gruposBanco: { grupo: GrupoLinhas; tipoBanco: TipoBanco }[]): Promise<ConflitoExibicao[]> {
    const conflitos: ConflitoExibicao[] = [];

    const registrosBanco = gruposBanco.flatMap(({ grupo, tipoBanco }) => parseGrupoBanco(grupo, tipoBanco));
    if (registrosBanco.length > 0) {
      const conflitosBanco = await detectarConflitosConciliados(registrosBanco);
      conflitos.push(
        ...conflitosBanco.map(
          (c: ConflitoRegistroBanco): ConflitoExibicao => ({
            chaveDecisao: `banco|${c.fitid}`,
            origem: 'banco',
            label: c.novo.descricao || c.fitid,
            antigo: { data: c.antigo.data, valor: c.antigo.valor },
            novo: { data: c.novo.data, valor: c.novo.valor },
            bancoFitid: c.fitid,
          }),
        ),
      );
    }

    for (const file of arquivosSistema) {
      const { registros } = await parseArquivoSistema(file);
      const conflitosSistema = await detectarConflitosConciliadosSistema(registros);
      conflitos.push(
        ...conflitosSistema.map(
          (c: ConflitoRegistroSistema): ConflitoExibicao => ({
            chaveDecisao: `sistema|${c.chave}`,
            origem: 'sistema',
            label: c.novo.cliente || c.novo.documento || c.chave,
            antigo: { data: c.antigo.data, valor: c.antigo.valor },
            novo: { data: c.novo.data, valor: c.novo.valor },
            sistemaAntigoId: c.antigoId,
            sistemaNovo: c.novo,
          }),
        ),
      );
    }

    return conflitos;
  }

  /**
   * Grava de fato — chamado direto (sem conflito nenhum) ou pelo botão
   * "Confirmar e importar" do modal (com `decisoes` escolhidas registro a
   * registro). No Sistema, "atualizar" precisa de um UPDATE explícito (o
   * upsert normal criaria uma linha nova, já que valor/data mudados não
   * batem mais na chave de conflito) — no Banco não precisa de nada
   * especial, o upsert por fitid sozinho já sobrescreve.
   */
  async function executarGravacaoConciliacao(
    arquivosSistema: File[],
    gruposBanco: { grupo: GrupoLinhas; tipoBanco: TipoBanco }[],
    conflitos: ConflitoExibicao[],
    decisoes: Map<string, DecisaoConflito>,
  ) {
    setProcessandoConciliacao(true);
    setErroConciliacao(null);
    setSucessoConciliacao(null);
    try {
      const fitidsManterBanco = new Set<string>();
      const chavesExcluirSistema = new Set<string>();
      for (const c of conflitos) {
        const decisao = decisoes.get(c.chaveDecisao) ?? 'manter';
        if (c.origem === 'banco' && c.bancoFitid) {
          if (decisao === 'manter') fitidsManterBanco.add(c.bancoFitid);
        } else if (c.origem === 'sistema' && c.sistemaAntigoId && c.sistemaNovo) {
          const chave = c.chaveDecisao.slice('sistema|'.length);
          chavesExcluirSistema.add(chave);
          if (decisao === 'atualizar') await atualizarLancamentoSistemaConciliado(c.sistemaAntigoId, c.sistemaNovo);
        }
      }

      for (const file of arquivosSistema) await importarArquivoSistema(file, chavesExcluirSistema);
      for (const { grupo, tipoBanco } of gruposBanco) await importarGrupoBanco(grupo, tipoBanco, fitidsManterBanco);

      queryClient.invalidateQueries({ queryKey: ['conciliacao'] });
      queryClient.invalidateQueries({ queryKey: ['uploads_log'] });
      const total = arquivosSistema.length + gruposBanco.length;
      setSucessoConciliacao(`${total} arquivo(s) de Conciliação (Banco/Sistema) importado(s) com sucesso.`);
    } catch (e) {
      setErroConciliacao(mensagemDeErro(e, 'Falha ao importar Conciliação Bancária.'));
    } finally {
      setProcessandoConciliacao(false);
      setPendenteConciliacao(null);
      setDecisoesConflito(new Map());
    }
  }

  /**
   * O lado Sistema (HTML) ainda é reconhecido pela extensão do arquivo, mas o
   * lado Banco (extrato BB / recebíveis Stone) agora vem em .xlsx/.csv — os
   * mesmos formatos dos relatórios 124/396 — então precisa ler o CONTEÚDO de
   * cada aba/arquivo pra decidir se é Banco, 396 (import direto) ou 124
   * (vai pra tela de mapeamento).
   */
  async function handleFiles(files: File[]) {
    const arquivosSistema = files.filter((f) => ehArquivoConciliacaoSistema(f.name));
    const arquivosRestantes = files.filter((f) => !ehArquivoConciliacaoSistema(f.name));

    const gruposPorArquivo = await Promise.all(arquivosRestantes.map((f) => extractRowGroups(f)));
    const todosGrupos = gruposPorArquivo.flat();

    const gruposBanco: { grupo: GrupoLinhas; tipoBanco: TipoBanco }[] = [];
    const gruposRelatorio: GrupoLinhas[] = [];
    for (const grupo of todosGrupos) {
      if (ehExtratoBB(grupo.rows)) gruposBanco.push({ grupo, tipoBanco: 'bb' });
      else if (ehRecebiveisStone(grupo.rows)) gruposBanco.push({ grupo, tipoBanco: 'stone' });
      else gruposRelatorio.push(grupo);
    }

    if (arquivosSistema.length > 0 || gruposBanco.length > 0) {
      setProcessandoConciliacao(true);
      setErroConciliacao(null);
      setSucessoConciliacao(null);
      try {
        const conflitos = await detectarTodosConflitos(arquivosSistema, gruposBanco);
        if (conflitos.length > 0) {
          // Nada é gravado ainda — fica esperando o usuário decidir cada
          // registro em conflito no modal (padrão "manter" = mais seguro).
          setPendenteConciliacao({ arquivosSistema, gruposBanco, conflitos });
          setDecisoesConflito(new Map(conflitos.map((c) => [c.chaveDecisao, 'manter' as DecisaoConflito])));
          setProcessandoConciliacao(false);
        } else {
          await executarGravacaoConciliacao(arquivosSistema, gruposBanco, [], new Map());
        }
      } catch (e) {
        setErroConciliacao(mensagemDeErro(e, 'Falha ao importar Conciliação Bancária.'));
        setProcessandoConciliacao(false);
      }
    }

    if (gruposRelatorio.length === 0) return;

    const novos: GrupoClassificado[] = gruposRelatorio.map((grupo) => ({ grupo, tipo: detectarTipoRelatorio(grupo.rows) }));
    const gruposVendas396 = novos.filter((c) => c.tipo === '396').map((c) => c.grupo);
    const outros = novos.filter((c) => c.tipo !== '396');

    setClassificados((prev) => [...prev, ...outros]);

    if (gruposVendas396.length > 0) await importarVendas396DosGrupos(gruposVendas396);

    for (const item of outros) {
      if (item.tipo !== '124') continue;
      const tipo = item.tipo;
      if (mapeamentos[tipo] || emInicializacao.current.has(tipo)) continue;
      emInicializacao.current.add(tipo);
      const mapeamento = await inicializarMapeamento(tipo, item.grupo);
      setMapeamentos((prev) => (prev[tipo] ? prev : { ...prev, [tipo]: mapeamento }));
      emInicializacao.current.delete(tipo);
    }
  }

  function removerArquivo(tipo: TipoRelatorioMapeado, label: string) {
    setClassificados((prev) => prev.filter((c) => !(c.tipo === tipo && c.grupo.label === label)));
  }

  async function executarImportacao(tipo: TipoRelatorioMapeado) {
    const grupos = gruposPorTipo.get(tipo) ?? [];
    const mapeamento = mapeamentos[tipo];
    if (!mapeamento || grupos.length === 0) return;

    setProcessandoTipo(tipo);
    try {
      // Sem nº de documento pra deduplicar — cada nova IMPORTAÇÃO (a sessão
      // inteira, não cada grupo dela) substitui a anterior por completo em
      // vez de acumular. Precisa rodar só uma vez ANTES do loop — dentro dele,
      // a 2ª+ aba/arquivo apagaria os dados que a 1ª acabou de gravar.
      await apagarUploadsAnteriores('124');

      for (const grupo of grupos) {
        const { registros, ignoradas } = construirRegistros124(grupo, mapeamento);
        const periodo = detectarPeriodoFiltroCabecalho(grupo.rows);

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
      setProcessandoTipo(null);
    }
  }

  return (
    <AppShell topbarNavy title="Uploads de Relatórios">
      <div className="space-y-6">
        <Dropzone onFiles={handleFiles} desabilitado={processandoConciliacao || processandoVendas396 || processandoTipo !== null} />

        {processandoConciliacao && (
          <Card className="flex items-center justify-center gap-2 border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 p-3 text-sm font-semibold text-[var(--color-accent)]">
            Importando Conciliação Bancária (Banco/Sistema), aguarde…
          </Card>
        )}

        {sucessoConciliacao && (
          <Card className="flex items-center justify-between gap-3 border-good/40 bg-good-soft p-3 text-sm font-semibold text-good">
            <span>{sucessoConciliacao}</span>
            <button type="button" onClick={() => setSucessoConciliacao(null)} className="font-semibold hover:underline">
              Fechar
            </button>
          </Card>
        )}

        {erroConciliacao && (
          <Card className="flex items-center justify-between gap-3 border-bad/40 bg-bad-soft p-3 text-sm text-[#8F2E2E]">
            <span>{erroConciliacao}</span>
            <button type="button" onClick={() => setErroConciliacao(null)} className="font-semibold hover:underline">
              Fechar
            </button>
          </Card>
        )}

        {processandoVendas396 && (
          <Card className="flex items-center justify-center gap-2 border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 p-3 text-sm font-semibold text-[var(--color-accent)]">
            Importando Vendas (Relatório 396), aguarde…
          </Card>
        )}

        {sucessoVendas396 && (
          <Card className="flex items-center justify-between gap-3 border-good/40 bg-good-soft p-3 text-sm font-semibold text-good">
            <span>{sucessoVendas396}</span>
            <button type="button" onClick={() => setSucessoVendas396(null)} className="font-semibold hover:underline">
              Fechar
            </button>
          </Card>
        )}

        {erroVendas396 && (
          <Card className="flex items-center justify-between gap-3 border-bad/40 bg-bad-soft p-3 text-sm text-[#8F2E2E]">
            <span>{erroVendas396}</span>
            <button type="button" onClick={() => setErroVendas396(null)} className="font-semibold hover:underline">
              Fechar
            </button>
          </Card>
        )}

        {naoReconhecidos.length > 0 && (
          <Card className="border-warn/40 bg-warn-soft p-4">
            <p className="text-sm font-semibold text-[#8A5B10]">Arquivos/abas não reconhecidos</p>
            <ul className="mt-1.5 space-y-1 text-sm text-[#8A5B10]">
              {naoReconhecidos.map((c) => (
                <li key={c.grupo.label}>{c.grupo.label} — cabeçalho não corresponde ao Relatório 124 nem 396.</li>
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
              onConfirmar={() => executarImportacao(tipo)}
              processando={processandoTipo === tipo}
            />
          );
        })}

        <UploadLog />
      </div>

      <Modal
        open={pendenteConciliacao !== null}
        title="Registros já conciliados com dado diferente no arquivo novo"
        onClose={() => {
          setPendenteConciliacao(null);
          setDecisoesConflito(new Map());
        }}
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setPendenteConciliacao(null);
                setDecisoesConflito(new Map());
              }}
              className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
            >
              Cancelar (não importa nada deste lote)
            </button>
            <button
              type="button"
              disabled={processandoConciliacao}
              onClick={() =>
                pendenteConciliacao &&
                executarGravacaoConciliacao(pendenteConciliacao.arquivosSistema, pendenteConciliacao.gruposBanco, pendenteConciliacao.conflitos, decisoesConflito)
              }
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processandoConciliacao ? 'Importando…' : 'Confirmar e importar'}
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-[var(--color-text-soft)]">
          {pendenteConciliacao?.conflitos.length} registro(s) já conciliado(s) mudaram de valor e/ou data no arquivo novo. Escolha, pra cada um: <strong>Atualizar</strong>{' '}
          (usa o dado novo) ou <strong>Manter</strong> (ignora o dado novo, preserva o que já está gravado).
        </p>
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto text-sm">
          {pendenteConciliacao?.conflitos.map((c) => {
            const decisao = decisoesConflito.get(c.chaveDecisao) ?? 'manter';
            return (
              <li key={c.chaveDecisao} className="rounded-md border border-[var(--color-line)] p-2.5">
                <div className="font-semibold text-[var(--color-text)]">
                  {c.origem === 'banco' ? 'Banco' : 'Sistema'} — {c.label}
                </div>
                <div className="mt-0.5 text-xs text-[var(--color-text-soft)]">
                  Antigo: {c.antigo.data ? fmtDataBR(c.antigo.data) : '—'} · R$ {c.antigo.valor.toFixed(2)} &nbsp;→&nbsp; Novo:{' '}
                  {c.novo.data ? fmtDataBR(c.novo.data) : '—'} · R$ {c.novo.valor.toFixed(2)}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDecisoesConflito((prev) => new Map(prev).set(c.chaveDecisao, 'atualizar'))}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                      decisao === 'atualizar' ? 'bg-[var(--color-accent)] text-white' : 'border border-[var(--color-line)] text-[var(--color-text-soft)]'
                    }`}
                  >
                    Atualizar
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecisoesConflito((prev) => new Map(prev).set(c.chaveDecisao, 'manter'))}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                      decisao === 'manter' ? 'bg-[var(--color-accent)] text-white' : 'border border-[var(--color-line)] text-[var(--color-text-soft)]'
                    }`}
                  >
                    Manter
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Modal>
    </AppShell>
  );
}
