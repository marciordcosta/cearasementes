import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { garantirCanaisPreco, sincronizarProdutosCusto } from '@/features/pricing/api';
import { carregarMapeamentoSalvo, inserirEntregas124, inserirVendas396, registrarLogUpload, salvarMapeamento } from '@/features/uploads/api';
import { Dropzone } from '@/features/uploads/components/Dropzone';
import { MappingPanel } from '@/features/uploads/components/MappingPanel';
import { UploadLog } from '@/features/uploads/components/UploadLog';
import { CAMPOS_POR_RELATORIO } from '@/features/uploads/fields';
import { classificarArquivos, encontrarColunaPorCabecalho } from '@/features/uploads/parsing';
import { construirRegistros124, construirRegistros333, construirRegistros396 } from '@/features/uploads/recordBuilder';
import type { GrupoClassificado, GrupoLinhas, MapeamentoColunas, TipoRelatorio } from '@/features/uploads/types';

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

export function UploadsPage() {
  const queryClient = useQueryClient();
  const [classificados, setClassificados] = useState<GrupoClassificado[]>([]);
  const [mapeamentos, setMapeamentos] = useState<Partial<Record<TipoRelatorio, MapeamentoColunas>>>({});
  const [processandoTipo, setProcessandoTipo] = useState<TipoRelatorio | null>(null);
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

  async function handleFiles(files: File[]) {
    const novos = await classificarArquivos(files);
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

  async function confirmarTipo(tipo: TipoRelatorio) {
    const grupos = gruposPorTipo.get(tipo) ?? [];
    const mapeamento = mapeamentos[tipo];
    if (!mapeamento || grupos.length === 0) return;

    setProcessandoTipo(tipo);
    try {
      // Log primeiro (por arquivo) pra pegar o id, e só depois insere os
      // dados já marcados com esse upload_log_id — é o que permite apagar
      // "o arquivo" (log + dados) de um upload específico mais tarde, sem
      // afetar outro upload que tenha usado o mesmo nome de arquivo.
      for (const grupo of grupos) {
        if (tipo === '124') {
          const { registros, ignoradas } = construirRegistros124(grupo, mapeamento);
          const logId = await registrarLogUpload({
            arquivoNome: grupo.label,
            tipoRelatorio: '124',
            linhasImportadas: registros.length,
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

          // Não guarda linha a linha: sincroniza direto no cadastro de
          // produtos da Precificação (código + nome + custo), sem duplicar
          // quem já existe.
          const { criados, atualizados } = await sincronizarProdutosCusto(registros);

          await registrarLogUpload({
            arquivoNome: grupo.label,
            tipoRelatorio: '333',
            linhasImportadas: registros.length,
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

          // Cria automaticamente, na Precificação, qualquer Tabela de Preço
          // que apareça neste arquivo e ainda não exista (parâmetros zerados
          // — o usuário ajusta depois em Parametrização de Custos).
          const nomesTabelas = registros.map((r) => r.tabela_preco);
          const criadas = await garantirCanaisPreco(nomesTabelas);

          const logId = await registrarLogUpload({
            arquivoNome: grupo.label,
            tipoRelatorio: '396',
            linhasImportadas: registros.length,
            status: registros.length > 0 ? 'sucesso' : 'aviso',
            mensagem:
              registros.length === 0
                ? 'Nenhuma linha de detalhe reconhecida com o mapeamento atual.'
                : [
                    ignoradas > 0 ? `${ignoradas} linha(s) ignorada(s) (rodapé ou valor inválido).` : null,
                    criadas > 0 ? `${criadas} Tabela(s) de Preço criada(s) automaticamente na Precificação.` : null,
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined,
          });
          await inserirVendas396(registros.map((r) => ({ ...r, upload_log_id: logId })));
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
      const mensagem = err instanceof Error ? err.message : 'Falha ao enviar para o Supabase.';
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
              onConfirmar={() => confirmarTipo(tipo)}
              processando={processandoTipo === tipo}
            />
          );
        })}

        <UploadLog />
      </div>
    </AppShell>
  );
}
