import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  apagarFotoTeste,
  apagarLaudo,
  apagarOpcaoChecklist,
  apagarParametrizacaoProduto,
  apagarPerguntaChecklist,
  atualizarFatorPlantio,
  atualizarFotosTeste,
  atualizarLaudo,
  atualizarOpcaoChecklist,
  atualizarPerguntaChecklist,
  atualizarResumoCondicao,
  atualizarTeste,
  enviarFotoTeste,
  enviarLaudo,
  fetchArquivosLaudos,
  fetchChecklistPlantio,
  fetchFatoresPlantio,
  fetchManualPlantio,
  fetchParametrizacaoProdutos,
  inserirOpcaoChecklist,
  inserirPerguntaChecklist,
  salvarManualPlantio,
  salvarParametrizacaoProduto,
  type PatchTeste,
} from '@/features/arquivos/api';
import { EditarLaudoModal } from '@/features/arquivos/components/EditarLaudoModal';
import { FormularioUpload } from '@/features/arquivos/components/FormularioUpload';
import { GuiaPlantioModal } from '@/features/arquivos/components/GuiaPlantioModal';
import { ImprimirEtiquetaModal } from '@/features/arquivos/components/ImprimirEtiquetaModal';
import { ListaArquivos } from '@/features/arquivos/components/ListaArquivos';
import { ParametrizacaoProdutosModal } from '@/features/arquivos/components/ParametrizacaoProdutosModal';
import { TesteModal } from '@/features/arquivos/components/TesteModal';
import { VisualizarArquivoModal } from '@/features/arquivos/components/VisualizarArquivoModal';
import { gerarGuiaTestePdf } from '@/features/arquivos/guiaTestePdf';
import type { ArquivoLaudo, ManualPlantio, NovoLaudoInput } from '@/features/arquivos/types';
import { fetchFornecedores, fetchProdutos } from '@/features/pricing/api';
import { mensagemDeErro } from '@/lib/errors';

