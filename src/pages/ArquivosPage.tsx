import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  apagarLaudo,
  apagarParametrizacaoProduto,
  atualizarFatorPlantio,
  atualizarLaudo,
  atualizarTeste,
  enviarLaudo,
  fetchArquivosLaudos,
  fetchFatoresPlantio,
  fetchParametrizacaoProdutos,
  salvarParametrizacaoProduto,
  type PatchTeste,
} from '@/features/arquivos/api';
import { EditarLaudoModal } from '@/features/arquivos/components/EditarLaudoModal';
import { FormularioUpload } from '@/features/arquivos/components/FormularioUpload';
import { GuiaPlantioModal } from '@/features/arquivos/components/GuiaPlantioModal';
import { ListaArquivos } from '@/features/arquivos/components/ListaArquivos';
import { ParametrizacaoProdutosModal } from '@/features/arquivos/components/ParametrizacaoProdutosModal';
import { TesteModal } from '@/features/arquivos/components/TesteModal';
import { VisualizarArquivoModal } from '@/features/arquivos/components/VisualizarArquivoModal';
import { filtrarArquivos } from '@/features/arquivos/filtrarArquivos';
import { gerarGuiaTestePdf } from '@/features/arquivos/guiaTestePdf';
import type { ArquivoLaudo, NovoLaudoInput } from '@/features/arquivos/types';
import { fetchTransportadoras } from '@/features/fretes/api';
import { fetchCanais, fetchCategorias, fetchProdutos } from '@/features/pricing/api';
import { mensagemDeErro } from '@/lib/errors';

