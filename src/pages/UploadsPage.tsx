import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { ehArquivoConciliacaoSistema, importarArquivoSistema, importarGrupoBanco } from '@/features/conciliacao/importar';
import type { TipoBanco } from '@/features/conciliacao/importar';
import { ehExtratoBB, ehRecebiveisStone } from '@/features/conciliacao/parsing';
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
        for (const file of arquivosSistema) await importarArquivoSistema(file);
        for (const { grupo, tipoBanco } of gruposBanco) await importarGrupoBanco(grupo, tipoBanco);
        queryClient.invalidateQueries({ queryKey: ['conciliacao'] });
        queryClient.invalidateQueries({ queryKey: ['uploads_log'] });
        const total = arquivosSistema.length + gruposBanco.length;
        setSucessoConciliacao(`${total} arquivo(s) de Conciliação (Banco/Sistema) importado(s) com sucesso.`);
      } catch (e) {
        setErroConciliacao(mensagemDeErro(e, 'Falha ao importar Conciliação Bancária.'));
      } finally {
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
      for (const grupo of grupos) {
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
    </AppShell>
  );
}