export function ArquivosPage() {
  const queryClient = useQueryClient();
  const { data: arquivos = [] } = useQuery({ queryKey: ['arquivos_laudos'], queryFn: fetchArquivosLaudos });
  const { data: produtos = [] } = useQuery({ queryKey: ['arquivos_parametrizacao_produtos'], queryFn: fetchParametrizacaoProdutos });
  const { data: fatores = [] } = useQuery({ queryKey: ['arquivos_fatores_plantio'], queryFn: fetchFatoresPlantio });
  const { data: checklist = [] } = useQuery({ queryKey: ['arquivos_checklist_plantio'], queryFn: fetchChecklistPlantio });
  const { data: manual = null } = useQuery({ queryKey: ['arquivos_manual_plantio'], queryFn: fetchManualPlantio });
  const { data: produtosPreco = [] } = useQuery({ queryKey: ['pricing', 'produtos'], queryFn: fetchProdutos });
  // Mesma queryKey já usada em PricingPage.tsx — cache compartilhado (fornecedores cadastrados na
  // Precificação), usado aqui só pra sugerir no autocomplete do campo Fornecedor de EditarLaudoModal.
  const { data: fornecedoresPreco = [] } = useQuery({ queryKey: ['pricing', 'fornecedores'], queryFn: fetchFornecedores });

  const [busca, setBusca] = useState('');
  const [uploadAberto, setUploadAberto] = useState(false);
  const [parametrizacaoAberta, setParametrizacaoAberta] = useState(false);
  const [guiaPlantioAberto, setGuiaPlantioAberto] = useState(false);
  const [laudoGuiaPlantio, setLaudoGuiaPlantio] = useState<ArquivoLaudo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [paraApagar, setParaApagar] = useState<ArquivoLaudo[] | null>(null);
  const [paraVisualizar, setParaVisualizar] = useState<ArquivoLaudo | null>(null);
  const [paraEditar, setParaEditar] = useState<ArquivoLaudo | null>(null);
  const [paraTeste, setParaTeste] = useState<ArquivoLaudo | null>(null);
  const [paraImprimirEtiqueta, setParaImprimirEtiqueta] = useState<ArquivoLaudo | null>(null);

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['arquivos_laudos'] });
  }

  function invalidarProdutos() {
    queryClient.invalidateQueries({ queryKey: ['arquivos_parametrizacao_produtos'] });
  }

  function invalidarFatores() {
    queryClient.invalidateQueries({ queryKey: ['arquivos_fatores_plantio'] });
  }

  function invalidarChecklist() {
    queryClient.invalidateQueries({ queryKey: ['arquivos_checklist_plantio'] });
  }

  function invalidarManual() {
    queryClient.invalidateQueries({ queryKey: ['arquivos_manual_plantio'] });
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
    patch: {
      nomeProduto: string;
      lote: string;
      anoSafra: string;
      pureza: string;
      germinacao: string;
      validade: string;
      categoria: string;
      processo: string;
      cultivar: string;
      fornecedor: string;
      pesoEmbalagem: string;
      pms: string;
    },
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

  async function onSalvarProduto(produto: {
    cultivar: string;
    processo: string;
    pmsBase: string;
    densidadeBase: string;
    indiceSobrevivencia: string;
    maxPlantulasCova: string;
    perdaMedia: string;
    perdaBaixa: string;
    maxPlantulasMetroLinear: string;
    modoPlantio: 'cova' | 'lanco' | 'linha' | null;
    margemTolerancia: string;
    observacaoEtiqueta: string;
  }) {
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

  async function onSalvarResumoCondicao(chave: string, resumo: string) {
    try {
      await atualizarResumoCondicao(chave, resumo);
      invalidarFatores();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao salvar o resumo da condição.'));
    }
  }

  async function onAdicionarPerguntaChecklist(pergunta: string) {
    try {
      await inserirPerguntaChecklist(pergunta, checklist.length);
      invalidarChecklist();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao adicionar a pergunta do checklist.'));
    }
  }

  async function onSalvarPerguntaChecklist(id: string, pergunta: string) {
    try {
      await atualizarPerguntaChecklist(id, pergunta);
      invalidarChecklist();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao salvar a pergunta do checklist.'));
    }
  }

  async function onApagarPerguntaChecklist(id: string) {
    try {
      await apagarPerguntaChecklist(id);
      invalidarChecklist();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao excluir a pergunta do checklist.'));
    }
  }

  async function onAdicionarOpcaoChecklist(perguntaId: string, texto: string, condicaoChave: string) {
    try {
      const pergunta = checklist.find((p) => p.id === perguntaId);
      await inserirOpcaoChecklist(perguntaId, texto, condicaoChave, pergunta?.opcoes.length ?? 0);
      invalidarChecklist();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao adicionar a opção do checklist.'));
    }
  }

  async function onSalvarOpcaoChecklist(id: string, patch: { texto?: string; condicaoChave?: string }) {
    try {
      await atualizarOpcaoChecklist(id, patch);
      invalidarChecklist();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao salvar a opção do checklist.'));
    }
  }

  async function onApagarOpcaoChecklist(id: string) {
    try {
      await apagarOpcaoChecklist(id);
      invalidarChecklist();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao excluir a opção do checklist.'));
    }
  }

  function abrirGuiaPlantioComLaudo(laudo: ArquivoLaudo) {
    setLaudoGuiaPlantio(laudo);
    setGuiaPlantioAberto(true);
  }

  async function onSalvarManualPlantio(manual: ManualPlantio) {
    try {
      await salvarManualPlantio(manual);
      invalidarManual();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao salvar o Manual de Plantio.'));
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
          <Button variant="primary" onClick={() => setUploadAberto(true)}>
            + Enviar Laudos
          </Button>
          <Button
            variant="navy"
            onClick={() => {
              setLaudoGuiaPlantio(null);
              setGuiaPlantioAberto(true);
            }}
          >
            Guia de Plantio
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
          produtos={produtos}
          busca={busca}
          onChangeBusca={setBusca}
          onApagar={setParaApagar}
          onVisualizar={setParaVisualizar}
          onEditar={setParaEditar}
          onAbrirTeste={setParaTeste}
          onAbrirGuiaPlantio={abrirGuiaPlantioComLaudo}
          onImprimirEtiqueta={setParaImprimirEtiqueta}
          onGerarGuiaTeste={gerarGuiaTestePdf}
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
      <EditarLaudoModal laudo={paraEditar} fornecedores={fornecedoresPreco} onFechar={() => setParaEditar(null)} onSalvar={onSalvarEdicao} />
      <TesteModal
        laudo={paraTeste}
        produtos={produtos}
        onFechar={() => setParaTeste(null)}
        onSalvar={onSalvarTeste}
        onAdicionarFoto={enviarFotoTeste}
        onRemoverFoto={apagarFotoTeste}
        onSalvarFotos={atualizarFotosTeste}
        onFotosAlteradas={invalidar}
      />
      <ImprimirEtiquetaModal
        laudo={paraImprimirEtiqueta}
        produtos={produtos}
        produtosPreco={produtosPreco}
        onFechar={() => setParaImprimirEtiqueta(null)}
      />
      <ParametrizacaoProdutosModal
        open={parametrizacaoAberta}
        produtos={produtos}
        arquivos={arquivos}
        fatores={fatores}
        checklist={checklist}
        manual={manual}
        onFechar={() => setParametrizacaoAberta(false)}
        onSalvar={onSalvarProduto}
        onApagar={onApagarProduto}
        onSalvarFator={onSalvarFator}
        onSalvarResumoCondicao={onSalvarResumoCondicao}
        onAdicionarPerguntaChecklist={onAdicionarPerguntaChecklist}
        onSalvarPerguntaChecklist={onSalvarPerguntaChecklist}
        onApagarPerguntaChecklist={onApagarPerguntaChecklist}
        onAdicionarOpcaoChecklist={onAdicionarOpcaoChecklist}
        onSalvarOpcaoChecklist={onSalvarOpcaoChecklist}
        onApagarOpcaoChecklist={onApagarOpcaoChecklist}
        onSalvarManual={onSalvarManualPlantio}
      />
      <GuiaPlantioModal
        open={guiaPlantioAberto}
        arquivos={arquivos}
        produtos={produtos}
        fatores={fatores}
        checklist={checklist}
        manual={manual}
        laudoInicial={laudoGuiaPlantio}
        produtosPreco={produtosPreco}
        onFechar={() => {
          setGuiaPlantioAberto(false);
          setLaudoGuiaPlantio(null);
        }}
      />
    </AppShell>
  );
}