export function ArquivosPage() {
  const queryClient = useQueryClient();
  const { data: arquivos = [] } = useQuery({ queryKey: ['arquivos_laudos'], queryFn: fetchArquivosLaudos });
  const { data: produtos = [] } = useQuery({ queryKey: ['arquivos_parametrizacao_produtos'], queryFn: fetchParametrizacaoProdutos });
  const { data: fatores = [] } = useQuery({ queryKey: ['arquivos_fatores_plantio'], queryFn: fetchFatoresPlantio });
  const { data: canaisPreco = [] } = useQuery({ queryKey: ['pricing', 'canais'], queryFn: fetchCanais });
  const { data: categoriasPreco = [] } = useQuery({ queryKey: ['pricing', 'categorias'], queryFn: fetchCategorias });
  const { data: produtosPreco = [] } = useQuery({ queryKey: ['pricing', 'produtos'], queryFn: fetchProdutos });
  const { data: transportadoras = [] } = useQuery({ queryKey: ['fretes', 'transportadoras'], queryFn: fetchTransportadoras });

  const [busca, setBusca] = useState('');
  const [uploadAberto, setUploadAberto] = useState(false);
  const [parametrizacaoAberta, setParametrizacaoAberta] = useState(false);
  const [guiaPlantioAberto, setGuiaPlantioAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [paraApagar, setParaApagar] = useState<ArquivoLaudo[] | null>(null);
  const [paraVisualizar, setParaVisualizar] = useState<ArquivoLaudo | null>(null);
  const [paraEditar, setParaEditar] = useState<ArquivoLaudo | null>(null);
  const [paraTeste, setParaTeste] = useState<ArquivoLaudo | null>(null);

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['arquivos_laudos'] });
  }

  function invalidarProdutos() {
    queryClient.invalidateQueries({ queryKey: ['arquivos_parametrizacao_produtos'] });
  }

  function invalidarFatores() {
    queryClient.invalidateQueries({ queryKey: ['arquivos_fatores_plantio'] });
  }

  async function onEnviar(inputs: NovoLaudoInput[]) {
    setEnviando(true);
    try {
      const resultados = await Promise.all(
        inputs.map(async (input) => {
          try {
            await enviarLaudo(input);
            return { arquivo: input.arquivo.name, ok: true };
          } catch (e) {
            return { arquivo: input.arquivo.name, ok: false, erro: mensagemDeErro(e, 'Falha ao enviar.') };
          }
        }),
      );
      invalidar();
      if (resultados.some((r) => !r.ok)) setErro('Um ou mais laudos falharam ao enviar — veja o resumo abaixo do formulário.');
      return resultados;
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarApagar() {
    if (!paraApagar) return;
    try {
      await Promise.all(paraApagar.map((laudo) => apagarLaudo(laudo)));
      setParaApagar(null);
      invalidar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao excluir o(s) laudo(s).'));
    }
  }

  async function onSalvarEdicao(
    id: string,
    patch: { nomeProduto: string; lote: string; anoSafra: string; pureza: string; germinacao: string; validade: string; pms: string },
  ) {
    try {
      await atualizarLaudo(id, patch);
      setParaEditar(null);
      invalidar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao salvar as correções do laudo.'));
    }
  }

  async function onSalvarTeste(id: string, patch: PatchTeste) {
    try {
      await atualizarTeste(id, patch);
      setParaTeste(null);
      invalidar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao salvar o teste de germinação.'));
    }
  }

  async function onSalvarProduto(produto: { id?: string; nomeProduto: string; pmsBase: string; densidadeBase: string; indiceSobrevivencia: string }) {
    try {
      await salvarParametrizacaoProduto(produto);
      invalidarProdutos();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao salvar o produto na parametrização.'));
    }
  }

  async function onApagarProduto(id: string) {
    try {
      await apagarParametrizacaoProduto(id);
      invalidarProdutos();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao excluir o produto da parametrização.'));
    }
  }

  async function onSalvarFator(chave: string, fator: string) {
    try {
      await atualizarFatorPlantio(chave, fator);
      invalidarFatores();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao salvar o fator de plantio.'));
    }
  }

  return (
    <AppShell
      topbarNavy
      title="Gerenciador de Arquivos"
      mostrarParametrizacao
      onAbrirParametrizacao={() => setParametrizacaoAberta(true)}
      actions={
        <>
          <Button variant="navy" onClick={() => gerarGuiaTestePdf(filtrarArquivos(arquivos, busca))}>
            Guia de Teste
          </Button>
          <Button variant="navy" onClick={() => setGuiaPlantioAberto(true)}>
            Guia de Plantio
          </Button>
          <Button variant="primary" onClick={() => setUploadAberto(true)}>
            + Enviar Laudos
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {erro && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-bad/40 bg-bad-soft p-3 text-sm text-[#8F2E2E]">
            <span>{erro}</span>
            <button type="button" onClick={() => setErro(null)} className="font-semibold hover:underline">
              Fechar
            </button>
          </div>
        )}

        <FormularioUpload aberto={uploadAberto} onFechar={() => setUploadAberto(false)} enviando={enviando} onEnviar={onEnviar} />
        <ListaArquivos
          arquivos={arquivos}
          busca={busca}
          onChangeBusca={setBusca}
          onApagar={setParaApagar}
          onVisualizar={setParaVisualizar}
          onEditar={setParaEditar}
          onAbrirTeste={setParaTeste}
          produtos={produtos}
        />
      </div>

      <Modal
        open={paraApagar !== null}
        title="Excluir Laudo"
        onClose={() => setParaApagar(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setParaApagar(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmarApagar}>
              Excluir
            </Button>
          </>
        }
      >
        {paraApagar && paraApagar.length === 1 ? (
          <p className="text-sm text-[var(--color-text)]">
            Excluir o laudo de <strong>{paraApagar[0].nomeProduto}</strong>
            {paraApagar[0].lote ? ` (Lote ${paraApagar[0].lote})` : ''}? O arquivo também será removido do armazenamento. Não
            tem como desfazer.
          </p>
        ) : (
          <p className="text-sm text-[var(--color-text)]">
            Excluir os <strong>{paraApagar?.length ?? 0} laudos selecionados</strong>? Os arquivos também serão removidos do
            armazenamento. Não tem como desfazer.
          </p>
        )}
      </Modal>

      <VisualizarArquivoModal laudo={paraVisualizar} onFechar={() => setParaVisualizar(null)} />
      <EditarLaudoModal laudo={paraEditar} onFechar={() => setParaEditar(null)} onSalvar={onSalvarEdicao} />
      <TesteModal laudo={paraTeste} onFechar={() => setParaTeste(null)} onSalvar={onSalvarTeste} />
      <ParametrizacaoProdutosModal
        open={parametrizacaoAberta}
        produtos={produtos}
        fatores={fatores}
        onFechar={() => setParametrizacaoAberta(false)}
        onSalvar={onSalvarProduto}
        onApagar={onApagarProduto}
        onSalvarFator={onSalvarFator}
      />
      <GuiaPlantioModal
        open={guiaPlantioAberto}
        arquivos={arquivos}
        produtos={produtos}
        fatores={fatores}
        canaisPreco={canaisPreco}
        categoriasPreco={categoriasPreco}
        produtosPreco={produtosPreco}
        transportadoras={transportadoras}
        onFechar={() => setGuiaPlantioAberto(false)}
      />
    </AppShell>
  );
}
