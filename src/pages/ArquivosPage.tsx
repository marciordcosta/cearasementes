import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { apagarLaudo, atualizarLaudo, enviarLaudo, fetchArquivosLaudos } from '@/features/arquivos/api';
import { EditarLaudoModal } from '@/features/arquivos/components/EditarLaudoModal';
import { FormularioUpload } from '@/features/arquivos/components/FormularioUpload';
import { ListaArquivos } from '@/features/arquivos/components/ListaArquivos';
import { VisualizarArquivoModal } from '@/features/arquivos/components/VisualizarArquivoModal';
import type { ArquivoLaudo, NovoLaudoInput } from '@/features/arquivos/types';
import { mensagemDeErro } from '@/lib/errors';

export function ArquivosPage() {
  const queryClient = useQueryClient();
  const { data: arquivos = [] } = useQuery({ queryKey: ['arquivos_laudos'], queryFn: fetchArquivosLaudos });

  const [busca, setBusca] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [paraApagar, setParaApagar] = useState<ArquivoLaudo[] | null>(null);
  const [paraVisualizar, setParaVisualizar] = useState<ArquivoLaudo | null>(null);
  const [paraEditar, setParaEditar] = useState<ArquivoLaudo | null>(null);

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['arquivos_laudos'] });
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

  async function onSalvarEdicao(id: string, patch: { nomeProduto: string; lote: string; anoSafra: string; pureza: string; germinacao: string; validade: string }) {
    try {
      await atualizarLaudo(id, patch);
      setParaEditar(null);
      invalidar();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao salvar as correções do laudo.'));
    }
  }

  return (
    <AppShell topbarNavy title="Gerenciador de Arquivos">
      <div className="space-y-6">
        {erro && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-bad/40 bg-bad-soft p-3 text-sm text-[#8F2E2E]">
            <span>{erro}</span>
            <button type="button" onClick={() => setErro(null)} className="font-semibold hover:underline">
              Fechar
            </button>
          </div>
        )}

        <FormularioUpload enviando={enviando} onEnviar={onEnviar} />
        <ListaArquivos
          arquivos={arquivos}
          busca={busca}
          onChangeBusca={setBusca}
          onApagar={setParaApagar}
          onVisualizar={setParaVisualizar}
          onEditar={setParaEditar}
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
    </AppShell>
  );
}
